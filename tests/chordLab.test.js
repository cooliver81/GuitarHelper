import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PRESETS, MAX_CHORDS, presetChords, toSeventh, toTriad, romanLabel, palette,
  resolveChord, voiceProgression, arpeggio, spellLab,
} from "../src/theory/chordLab.js";
import { chordName, chordPcs } from "../src/theory/chords.js";
import { mod12 } from "../src/theory/notes.js";

const romans = (chords) => chords.map(romanLabel).join(" ");

test("every preset parses, has 1–4 chords and a unique id", () => {
  const ids = new Set();
  for (const p of PRESETS) {
    const chords = presetChords(p);
    assert.ok(chords.length >= 1 && chords.length <= MAX_CHORDS, p.id);
    assert.ok(chords.every((c) => c.type), p.id);
    assert.ok(!ids.has(p.id), p.id);
    ids.add(p.id);
  }
});

test("roman labels: case from quality, suffix from type", () => {
  assert.equal(romanLabel({ degree: 0, type: "maj" }), "I");
  assert.equal(romanLabel({ degree: 2, type: "m7" }), "ii7");
  assert.equal(romanLabel({ degree: 7, type: "7" }), "V7");
  assert.equal(romanLabel({ degree: 11, type: "m7b5" }), "viiø7");
  assert.equal(romanLabel({ degree: 11, type: "dim" }), "vii°");
  assert.equal(romanLabel({ degree: 10, type: "maj" }), "bVII");
  assert.equal(romanLabel({ degree: 8, type: "maj7" }), "bVImaj7");
  assert.equal(romanLabel({ degree: 6, type: "dim7" }), "#iv°7");
  assert.equal(romanLabel({ degree: 0, type: "aug" }), "I+");
});

test("triads to 7ths give the diatonic 7th chords, major and minor", () => {
  const major = palette("major", "triad").filter((c) => !c.extra);
  assert.equal(romans(major), "I ii iii IV V vi vii°");
  assert.equal(romans(major.map(toSeventh)), "Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7");
  const minor = palette("minor", "triad").filter((c) => !c.extra);
  assert.equal(romans(minor.map(toSeventh)), "i7 iiø7 bIIImaj7 iv7 v7 bVImaj7 bVII7");
  assert.deepEqual(palette("major", "seventh"), palette("major", "triad").map((c) => ({ ...toSeventh(c), extra: c.extra })));
});

test("7ths back to triads; conversion leaves the other size alone", () => {
  const sevenths = ["maj7", "m7", "7", "m7b5", "dim7"].map((type) => ({ degree: 0, type }));
  assert.deepEqual(sevenths.map((c) => toTriad(c).type), ["maj", "m", "maj", "dim", "dim"]);
  assert.deepEqual(toTriad({ degree: 4, type: "m" }), { degree: 4, type: "m" });
  assert.deepEqual(toSeventh({ degree: 7, type: "7" }), { degree: 7, type: "7" });
  assert.equal(toSeventh({ degree: 0, type: "aug" }).type, "aug");
});

test("presets resolve in a key", () => {
  const pop = PRESETS.find((p) => p.id === "pop");
  assert.deepEqual(presetChords(pop).map((c) => chordName(resolveChord(c, 7))), ["G", "D", "Em", "C"]);
  const andalusian = PRESETS.find((p) => p.id === "andalusian");
  assert.equal(andalusian.mode, "minor");
  assert.deepEqual(presetChords(andalusian).map((c) => chordName(resolveChord(c, 9))), ["Am", "G", "F", "E"]);
});

test("spelling: borrowed roots take flats, tones are spelled by letter", () => {
  const n = (degree, type, key, mode = "major") => spellLab({ degree, type }, key, mode);
  assert.deepEqual(n(8, "maj", 0), { name: "Ab", tones: ["Ab", "C", "Eb"] });
  assert.deepEqual(n(10, "7", 0), { name: "Bb7", tones: ["Bb", "D", "F", "Ab"] });
  assert.deepEqual(n(5, "m", 0), { name: "Fm", tones: ["F", "Ab", "C"] });
  assert.deepEqual(n(11, "dim", 5), { name: "Edim", tones: ["E", "G", "Bb"] });
  assert.deepEqual(n(7, "7", 9, "minor"), { name: "E7", tones: ["E", "G#", "B", "D"] });
  assert.deepEqual(n(4, "m", 2), { name: "F#m", tones: ["F#", "A", "C#"] });
  assert.deepEqual(n(6, "dim7", 0), { name: "F#dim7", tones: ["F#", "A", "C", "Eb"] });
  // Double flats fall back to the plain name: Cdim7's bb7 shows as A.
  assert.deepEqual(n(0, "dim7", 0).tones, ["C", "Eb", "Gb", "A"]);
});

// ---------- Voicing ----------

const chordsIn = (id, key, size = "triad") => {
  const cs = presetChords(PRESETS.find((p) => p.id === id));
  return cs.map((c) => resolveChord(size === "seventh" ? toSeventh(c) : c, key));
};

const totalMove = (vs) => vs.slice(1).reduce((sum, v, i) => {
  const prev = vs[i].upper;
  return sum + v.upper.reduce((s, m) => s + Math.min(...prev.map((p) => Math.abs(p - m))), 0);
}, 0);

test("voicings: root in the bass, every chord tone once in the upper voices, in range", () => {
  for (const smooth of [false, true]) {
    for (const size of ["triad", "seventh"]) {
      const chords = chordsIn("ii-V-I", 5, size);
      voiceProgression(chords, { smooth }).forEach((v, i) => {
        const c = chords[i];
        assert.equal(mod12(v.bass), c.root);
        assert.ok(v.bass >= 40 && v.bass < 52, `bass ${v.bass}`);
        assert.deepEqual(v.upper.map(mod12).sort((a, b) => a - b), chordPcs(c).sort((a, b) => a - b));
        assert.ok(v.upper[0] >= 52 && v.upper[0] < 64, `low ${v.upper[0]}`);
        assert.ok(v.upper.every((m, k) => k === 0 || m > v.upper[k - 1]), "ascending");
      });
    }
  }
});

test("root position stacks from the root; smooth moves less", () => {
  const chords = chordsIn("pop", 0);
  const plain = voiceProgression(chords, { smooth: false });
  plain.forEach((v, i) => assert.equal(mod12(v.upper[0]), chords[i].root));
  const smooth = voiceProgression(chords, { smooth: true });
  assert.deepEqual(smooth[0], plain[0]);
  assert.ok(totalMove(smooth) < totalMove(plain), `${totalMove(smooth)} vs ${totalMove(plain)}`);
  // C -> G: the common tone G stays put.
  assert.ok(smooth[1].upper.includes(plain[0].upper[2]));
});

// ---------- Arpeggios ----------

test("arpeggio patterns cycle through the notes", () => {
  const n = [48, 60, 64, 67];
  assert.deepEqual(arpeggio(n, "up", 8), [48, 60, 64, 67, 48, 60, 64, 67]);
  assert.deepEqual(arpeggio(n, "down", 5), [67, 64, 60, 48, 67]);
  assert.deepEqual(arpeggio(n, "updown", 8), [48, 60, 64, 67, 64, 60, 48, 60]);
  assert.deepEqual(arpeggio([67, 48, 64], "up", 3), [48, 64, 67]);
  assert.deepEqual(arpeggio([60, 64], "updown", 4), [60, 64, 60, 64]);
});
