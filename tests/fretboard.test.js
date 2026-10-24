import { test } from "node:test";
import assert from "node:assert/strict";

import { midiAt, dotsForPcs, positionDots, cagedPositions, notesPerStringDots, lowFretOf } from "../src/theory/fretboard.js";
import { scalePcs, SCALES } from "../src/theory/scales.js";

// Frets per string, high E first, for compact assertions.
function shape(dots) {
  const rows = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const d of dots) rows[d.string].push(d.fret);
  return [1, 2, 3, 4, 5, 6].map((s) => rows[s].sort((a, b) => a - b).join(" ")).join(" | ");
}

test("standard tuning", () => {
  assert.equal(midiAt(6, 0), 40);
  assert.equal(midiAt(2, 0), 59);
  assert.equal(midiAt(1, 12), 76);
  assert.equal(lowFretOf(7), 3); // G on string 6
});

test("dotsForPcs finds every G between frets 0 and 12", () => {
  const dots = dotsForPcs([7], { fretMax: 12 });
  assert.equal(dots.length, 7); // 3, 10, 5, 0+12, 8, 3
  assert.ok(dots.every((d) => d.pc === 7));
});

test("G major, index finger at fret 2, is the classic E-shape position", () => {
  const dots = positionDots(scalePcs(7, "major"), 2);
  assert.equal(shape(dots), "2 3 5 | 3 5 | 2 4 5 | 2 4 5 | 2 3 5 | 2 3 5");
  // Each pitch once.
  assert.equal(new Set(dots.map((d) => d.midi)).size, dots.length);
});

test("stretches fill gaps but don't extend the box", () => {
  const dots = positionDots(scalePcs(7, "major"), 4);
  const lowest = Math.min(...dots.map((d) => d.midi));
  assert.equal(lowest, 45); // A2 at fret 5, not the G at fret 3
});

test("five CAGED positions for G, ordered up the neck", () => {
  const p = cagedPositions(7);
  assert.deepEqual(p.map((x) => x.start), [0, 2, 4, 7, 9]);
  assert.deepEqual(p.map((x) => x.shape), ["G", "E", "D", "C", "A"]);
});

test("A minor pentatonic box 1 (2 notes per string) at the 5th fret", () => {
  const dots = notesPerStringDots(9, SCALES.minorPent.intervals, 0, 2);
  assert.equal(shape(dots), "5 8 | 5 8 | 5 7 | 5 7 | 5 7 | 5 8");
});

test("position playing and pentatonic boxes agree for A minor pentatonic", () => {
  const box = positionDots(scalePcs(9, "minorPent"), 5);
  assert.equal(shape(box), "5 8 | 5 8 | 5 7 | 5 7 | 5 7 | 5 8");
});

test("3 notes per string never goes below the nut", () => {
  for (let i = 0; i < 7; i++) {
    const dots = notesPerStringDots(4, SCALES.major.intervals, i, 3); // E major
    assert.equal(dots.length, 18);
    assert.ok(dots.every((d) => d.fret >= 0), `pattern ${i}`);
    // strictly ascending pitch
    for (let k = 1; k < dots.length; k++) assert.ok(dots[k].midi > dots[k - 1].midi);
  }
});
