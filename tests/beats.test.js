import { test } from "node:test";
import assert from "node:assert/strict";

import { fft, onsetEnvelope, estimateTempo, trackBeats, autoSync, syncFromBeats } from "../src/audio/beats.js";
import { parseChart } from "../src/theory/progressions.js";
import { chordPcs } from "../src/theory/chords.js";

const SR = 11025;

// A fake band: `intro` seconds of soft noise, then the chart at `bpm`. Each beat sounds
// the chord tones (octaves 3 and 4) with a decaying envelope, plus a short noise hit.
// `drift` speeds the tempo up linearly over the recording (live playing).
function band(bars, { bpm = 120, intro = 2, choruses = 3, drift = 0, seed = 1 } = {}) {
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const beats = [];
  let t = intro;
  for (let c = 0; c < choruses; c++) for (const bar of bars) for (const { chord, beats: n } of bar) for (let b = 0; b < n; b++) {
    beats.push({ t, chord });
    const tempo = bpm * (1 + drift * (beats.length / 200));
    t += 60 / tempo;
  }
  const x = new Float32Array(Math.ceil((t + 1) * SR));
  for (let i = 0; i < x.length; i++) x[i] = 0.01 * rnd();
  for (let k = 0; k < beats.length; k++) {
    const { t: start, chord } = beats[k];
    const end = k + 1 < beats.length ? beats[k + 1].t : start + 0.5;
    const freqs = chordPcs(chord).flatMap((pc) => [48 + pc, 60 + pc]).map((m) => 440 * 2 ** ((m - 69) / 12));
    const i0 = Math.round(start * SR), i1 = Math.round(end * SR);
    for (let i = i0; i < i1 && i < x.length; i++) {
      const dt = (i - i0) / SR;
      let v = 0;
      for (const f of freqs) v += Math.sin(2 * Math.PI * f * dt);
      x[i] += 0.08 * v * Math.exp(-dt * 3) + (dt < 0.02 ? 0.5 * rnd() * (1 - dt / 0.02) : 0);
    }
  }
  return { x, beats: beats.map((b) => b.t) };
}

test("fft of a pure tone peaks at its bin", () => {
  const n = 64, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 5 * i) / n);
  fft(re, im);
  const mag = Array.from(re, (v, i) => Math.hypot(v, im[i]));
  assert.equal(mag.indexOf(Math.max(...mag.slice(0, n / 2))), 5);
});

const chart = parseChart("Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | B7 | Em7 | Em7", { key: 7 }).bars;

test("tempo and beats of a steady recording", () => {
  const { x, beats } = band(chart, { bpm: 120 });
  const on = onsetEnvelope(x, SR);
  const bpm = estimateTempo(on.env, on.fps);
  assert.ok(Math.abs(bpm - 120) < 1, `bpm ${bpm}`);
  const found = trackBeats(on.env, on.fps, bpm).map((f) => f / on.fps + on.t0);
  // Every real beat after the intro has a tracked beat within 40 ms.
  const worst = Math.max(...beats.map((b) => Math.min(...found.map((f) => Math.abs(f - b)))));
  assert.ok(worst < 0.04, `worst beat error ${worst.toFixed(3)} s`);
});

test("auto-sync finds bar 1 after an intro", () => {
  const { x, beats } = band(chart, { bpm: 120, intro: 2.3 });
  const s = autoSync(x, SR, chart);
  assert.ok(Math.abs(s.taps[0] - beats[0]) < 0.04, `bar 1 at ${s.taps[0]}, expected ${beats[0]}`);
  assert.ok(Math.abs(s.bpm - 120) < 2, `bpm ${s.bpm}`);
  // Bar 9 (second chorus) lines up too.
  assert.ok(Math.abs(s.taps[8] - beats[32]) < 0.04);
  assert.ok(s.margin > 0, "a clear winner");
});

test("auto-sync on a fast tune that speeds up", () => {
  const { x, beats } = band(chart, { bpm: 180, intro: 1.1, drift: 0.15, choruses: 4 });
  const s = autoSync(x, SR, chart);
  assert.ok(Math.abs(s.taps[0] - beats[0]) < 0.04, `bar 1 at ${s.taps[0]}, expected ${beats[0]}`);
  const lastBar = beats[beats.length - 4];
  const err = Math.min(...s.taps.map((t) => Math.abs(t - lastBar)));
  assert.ok(err < 0.04, `last bar off by ${err.toFixed(3)} s`);
});

test("syncFromBeats: shifting the start moves bar 1 by a beat", () => {
  const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
  assert.deepEqual(syncFromBeats(beats, 1).taps, [0.5, 2.5]);
  assert.equal(syncFromBeats(beats, 0).bpm, 120);
});
