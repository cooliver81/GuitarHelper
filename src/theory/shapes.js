// Tools for learning scale shapes: fingerings, practice sequences, comparing two scales,
// pentatonics hidden inside a scale, which positions share which notes, quiz checking.
// All pure functions (tested in tests/shapes.test.js).

import { mod12 } from "./notes.js";
import { SCALES, scalePcs } from "./scales.js";
import { positionDots, cagedPositions, dotsForPcs } from "./fretboard.js";

// ---------- Fingering ----------

// Position playing: one finger per fret from `start` (index) to start+3 (pinky);
// a stretch below the box is the index, above it the pinky. Open strings = 0.
export function positionFinger(fret, start) {
  if (fret === 0) return 0;
  return Math.max(1, Math.min(4, fret - start + 1));
}

// Per-string fingering for patterns (e.g. 3 notes per string): spread fingers 1..4
// across the span on each string.
export function patternFingers(dots) {
  const byString = new Map();
  for (const d of dots) (byString.get(d.string) || byString.set(d.string, []).get(d.string)).push(d.fret);
  return dots.map((d) => {
    const frets = byString.get(d.string);
    const lo = Math.min(...frets);
    const span = Math.max(...frets) - lo;
    if (d.fret === 0) return 0;
    const o = d.fret - lo;
    if (span <= 3) return 1 + o;
    // Stretched string (whole-whole = frets x, x+2, x+4): fingers 1-2-4.
    return [1, 2, 2, 3, 4, 4][Math.round((o * 4) / span)];
  });
}

// ---------- Sequences ----------

export const SEQUENCES = {
  straight: { name: "Straight up and down", group: 1, step: 1 },
  thirds:   { name: "In 3rds (1-3, 2-4…)", pattern: [0, 2] },
  fourths:  { name: "In 4ths (1-4, 2-5…)", pattern: [0, 3] },
  groups3:  { name: "Groups of 3 (1-2-3, 2-3-4…)", pattern: [0, 1, 2] },
  groups4:  { name: "Groups of 4 (1-2-3-4, 2-3-4-5…)", pattern: [0, 1, 2, 3] },
  triads:   { name: "Triads (1-3-5, 2-4-6…)", pattern: [0, 2, 4] },
  sevenths: { name: "7th arpeggios (1-3-5-7…)", pattern: [0, 2, 4, 6] },
};

// Indexes into a list of n notes sorted low to high. Up the shape, then the same
// pattern mirrored back down.
export function sequenceIndexes(n, type) {
  if (n <= 0) return [];
  if (type === "straight") return [...Array(n).keys(), ...[...Array(n - 1).keys()].reverse()];
  const pat = SEQUENCES[type].pattern;
  const reach = Math.max(...pat);
  const up = [];
  for (let i = 0; i + reach < n; i++) pat.forEach((p) => up.push(i + p));
  const down = [];
  for (let i = n - 1; i - reach >= 0; i--) pat.forEach((p) => down.push(i - p));
  return [...up, ...down];
}

// Notes in a shape, low to high, each pitch once.
export function shapeOrder(dots) {
  const sorted = dots.slice().sort((a, b) => a.midi - b.midi);
  return sorted.filter((d, i) => i === 0 || d.midi !== sorted[i - 1].midi);
}

// ---------- Comparing scales ----------

const degreeNumber = (label) => Number(label.replace(/[^0-9]/g, "")) % 7 || 7;

// Same root, two scales: which notes they share and which differ, paired by degree
// ("6 vs b6"). Degree numbers compare 9 with 2, 11 with 4, 13 with 6.
export function compareScales(rootPc, a, b) {
  const A = scalePcs(rootPc, a);
  const B = scalePcs(rootPc, b);
  const both = A.filter((pc) => B.includes(pc));
  const onlyA = A.filter((pc) => !B.includes(pc));
  const onlyB = B.filter((pc) => !A.includes(pc));
  const label = (id, pc) => SCALES[id].degrees[SCALES[id].intervals.indexOf(mod12(pc - rootPc))];
  const diffs = [];
  const usedB = new Set();
  for (const pc of onlyA) {
    const la = label(a, pc);
    const match = onlyB.find((q) => !usedB.has(q) && degreeNumber(label(b, q)) === degreeNumber(la));
    if (match != null) { usedB.add(match); diffs.push({ a: la, b: label(b, match) }); }
    else diffs.push({ a: la, b: null });
  }
  for (const q of onlyB) if (!usedB.has(q)) diffs.push({ a: null, b: label(b, q) });
  return { both, onlyA, onlyB, diffs };
}

// Brightness order of the major modes: each step down flattens one note.
export const MODE_LADDER = ["lydian", "major", "mixolydian", "dorian", "aeolian", "phrygian", "locrian"];

// ---------- Pentatonics inside a scale ----------

// Every major pentatonic that fits inside the scale, with its relative minor.
// G major contains G, C and D major pentatonic (= E, A and B minor pentatonic).
export function pentatonicsInside(rootPc, scaleId) {
  const pcs = new Set(scalePcs(rootPc, scaleId));
  const out = [];
  for (let r = 0; r < 12; r++) {
    const pent = scalePcs(r, "majorPent");
    if (pent.every((pc) => pcs.has(pc))) out.push({ majorRoot: r, minorRoot: mod12(r + 9), pcs: pent });
  }
  // Start from the one built on the scale's own root, then go round the cycle.
  return out.sort((x, y) => mod12(x.majorRoot - rootPc) - mod12(y.majorRoot - rootPc));
}

// ---------- Positions on the whole neck ----------

// For every dot of the scale on the neck, which of the 5 positions contain it.
// Notes shared by two positions are where you slide from one to the next.
export function positionMembership(rootPc, scaleId) {
  const pcs = scalePcs(rootPc, scaleId);
  const positions = cagedPositions(mod12(rootPc + SCALES[scaleId].parent));
  // Each position also exists an octave up when it starts low enough.
  const copies = positions.flatMap((p, i) => [p.start, p.start + 12].filter((s) => s <= 15).map((start) => ({
    i, start, cells: new Set(positionDots(pcs, start).map((d) => `${d.string}:${d.fret}`)),
  })));
  return dotsForPcs(pcs).map((d) => {
    const inside = copies.filter((c) => c.cells.has(`${d.string}:${d.fret}`));
    // Home = the position whose box (start..start+3) this note sits most centrally in.
    const home = inside.length
      ? inside.reduce((a, b) => (Math.abs(d.fret - (b.start + 1.5)) < Math.abs(d.fret - (a.start + 1.5)) ? b : a)).i
      : -1;
    return { ...d, positions: [...new Set(inside.map((c) => c.i))], home };
  });
}

// Two neighbouring positions: notes in A only, B only, or both.
export function connectPositions(pcs, startA, startB) {
  const A = positionDots(pcs, startA);
  const B = positionDots(pcs, startB);
  const key = (d) => `${d.string}:${d.fret}`;
  const inB = new Set(B.map(key));
  const inA = new Set(A.map(key));
  return [
    ...A.map((d) => ({ ...d, side: inB.has(key(d)) ? "both" : "a" })),
    ...B.filter((d) => !inA.has(key(d))).map((d) => ({ ...d, side: "b" })),
  ];
}

// ---------- Quiz ----------

// Compare clicked cells with the answer. Cells are "string:fret" strings.
export function checkCells(answer, clicked) {
  const want = new Set(answer);
  const got = new Set(clicked);
  return {
    correct: [...got].filter((c) => want.has(c)),
    wrong: [...got].filter((c) => !want.has(c)),
    missed: [...want].filter((c) => !got.has(c)),
    perfect: want.size === got.size && [...got].every((c) => want.has(c)),
  };
}

// The scale's own root triad (1-3-5 or 1-b3-5...) — the chord shape a position hangs on.
export function anchorTriad(rootPc, scaleId) {
  const s = SCALES[scaleId];
  const pick = (re) => s.intervals[s.degrees.findIndex((d) => re.test(d))];
  const third = pick(/^b?3$/) ?? pick(/^#9$/);
  const fifth = pick(/^5$/) ?? pick(/^b5$/);
  return [0, third, fifth].filter((x) => x != null).map((i) => mod12(rootPc + i));
}
