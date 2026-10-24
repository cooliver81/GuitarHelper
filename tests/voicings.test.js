import { test } from "node:test";
import assert from "node:assert/strict";

import { closeVoicing, voicingVoices, voicingsFor, fretString, voiceLead, movementCost, diatonicWalk } from "../src/theory/voicings.js";
import { chordPcs, identifyChord, chordName, scaleSevenths } from "../src/theory/chords.js";
import { scalePcs } from "../src/theory/scales.js";
import { mod12 } from "../src/theory/notes.js";

const Cmaj7 = { root: 0, type: "maj7" };

test("close voicing and inversions", () => {
  assert.deepEqual(closeVoicing("maj7", 0), [0, 4, 7, 11]);
  assert.deepEqual(closeVoicing("maj7", 1), [4, 7, 11, 12]);
  assert.deepEqual(closeVoicing("maj", 0), [0, 4, 7, 12]);
});

test("drop 2 drops the second voice from the top", () => {
  // close C E G B -> drop G: G C E B
  assert.deepEqual(voicingVoices("maj7", "drop2", 0), [-5, 0, 4, 11]);
  // drop 3: drop E: E C G B
  assert.deepEqual(voicingVoices("maj7", "drop3", 0), [-8, 0, 7, 11]);
  // drop 2&4: drop C and G
  assert.deepEqual(voicingVoices("maj7", "drop24", 0), [-12, -5, 4, 11]);
});

test("shells: R-7-3 from string 6, R-3-7 from string 5", () => {
  assert.deepEqual(voicingVoices("7", "shell", 0, [6, 4, 3]), [0, 10, 16]);
  assert.deepEqual(voicingVoices("7", "shell", 0, [5, 4, 3]), [0, 4, 10]);
});

test("Cmaj7 drop 2 on the top four strings includes the common x-x-10-12-12-12", () => {
  const vs = voicingsFor(Cmaj7, "drop2", { stringSets: [[4, 3, 2, 1]] });
  const shapes = vs.map(fretString);
  assert.ok(shapes.includes("x-x-10-12-12-12"), shapes.join(", "));
  assert.ok(shapes.includes("x-x-5-5-5-7"), shapes.join(", "));
  // Four inversions, each somewhere on the neck.
  assert.deepEqual(new Set(vs.map((v) => v.inversion)), new Set([0, 1, 2, 3]));
});

test("every generated voicing contains exactly the chord's voicing tones", () => {
  const chords = [Cmaj7, { root: 2, type: "m7" }, { root: 7, type: "7" }, { root: 11, type: "m7b5" }, { root: 4, type: "7b9" }];
  for (const c of chords) {
    for (const kind of ["drop2", "drop3", "drop24"]) {
      for (const v of voicingsFor(c, kind)) {
        const pcs = new Set(v.midis.map(mod12));
        assert.equal(pcs.size, 4, `${kind} ${v.frets}`);
        for (const pc of pcs) assert.ok(chordPcs(c).includes(pc));
        const fretted = v.frets.filter((f) => f > 0);
        if (fretted.length) assert.ok(Math.max(...fretted) - Math.min(...fretted) <= 4);
      }
    }
  }
});

test("voice leading picks the cheapest path (checked against brute force)", () => {
  const prog = [{ root: 2, type: "m7" }, { root: 7, type: "7" }, { root: 0, type: "maj7" }];
  const sets = [[4, 3, 2, 1]];
  const result = voiceLead(prog, "drop2", { stringSets: sets });
  const cands = prog.map((c) => voicingsFor(c, "drop2", { stringSets: sets }));
  let best = Infinity;
  for (const a of cands[0]) for (const b of cands[1]) for (const c of cands[2]) {
    const start = 0.3 * Math.abs(a.frets.reduce((s, f) => s + f, 0) / 4 - 5);
    best = Math.min(best, start + movementCost(a, b) + movementCost(b, c));
  }
  assert.ok(Math.abs(result.cost - best) < 1e-9);
  // A good ii-V-I in drop 2 moves little: total under ~6 semitones per change.
  assert.ok(result.cost < 14, `cost ${result.cost}`);
});

test("identifyChord names stacked notes", () => {
  assert.deepEqual(identifyChord([7, 11, 2, 6]), { root: 7, type: "maj7" });
  assert.deepEqual(identifyChord([6, 9, 0, 4]), { root: 6, type: "m7b5" });
  assert.equal(identifyChord([0, 1, 2]), null);
});

test("diatonic 7ths of harmonic minor include mMaj7 and dim7", () => {
  const names = scaleSevenths(scalePcs(9, "harmonicMinor")).map((c) => (c ? chordName(c) : "?"));
  assert.deepEqual(names, ["AmMaj7", "Bm7b5", "?", "Dm7", "E7", "Fmaj7", "G#dim7"]);
});

test("diatonic drop 2 walk in G harmonises the scale", () => {
  const start = voicingsFor({ root: 7, type: "maj7" }, "drop2", { stringSets: [[4, 3, 2, 1]] })[0];
  const walk = diatonicWalk(start, scalePcs(7, "major"));
  const names = walk.map((v) => chordName(identifyChord(v.midis.map(mod12))));
  assert.deepEqual(names, ["Gmaj7", "Am7", "Bm7", "Cmaj7", "D7", "Em7", "F#m7b5", "Gmaj7"]);
  assert.equal(walk[7].midis[0] - walk[0].midis[0], 12);
});
