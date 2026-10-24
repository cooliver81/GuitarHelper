// Progress mode: a grid of scales × CAGED shapes. A cell's score = perfect "fill in"
// quizzes + "I know this shape" checks. Shapes are key-independent, so a perfect quiz
// in Bb counts for the same shape in G.
// Ticked scales are "my scales": the quiz draws from them, and "Study next" picks the
// weakest shape so practice spreads across scales and shapes instead of repeating one.

import { h, toggle } from "../../ui/dom.js";
import { SCALES, parentRoot } from "../../theory/scales.js";
import { cagedPositions } from "../../theory/fretboard.js";

const SHAPES = ["E", "D", "C", "A", "G"];
// Shown by default; the rest are behind "Show all scales".
const COMMON = ["majorPent", "minorPent", "blues", "major", "aeolian", "dorian", "mixolydian"];

const level = (score) => (score >= 3 ? 2 : score >= 1 ? 1 : 0);

export function view(ctx) {
  const { st } = ctx;
  const mine = new Set(st.rotation);
  const score = (id, shape) => { const p = ctx.getProgress(id, shape); return (p.perfect || 0) + (p.memory || 0); };

  // Open a scale in a given shape (in the current key).
  const open = (scaleId, shape) => {
    const positions = cagedPositions(parentRoot(st.key, scaleId));
    const idx = positions.findIndex((p) => p.shape === shape);
    ctx.set({ mode: "scale", scale: scaleId, view: "position", pos: Math.max(0, idx), overlay: -1, pent: -1 });
  };

  const weakest = () => {
    const cells = st.rotation.flatMap((id) => SHAPES.map((shape) => ({ id, shape, s: score(id, shape) })));
    if (!cells.length) return null;
    const min = Math.min(...cells.map((c) => c.s));
    const pool = cells.filter((c) => c.s === min);
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const shown = Object.keys(SCALES).filter((id) => st.showAllScales || COMMON.includes(id) || mine.has(id));
  const rows = [];
  let group = null;
  for (const id of shown) {
    const s = SCALES[id];
    if (s.group !== group) { group = s.group; rows.push(h("tr", { class: "group-row" }, h("td", { colspan: 6 }, group))); }
    rows.push(h("tr", {},
      h("td", {}, toggle(s.name, mine.has(id), (on) => ctx.set({ rotation: on ? [...st.rotation, id] : st.rotation.filter((x) => x !== id) }))),
      ...SHAPES.map((shape) => {
        const sc = score(id, shape);
        const p = ctx.getProgress(id, shape);
        return h("td", {}, h("button", {
          class: "cell-btn", "data-level": String(level(sc)),
          title: `${s.name}, ${shape} shape: ${p.perfect || 0} perfect quizzes, ${p.memory || 0} “I know this” checks${p.last ? `, last ${p.last}` : ""}. Click to open it.`,
          "aria-label": `${s.name}, ${shape} shape, score ${sc}`,
          onclick: () => open(id, shape),
        }, sc ? String(sc) : "·"));
      })));
  }

  const total = st.rotation.length * 5;
  const solid = st.rotation.flatMap((id) => SHAPES.map((sh) => score(id, sh))).filter((x) => x >= 3).length;
  const started = st.rotation.flatMap((id) => SHAPES.map((sh) => score(id, sh))).filter((x) => x >= 1).length;
  const w = weakest();

  const toolbar = [h("div", { class: "toolbar" },
    h("button", { class: "btn primary", disabled: !w, onclick: () => w && open(w.id, w.shape), title: w ? `Opens ${SCALES[w.id].name}, ${w.shape} shape` : "Tick a scale first" },
      w ? `Study next: ${SCALES[w.id].name.split(" (")[0]}, ${w.shape} shape` : "Study next"),
    h("button", { class: "btn", disabled: !st.rotation.length, onclick: () => ctx.set({ mode: "quiz", quiz: "fill", quizSource: "rotation" }) }, "Quiz my scales"))];

  const body = [
    h("div", { class: "surface stack" },
      h("div", { class: "stat-row" },
        h("div", { class: "stat" }, h("b", {}, `${solid} / ${total}`), h("span", {}, "shapes solid (3+)")),
        h("div", { class: "stat" }, h("b", {}, String(started)), h("span", {}, "shapes started")),
        h("div", { class: "stat" }, h("b", {}, String(st.rotation.length)), h("span", {}, "scales ticked"))),
      h("div", { class: "meter-bar", title: `${solid} of ${total} solid` }, h("i", { style: `width:${total ? Math.round((solid / total) * 100) : 0}%` })),
      h("div", { class: "hint" }, "Ticked scales are your quiz mix (four common ones to start; change them freely). Each scale has five shapes up the neck, named after the open chord they're built around (E, D, C, A, G). A shape's score goes up with every perfect “Fill in a shape” quiz and every “✓ I know this shape” click. 1–2 = yellow, 3+ = green.")),
    h("div", { class: "surface" },
      h("div", { class: "progress-wrap" }, h("table", { class: "progress-grid" },
        h("thead", {}, h("tr", {}, h("th", {}, "Scale (tick = mine)"), ...SHAPES.map((s) => h("th", {}, `${s} shape`)))),
        h("tbody", {}, ...rows))),
      h("div", { class: "row", style: "margin-top:10px" },
        toggle(`Show all ${Object.keys(SCALES).length} scales`, st.showAllScales, (v) => ctx.set({ showAllScales: v })),
        h("span", { class: "spacer" }),
        h("button", { class: "btn small ghost", onclick: () => { if (confirm("Reset all shape scores? This can't be undone.")) { ctx.resetProgress(); ctx.rerender(); } } }, "Reset scores"))),
  ];
  return { toolbar, body, dots: [], hideBoard: true };
}
