// Scale formulas. `degrees` labels each interval; `colour` = the degree(s) that give a
// mode its sound compared with plain major/minor; `parent` is the distance from the
// scale's root to the root of the major scale (or minor parent) whose fingering
// positions it shares, so A dorian uses the same five positions as G major.

import { mod12 } from "./notes.js";

const MAJOR_DEGREES = ["1", "2", "3", "4", "5", "6", "7"];

export const SCALES = {
  majorPent:      { name: "Major pentatonic",      group: "Pentatonic & blues", intervals: [0, 2, 4, 7, 9], degrees: ["1", "2", "3", "5", "6"], parent: 0, colour: [] },
  minorPent:      { name: "Minor pentatonic",      group: "Pentatonic & blues", intervals: [0, 3, 5, 7, 10], degrees: ["1", "b3", "4", "5", "b7"], parent: 3, colour: [] },
  blues:          { name: "Blues",                 group: "Pentatonic & blues", intervals: [0, 3, 5, 6, 7, 10], degrees: ["1", "b3", "4", "b5", "5", "b7"], parent: 3, colour: ["b5"] },

  major:          { name: "Major (Ionian)",        group: "Major scale & modes", intervals: [0, 2, 4, 5, 7, 9, 11], degrees: MAJOR_DEGREES, parent: 0, colour: ["4", "7"] },
  dorian:         { name: "Dorian",                group: "Major scale & modes", intervals: [0, 2, 3, 5, 7, 9, 10], degrees: ["1", "2", "b3", "4", "5", "6", "b7"], parent: -2, colour: ["6"] },
  phrygian:       { name: "Phrygian",              group: "Major scale & modes", intervals: [0, 1, 3, 5, 7, 8, 10], degrees: ["1", "b2", "b3", "4", "5", "b6", "b7"], parent: -4, colour: ["b2"] },
  lydian:         { name: "Lydian",                group: "Major scale & modes", intervals: [0, 2, 4, 6, 7, 9, 11], degrees: ["1", "2", "3", "#4", "5", "6", "7"], parent: -5, colour: ["#4"] },
  mixolydian:     { name: "Mixolydian",            group: "Major scale & modes", intervals: [0, 2, 4, 5, 7, 9, 10], degrees: ["1", "2", "3", "4", "5", "6", "b7"], parent: -7, colour: ["b7"] },
  aeolian:        { name: "Natural minor (Aeolian)", group: "Major scale & modes", intervals: [0, 2, 3, 5, 7, 8, 10], degrees: ["1", "2", "b3", "4", "5", "b6", "b7"], parent: 3, colour: ["b6"] },
  locrian:        { name: "Locrian",               group: "Major scale & modes", intervals: [0, 1, 3, 5, 6, 8, 10], degrees: ["1", "b2", "b3", "4", "b5", "b6", "b7"], parent: 1, colour: ["b5"] },

  harmonicMinor:  { name: "Harmonic minor",        group: "Jazz minor", intervals: [0, 2, 3, 5, 7, 8, 11], degrees: ["1", "2", "b3", "4", "5", "b6", "7"], parent: 3, colour: ["7"] },
  phrygianDom:    { name: "Phrygian dominant (V of harmonic minor)", group: "Jazz minor", intervals: [0, 1, 4, 5, 7, 8, 10], degrees: ["1", "b9", "3", "4", "5", "b13", "b7"], parent: 8, colour: ["b9", "3"] },
  locrianNat2:    { name: "Locrian ♮2 (for m7b5)", group: "Jazz minor", intervals: [0, 2, 3, 5, 6, 8, 10], degrees: ["1", "9", "b3", "11", "b5", "b13", "b7"], parent: 1, colour: ["9"] },
  melodicMinor:   { name: "Melodic minor",         group: "Jazz minor", intervals: [0, 2, 3, 5, 7, 9, 11], degrees: ["1", "2", "b3", "4", "5", "6", "7"], parent: 3, colour: ["6", "7"] },

  altered:        { name: "Altered (for 7alt)",    group: "Jazz dominant", intervals: [0, 1, 3, 4, 6, 8, 10], degrees: ["1", "b9", "#9", "3", "#11", "b13", "b7"], parent: 4, colour: ["#9", "b13"] },
  lydianDom:      { name: "Lydian dominant",       group: "Jazz dominant", intervals: [0, 2, 4, 6, 7, 9, 10], degrees: ["1", "9", "3", "#11", "5", "13", "b7"], parent: 10, colour: ["#11", "b7"] },
  halfWhole:      { name: "Half-whole diminished", group: "Jazz dominant", intervals: [0, 1, 3, 4, 6, 7, 9, 10], degrees: ["1", "b9", "#9", "3", "#11", "5", "13", "b7"], parent: 0, colour: ["b9", "13"] },
  bebopDom:       { name: "Bebop dominant",        group: "Jazz dominant", intervals: [0, 2, 4, 5, 7, 9, 10, 11], degrees: ["1", "2", "3", "4", "5", "6", "b7", "7"], parent: -7, colour: ["7"] },
};

export function scalePcs(rootPc, scaleId) {
  return SCALES[scaleId].intervals.map((i) => mod12(rootPc + i));
}

// Label for a pitch class inside a scale ("b3"), or null if it isn't in the scale.
export function scaleDegree(rootPc, scaleId, pc) {
  const s = SCALES[scaleId];
  const idx = s.intervals.indexOf(mod12(pc - rootPc));
  return idx < 0 ? null : s.degrees[idx];
}

export function parentRoot(rootPc, scaleId) {
  return mod12(rootPc + SCALES[scaleId].parent);
}
