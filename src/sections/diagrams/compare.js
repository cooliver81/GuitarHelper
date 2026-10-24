// Compare mode: two scales on the same root, on one board. Shared notes grey, notes only
// in A blue, only in B orange. The mode ladder steps from brightest (Lydian) to darkest
// (Locrian), one flattened note at a time.

import { h, field, select, panel } from "../../ui/dom.js";
import { pcName, prefersFlats } from "../../theory/notes.js";
import { SCALES, scalePcs, scaleDegree, parentRoot } from "../../theory/scales.js";
import { positionDots, cagedPositions, dotsForPcs } from "../../theory/fretboard.js";
import { compareScales, MODE_LADDER, shapeOrder, sequenceIndexes } from "../../theory/shapes.js";
import { seg, keyField, scaleOptions, positionPicker, legend } from "./common.js";

const short = (id) => SCALES[id].name.split(" (")[0];

export function view(ctx) {
  const { st } = ctx;
  const A = st.cmpA, B = st.cmpB;
  // Spell each scale in its own key signature: G minor's b6 is Eb, not D#.
  const nameIn = (id) => (pc) => pcName(pc, prefersFlats(parentRoot(st.key, id)));
  const nameA = nameIn(A), nameB = nameIn(B);
  const cmp = compareScales(st.key, A, B);
  const union = [...new Set([...scalePcs(st.key, A), ...scalePcs(st.key, B)])];
  const parent = parentRoot(st.key, A);
  const positions = cagedPositions(parent);
  const pos = positions[Math.min(st.pos, 4)];
  const whole = st.view === "neck";

  const base = whole ? dotsForPcs(union) : positionDots(union, pos.start);
  const dots = base.map((d) => {
    const inA = cmp.both.includes(d.pc) || cmp.onlyA.includes(d.pc);
    const kind = cmp.both.includes(d.pc) ? (d.pc === st.key ? "root" : "scale") : inA ? "a" : "b";
    const degree = inA ? scaleDegree(st.key, A, d.pc) : scaleDegree(st.key, B, d.pc);
    const label = st.labels === "note" ? (inA ? nameA : nameB)(d.pc) : st.labels === "none" ? "" : degree;
    return { ...d, kind, label };
  });

  const playOne = (id) => {
    const pcs = scalePcs(st.key, id);
    const order = shapeOrder(dots.filter((d) => pcs.includes(d.pc)));
    ctx.playSequence(sequenceIndexes(order.length, "straight").map((i) => order[i]), { loop: false });
  };

  const toolbar = [
    h("div", { class: "toolbar" },
      keyField(ctx, "Root"),
      field("Scale A (blue)", select(scaleOptions(), A, (v) => ctx.set({ cmpA: v }))),
      h("button", { class: "btn icon", title: "Swap A and B", "aria-label": "Swap A and B", onclick: () => ctx.set({ cmpA: B, cmpB: A }) }, "⇄"),
      field("Scale B (orange)", select(scaleOptions(), B, (v) => ctx.set({ cmpB: v }))),
      h("div", { class: "field" }, h("span", {}, "View"), seg([["position", "One shape"], ["neck", "Whole neck"]], whole ? "neck" : "position", (v) => ctx.set({ view: v })))),
  ];
  if (!whole) toolbar.push(h("div", { class: "toolbar" }, positionPicker(ctx, parent)));

  const diffText = (d) => (d.a && d.b
    ? `${short(A)} has ${d.a} (${nameA(scalePcs(st.key, A)[SCALES[A].degrees.indexOf(d.a)])}) where ${short(B)} has ${d.b} (${nameB(scalePcs(st.key, B)[SCALES[B].degrees.indexOf(d.b)])})`
    : d.a ? `${short(A)} adds ${d.a} (${nameA(scalePcs(st.key, A)[SCALES[A].degrees.indexOf(d.a)])})`
    : `${short(B)} adds ${d.b} (${nameB(scalePcs(st.key, B)[SCALES[B].degrees.indexOf(d.b)])})`);

  const title = `${nameA(st.key)} ${short(A)} vs ${short(B)}`;
  const sub = cmp.diffs.length ? `${cmp.diffs.length} note${cmp.diffs.length > 1 ? "s differ" : " differs"}${whole ? "" : ` · ${pos.shape} shape, frets ${pos.start}–${pos.start + 3}`}` : "Same notes";

  const foot = [h("div", { class: "controls" },
    ctx.playing
      ? h("button", { class: "btn", onclick: () => { ctx.stopPlaying(); ctx.rerender(); } }, "■ Stop")
      : [h("button", { class: "btn primary", onclick: () => playOne(A) }, `▶ Hear ${short(A)}`),
        h("button", { class: "btn", onclick: () => playOne(B) }, `▶ Hear ${short(B)}`)])];

  const ladderIdx = MODE_LADDER.indexOf(A);
  const info = [
    cmp.diffs.length ? h("ul", { class: "diff-list" }, ...cmp.diffs.map((d) => h("li", {}, diffText(d)))) : null,
    h("div", { class: "hint" }, "Same root, so this is exactly how the two sound different. Play one, then the other, over a drone on the root (Tools → Metronome) and listen for the coloured notes."),
  ];
  const panels = [panel("compare-ladder", "Mode ladder: bright → dark", { open: true, badge: "one note at a time" },
    h("div", { class: "row chips" }, ...MODE_LADDER.slice(0, -1).map((m, i) => h("button", {
      class: `chip${ladderIdx === i && B === MODE_LADDER[i + 1] ? " on" : ""}`, onclick: () => ctx.set({ cmpA: m, cmpB: MODE_LADDER[i + 1] }),
    }, `${short(m)} → ${short(MODE_LADDER[i + 1])}`))),
    h("div", { class: "hint" }, "Each step flattens one note. Walk down it and the mood gets darker: Lydian, Major, Mixolydian, Dorian, Minor, Phrygian, Locrian."))];

  return {
    toolbar, title, sub, dots, foot, info, panels,
    labels: ["interval", "note", "none"],
    legend: legend([["var(--dot-root)", "Root"], ["var(--dot-scale)", "In both"], ["var(--side-a)", `Only ${short(A)}`], ["var(--side-b)", `Only ${short(B)}`]]),
    highlight: whole ? null : [pos.start, pos.start + 3],
  };
}
