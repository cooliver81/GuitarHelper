// Improvisation exercises over a progression, scored from detected notes.
// Times are seconds on one clock; note times are onsets (detection latency already removed).
// Each chord span gets at most one verdict: hit or miss.

import { mod12, pcName } from "./notes.js";
import { chordPcs, chordDegree, guideTones, chordName } from "./chords.js";

export const EXERCISES = {
  free:      { name: "Free play (no scoring)", hint: "Play anything. The board shows this chord's tones." },
  roots:     { name: "Roots on the change", hint: "First note of each chord: its root." },
  guide:     { name: "Guide tones (3rd or 7th)", hint: "First note of each chord: its 3rd or 7th. Try to move by a half or whole step." },
  chordTone: { name: "Land on a chord tone", hint: "First note of each chord: any chord tone (R 3 5 7)." },
  nearest:   { name: "Nearest chord tone", hint: "Keep playing through the change; the first note of the new chord must be a chord tone within a whole step of your last note." },
  approach:  { name: "Chromatic approach", hint: "Hit a chord tone of the new chord from a half step below (e.g. B → C)." },
  enclosure: { name: "Enclosure", hint: "Above, below, target: a scale step above the chord tone, a half step below it, then the chord tone." },
};

const EARLY_TOLERANCE = 0.12; // a note this early still counts for the next chord

export class ExerciseScorer {
  constructor(type) {
    this.type = type;
    this.spans = [];   // { chord, start, verdict }
    this.notes = [];   // { midi, time, spanIndex }
    this.hits = 0;
    this.misses = 0;
    this.streak = 0;
    this.best = 0;
  }

  chordStarted(chord, time) {
    this.spans.push({ chord, start: time, verdict: null });
    // A chord two changes back can't receive late notes any more.
    const out = [];
    for (let i = 0; i < this.spans.length - 2; i++) out.push(...this._finalize(i));
    return out;
  }

  _spanIndexAt(time) {
    for (let i = this.spans.length - 1; i >= 0; i--) {
      if (this.spans[i].start - EARLY_TOLERANCE <= time) return i;
    }
    return -1;
  }

  _finalize(i) {
    const s = this.spans[i];
    if (!s || s.verdict || this.type === "free") return [];
    s.verdict = "miss";
    this.misses++;
    this.streak = 0;
    return [{ verdict: "miss", chord: s.chord, message: `${chordName(s.chord)}: missed` }];
  }

  _judge(i, verdict, message) {
    const s = this.spans[i];
    s.verdict = verdict;
    if (verdict === "hit") {
      this.hits++;
      this.streak++;
      this.best = Math.max(this.best, this.streak);
    } else {
      this.misses++;
      this.streak = 0;
    }
    return { verdict, chord: s.chord, message };
  }

  // Returns a list of verdict events (possibly empty).
  noteOn(midi, time) {
    const i = this._spanIndexAt(time);
    if (i < 0) return [];
    const events = [];
    for (let k = 0; k < i; k++) events.push(...this._finalize(k));

    const prevNote = this.notes[this.notes.length - 1] || null;
    this.notes.push({ midi, time, spanIndex: i });
    if (this.notes.length > 16) this.notes.shift();

    const span = this.spans[i];
    if (span.verdict || this.type === "free") return events;

    const chord = span.chord;
    const pc = mod12(midi);
    const deg = chordDegree(chord, pc);
    const name = `${pcName(pc)}${deg ? ` (${deg})` : ""}`;
    const label = chordName(chord);
    const firstInSpan = !prevNote || prevNote.spanIndex !== i;

    switch (this.type) {
      case "roots":
        if (firstInSpan) events.push(this._judge(i, pc === chord.root ? "hit" : "miss", `${label}: ${name}`));
        break;
      case "guide":
        if (firstInSpan) events.push(this._judge(i, guideTones(chord).includes(pc) ? "hit" : "miss", `${label}: ${name}`));
        break;
      case "chordTone":
        if (firstInSpan) events.push(this._judge(i, chordPcs(chord).includes(pc) ? "hit" : "miss", `${label}: ${name}`));
        break;
      case "nearest": {
        if (!firstInSpan) break;
        const isTone = chordPcs(chord).includes(pc);
        const close = prevNote && Math.abs(midi - prevNote.midi) <= 2;
        const why = !isTone ? "not a chord tone" : !prevNote ? "no note before the change" : !close ? `jumped ${Math.abs(midi - prevNote.midi)} semitones` : "smooth";
        events.push(this._judge(i, isTone && close ? "hit" : "miss", `${label}: ${name}, ${why}`));
        break;
      }
      case "approach": {
        if (prevNote && chordPcs(chord).includes(pc) && midi - prevNote.midi === 1) {
          events.push(this._judge(i, "hit", `${label}: ${pcName(prevNote.midi)} → ${name}`));
        }
        break;
      }
      case "enclosure": {
        const n = this.notes.length;
        if (n >= 3 && chordPcs(chord).includes(pc)) {
          const [a, b] = [this.notes[n - 3].midi, this.notes[n - 2].midi];
          const above = a - midi === 1 || a - midi === 2;
          if (above && b === midi - 1) {
            events.push(this._judge(i, "hit", `${label}: ${pcName(a)} ${pcName(b)} → ${name}`));
          }
        }
        break;
      }
    }
    return events;
  }

  finish() {
    const out = [];
    for (let i = 0; i < this.spans.length; i++) out.push(...this._finalize(i));
    return out;
  }

  get accuracy() {
    const total = this.hits + this.misses;
    return total ? this.hits / total : null;
  }
}

// What the board should highlight as targets for the current chord.
export function targetPcs(type, chord) {
  if (type === "roots") return [chord.root];
  if (type === "guide") return guideTones(chord);
  return chordPcs(chord);
}
