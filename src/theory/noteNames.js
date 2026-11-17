// Note names: which notes to learn in what order, how scales are spelled, and a small
// spaced-repetition schedule. A "cell" is one fret on one string; a "card" is what we
// remember about a cell: { box, due, seen, misses }.

import { mod12, pcName, SHARP_NAMES, FLAT_NAMES } from "./notes.js";
import { SCALES, scaleDegree } from "./scales.js";
import { midiAt, positionDots, STRINGS_LOW_TO_HIGH } from "./fretboard.js";

// ---------- What to learn, in order ----------

// Natural notes first, outer strings first; frets 0-11, because 12 onward repeats them.
export const STAGES = [
  { id: "e",    name: "1. E strings, natural notes",  strings: [6, 1],             naturals: true,  hint: "Both E strings have the same notes. Everything else hangs off these." },
  { id: "a",    name: "2. Add the A string",          strings: [6, 5, 1],          naturals: true,  hint: "With E and A you can name the root of most barre chords and scale shapes." },
  { id: "d",    name: "3. Add the D string",          strings: [6, 5, 4, 1],       naturals: true,  hint: "Octave shape: from a note on the low E string, go two strings up and two frets on to land on the D string." },
  { id: "g",    name: "4. Add the G string",          strings: [6, 5, 4, 3, 1],    naturals: true,  hint: "Same octave shape from the A string: two strings up, two frets on." },
  { id: "b",    name: "5. Add the B string",          strings: [6, 5, 4, 3, 2, 1], naturals: true,  hint: "The shape shifts when it crosses the B string: from the D string, two strings up and three frets on." },
  { id: "all",  name: "6. Sharps and flats, everywhere", strings: [6, 5, 4, 3, 2, 1], naturals: false, hint: "Each one is a fret above or below a natural you already know." },
];

export const cellKey = (c) => `${c.string}:${c.fret}`;

export function namesOf(pc) {
  const p = mod12(pc);
  return SHARP_NAMES[p] === FLAT_NAMES[p] ? [SHARP_NAMES[p]] : [SHARP_NAMES[p], FLAT_NAMES[p]];
}

const cell = (string, fret) => {
  const midi = midiAt(string, fret);
  return { string, fret, midi, pc: mod12(midi) };
};

export function stageCells(stage) {
  const out = [];
  for (const string of stage.strings) {
    for (let fret = 0; fret < 12; fret++) {
      const c = cell(string, fret);
      if (!stage.naturals || namesOf(c.pc).length === 1) out.push(c);
    }
  }
  return out;
}

// One fret across all six strings, low to high.
export function fretCells(fret) {
  return STRINGS_LOW_TO_HIGH.map((string) => cell(string, fret));
}

// Where a note sits on each string, frets 0-12: { string: [frets] }.
export function stringsWith(pc) {
  const out = {};
  for (const string of STRINGS_LOW_TO_HIGH) {
    for (let fret = 0; fret <= 12; fret++) {
      if (mod12(midiAt(string, fret)) === mod12(pc)) (out[string] = out[string] || []).push(fret);
    }
  }
  return out;
}

// ---------- Scale spelling ----------

export const CYCLE_FOURTHS = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7]; // C F Bb Eb Ab Db Gb B E A D G

export const SPELL_SCALES = ["major", "aeolian", "dorian", "mixolydian", "lydian", "phrygian", "locrian", "harmonicMinor", "melodicMinor", "majorPent", "minorPent"];

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];

// Each degree takes its own letter (the 3 of D is an F-something). Null if a double accidental is needed.
function spellFrom(rootName, rootPc, scaleId) {
  const s = SCALES[scaleId];
  const li = LETTERS.indexOf(rootName[0]);
  const names = [];
  for (let k = 0; k < s.intervals.length; k++) {
    const letter = (li + +s.degrees[k].replace(/\D/g, "") - 1) % 7;
    let acc = mod12(rootPc + s.intervals[k] - LETTER_PCS[letter]);
    if (acc > 6) acc -= 12;
    if (Math.abs(acc) > 1) return null;
    names.push(LETTERS[letter] + (acc === 1 ? "#" : acc === -1 ? "b" : ""));
  }
  return names;
}

// The spelling with the fewest accidentals, no double accidentals; flats win a tie (Gb over F#).
export function spellScale(rootPc, scaleId) {
  const options = [pcName(rootPc, true), pcName(rootPc, false)]
    .map((root) => ({ root, names: spellFrom(root, mod12(rootPc), scaleId) }))
    .filter((o) => o.names);
  const count = (o) => o.names.filter((n) => n.length > 1).length;
  return options.reduce((best, o) => (count(o) < count(best) ? o : best));
}

// A scale shape as a walk from its lowest note up: position dots plus name and degree.
export function shapeWalk(rootPc, scaleId, start) {
  const { names } = spellScale(rootPc, scaleId);
  return positionDots(SCALES[scaleId].intervals.map((i) => mod12(rootPc + i)), start).map((d) => ({
    ...d,
    name: names[SCALES[scaleId].intervals.indexOf(mod12(d.pc - rootPc))],
    degree: scaleDegree(rootPc, scaleId, d.pc),
  }));
}

// ---------- Spaced repetition (Leitner boxes) ----------

export const DAY = 24 * 60 * 60 * 1000;
export const FAST_MS = 3000; // quick enough to count as knowing it
const INTERVAL_DAYS = [0, 1, 3, 7, 21];
const TOP_BOX = INTERVAL_DAYS.length - 1;

// Right and fast: next box, if the card was due. Right but slow: stays, due now. Wrong: back to box 0.
export function gradeCard(card, { ok, ms, now }) {
  const c = card || { box: 0, due: now, seen: 0, misses: 0 };
  const seen = c.seen + 1;
  if (!ok) return { box: 0, due: now, seen, misses: c.misses + 1 };
  if (ms > FAST_MS) return { ...c, seen, due: now };
  if (c.due > now) return { ...c, seen };
  const box = Math.min(c.box + 1, TOP_BOX);
  return { ...c, seen, box, due: now + INTERVAL_DAYS[box] * DAY };
}

// "solid" takes two fast answers a day apart at least.
export function cardLevel(card) {
  if (!card) return "new";
  if (card.box >= 2) return "solid";
  return card.box === 1 ? "learning" : "weak";
}

export function stageProgress(cells, cards, now) {
  let solid = 0;
  let due = 0;
  for (const c of cells) {
    const card = cards[cellKey(c)];
    if (cardLevel(card) === "solid") solid++;
    if (!card || card.due <= now) due++;
  }
  return { total: cells.length, solid, due };
}

function weight(card, now) {
  if (!card) return 3;
  if (card.box === 0) return 8;
  return card.due <= now ? 4 : 0.5;
}

// Weighted pick: missed cards most, then due, then new; the rest stay in rotation at a low rate.
export function pickCell(cells, cards, now, lastKey, rand = Math.random) {
  const pool = cells.filter((c) => cellKey(c) !== lastKey);
  const ws = pool.map((c) => weight(cards[cellKey(c)], now));
  let r = rand() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= ws[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
