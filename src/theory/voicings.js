// Chord voicings: shells, drop 2, drop 3, drop 2&4, and close triads, placed on string sets.
// A "voicing" here is a list of voices low -> high, each a semitone offset from the chord root.

import { mod12 } from "./notes.js";
import { CHORD_TYPES } from "./chords.js";
import { STANDARD_TUNING, MAX_FRET } from "./fretboard.js";

export const VOICING_KINDS = {
  drop2:  { name: "Drop 2",   stringSets: [[4, 3, 2, 1], [5, 4, 3, 2], [6, 5, 4, 3]] },
  drop3:  { name: "Drop 3",   stringSets: [[6, 4, 3, 2], [5, 3, 2, 1]] },
  drop24: { name: "Drop 2&4", stringSets: [[6, 5, 3, 2], [5, 4, 2, 1]] },
  shell:  { name: "Shell",    stringSets: [[6, 4, 3], [5, 4, 3]] },
  triad:  { name: "Triad",    stringSets: [[6, 5, 4], [5, 4, 3], [4, 3, 2], [3, 2, 1]] },
};

// Close position, `inversion` notes moved from the bottom to the top.
export function closeVoicing(chordType, inversion = 0) {
  const tones = CHORD_TYPES[chordType].voicing;
  const base = tones[0];
  // A doubled root (triads: R 3 5 R) stays an octave up instead of collapsing onto the bass.
  let close = tones.map((t, i) => base + (mod12(t - base) || (i ? 12 : 0))).sort((a, b) => a - b);
  for (let i = 0; i < inversion; i++) close = [...close.slice(1), close[0] + 12];
  return close;
}

function closeTriad(chordType, inversion) {
  let close = CHORD_TYPES[chordType].tones.slice(0, 3);
  for (let i = 0; i < inversion; i++) close = [...close.slice(1), close[0] + 12];
  return close;
}

// Voices low -> high for one kind and inversion (inversion = which close-position
// rotation the drop is taken from, 0..3).
export function voicingVoices(chordType, kind, inversion = 0, stringSet = null) {
  if (kind === "triad") return closeTriad(chordType, inversion % 3);
  if (kind === "shell") {
    const t = CHORD_TYPES[chordType];
    const third = t.tones[t.degrees.findIndex((d) => /^(b?3|4)$/.test(d))];
    const seventh = t.tones[t.degrees.findIndex((d) => /^(b?b?7|6)$/.test(d))];
    if (third == null || seventh == null) return null;
    // Bass on string 6: R-7-3. Bass on string 5: R-3-7.
    return stringSet && stringSet[0] === 6 ? [0, seventh, third + 12] : [0, third, seventh];
  }
  const [a, b, c, d] = closeVoicing(chordType, inversion);
  if (kind === "drop2") return [c - 12, a, b, d];
  if (kind === "drop3") return [b - 12, a, c, d];
  if (kind === "drop24") return [a - 12, c - 12, b, d];
  throw new Error(`Unknown voicing kind: ${kind}`);
}

export function inversionCount(kind) {
  if (kind === "shell") return 1;
  if (kind === "triad") return 3;
  return 4;
}

export function degreeOf(chordType, semis) {
  const t = CHORD_TYPES[chordType];
  const idx = t.tones.findIndex((x) => mod12(x) === mod12(semis));
  return idx < 0 ? "?" : t.degrees[idx];
}

// Every fingering of `voices` (relative to `rootPc`) on `strings`, within a hand span.
export function placeVoices(rootPc, voices, strings, { maxSpan = 4, fretMax = MAX_FRET, tuning = STANDARD_TUNING } = {}) {
  const out = [];
  const bassPc = mod12(rootPc + voices[0]);
  for (let f = 0; f <= fretMax; f++) {
    const bassMidi = tuning[strings[0]] + f;
    if (mod12(bassMidi) !== bassPc) continue;
    const midis = voices.map((v) => bassMidi + (v - voices[0]));
    const frets = midis.map((m, i) => m - tuning[strings[i]]);
    if (frets.some((x) => x < 0 || x > fretMax)) continue;
    const fretted = frets.filter((x) => x > 0);
    if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > maxSpan) continue;
    out.push({ strings: strings.slice(), frets, midis });
  }
  return out;
}

// All voicings of one chord for a kind, over all (or chosen) string sets and inversions.
export function voicingsFor(chord, kind, { stringSets = VOICING_KINDS[kind].stringSets, tuning = STANDARD_TUNING } = {}) {
  const out = [];
  for (const strings of stringSets) {
    for (let inv = 0; inv < inversionCount(kind); inv++) {
      const voices = voicingVoices(chord.type, kind, inv, strings);
      if (!voices || voices.length !== strings.length) continue;
      const degrees = voices.map((v) => degreeOf(chord.type, v));
      for (const p of placeVoices(chord.root, voices, strings, { tuning })) {
        out.push({ ...p, degrees, inversion: inv, bassDegree: degrees[0], kind, chord });
      }
    }
  }
  return out.sort((x, y) => avgFret(x) - avgFret(y));
}

export function avgFret(v) {
  return v.frets.reduce((s, f) => s + f, 0) / v.frets.length;
}

// "x-x-10-12-12-12" style, low E first.
export function fretString(v) {
  const byString = { 6: "x", 5: "x", 4: "x", 3: "x", 2: "x", 1: "x" };
  v.strings.forEach((s, i) => { byString[s] = String(v.frets[i]); });
  return [6, 5, 4, 3, 2, 1].map((s) => byString[s]).join("-");
}

// ---------- Voice leading ----------

// Semitones moved by all voices (matched low to high), plus a little for moving the hand.
export function movementCost(a, b) {
  const x = a.midis.slice().sort((p, q) => p - q);
  const y = b.midis.slice().sort((p, q) => p - q);
  const n = Math.min(x.length, y.length);
  let cost = 0;
  for (let i = 0; i < n; i++) cost += Math.abs(x[i] - y[i]);
  return cost + 0.5 * Math.abs(avgFret(a) - avgFret(b));
}

// Pick one voicing per chord so the whole progression moves the least (Viterbi).
// `loop` also counts the move from the last chord back to the first.
export function voiceLead(chords, kind, { stringSets, preferFret = 5, tuning = STANDARD_TUNING } = {}) {
  const cands = chords.map((c) => voicingsFor(c, kind, { stringSets, tuning }));
  if (cands.some((c) => c.length === 0)) return null;

  let cost = cands[0].map((v) => 0.3 * Math.abs(avgFret(v) - preferFret));
  const back = [];
  for (let i = 1; i < cands.length; i++) {
    const next = [];
    const ptr = [];
    for (const v of cands[i]) {
      let best = Infinity;
      let arg = -1;
      cands[i - 1].forEach((u, j) => {
        const c = cost[j] + movementCost(u, v);
        if (c < best) { best = c; arg = j; }
      });
      next.push(best);
      ptr.push(arg);
    }
    cost = next;
    back.push(ptr);
  }
  let j = cost.indexOf(Math.min(...cost));
  const total = cost[j];
  const path = [cands[cands.length - 1][j]];
  for (let i = back.length - 1; i >= 0; i--) {
    j = back[i][j];
    path.unshift(cands[i][j]);
  }
  return { path, cost: total };
}

// Harmonise a scale with one voicing shape: every voice steps up to the next scale note,
// on the same strings. From Gmaj7 drop 2 this gives Gmaj7 Am7 Bm7 Cmaj7 D7 Em7 F#m7b5 Gmaj7.
export function diatonicWalk(start, scalePcList, steps = 8, tuning = STANDARD_TUNING) {
  const inScale = new Set(scalePcList.map(mod12));
  const out = [start];
  let cur = start;
  for (let i = 1; i < steps; i++) {
    const midis = cur.midis.map((m) => {
      let x = m + 1;
      while (!inScale.has(mod12(x))) x++;
      return x;
    });
    cur = { strings: cur.strings, midis, frets: midis.map((m, j) => m - tuning[cur.strings[j]]) };
    out.push(cur);
  }
  return out;
}
