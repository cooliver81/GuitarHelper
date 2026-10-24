import { test } from "node:test";
import assert from "node:assert/strict";

import { parsePc, pcName, midiToName, midiToFreq, freqToMidi, nearestNote, prefersFlats } from "../src/theory/notes.js";
import { scalePcs, scaleDegree, parentRoot, SCALES } from "../src/theory/scales.js";
import { parseChord, parseRoman, chordPcs, chordName, guideTones, chordDegree, diatonicSevenths, CHORD_TYPES } from "../src/theory/chords.js";

test("note names parse to pitch classes, including flats and odd spellings", () => {
  assert.equal(parsePc("C"), 0);
  assert.equal(parsePc("Bb"), 10);
  assert.equal(parsePc("A#"), 10);
  assert.equal(parsePc("Cb"), 11);
  assert.equal(parsePc("E#"), 5);
  assert.equal(parsePc("f#3"), 6);
  assert.throws(() => parsePc("H"));
});

test("MIDI, frequency and names round-trip", () => {
  assert.equal(midiToFreq(69), 440);
  assert.ok(Math.abs(midiToFreq(40) - 82.4069) < 1e-3); // low E
  assert.ok(Math.abs(freqToMidi(82.4069) - 40) < 1e-4);
  assert.equal(midiToName(40), "E2");
  assert.equal(midiToName(70, true), "Bb4");
  assert.equal(freqToMidi(0), null);
  const n = nearestNote(445);
  assert.equal(n.midi, 69);
  assert.ok(Math.abs(n.cents - 19.56) < 0.01);
});

test("flat keys are spelled with flats", () => {
  assert.equal(prefersFlats(5), true);  // F
  assert.equal(prefersFlats(7), false); // G
  assert.equal(prefersFlats(2, "minor"), true); // D minor -> F major
  assert.equal(pcName(10, true), "Bb");
});

test("scales: G major and its modes share notes, with the right degree labels", () => {
  assert.deepEqual(scalePcs(7, "major"), [7, 9, 11, 0, 2, 4, 6]);
  assert.deepEqual(new Set(scalePcs(9, "dorian")), new Set(scalePcs(7, "major")));
  assert.deepEqual(new Set(scalePcs(2, "mixolydian")), new Set(scalePcs(7, "major")));
  assert.equal(scaleDegree(9, "dorian", 0), "b3");
  assert.equal(scaleDegree(9, "dorian", 1), null);
  for (const [id, s] of Object.entries(SCALES)) {
    assert.equal(s.intervals.length, s.degrees.length, id);
  }
});

test("scale parents point at the major scale that owns the fingerings", () => {
  assert.equal(parentRoot(9, "dorian"), 7);      // A dorian -> G
  assert.equal(parentRoot(4, "aeolian"), 7);     // E minor -> G
  assert.equal(parentRoot(9, "minorPent"), 0);   // A minor pent -> C
  assert.equal(parentRoot(11, "locrian"), 0);    // B locrian -> C
  assert.equal(parentRoot(7, "phrygianDom"), 3); // G phrygian dominant -> C harmonic minor -> Eb
});

test("chord symbols parse in the spellings people write", () => {
  assert.deepEqual(parseChord("Bbmaj7"), { root: 10, type: "maj7" });
  assert.deepEqual(parseChord("F#m7b5"), { root: 6, type: "m7b5" });
  assert.deepEqual(parseChord("Bø"), { root: 11, type: "m7b5" });
  assert.deepEqual(parseChord("C-7"), { root: 0, type: "m7" });
  assert.deepEqual(parseChord("EbΔ"), { root: 3, type: "maj7" });
  assert.deepEqual(parseChord("B7b9"), { root: 11, type: "7b9" });
  assert.deepEqual(parseChord("Am6"), { root: 9, type: "m6" });
  assert.deepEqual(parseChord("G"), { root: 7, type: "maj" });
  assert.equal(parseChord("Xm7"), null);
  assert.equal(parseChord("Cfoo"), null);
});

test("roman numerals resolve with explicit or implied quality", () => {
  assert.deepEqual(parseRoman("iim7"), { degree: 2, type: "m7" });
  assert.deepEqual(parseRoman("V7"), { degree: 7, type: "7" });
  assert.deepEqual(parseRoman("bVII7"), { degree: 10, type: "7" });
  assert.deepEqual(parseRoman("#ivdim7"), { degree: 6, type: "dim7" });
  assert.deepEqual(parseRoman("vi"), { degree: 9, type: "m" });
  assert.deepEqual(parseRoman("IV"), { degree: 5, type: "maj" });
  assert.equal(parseRoman("Bbmaj7"), null);
});

test("chord tones, names and guide tones", () => {
  const g7 = { root: 7, type: "7" };
  assert.deepEqual(chordPcs(g7), [7, 11, 2, 5]);
  assert.deepEqual(guideTones(g7), [11, 5]); // B and F
  assert.deepEqual(guideTones({ root: 0, type: "m6" }), [3, 9]);
  assert.deepEqual(guideTones({ root: 2, type: "7sus4" }), [7, 0]);
  assert.equal(chordName({ root: 10, type: "maj7" }, true), "Bbmaj7");
  assert.equal(chordDegree(g7, 5), "b7");
  assert.equal(chordDegree(g7, 0), null);
});

test("every chord type is internally consistent", () => {
  for (const [id, t] of Object.entries(CHORD_TYPES)) {
    assert.equal(t.tones.length, t.degrees.length, id);
    assert.equal(t.voicing.length, 4, id);
    assert.ok(SCALES[t.scale], `${id} -> ${t.scale}`);
  }
});

test("diatonic sevenths of G major", () => {
  const names = diatonicSevenths(7).map((c) => chordName(c));
  assert.deepEqual(names, ["Gmaj7", "Am7", "Bm7", "Cmaj7", "D7", "Em7", "F#m7b5"]);
});
