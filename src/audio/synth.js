// Every sound the app makes, synthesised (no sample files).
// Guitar = Karplus-Strong plucked string; bass = filtered triangle; drums = filtered noise.

import { audioContext, masterOut } from "./context.js";
import { midiToFreq } from "../theory/notes.js";

const buses = {};

// Named sub-mixes so each part has its own volume.
export function bus(name, gain = 1) {
  if (!buses[name]) {
    const g = audioContext().createGain();
    g.gain.value = gain;
    g.connect(masterOut());
    buses[name] = g;
  }
  return buses[name];
}

export function setBusGain(name, gain) {
  bus(name).gain.value = gain;
}

// ---------- Click ----------

export function click(time, accent = false, dest = bus("click")) {
  const ctx = audioContext();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = accent ? "square" : "sine";
  osc.frequency.value = accent ? 1500 : 1000;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(accent ? 0.25 : 0.14, time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(g).connect(dest);
  osc.start(time);
  osc.stop(time + 0.06);
}

// ---------- Plucked string (Karplus-Strong) ----------

const ksCache = new Map();

function ksBuffer(midi) {
  const ctx = audioContext();
  const key = `${midi}@${ctx.sampleRate}`;
  if (ksCache.has(key)) return ksCache.get(key);
  const sr = ctx.sampleRate;
  const f = midiToFreq(midi);
  // The averaging filter adds half a sample of delay: period = N + 0.5.
  const N = Math.max(2, Math.floor(sr / f - 0.5));
  const len = Math.floor(sr * 2.2);
  const buf = ctx.createBuffer(1, len, sr);
  const y = buf.getChannelData(0);
  // Damping: low notes ring longer, high notes decay faster, like a real string.
  const damping = 0.9965 - Math.min(0.006, (midi - 40) * 0.00012);
  let prev = 0;
  for (let i = 0; i < N; i++) {
    // Slightly low-passed noise burst = a softer pick attack.
    const r = Math.random() * 2 - 1;
    prev = 0.6 * r + 0.4 * prev;
    y[i] = prev;
  }
  for (let i = N; i < len; i++) y[i] = damping * 0.5 * (y[i - N] + y[i - N - 1 < 0 ? 0 : i - N - 1]);
  const entry = { buf, rate: f / (sr / (N + 0.5)) };
  ksCache.set(key, entry);
  return entry;
}

// One plucked note. `dur` cuts it short (muted/staccato); default rings out.
export function pluck(midi, time, { gain = 0.5, dur = 2, dest = bus("guitar") } = {}) {
  const ctx = audioContext();
  time = Math.max(time, ctx.currentTime); // "now" callers pass 0
  const { buf, rate } = ksBuffer(midi);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.setValueAtTime(gain, time + Math.max(0.01, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(g).connect(dest);
  src.start(time);
  src.stop(time + dur + 0.05);
}

// Strum low to high, a few ms apart.
export function strum(midis, time, { gain = 0.28, dur = 1.2, spread = 0.012, dest = bus("comp") } = {}) {
  midis.slice().sort((a, b) => a - b).forEach((m, i) => pluck(m, time + i * spread, { gain, dur, dest }));
}

// ---------- Bass ----------

export function bassNote(midi, time, dur, { gain = 0.5, dest = bus("bass") } = {}) {
  const ctx = audioContext();
  const f = midiToFreq(midi);
  const osc = ctx.createOscillator();
  const sub = ctx.createOscillator();
  osc.type = "triangle";
  sub.type = "sine";
  osc.frequency.value = f;
  sub.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1400, time);
  lp.frequency.exponentialRampToValueAtTime(400, time + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.008);
  g.gain.exponentialRampToValueAtTime(gain * 0.5, time + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.98);
  osc.connect(lp);
  sub.connect(lp);
  lp.connect(g).connect(dest);
  osc.start(time);
  sub.start(time);
  osc.stop(time + dur);
  sub.stop(time + dur);
}

// ---------- Drums ----------

let noiseBuf = null;
function noise() {
  const ctx = audioContext();
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

function hit(time, { freq, q, decay, gain, type = "bandpass", dest = bus("drums") }) {
  const ctx = audioContext();
  const src = noise();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  src.connect(f).connect(g).connect(dest);
  src.start(time, Math.random() * 0.5);
  src.stop(time + decay + 0.02);
}

export function ride(time, accent = false) {
  hit(time, { freq: 7000, q: 0.8, decay: accent ? 0.45 : 0.3, gain: accent ? 0.16 : 0.1 });
}

export function hihat(time) {
  hit(time, { freq: 8000, q: 0.5, decay: 0.05, gain: 0.12, type: "highpass" });
}

// ---------- Drone ----------

export class Drone {
  constructor() {
    this.nodes = null;
  }

  start(freq, timbre = "warm") {
    this.stop();
    const ctx = audioContext();
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(timbre === "sine" ? 0.12 : 0.08, ctx.currentTime + 0.3);
    out.connect(bus("drone"));
    const oscs = [];
    if (timbre === "sine") {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(out);
      oscs.push({ o, ratio: 1 });
    } else {
      // Two detuned saws through a low-pass, plus a fifth: a soft tanpura-like pad.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      lp.connect(out);
      for (const [ratio, detune, type, level] of [[1, -4, "sawtooth", 0.5], [1, 4, "sawtooth", 0.5], [1.5, 0, "sine", 0.3], [0.5, 0, "sine", 0.6]]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq * ratio;
        o.detune.value = detune;
        g.gain.value = level;
        o.connect(g).connect(lp);
        oscs.push({ o, ratio });
      }
    }
    oscs.forEach(({ o }) => o.start());
    this.nodes = { out, oscs };
  }

  setFreq(freq) {
    if (!this.nodes) return;
    const t = audioContext().currentTime;
    this.nodes.oscs.forEach(({ o, ratio }) => o.frequency.setTargetAtTime(freq * ratio, t, 0.03));
  }

  stop() {
    if (!this.nodes) return;
    const ctx = audioContext();
    const { out, oscs } = this.nodes;
    out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
    oscs.forEach(({ o }) => o.stop(ctx.currentTime + 0.3));
    this.nodes = null;
  }

  get running() {
    return !!this.nodes;
  }
}
