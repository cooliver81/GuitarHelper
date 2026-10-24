import { test } from "node:test";
import assert from "node:assert/strict";

import { parseChart, timeline, walkingBass, transposeBars, FORMS } from "../src/theory/progressions.js";
import { chordName } from "../src/theory/chords.js";
import { mod12 } from "../src/theory/notes.js";
import { ExerciseScorer } from "../src/theory/exercises.js";

const names = (bars) => bars.map((bar) => bar.map((c) => chordName(c.chord)).join(" "));

test("absolute chord charts, % repeats and split bars", () => {
  const { bars, errors } = parseChart("| Dm7 G7 | Cmaj7 | % |");
  assert.deepEqual(errors, []);
  assert.deepEqual(names(bars), ["Dm7 G7", "Cmaj7", "Cmaj7"]);
  assert.deepEqual(bars[0].map((c) => c.beats), [2, 2]);
  assert.deepEqual(bars[1].map((c) => c.beats), [4]);
});

test("roman charts resolve in a key; unknown tokens are reported", () => {
  const { bars, errors } = parseChart("| iim7b5 | V7b9 | im6 | Xyz |", { key: 4 });
  assert.deepEqual(names(bars), ["F#m7b5", "B7b9", "Em6"]);
  assert.deepEqual(errors, ["Xyz"]);
});

test("every built-in form parses cleanly", () => {
  for (const f of FORMS) {
    const { bars, errors } = parseChart(f.chart, { key: f.key });
    assert.deepEqual(errors, [], f.id);
    assert.ok(bars.length >= 4, f.id);
  }
});

test("transpose and timeline", () => {
  const { bars } = parseChart("| iim7 V7 | Imaj7 |", { key: 7 });
  assert.deepEqual(names(transposeBars(bars, 5)), ["Dm7 G7", "Cmaj7"]);
  const t = timeline(bars);
  assert.equal(t.totalBeats, 8);
  assert.deepEqual(t.spans.map((s) => s.start), [0, 2, 4]);
});

test("walking bass: root on beat 1, half step into the next root", () => {
  const { bars } = parseChart("| Dm7 | G7 | Cmaj7 | Cmaj7 |");
  const { spans } = timeline(bars);
  const line = walkingBass(spans);
  assert.equal(line.length, 16);
  spans.forEach((s, i) => {
    const first = line.find((n) => n.beat === s.start);
    assert.equal(mod12(first.midi), s.chord.root);
    const last = line.find((n) => n.beat === s.start + s.beats - 1);
    const nextRoot = spans[(i + 1) % spans.length].chord.root;
    assert.ok([1, 11].includes(mod12(last.midi - nextRoot)), `bar ${i}`);
  });
  assert.ok(line.every((n) => n.midi >= 28 && n.midi <= 50));
});

// ---------- Exercise scoring ----------

const Dm7 = { root: 2, type: "m7" };
const G7 = { root: 7, type: "7" };
const C = { root: 0, type: "maj7" };

test("guide tones: first note of each chord must be its 3rd or 7th", () => {
  const s = new ExerciseScorer("guide");
  s.chordStarted(Dm7, 0);
  assert.equal(s.noteOn(65, 0.1)[0].verdict, "hit"); // F = b3
  s.noteOn(69, 0.5); // later notes in the chord don't count
  s.chordStarted(G7, 2);
  assert.equal(s.noteOn(67, 2.05)[0].verdict, "miss"); // G = root
  s.chordStarted(C, 4);
  assert.equal(s.noteOn(71, 3.95)[0].verdict, "hit"); // B a touch early still counts for Cmaj7
  assert.equal(s.hits, 2);
  assert.equal(s.misses, 1);
});

test("a chord with no notes is a miss once the music moves on", () => {
  const s = new ExerciseScorer("chordTone");
  s.chordStarted(Dm7, 0);
  s.chordStarted(G7, 2);
  const ev = s.noteOn(71, 2.1);
  assert.deepEqual(ev.map((e) => e.verdict), ["miss", "hit"]);
});

test("nearest chord tone: step into the new chord", () => {
  const s = new ExerciseScorer("nearest");
  s.chordStarted(Dm7, 0);
  s.noteOn(72, 0.1); // C, b7 of Dm7: first note, no previous note
  s.chordStarted(G7, 2);
  assert.equal(s.noteOn(71, 2.1)[0].verdict, "hit"); // C -> B, half step
  s.chordStarted(C, 4);
  assert.equal(s.noteOn(79, 4.1)[0].verdict, "miss"); // B -> G jumps 8
});

test("approach from a half step below, and enclosures", () => {
  const a = new ExerciseScorer("approach");
  a.chordStarted(C, 0);
  a.noteOn(70, 0.1);
  assert.deepEqual(a.noteOn(71, 0.3).map((e) => e.verdict), ["hit"]); // Bb -> B (7)

  const e = new ExerciseScorer("enclosure");
  e.chordStarted(C, 0);
  e.noteOn(65, 0.1); // F (above E)
  e.noteOn(63, 0.3); // Eb (below E)
  assert.deepEqual(e.noteOn(64, 0.5).map((x) => x.verdict), ["hit"]); // E = 3
});
