// Mapping a recording's time to bars of a chart, and back.
//
// Two ways to sync:
//   grid: { mode: "grid", bpm, beatsPerBar, offset }  - steady tempo (studio, click track).
//         `offset` = time (s) of beat 1 of the chart's first bar.
//   taps: { mode: "taps", taps: [t0, t1, ...] }        - the player tapped every bar line
//         while listening; follows live tempo drift. Past the last tap, the average of the
//         last few bar lengths carries on.
// Bars are counted from 0 = the chart's first bar; they keep counting through repeats.

const TAIL = 4;

export function barLength(sync) {
  if (sync.mode === "grid") return (60 / sync.bpm) * sync.beatsPerBar;
  const t = sync.taps;
  if (t.length < 2) return null;
  const k = Math.min(TAIL, t.length - 1);
  return (t[t.length - 1] - t[t.length - 1 - k]) / k;
}

// Start time of bar `b` (can be negative = before the chart starts).
export function barStart(sync, b) {
  if (sync.mode === "grid") return sync.offset + b * barLength(sync);
  const t = sync.taps;
  if (!t.length) return null;
  if (b >= 0 && b < t.length) return t[b];
  const len = barLength(sync) ?? 2;
  if (b < 0) return t[0] + b * (t.length > 1 ? (t[1] - t[0]) : len);
  return t[t.length - 1] + (b - (t.length - 1)) * len;
}

// Which bar is sounding at time `time`, and how far through it (0..1).
export function barAt(sync, time) {
  if (sync.mode === "grid") {
    const x = (time - sync.offset) / barLength(sync);
    const bar = Math.floor(x);
    return { bar, frac: x - bar };
  }
  const t = sync.taps;
  if (!t.length) return null;
  if (time < t[0]) {
    const len = t.length > 1 ? t[1] - t[0] : barLength(sync) ?? 2;
    const x = (time - t[0]) / len;
    const bar = Math.floor(x);
    return { bar, frac: x - bar };
  }
  if (time >= t[t.length - 1]) {
    const len = barLength(sync) ?? 2;
    const x = (t.length - 1) + (time - t[t.length - 1]) / len;
    const bar = Math.floor(x);
    return { bar, frac: x - bar };
  }
  // Binary search for the last tap <= time.
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= time) lo = mid; else hi = mid;
  }
  return { bar: lo, frac: (time - t[lo]) / (t[lo + 1] - t[lo]) };
}

// Chart position for an absolute bar: which chorus, which bar of the chart, which chord.
// `bars` is parseChart(...).bars; beat position inside the bar picks the chord.
export function chartPosition(bars, bar, frac, beatsPerBar = 4) {
  const n = bars.length;
  if (!n || bar < 0) return null;
  const chorus = Math.floor(bar / n);
  const barIndex = bar % n;
  const beat = frac * beatsPerBar;
  let acc = 0;
  let chordIndex = 0;
  bars[barIndex].forEach((c, i) => {
    if (beat >= acc) chordIndex = i;
    acc += c.beats;
  });
  return { chorus, barIndex, chordIndex };
}

// The chord after (barIndex, chordIndex), wrapping to the top of the chart.
export function nextChordPosition(bars, barIndex, chordIndex) {
  if (chordIndex + 1 < bars[barIndex].length) return { barIndex, chordIndex: chordIndex + 1 };
  return { barIndex: (barIndex + 1) % bars.length, chordIndex: 0 };
}

// Tempo implied by the taps, for display.
export function tappedBpm(sync, beatsPerBar = 4) {
  const len = barLength(sync);
  return len ? (60 * beatsPerBar) / len : null;
}
