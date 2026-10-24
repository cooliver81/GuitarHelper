// Chord types, chord-symbol parsing and roman numerals.
// `voicing` is the four chord tones used for drop voicings (rootless where the
// chord has five notes, e.g. 7b9 = 3 5 b7 b9). `scale` is the default chord scale.

import { mod12, parsePc, pcName } from "./notes.js";

export const CHORD_TYPES = {
  maj:   { label: "",      tones: [0, 4, 7],          degrees: ["R", "3", "5"],              voicing: [0, 4, 7, 12],  scale: "major" },
  m:     { label: "m",     tones: [0, 3, 7],          degrees: ["R", "b3", "5"],             voicing: [0, 3, 7, 12],  scale: "aeolian" },
  dim:   { label: "dim",   tones: [0, 3, 6],          degrees: ["R", "b3", "b5"],            voicing: [0, 3, 6, 12],  scale: "locrian" },
  aug:   { label: "aug",   tones: [0, 4, 8],          degrees: ["R", "3", "#5"],             voicing: [0, 4, 8, 12],  scale: "lydianDom" },
  maj7:  { label: "maj7",  tones: [0, 4, 7, 11],      degrees: ["R", "3", "5", "7"],         voicing: [0, 4, 7, 11],  scale: "major" },
  m7:    { label: "m7",    tones: [0, 3, 7, 10],      degrees: ["R", "b3", "5", "b7"],       voicing: [0, 3, 7, 10],  scale: "dorian" },
  7:     { label: "7",     tones: [0, 4, 7, 10],      degrees: ["R", "3", "5", "b7"],        voicing: [0, 4, 7, 10],  scale: "mixolydian" },
  m7b5:  { label: "m7b5",  tones: [0, 3, 6, 10],      degrees: ["R", "b3", "b5", "b7"],      voicing: [0, 3, 6, 10],  scale: "locrian" },
  dim7:  { label: "dim7",  tones: [0, 3, 6, 9],       degrees: ["R", "b3", "b5", "bb7"],     voicing: [0, 3, 6, 9],   scale: "halfWhole" },
  6:     { label: "6",     tones: [0, 4, 7, 9],       degrees: ["R", "3", "5", "6"],         voicing: [0, 4, 7, 9],   scale: "major" },
  m6:    { label: "m6",    tones: [0, 3, 7, 9],       degrees: ["R", "b3", "5", "6"],        voicing: [0, 3, 7, 9],   scale: "melodicMinor" },
  mMaj7: { label: "mMaj7", tones: [0, 3, 7, 11],      degrees: ["R", "b3", "5", "7"],        voicing: [0, 3, 7, 11],  scale: "melodicMinor" },
  "7sus4": { label: "7sus4", tones: [0, 5, 7, 10],      degrees: ["R", "4", "5", "b7"],        voicing: [0, 5, 7, 10],  scale: "mixolydian" },
  maj9:  { label: "maj9",  tones: [0, 4, 7, 11, 14],  degrees: ["R", "3", "5", "7", "9"],    voicing: [4, 7, 11, 14], scale: "major" },
  m9:    { label: "m9",    tones: [0, 3, 7, 10, 14],  degrees: ["R", "b3", "5", "b7", "9"],  voicing: [3, 7, 10, 14], scale: "dorian" },
  9:     { label: "9",     tones: [0, 4, 7, 10, 14],  degrees: ["R", "3", "5", "b7", "9"],   voicing: [4, 7, 10, 14], scale: "mixolydian" },
  "7b9": { label: "7b9",   tones: [0, 4, 7, 10, 13],  degrees: ["R", "3", "5", "b7", "b9"],  voicing: [4, 7, 10, 13], scale: "phrygianDom" },
  "7alt":{ label: "7alt",  tones: [0, 4, 10, 13, 15, 8], degrees: ["R", "3", "b7", "b9", "#9", "b13"], voicing: [4, 10, 15, 20], scale: "altered" },
};

// Suffix spellings people actually write, mapped to a type id.
const SUFFIXES = [
  ["maj7", "maj7"], ["ma7", "maj7"], ["M7", "maj7"], ["Δ7", "maj7"], ["Δ", "maj7"],
  ["maj9", "maj9"], ["M9", "maj9"],
  ["mMaj7", "mMaj7"], ["m(maj7)", "mMaj7"], ["-Δ", "mMaj7"],
  ["m7b5", "m7b5"], ["min7b5", "m7b5"], ["-7b5", "m7b5"], ["ø7", "m7b5"], ["ø", "m7b5"],
  ["m9", "m9"], ["-9", "m9"], ["min9", "m9"],
  ["m7", "m7"], ["min7", "m7"], ["-7", "m7"],
  ["m6", "m6"], ["min6", "m6"], ["-6", "m6"],
  ["dim7", "dim7"], ["o7", "dim7"], ["°7", "dim7"],
  ["dim", "dim"], ["o", "dim"], ["°", "dim"],
  ["aug", "aug"], ["+", "aug"],
  ["7sus4", "7sus4"], ["7sus", "7sus4"],
  ["7b9", "7b9"], ["7(b9)", "7b9"],
  ["7alt", "7alt"], ["alt", "7alt"],
  ["9", "9"], ["7", "7"], ["6", "6"],
  ["min", "m"], ["m", "m"], ["-", "m"],
  ["maj", "maj"], ["", "maj"],
];

function parseSuffix(suffix) {
  for (const [s, type] of SUFFIXES) if (suffix === s) return type;
  return null;
}

// "Bbmaj7" -> { root: 10, type: "maj7" }. Returns null if it isn't a chord symbol.
export function parseChord(symbol) {
  const m = String(symbol).trim().match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;
  const type = parseSuffix(m[2]);
  if (!type) return null;
  return { root: parsePc(m[1]), type };
}

export function chordName(chord, flats = false) {
  return pcName(chord.root, flats) + CHORD_TYPES[chord.type].label;
}

export function chordPcs(chord) {
  return CHORD_TYPES[chord.type].tones.map((t) => mod12(chord.root + t));
}

// Degree label of a pitch class within a chord ("b7"), or null.
export function chordDegree(chord, pc) {
  const t = CHORD_TYPES[chord.type];
  const idx = t.tones.findIndex((i) => mod12(chord.root + i) === mod12(pc));
  return idx < 0 ? null : t.degrees[idx];
}

// The 3rd and 7th (or 6th) — the notes that say what the chord is.
const GUIDE_DEGREES = new Set(["3", "b3", "7", "b7", "bb7", "6"]);

export function guideTones(chord) {
  const t = CHORD_TYPES[chord.type];
  const wanted = chord.type === "7sus4" ? new Set(["4", "b7"]) : GUIDE_DEGREES;
  return t.tones
    .filter((_, idx) => wanted.has(t.degrees[idx]))
    .map((i) => mod12(chord.root + i));
}

// ---------- Roman numerals ----------

const ROMAN = [["VII", 11], ["VI", 9], ["V", 7], ["IV", 5], ["III", 4], ["II", 2], ["I", 0]];

// "bVII7", "iim7b5", "#ivdim7" -> { degree semitones, type }. Case doesn't set quality;
// the suffix does (write "iim7", not "ii"). A bare lowercase numeral means minor triad.
export function parseRoman(token) {
  const m = String(token).trim().match(/^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
  if (!m) return null;
  const upper = m[2].toUpperCase();
  let degree = ROMAN.find(([r]) => r === upper)[1];
  if (m[1] === "b") degree -= 1;
  if (m[1] === "#") degree += 1;
  let type = parseSuffix(m[3]);
  if (!type) return null;
  if (m[3] === "" && m[2] !== upper) type = "m";
  return { degree: mod12(degree), type };
}

// Diatonic 7th chords of a major key, I to vii.
export function diatonicSevenths(keyPc) {
  const steps = [0, 2, 4, 5, 7, 9, 11];
  const types = ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"];
  const romans = ["Imaj7", "iim7", "iiim7", "IVmaj7", "V7", "vim7", "viim7b5"];
  return steps.map((s, i) => ({ root: mod12(keyPc + s), type: types[i], roman: romans[i] }));
}

// Name a set of pitch classes as a chord (4-note types first). Returns null if unknown.
export function identifyChord(pcs) {
  const set = new Set(pcs.map(mod12));
  const order = ["maj7", "m7", "7", "m7b5", "dim7", "mMaj7", "6", "m6", "maj", "m", "dim", "aug"];
  for (const type of order) {
    const tones = CHORD_TYPES[type].tones;
    if (tones.length !== set.size) continue;
    for (const root of set) {
      if (tones.every((t) => set.has(mod12(root + t)))) {
        // 6 vs m7 share notes (C6 = Am7): prefer the 7th-chord reading.
        return { root, type };
      }
    }
  }
  return null;
}

// Diatonic chords of any 7-note scale, built by stacking thirds (null where unnamed).
export function scaleSevenths(scalePcList) {
  const n = scalePcList.length;
  return scalePcList.map((_, i) => identifyChord([0, 2, 4, 6].map((k) => scalePcList[(i + k) % n])));
}
