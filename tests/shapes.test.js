import { test } from "node:test";
import assert from "node:assert/strict";

import {
  positionFinger, patternFingers, sequenceIndexes, shapeOrder, compareScales, MODE_LADDER,
  pentatonicsInside, positionMembership, connectPositions, checkCells, anchorTriad,
} from "../src/theory/shapes.js";
import { SCALES, scalePcs, parentRoot } from "../src/theory/scales.js";
import { positionDots, notesPerStringDots } from "../src/theory/fretboard.js";
import { pcName, prefersFlats } from "../src/theory/notes.js";

test("position fingering: one finger per fret, stretches go to index or pinky", () => {
  assert.equal(positionFinger(2, 2), 1);
  assert.equal(positionFinger(5, 2), 4);
  assert.equal(positionFinger(1, 2), 1); // stretch below
  assert.equal(positionFinger(6, 2), 4); // stretch above
  assert.equal(positionFinger(0, 0), 0);
});

test("3-notes-per-string fingering", () => {
  const dots = notesPerStringDots(7, SCALES.major.intervals, 0, 3); // G major from G
  const f = patternFingers(dots);
  const low = dots.map((d, i) => [d, f[i]]).filter(([d]) => d.string === 6).map(([, x]) => x);
  assert.deepEqual(low, [1, 2, 4]); // frets 3 5 7
});

test("sequences: thirds and groups of 3 go up then mirror down", () => {
  assert.deepEqual(sequenceIndexes(5, "thirds"), [0, 2, 1, 3, 2, 4, 4, 2, 3, 1, 2, 0]);
  assert.deepEqual(sequenceIndexes(4, "groups3"), [0, 1, 2, 1, 2, 3, 3, 2, 1, 2, 1, 0]);
  assert.deepEqual(sequenceIndexes(3, "straight"), [0, 1, 2, 1, 0]);
  assert.deepEqual(sequenceIndexes(2, "triads"), []);
});

test("shapeOrder sorts low to high and drops repeated pitches", () => {
  const order = shapeOrder(positionDots(scalePcs(7, "major"), 2));
  for (let i = 1; i < order.length; i++) assert.ok(order[i].midi > order[i - 1].midi);
});

test("compare modes: dorian vs aeolian differ only in the 6th", () => {
  const c = compareScales(9, "dorian", "aeolian");
  assert.deepEqual(c.diffs, [{ a: "6", b: "b6" }]);
  assert.equal(c.both.length, 6);
});

test("each step down the mode ladder changes exactly one note", () => {
  for (let i = 0; i + 1 < MODE_LADDER.length; i++) {
    assert.equal(compareScales(0, MODE_LADDER[i], MODE_LADDER[i + 1]).diffs.length, 1, MODE_LADDER[i]);
  }
});

test("compare pairs 9 with 2 and handles extra notes", () => {
  const c = compareScales(2, "locrianNat2", "locrian");
  assert.deepEqual(c.diffs, [{ a: "9", b: "b2" }]);
  const blues = compareScales(9, "blues", "minorPent");
  assert.deepEqual(blues.diffs, [{ a: "b5", b: null }]);
});

test("G major hides G, C and D major pentatonic", () => {
  const p = pentatonicsInside(7, "major");
  assert.deepEqual(p.map((x) => pcName(x.majorRoot)), ["G", "C", "D"]);
  assert.deepEqual(p.map((x) => pcName(x.minorRoot)), ["E", "A", "B"]);
  assert.equal(pentatonicsInside(9, "harmonicMinor").length, 0);
});

test("every note of G major on the neck belongs to at least one position, many to two", () => {
  const m = positionMembership(7, "major");
  const inFrets = m.filter((d) => d.fret >= 1 && d.fret <= 13);
  assert.ok(inFrets.every((d) => d.positions.length >= 1), JSON.stringify(inFrets.find((d) => !d.positions.length)));
  assert.ok(m.filter((d) => d.positions.length >= 2).length >= 10);
  // Every position is home to some notes (the map isn't all one colour).
  assert.deepEqual(new Set(m.map((d) => d.home).filter((x) => x >= 0)), new Set([0, 1, 2, 3, 4]));
});

test("connecting positions 2 and 3 of G major shares notes", () => {
  const c = connectPositions(scalePcs(7, "major"), 2, 4);
  assert.ok(c.some((d) => d.side === "both"));
  assert.ok(c.some((d) => d.side === "a") && c.some((d) => d.side === "b"));
});

test("checkCells", () => {
  const r = checkCells(["6:3", "6:5"], ["6:3", "5:2"]);
  assert.deepEqual(r, { correct: ["6:3"], wrong: ["5:2"], missed: ["6:5"], perfect: false });
  assert.equal(checkCells(["1:1"], ["1:1"]).perfect, true);
});

test("anchor triads", () => {
  assert.deepEqual(anchorTriad(7, "major"), [7, 11, 2]);      // G B D
  assert.deepEqual(anchorTriad(9, "dorian"), [9, 0, 4]);      // A C E
  assert.deepEqual(anchorTriad(11, "locrian"), [11, 2, 5]);   // B D F
});

test("each scale is spelled in its own key: G minor's b6 is Eb, G dorian's 6 is E", () => {
  const spell = (root, id, pc) => pcName(pc, prefersFlats(parentRoot(root, id)));
  assert.equal(spell(7, "aeolian", 3), "Eb");
  assert.equal(spell(7, "dorian", 4), "E");
  assert.equal(spell(7, "major", 6), "F#");
});
