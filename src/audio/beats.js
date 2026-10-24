// Auto-sync: find the beats in a recording and where the chart's bar 1 is.
// Pure functions on a mono Float32Array, so they run in a Worker and in node tests.
//
//   1. Onset strength: log-spectral flux (how much new energy each 12 ms frame adds).
//   2. Tempo: autocorrelation of the onset curve, weighted towards ~120 BPM.
//   3. Beats: dynamic programming (Ellis 2007, "Beat tracking by dynamic programming"):
//      beats land on strong onsets while keeping close to the tempo, so live drift is followed.
//   4. Bar 1: average the pitch content (chroma) of each beat and slide the chart's chords
//      along it; the start beat where they match best is bar 1. Also tries double and half
//      tempo, the classic beat-tracker mistake.
// Result: a bar line for every 4 beats from bar 1 — the same "taps" Play-along uses.

import { chordPcs } from "../theory/chords.js";

// ---------- FFT (radix 2, in place) ----------

const twiddles = new Map();
function table(n) {
  if (!twiddles.has(n)) {
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
    twiddles.set(n, { cos, sin });
  }
  return twiddles.get(n);
}

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  const { cos, sin } = table(n);
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * step], s = sin[k * step];
        const a = i + k, b = a + half;
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

// Magnitude spectra of every frame, passed to `each(frameIndex, mag)`.
function stft(x, size, hop, each) {
  const win = new Float64Array(size).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  const re = new Float64Array(size), im = new Float64Array(size), mag = new Float64Array(size / 2);
  const frames = Math.max(0, Math.floor((x.length - size) / hop) + 1);
  for (let t = 0; t < frames; t++) {
    const o = t * hop;
    for (let i = 0; i < size; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    each(t, mag);
  }
  return frames;
}

// ---------- 1. Onset strength ----------

export const ONSET = { size: 512, hop: 128 };

export function onsetEnvelope(x, sr) {
  const { size, hop } = ONSET;
  const out = [];
  let prev = null;
  stft(x, size, hop, (t, mag) => {
    const cur = Float64Array.from(mag, (m) => Math.log1p(100 * m));
    let flux = 0;
    if (prev) for (let k = 1; k < cur.length; k++) flux += Math.max(0, cur[k] - prev[k]);
    out.push(flux);
    prev = cur;
  });
  // Remove the slow trend (loud vs quiet passages), keep the peaks, scale to unit spread.
  const fps = sr / hop;
  const w = Math.round(fps * 0.5);
  const prefix = new Float64Array(out.length + 1);
  for (let i = 0; i < out.length; i++) prefix[i + 1] = prefix[i] + out[i];
  const env = new Float64Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const lo = Math.max(0, i - w), hi = Math.min(out.length, i + w + 1);
    env[i] = Math.max(0, out[i] - (prefix[hi] - prefix[lo]) / (hi - lo));
  }
  const sd = Math.sqrt(env.reduce((a, v) => a + v * v, 0) / Math.max(1, env.length)) || 1;
  for (let i = 0; i < env.length; i++) env[i] /= sd;
  // Frame t's window is centred size/2 samples after its start.
  return { env, fps, t0: size / 2 / sr };
}

// ---------- 2. Tempo ----------

export function estimateTempo(env, fps, { min = 50, max = 240, centre = 120 } = {}) {
  const lagMin = Math.floor((60 * fps) / max), lagMax = Math.ceil((60 * fps) / min);
  const ac = new Float64Array(lagMax + 2);
  for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    ac[lag] = s / (env.length - lag);
  }
  let best = -1, bestLag = lagMin;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const bpm = (60 * fps) / lag;
    const w = Math.exp(-0.5 * (Math.log2(bpm / centre) / 0.9) ** 2);
    if (ac[lag] * w > best && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) { best = ac[lag] * w; bestLag = lag; }
  }
  // Parabolic interpolation around the peak for a sub-frame period.
  const a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1];
  const d = a - 2 * b + c;
  const lag = d ? bestLag + (0.5 * (a - c)) / d : bestLag;
  return (60 * fps) / lag;
}

// ---------- 3. Beats ----------

export function trackBeats(env, fps, bpm, { tightness = 100 } = {}) {
  const period = (60 * fps) / bpm;
  const n = env.length;
  const score = new Float64Array(n), back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    let best = -Infinity, arg = -1;
    for (let p = Math.max(0, Math.round(t - 2 * period)); p <= t - Math.round(period / 2); p++) {
      const v = score[p] - tightness * Math.log((t - p) / period) ** 2;
      if (v > best) { best = v; arg = p; }
    }
    score[t] = env[t] + (arg >= 0 ? Math.max(0, best) : 0);
    back[t] = arg >= 0 && best > 0 ? arg : -1;
  }
  // Best end point within the last beat period, then follow the chain back.
  let t = n - 1;
  for (let i = Math.max(0, Math.floor(n - period)); i < n; i++) if (score[i] > score[t]) t = i;
  const beats = [];
  while (t >= 0) { beats.push(t); t = back[t]; }
  return beats.reverse();
}

// ---------- 4. Pitch content and chart alignment ----------

export const CHROMA = { size: 2048, hop: 512 };

// Per-frame 12-bin chroma (C=0), from 80 Hz to 2 kHz.
export function chromagram(x, sr) {
  const { size, hop } = CHROMA;
  const pcOfBin = new Int8Array(size / 2).fill(-1);
  for (let k = 1; k < size / 2; k++) {
    const f = (k * sr) / size;
    if (f >= 80 && f <= 2000) pcOfBin[k] = ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12;
  }
  const frames = [];
  stft(x, size, hop, (t, mag) => {
    const c = new Float64Array(12);
    for (let k = 0; k < mag.length; k++) if (pcOfBin[k] >= 0) c[pcOfBin[k]] += mag[k];
    frames.push(c);
  });
  return { frames, fps: sr / hop, t0: size / 2 / sr };
}

function normalise(v) {
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const out = v.map((x) => x - mean);
  const n = Math.hypot(...out) || 1;
  return out.map((x) => x / n);
}

// Average chroma between consecutive beat times (seconds).
export function beatChroma(chroma, times) {
  const out = [];
  for (let i = 0; i < times.length; i++) {
    const end = i + 1 < times.length ? times[i + 1] : times[i] + (times[i] - (times[i - 1] ?? times[i] - 0.5));
    const a = Math.max(0, Math.floor((times[i] - chroma.t0) * chroma.fps));
    const b = Math.min(chroma.frames.length, Math.max(a + 1, Math.floor((end - chroma.t0) * chroma.fps)));
    const c = new Float64Array(12);
    for (let f = a; f < b; f++) for (let k = 0; k < 12; k++) c[k] += chroma.frames[f][k];
    out.push(normalise(Array.from(c)));
  }
  return out;
}

// One template per beat of the chart (chord tones = 1).
export function chartTemplates(bars) {
  const out = [];
  for (const bar of bars) for (const { chord, beats } of bar) {
    const v = new Array(12).fill(0);
    for (const pc of chordPcs(chord)) v[pc] = 1;
    const tmpl = normalise(v);
    for (let b = 0; b < beats; b++) out.push(tmpl);
  }
  return out;
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// Which beat index is bar 1? Scores every start up to `maxStart` by the mean match of
// the chart (repeating) against the rest of the recording. Prefers the earliest start
// that is about as good as the best (the same chart a chorus later matches too).
export function alignChart(beatVecs, templates, { maxStart = 64, beatsPerBar = 4 } = {}) {
  const B = templates.length;
  const scores = [];
  for (let s = 0; s <= Math.min(maxStart, beatVecs.length - Math.min(B, 8)); s++) {
    let sum = 0, n = 0;
    for (let k = 0; s + k < beatVecs.length; k++) { sum += dot(beatVecs[s + k], templates[k % B]); n++; }
    scores.push(n ? sum / n : -1);
  }
  if (!scores.length) return { start: 0, score: 0, margin: 0 };
  const best = Math.max(...scores);
  const start = scores.findIndex((x) => x >= best - 0.01);
  // Margin over the best start that is not a whole number of bars away (= wrong bar line).
  const rival = Math.max(-1, ...scores.filter((_, s) => (s - start) % beatsPerBar !== 0));
  return { start, score: scores[start], margin: scores[start] - rival };
}

// ---------- Everything ----------

// x: mono samples, sr: sample rate, bars: parseChart(...).bars.
export function autoSync(x, sr, bars, { beatsPerBar = 4 } = {}) {
  const on = onsetEnvelope(x, sr);
  const bpm0 = estimateTempo(on.env, on.fps);
  const frames = trackBeats(on.env, on.fps, bpm0);
  const beats = frames.map((f) => +(f / on.fps + on.t0).toFixed(3));
  const chroma = chromagram(x, sr);
  const templates = chartTemplates(bars);

  // Tempo candidates: as tracked, double (beats in between), half (every other beat).
  const mid = beats.flatMap((b, i) => (i + 1 < beats.length ? [b, +((b + beats[i + 1]) / 2).toFixed(3)] : [b]));
  const candidates = [
    { factor: 1, beats },
    { factor: 2, beats: mid },
    { factor: 0.5, beats: beats.filter((_, i) => i % 2 === 0) },
    { factor: 0.5, beats: beats.filter((_, i) => i % 2 === 1) },
  ].filter((c) => c.beats.length > beatsPerBar * 2);

  let best = null;
  for (const c of candidates) {
    const fit = templates.length ? alignChart(beatChroma(chroma, c.beats), templates, { beatsPerBar, maxStart: Math.round(64 * c.factor) }) : { start: 0, score: 0, margin: 0 };
    // Small preference for the tempo the tracker found.
    const value = fit.score + (c.factor === 1 ? 0.03 : 0);
    if (!best || value > best.value) best = { ...c, ...fit, value };
  }
  if (!best) return null;
  return syncFromBeats(best.beats, best.start, beatsPerBar, { score: best.score, margin: best.margin });
}

// Bar lines (the "taps" Play-along uses) from a beat list and the beat where bar 1 starts.
export function syncFromBeats(beats, start, beatsPerBar = 4, extra = {}) {
  const taps = [];
  for (let i = start; i < beats.length; i += beatsPerBar) taps.push(beats[i]);
  const span = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 0.5;
  return { beats, start, taps, bpm: +(60 / span).toFixed(1), ...extra };
}
