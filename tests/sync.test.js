import { test } from "node:test";
import assert from "node:assert/strict";

import { barAt, barStart, chartPosition, nextChordPosition, tappedBpm } from "../src/theory/sync.js";
import { parseChart } from "../src/theory/progressions.js";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("grid sync: 120 BPM in 4/4 = 2 s bars from the offset", () => {
  const s = { mode: "grid", bpm: 120, beatsPerBar: 4, offset: 3 };
  assert.equal(barStart(s, 0), 3);
  assert.equal(barStart(s, 5), 13);
  assert.deepEqual(barAt(s, 3), { bar: 0, frac: 0 });
  const p = barAt(s, 8);
  assert.equal(p.bar, 2);
  assert.ok(near(p.frac, 0.5));
  assert.equal(barAt(s, 1).bar, -1); // intro before the chart
});

test("tap sync follows uneven bars, then carries on at the recent average", () => {
  const s = { mode: "taps", taps: [1, 3, 5.2, 7.2, 9.4] };
  assert.equal(barAt(s, 4).bar, 1);
  assert.ok(near(barAt(s, 4).frac, 1 / 2.2)); // 1 s into a 2.2 s bar
  assert.equal(barAt(s, 9.4).bar, 4);
  // last 4 intervals: 2, 2.2, 2, 2.2 -> 2.1 s per bar
  assert.ok(near(barStart(s, 6), 9.4 + 2 * 2.1));
  assert.equal(barAt(s, 9.4 + 2.1 * 1.5).bar, 5);
  assert.equal(barAt(s, 0.5).bar, -1);
  assert.ok(near(tappedBpm(s), 240 / 2.1));
});

test("chart position wraps through choruses and splits bars by beats", () => {
  const { bars } = parseChart("| Dm7 G7 | Cmaj7 | % |");
  assert.deepEqual(chartPosition(bars, 0, 0.1), { chorus: 0, barIndex: 0, chordIndex: 0 });
  assert.deepEqual(chartPosition(bars, 0, 0.6), { chorus: 0, barIndex: 0, chordIndex: 1 });
  assert.deepEqual(chartPosition(bars, 4, 0), { chorus: 1, barIndex: 1, chordIndex: 0 });
  assert.equal(chartPosition(bars, -1, 0.5), null);
  assert.deepEqual(nextChordPosition(bars, 0, 0), { barIndex: 0, chordIndex: 1 });
  assert.deepEqual(nextChordPosition(bars, 2, 0), { barIndex: 0, chordIndex: 0 });
});
