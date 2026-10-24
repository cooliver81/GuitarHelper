// Chord charts: parsing "| Dm7 G7 | Cmaj7 | % |" or roman numerals "| iim7 | V7 | Imaj7 |",
// built-in practice forms, and a simple walking bass line.

import { mod12 } from "./notes.js";
import { parseChord, parseRoman, chordPcs, CHORD_TYPES } from "./chords.js";

// Generic practice forms. Keys default to G major / E minor.
export const FORMS = [
  { id: "ii-V-I",        name: "Major ii–V–I",                     key: 7, mode: "major", chart: "| iim7 | V7 | Imaj7 | Imaj7 |" },
  { id: "minor-ii-V-i",  name: "Minor ii–V–i",                     key: 4, mode: "minor", chart: "| iim7b5 | V7b9 | im6 | im6 |" },
  { id: "major-minor",   name: "ii–V–I, then ii–V–i to the relative minor", key: 7, mode: "major", chart: "| iim7 | V7 | Imaj7 | IVmaj7 | viim7b5 | III7b9 | vim6 | vim6 |" },
  { id: "cycle",         name: "Diatonic cycle of 4ths",           key: 7, mode: "major", chart: "| vim7 | iim7 | V7 | Imaj7 | IVmaj7 | viim7b5 | III7b9 | vim7 |" },
  { id: "turnaround",    name: "I–vi–ii–V turnaround",             key: 7, mode: "major", chart: "| Imaj7 vim7 | iim7 V7 | iiim7 VI7 | iim7 V7 |" },
  { id: "short-ii-V",    name: "ii–V–I, two beats each",           key: 7, mode: "major", chart: "| iim7 V7 | Imaj7 | iim7 V7 | Imaj7 |" },
  { id: "blues",         name: "12-bar blues",                     key: 7, mode: "major", chart: "| I7 | IV7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7 |" },
  { id: "jazz-blues",    name: "Jazz blues",                       key: 7, mode: "major", chart: "| I7 | IV7 | I7 | vm7 I7 | IV7 | #ivdim7 | I7 | VI7b9 | iim7 | V7 | I7 VI7b9 | iim7 V7 |" },
  { id: "minor-blues",   name: "Minor blues",                      key: 4, mode: "minor", chart: "| im7 | im7 | im7 | im7 | ivm7 | ivm7 | im7 | im7 | bVI7 | V7b9 | im7 | V7b9 |" },
];

// Split a bar's beats between its chords: 2 chords -> 2+2, 3 -> 2+1+1, 4 -> 1 each.
function splitBeats(count, beatsPerBar) {
  if (count === 1) return [beatsPerBar];
  const base = Math.floor(beatsPerBar / count);
  const out = Array(count).fill(base);
  out[0] += beatsPerBar - base * count;
  return out;
}

// Returns { bars: [[{ chord, beats, symbol }]], errors: [token] }. `key` resolves roman numerals.
export function parseChart(text, { key = 0, beatsPerBar = 4 } = {}) {
  const bars = [];
  const errors = [];
  const rawBars = String(text).split(/[|\n]/).map((s) => s.trim()).filter(Boolean);
  for (const raw of rawBars) {
    if (raw === "%") {
      if (bars.length) bars.push(bars[bars.length - 1].map((c) => ({ ...c })));
      continue;
    }
    const tokens = raw.split(/\s+/);
    const chords = [];
    for (const tok of tokens) {
      const c = resolveToken(tok, key);
      if (c) chords.push({ chord: c, symbol: tok });
      else errors.push(tok);
    }
    if (!chords.length) continue;
    const beats = splitBeats(chords.length, beatsPerBar);
    bars.push(chords.map((c, i) => ({ ...c, beats: beats[i] })));
  }
  return { bars, errors };
}

function resolveToken(tok, key) {
  const roman = parseRoman(tok);
  if (roman) return { root: mod12(key + roman.degree), type: roman.type };
  return parseChord(tok);
}

export function transposeBars(bars, semitones) {
  return bars.map((bar) => bar.map((c) => ({ ...c, chord: { ...c.chord, root: mod12(c.chord.root + semitones) } })));
}

// Flatten bars into a timeline of chord spans, in beats.
export function timeline(bars) {
  const spans = [];
  let beat = 0;
  bars.forEach((bar, barIndex) => {
    bar.forEach((c) => {
      spans.push({ chord: c.chord, symbol: c.symbol, start: beat, beats: c.beats, barIndex });
      beat += c.beats;
    });
  });
  return { spans, totalBeats: beat };
}

// ---------- Walking bass ----------

const BASS_LOW = 28;  // E1
const BASS_HIGH = 50; // D3

function nearestInRange(pc, near) {
  let best = null;
  for (let m = BASS_LOW; m <= BASS_HIGH; m++) {
    if (mod12(m) !== pc) continue;
    if (best == null || Math.abs(m - near) < Math.abs(best - near)) best = m;
  }
  return best;
}

// One note per beat. Beat 1 = root, last beat = half step into the next root,
// beats between walk up through chord tones.
export function walkingBass(spans) {
  const notes = [];
  let prev = 38; // around D2
  spans.forEach((span, i) => {
    const next = spans[(i + 1) % spans.length].chord;
    const tones = CHORD_TYPES[span.chord.type].tones.slice(1, 4).map((t) => mod12(span.chord.root + t));
    const root = nearestInRange(span.chord.root, prev);
    let cur = root;
    for (let b = 0; b < span.beats; b++) {
      let midi;
      if (b === 0) midi = root;
      else if (b === span.beats - 1) {
        const target = nearestInRange(next.root, cur);
        // Approach from below when coming up, from above when coming down.
        midi = target >= cur ? target - 1 : target + 1;
        if (midi < BASS_LOW) midi = target + 1;
        if (midi > BASS_HIGH) midi = target - 1;
      } else {
        const pc = tones[(b - 1) % tones.length];
        midi = nearestInRange(pc, cur + 3);
      }
      notes.push({ beat: span.start + b, midi });
      cur = midi;
    }
    prev = cur;
  });
  return notes;
}

export function spanPcs(span) {
  return chordPcs(span.chord);
}
