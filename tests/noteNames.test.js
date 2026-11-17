import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STAGES, CYCLE_FOURTHS, SPELL_SCALES, DAY, stageCells, namesOf, fretCells, spellScale, shapeWalk,
  stringsWith, gradeCard, cardLevel, stageProgress, pickCell, cellKey,
} from "../src/theory/noteNames.js";
import { mod12, parsePc } from "../src/theory/notes.js";
import { SCALES, scalePcs } from "../src/theory/scales.js";

// ---------- Neck stages ----------

test("stages grow from the E strings' naturals to every note", () => {
  const first = stageCells(STAGES[0]);
  assert.equal(first.length, 14); // 7 natural letters on each E string, frets 0-11
  assert.ok(first.every((c) => c.string === 6 || c.string === 1));
  assert.ok(first.every((c) => namesOf(c.pc).length === 1));
  const last = stageCells(STAGES[STAGES.length - 1]);
  assert.equal(last.length, 72); // 6 strings x 12 frets
  for (let i = 1; i < STAGES.length; i++) {
    assert.ok(stageCells(STAGES[i]).length > stageCells(STAGES[i - 1]).length, STAGES[i].id);
  }
});

test("note names: a black key has both spellings", () => {
  assert.deepEqual(namesOf(0), ["C"]);
  assert.deepEqual(namesOf(1), ["C#", "Db"]);
  assert.deepEqual(namesOf(10), ["A#", "Bb"]);
});

test("across a fret, low string to high", () => {
  const names = fretCells(7).map((c) => namesOf(c.pc)[0]);
  assert.deepEqual(names, ["B", "E", "A", "D", "F#", "B"]);
});

test("every note is on every string; open strings also count at fret 12", () => {
  for (let pc = 0; pc < 12; pc++) {
    assert.deepEqual(Object.keys(stringsWith(pc)).map(Number).sort(), [1, 2, 3, 4, 5, 6]);
  }
  assert.deepEqual(stringsWith(parsePc("E"))[6], [0, 12]);
  assert.deepEqual(stringsWith(parsePc("F"))[6], [1]);
});

// ---------- Scale spelling ----------

test("major keys spell as the usual cycle of fourths", () => {
  assert.deepEqual(CYCLE_FOURTHS.map((pc) => spellScale(pc, "major").root),
    ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "B", "E", "A", "D", "G"]);
  assert.deepEqual(spellScale(2, "major").names, ["D", "E", "F#", "G", "A", "B", "C#"]);
  assert.deepEqual(spellScale(6, "major").names, ["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F"]);
});

test("modes and minors use the right letters", () => {
  assert.deepEqual(spellScale(2, "dorian").names, ["D", "E", "F", "G", "A", "B", "C"]);
  assert.deepEqual(spellScale(7, "aeolian").names, ["G", "A", "Bb", "C", "D", "Eb", "F"]);
  assert.deepEqual(spellScale(9, "harmonicMinor").names, ["A", "B", "C", "D", "E", "F", "G#"]);
  assert.deepEqual(spellScale(11, "lydian").names, ["B", "C#", "D#", "E#", "F#", "G#", "A#"]);
  assert.deepEqual(spellScale(4, "minorPent").names, ["E", "G", "A", "B", "D"]);
  assert.deepEqual(spellScale(1, "minorPent").names, ["C#", "E", "F#", "G#", "B"]);
});

test("every offered scale in every key: right pitches, no double accidentals, seven letters once", () => {
  for (const id of SPELL_SCALES) {
    for (let pc = 0; pc < 12; pc++) {
      const { names } = spellScale(pc, id);
      assert.deepEqual(names.map(parsePc), scalePcs(pc, id), `${id} ${pc}`);
      assert.ok(names.every((n) => /^[A-G][#b]?$/.test(n)), `${id} ${pc}: ${names}`);
      if (SCALES[id].intervals.length === 7) assert.equal(new Set(names.map((n) => n[0])).size, 7, `${id} ${pc}: ${names}`);
    }
  }
});

test("a shape walks up from its lowest note with names and degrees", () => {
  const walk = shapeWalk(7, "major", 2); // G major, frets 2-5
  assert.ok(walk.length >= 14);
  assert.ok(walk.every((d, i) => i === 0 || d.midi > walk[i - 1].midi));
  assert.ok(walk.every((d) => mod12(parsePc(d.name)) === d.pc));
  const g = walk.find((d) => d.string === 6 && d.fret === 3);
  assert.equal(g.name, "G");
  assert.equal(g.degree, "1");
  const fs = walk.find((d) => d.string === 6 && d.fret === 2);
  assert.equal(fs.name, "F#");
  assert.equal(fs.degree, "7");
});

// ---------- Spaced repetition ----------

const NOW = 1_000_000_000;

test("fast and right moves a card up and pushes it back; wrong sends it to the start", () => {
  let c = gradeCard(undefined, { ok: true, ms: 1500, now: NOW });
  assert.equal(c.box, 1);
  assert.equal(c.due, NOW + DAY);
  c = gradeCard(c, { ok: true, ms: 1500, now: NOW + DAY });
  assert.equal(c.box, 2);
  assert.equal(c.due, NOW + DAY + 3 * DAY);
  c = gradeCard(c, { ok: false, ms: 900, now: NOW + 5 * DAY });
  assert.equal(c.box, 0);
  assert.equal(c.due, NOW + 5 * DAY);
  assert.equal(c.misses, 1);
  assert.equal(c.seen, 3);
});

test("right but slow stays in its box and is due again now", () => {
  const c = gradeCard({ box: 2, due: NOW, seen: 2, misses: 0 }, { ok: true, ms: 6000, now: NOW });
  assert.equal(c.box, 2);
  assert.equal(c.due, NOW);
});

test("extra reviews before the due date can't climb the boxes", () => {
  const c0 = gradeCard(undefined, { ok: true, ms: 1000, now: NOW });
  const c1 = gradeCard(c0, { ok: true, ms: 1000, now: NOW + 60_000 });
  assert.equal(c1.box, 1);
  assert.equal(c1.due, c0.due);
});

test("levels and stage progress: solid needs box 2, so at least two days", () => {
  const cells = stageCells(STAGES[0]);
  assert.equal(cardLevel(undefined), "new");
  assert.equal(cardLevel({ box: 0, seen: 1 }), "weak");
  assert.equal(cardLevel({ box: 1, seen: 1 }), "learning");
  assert.equal(cardLevel({ box: 2, seen: 2 }), "solid");
  const cards = {
    [cellKey(cells[0])]: { box: 2, due: NOW + DAY, seen: 2, misses: 0 },
    [cellKey(cells[1])]: { box: 0, due: NOW, seen: 1, misses: 1 },
  };
  const p = stageProgress(cells, cards, NOW);
  assert.equal(p.total, 14);
  assert.equal(p.solid, 1);
  assert.equal(p.due, 13); // everything but the solid card: the missed one and 12 new ones
});

test("picking: missed cards come up most, never the same cell twice running", () => {
  const cells = stageCells(STAGES[0]);
  const later = { box: 3, due: NOW + 9 * DAY, seen: 3, misses: 0 };
  const cards = Object.fromEntries(cells.map((c) => [cellKey(c), later]));
  const missed = cells[3];
  cards[cellKey(missed)] = { box: 0, due: NOW, seen: 2, misses: 1 };
  let hits = 0;
  for (let i = 0; i < 300; i++) if (cellKey(pickCell(cells, cards, NOW, null)) === cellKey(missed)) hits++;
  assert.ok(hits > 100, `missed picked ${hits}/300`);
  for (let i = 0; i < 100; i++) assert.notEqual(cellKey(pickCell(cells, cards, NOW, cellKey(missed))), cellKey(missed));
});
