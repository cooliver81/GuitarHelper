// Progressions lab: up to four chords written as scale degrees, so they move to any key.
// Presets, triad <-> 7th conversion, roman-numeral labels, close voicings with optional
// smooth voice leading, and arpeggio patterns. A chord here is { degree, type }:
// degree = semitones above the key's tonic, type = a CHORD_TYPES id.

import { mod12, pcName, prefersFlats } from "./notes.js";
import { CHORD_TYPES, parseRoman } from "./chords.js";

export const MAX_CHORDS = 4;

// The chord types the builder offers: basic triads and 7th chords.
export const LAB_TYPES = ["maj", "m", "dim", "aug", "maj7", "m7", "7", "m7b5", "dim7"];

// Generic forms only (no song titles). Minor forms are numbered from the minor tonic.
export const PRESETS = [
  { id: "pop",        mode: "major", name: "I–V–vi–IV",                 chart: "I V vi IV" },
  { id: "pop-minor",  mode: "major", name: "vi–IV–I–V",                 chart: "vi IV I V" },
  { id: "fifties",    mode: "major", name: "I–vi–IV–V (doo-wop)",       chart: "I vi IV V" },
  { id: "rock",       mode: "major", name: "I–IV–V–IV",                 chart: "I IV V IV" },
  { id: "i-iv-vi-v",  mode: "major", name: "I–IV–vi–V",                 chart: "I IV vi V" },
  { id: "ii-V-I",     mode: "major", name: "ii–V–I",                    chart: "ii V I I" },
  { id: "turnaround", mode: "major", name: "I–vi–ii–V turnaround",      chart: "I vi ii V" },
  { id: "iii-vi",     mode: "major", name: "iii–vi–ii–V",               chart: "iii vi ii V" },
  { id: "mixolydian", mode: "major", name: "I–bVII–IV–I (Mixolydian)",  chart: "I bVII IV I" },
  { id: "plagal",     mode: "major", name: "I–IV–iv–I (minor iv)",      chart: "I IV iv I" },
  { id: "minor-ii-V", mode: "minor", name: "Minor ii°–V–i",             chart: "iidim V i i" },
  { id: "andalusian", mode: "minor", name: "i–bVII–bVI–V (Andalusian)", chart: "i bVII bVI V" },
  { id: "minor-iv-v", mode: "minor", name: "i–iv–V–i",                  chart: "i iv V i" },
  { id: "epic",       mode: "minor", name: "i–bVI–bIII–bVII",           chart: "i bVI bIII bVII" },
];

const toChords = (chart) => chart.split(/\s+/).map((tok) => {
  const r = parseRoman(tok);
  return { degree: r.degree, type: r.type };
});

export function presetChords(preset) {
  return toChords(preset.chart);
}

// Triad -> its usual 7th: major triads on V and bVII take a b7 (dominant), others a maj7.
export function toSeventh({ degree, type }) {
  if (type === "maj") return { degree, type: degree === 7 || degree === 10 ? "7" : "maj7" };
  return { degree, type: { m: "m7", dim: "m7b5" }[type] || type };
}

const TRIAD_OF = { maj7: "maj", 7: "maj", m7: "m", m7b5: "dim", dim7: "dim" };

export function toTriad({ degree, type }) {
  return { degree, type: TRIAD_OF[type] || type };
}

// ---------- Roman numerals ----------

const NUMERALS = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];
const LOWER = new Set(["m", "dim", "m7", "m7b5", "dim7"]);
const ROMAN_SUFFIX = { maj: "", m: "", dim: "°", aug: "+", maj7: "maj7", m7: "7", 7: "7", m7b5: "ø7", dim7: "°7" };

// { degree: 2, type: "m7" } -> "ii7". Lowercase numeral = minor or diminished.
export function romanLabel({ degree, type }) {
  const n = NUMERALS[mod12(degree)];
  return (LOWER.has(type) ? n.toLowerCase() : n) + (ROMAN_SUFFIX[type] ?? CHORD_TYPES[type].label);
}

// ---------- Palette ----------

// Diatonic chords of the key, then a few common borrowed ones (`extra`).
const PALETTE = {
  major: { diatonic: "I ii iii IV V vi viidim", extra: "iv bVI bVII" },
  minor: { diatonic: "i iidim bIII iv v bVI bVII", extra: "V" },
};

export function palette(mode, size = "triad") {
  const p = PALETTE[mode] || PALETTE.major;
  const all = [
    ...toChords(p.diatonic).map((c) => ({ ...c, extra: false })),
    ...toChords(p.extra).map((c) => ({ ...c, extra: true })),
  ];
  return size === "seventh" ? all.map((c) => ({ ...toSeventh(c), extra: c.extra })) : all;
}

export function resolveChord({ degree, type }, keyPc) {
  return { root: mod12(keyPc + degree), type };
}

// ---------- Spelling ----------

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];

// Chord name and tone names in a key. The root follows the numeral (bVI in C = Ab, not G#),
// else the key signature; each tone takes the letter of its degree (Edim = E G Bb).
// A tone that would need a double accidental gets its plain name instead (bb7 of Cdim7 = A).
export function spellLab(chord, keyPc, mode = "major") {
  const numeral = NUMERALS[mod12(chord.degree)];
  const flats = numeral[0] === "b" || (numeral[0] !== "#" && prefersFlats(keyPc, mode));
  const root = mod12(keyPc + chord.degree);
  const rootName = pcName(root, flats);
  const li = LETTERS.indexOf(rootName[0]);
  const t = CHORD_TYPES[chord.type];
  const tones = t.tones.map((semis, k) => {
    const num = t.degrees[k] === "R" ? 1 : +t.degrees[k].replace(/\D/g, "");
    const letter = (li + num - 1) % 7;
    let acc = mod12(root + semis - LETTER_PCS[letter]);
    if (acc > 6) acc -= 12;
    if (Math.abs(acc) > 1) return pcName(root + semis, true);
    return LETTERS[letter] + (acc === 1 ? "#" : acc === -1 ? "b" : "");
  });
  return { name: rootName + t.label, tones };
}

// ---------- Voicing ----------

const BASS_LOW = 40;  // E2, the open low E string
const UPPER_LOW = 52; // E3: the upper voices' lowest note sits in [E3, E4)

// Close position, `inv` lowest tones moved up an octave. Offsets from the root, ascending.
function closeShape(type, inv) {
  let t = CHORD_TYPES[type].tones.slice();
  for (let i = 0; i < inv; i++) t = [...t.slice(1), t[0] + 12];
  return t;
}

function place(rootPc, shape) {
  const low = rootPc + shape[0];
  const shift = UPPER_LOW + mod12(low - UPPER_LOW) - low;
  return shape.map((s) => rootPc + s + shift);
}

// How far each voice has to go to reach the nearest voice of the other chord, both ways
// (works when a triad moves to a 7th chord and back).
function distance(a, b) {
  const near = (x, ys) => Math.min(...ys.map((y) => Math.abs(x - y)));
  return a.reduce((s, x) => s + near(x, b), 0) + b.reduce((s, y) => s + near(y, a), 0);
}

// [{ root, type }] -> [{ bass, upper: [midi ascending] }]. Bass = the root, low.
// Smooth: each chord takes the inversion closest to the previous one (first chord in root position).
export function voiceProgression(chords, { smooth = true } = {}) {
  let prev = null;
  return chords.map((c) => {
    let upper = place(c.root, closeShape(c.type, 0));
    if (smooth && prev) {
      let best = distance(upper, prev);
      for (let inv = 1; inv < CHORD_TYPES[c.type].tones.length; inv++) {
        const cand = place(c.root, closeShape(c.type, inv));
        const d = distance(cand, prev);
        if (d < best) { best = d; upper = cand; }
      }
    }
    prev = upper;
    return { bass: BASS_LOW + mod12(c.root - BASS_LOW), upper };
  });
}

// ---------- Arpeggios ----------

// `count` notes walking through `notes` (sorted low -> high) by pattern: up, down, updown.
export function arpeggio(notes, pattern, count) {
  const up = notes.slice().sort((a, b) => a - b);
  const cycle = pattern === "down" ? up.slice().reverse()
    : pattern === "updown" ? [...up, ...up.slice(1, -1).reverse()]
    : up;
  return Array.from({ length: count }, (_, i) => cycle[i % cycle.length]);
}
