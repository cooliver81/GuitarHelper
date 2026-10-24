// Controls shared by the Diagrams modes.

import { h, field, select, toggle, seg } from "../../ui/dom.js";
import { SHARP_NAMES, FLAT_NAMES } from "../../theory/notes.js";
import { SCALES } from "../../theory/scales.js";
import { cagedPositions } from "../../theory/fretboard.js";
import { SEQUENCES, sequenceIndexes, shapeOrder } from "../../theory/shapes.js";

export { seg };

export function keyOptions() {
  return SHARP_NAMES.map((n, i) => [i, n === FLAT_NAMES[i] ? n : `${n} / ${FLAT_NAMES[i]}`]);
}

export function keyField(ctx, label = "Key", prop = "key") {
  return field(label, select(keyOptions(), ctx.st[prop], (v) => ctx.set({ [prop]: +v })));
}

export function scaleOptions(filter = () => true) {
  const groups = {};
  for (const [id, s] of Object.entries(SCALES)) if (filter(id)) (groups[s.group] = groups[s.group] || []).push([id, s.name]);
  return Object.entries(groups).map(([group, options]) => ({ group, options }));
}

// Positions sorted up the neck, named by their CAGED shape (the open chord the box is
// built around) with the fret the index finger sits at.
export function positionPicker(ctx, parentPc, { label = "Shape", value = ctx.st.pos, onpick = (v) => ctx.set({ pos: +v }) } = {}) {
  const positions = cagedPositions(parentPc);
  return h("div", { class: "field" }, h("span", {}, label),
    seg(positions.map((p, i) => [i, h("span", {}, `${p.shape} shape`, h("small", {}, `fret ${p.start}`)), `Position ${p.number} up the neck: frets ${p.start}–${p.start + 3}`]), value, onpick));
}

export function legend(items) {
  return h("div", { class: "legend" }, ...items.map(([colour, text, ring]) =>
    h("span", {}, h("i", { class: ring ? "ring" : null, style: ring ? null : `background:${colour}` }), text)));
}

// Play button + tempo for any shape; sequence options live in a panel (practiceOptions).
export function playButton(ctx, getDots, { sequences = true, label = "Play" } = {}) {
  const st = ctx.st;
  const play = () => {
    const order = shapeOrder(getDots());
    const idx = sequenceIndexes(order.length, sequences ? st.seq : "straight");
    ctx.playSequence(idx.map((i) => order[i]));
  };
  const what = sequences && st.seq !== "straight" ? SEQUENCES[st.seq].name.split(" (")[0].toLowerCase() : "up and down";
  return h("div", { class: "controls" },
    ctx.playing
      ? h("button", { class: "btn", onclick: () => { ctx.stopPlaying(); ctx.rerender(); } }, "■ Stop")
      : h("button", { class: "btn primary", onclick: play, title: "Hear the shape, with a one-bar count-in" }, `▶ ${label}`),
    h("span", { class: "hint" }, `${what} · ${st.bpm} BPM`));
}

export function practiceFields(ctx, { sequences = true } = {}) {
  const st = ctx.st;
  return h("div", { class: "toolbar" },
    sequences ? field("Play pattern", select(Object.entries(SEQUENCES).map(([k, v]) => [k, v.name]), st.seq, (v) => ctx.set({ seq: v }))) : null,
    field("Tempo (BPM, 8th notes)", h("input", { type: "number", class: "num", min: 30, max: 300, value: st.bpm, onchange: (e) => ctx.set({ bpm: Math.max(30, Math.min(300, +e.target.value || 90)) }) })),
    toggle("Click track", st.seqClick, (v) => ctx.set({ seqClick: v })),
    toggle("Loop", st.loop, (v) => ctx.set({ loop: v })));
}
