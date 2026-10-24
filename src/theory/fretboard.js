// Fretboard geometry: where notes are, and which dots make up a position or pattern.
// Strings are numbered like guitarists do: 6 = low E ... 1 = high E.

import { mod12 } from "./notes.js";

export const STANDARD_TUNING = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };
export const STRINGS_LOW_TO_HIGH = [6, 5, 4, 3, 2, 1];
export const MAX_FRET = 15;

export function midiAt(string, fret, tuning = STANDARD_TUNING) {
  return tuning[string] + fret;
}

// Every place a set of pitch classes appears between two frets.
export function dotsForPcs(pcs, { fretMin = 0, fretMax = MAX_FRET, tuning = STANDARD_TUNING } = {}) {
  const set = new Set(pcs.map(mod12));
  const dots = [];
  for (const string of STRINGS_LOW_TO_HIGH) {
    for (let fret = fretMin; fret <= fretMax; fret++) {
      const midi = midiAt(string, fret, tuning);
      if (set.has(mod12(midi))) dots.push({ string, fret, midi, pc: mod12(midi) });
    }
  }
  return dots;
}

// Lowest fret >= 0 where pitch class `pc` sits on string 6.
export function lowFretOf(pc, tuning = STANDARD_TUNING) {
  return mod12(pc - tuning[6]);
}

// "Position playing": index finger at fret `start`, one finger per fret (start..start+3),
// stretching one fret either side only for notes not reachable inside the box.
// Each pitch appears once. This is how one-position scales and arpeggios are taught.
export function positionDots(pcs, start, tuning = STANDARD_TUNING) {
  const lo = Math.max(0, start - 1);
  const hi = start + 4;
  const candidates = dotsForPcs(pcs, { fretMin: lo, fretMax: hi, tuning });
  const inside = (d) => d.fret >= start && d.fret <= start + 3;
  const byMidi = new Map();
  for (const d of candidates) {
    const prev = byMidi.get(d.midi);
    if (!prev) { byMidi.set(d.midi, d); continue; }
    // Prefer the in-box fret; between two in-box options keep the lower string.
    if (!inside(prev) && inside(d)) byMidi.set(d.midi, d);
  }
  // Stretches fill gaps inside the box; they never extend its range.
  const insideMidis = candidates.filter(inside).map((d) => d.midi);
  const minIn = Math.min(...insideMidis);
  const maxIn = Math.max(...insideMidis);
  return [...byMidi.values()]
    .filter((d) => inside(d) || (d.midi > minIn && d.midi < maxIn))
    .sort((a, b) => a.midi - b.midi);
}

// Five standard position starts for a key, relative to its parent major root on string 6:
// the E, D, C, A and G shapes of the CAGED system, in order up the neck.
const CAGED_OFFSETS = [
  { shape: "E", offset: -1 },
  { shape: "D", offset: 1 },
  { shape: "C", offset: 4 },
  { shape: "A", offset: 6 },
  { shape: "G", offset: 9 },
];

export function cagedPositions(parentPc, tuning = STANDARD_TUNING) {
  const rootFret = lowFretOf(parentPc, tuning);
  return CAGED_OFFSETS
    .map(({ shape, offset }) => {
      let start = rootFret + offset;
      while (start < 0) start += 12;
      while (start > 11) start -= 12;
      return { shape, start };
    })
    .sort((a, b) => a.start - b.start)
    .map((p, i) => ({ ...p, number: i + 1 }));
}

// N notes per string: start on string 6 at scale note `startIndex`, then walk the scale
// upward, N notes on each string. 2 = pentatonic boxes, 3 = 3-notes-per-string.
export function notesPerStringDots(rootPc, intervals, startIndex, perString, tuning = STANDARD_TUNING) {
  const n = intervals.length;
  const firstPc = mod12(rootPc + intervals[startIndex % n]);
  let midi = tuning[6] + lowFretOf(firstPc, tuning);
  const dots = [];
  let idx = startIndex % n;
  for (const string of STRINGS_LOW_TO_HIGH) {
    for (let k = 0; k < perString; k++) {
      dots.push({ string, fret: midi - tuning[string], midi, pc: mod12(midi) });
      const next = (idx + 1) % n;
      const step = mod12(intervals[next] - intervals[idx]) || 12;
      midi += step;
      idx = next;
    }
  }
  // If the shape dips below the nut, move it up an octave.
  const minFret = Math.min(...dots.map((d) => d.fret));
  const shift = minFret < 0 ? 12 : 0;
  return dots.map((d) => ({ ...d, fret: d.fret + shift, midi: d.midi + shift }));
}

// Notes on one string between two frets — for horizontal (along-the-string) practice.
export function singleStringDots(pcs, string, { fretMin = 0, fretMax = MAX_FRET, tuning = STANDARD_TUNING } = {}) {
  return dotsForPcs(pcs, { fretMin, fretMax, tuning }).filter((d) => d.string === string);
}
