import { test } from "node:test";
import assert from "node:assert/strict";

import { detectPitch, pickChannel } from "../src/audio/pitch.js";
import { NoteGate } from "../src/audio/noteGate.js";
import { midiToFreq } from "../src/theory/notes.js";

const SR = 48000;
const N = 2048;

// Plucked-string-ish tone: harmonics at 1/k amplitude. harmonics = 1 is a pure sine,
// the case the first (autocorrelation) detector failed on for low E.
function tone(freq, harmonics = 6, { amp = 0.3, sr = SR, n = N, phase = 0.3 } = {}) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 1; k <= harmonics; k++) s += Math.sin(2 * Math.PI * freq * k * (i / sr) + phase * k) / k;
    b[i] = amp * s;
  }
  return b;
}

function cents(a, b) {
  return 1200 * Math.log2(a / b);
}

// Open strings, 5th and 12th frets, up to the 17th fret of the high E.
const MIDIS = [40, 45, 50, 52, 55, 57, 59, 62, 64, 67, 69, 71, 76, 81];

for (const harmonics of [1, 3, 6]) {
  test(`within ±3 cents from E2 to A5 (${harmonics} harmonic${harmonics > 1 ? "s" : ""})`, () => {
    for (const m of MIDIS) {
      const f = midiToFreq(m);
      const r = detectPitch(tone(f, harmonics), SR);
      assert.ok(r, `midi ${m}: no pitch`);
      const c = cents(r.freq, f);
      assert.ok(Math.abs(c) <= 3, `midi ${m}: ${c.toFixed(1)} cents`);
    }
  });
}

test("works at 44.1 kHz too", () => {
  for (const m of [40, 52, 64, 76]) {
    const f = midiToFreq(m);
    const r = detectPitch(tone(f, 6, { sr: 44100 }), 44100);
    assert.ok(Math.abs(cents(r.freq, f)) <= 3, `midi ${m}`);
  }
});

test("a missing fundamental still reads as the played note (not an octave up)", () => {
  // Harmonics 2..6 only, like a thin bridge pickup.
  const f = midiToFreq(45);
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) for (let k = 2; k <= 6; k++) b[i] += 0.3 * Math.sin(2 * Math.PI * f * k * (i / SR)) / k;
  const r = detectPitch(b, SR);
  assert.ok(Math.abs(cents(r.freq, f)) <= 5, `${r && r.freq}`);
});

test("silence and white noise give no pitch", () => {
  assert.equal(detectPitch(new Float32Array(N), SR), null);
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const noise = Float32Array.from({ length: N }, () => 0.3 * rand());
  assert.equal(detectPitch(noise, SR), null);
});

test("pickChannel auto picks the louder input", () => {
  const quiet = new Float32Array(16).fill(0.001);
  const loud = new Float32Array(16).fill(0.2);
  assert.equal(pickChannel([quiet, loud]), loud);
  assert.equal(pickChannel([quiet, loud], "1"), quiet);
  assert.equal(pickChannel([loud]), loud);
});

test("note gate fires once per sustained note, with the onset time", () => {
  const g = new NoteGate({ sustainMs: 100 });
  const frame = 21.3;
  const events = [];
  let t = 0;
  const feed = (reading, frames) => {
    for (let i = 0; i < frames; i++) {
      t += frame;
      const e = g.push(reading, frame, t);
      if (e) events.push(e);
    }
  };
  feed({ freq: 220 }, 20);      // one long A
  feed({ freq: 221 }, 5);       // small drift: same note
  feed({ freq: 246.9 }, 10);    // new note B
  feed(null, 3);                // silence
  feed({ freq: 246.9 }, 10);    // B again after a gap: fires again
  assert.equal(events.length, 3);
  assert.ok(Math.abs(events[0].freq - 220) < 1);
  assert.ok(events[0].onsetMs < frame * 1.01);
});
