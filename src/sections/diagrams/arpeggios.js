// Arpeggios mode: any 7th chord in the 5 positions of a key (or the whole neck), the
// chord scale dimmed behind it, and the key's diatonic chords one click away.

import { h, field, select, toggle, panel } from "../../ui/dom.js";
import { SCALES, scalePcs, scaleDegree, parentRoot } from "../../theory/scales.js";
import { CHORD_TYPES, chordPcs, chordDegree, chordName, guideTones, scaleSevenths } from "../../theory/chords.js";
import { positionDots, cagedPositions, dotsForPcs } from "../../theory/fretboard.js";
import { positionFinger } from "../../theory/shapes.js";
import { seg, keyOptions, keyField, positionPicker, legend, playButton, practiceFields } from "./common.js";

export const SEVENTH_TYPES = ["maj7", "m7", "7", "m7b5", "dim7", "m6", "6", "mMaj7", "7sus4", "7b9", "9", "m9", "maj9", "7alt"];

export function diatonicChips(ctx, onpick) {
  const { st } = ctx;
  const chords = scaleSevenths(scalePcs(st.key, "major"));
  const active = chords.findIndex((c) => c && c.root === st.chordRoot && c.type === st.chordType);
  return h("div", { class: "row chips" }, h("span", { class: "label" }, `Chords in ${ctx.pcName(st.key)} major`),
    ...chords.map((c, i) => h("button", { class: `chip${active === i ? " on" : ""}`, onclick: () => onpick(c) }, chordName(c, ctx.flats()))));
}

export function view(ctx) {
  const { st } = ctx;
  const chord = { root: st.chordRoot, type: st.chordType };
  const t = CHORD_TYPES[st.chordType];
  const tones = chordPcs(chord);
  const pcs = st.behind ? [...new Set([...tones, ...scalePcs(st.chordRoot, t.scale)])] : tones;
  const positions = cagedPositions(parentRoot(st.key, "major"));
  const pos = positions[Math.min(st.pos, 4)];
  const whole = st.view === "neck";
  const name = (pc) => ctx.pcName(pc);

  const dots = (whole ? dotsForPcs(pcs) : positionDots(pcs, pos.start)).map((d) => {
    const deg = chordDegree(chord, d.pc);
    let label = deg || scaleDegree(st.chordRoot, t.scale, d.pc) || "";
    if (st.labels === "note") label = name(d.pc);
    else if (st.labels === "finger") label = whole ? "" : String(positionFinger(d.fret, pos.start));
    else if (st.labels === "none") label = "";
    if (!deg) return { ...d, kind: "scale", dim: true, label };
    return { ...d, kind: d.pc === chord.root ? "root" : guideTones(chord).includes(d.pc) ? "guide" : "tone", label };
  });

  const toolbar = [
    h("div", { class: "toolbar" },
      keyField(ctx),
      field("Chord root", select(keyOptions(), st.chordRoot, (v) => ctx.set({ chordRoot: +v }))),
      field("Chord type", select(SEVENTH_TYPES.map((x) => [x, x]), st.chordType, (v) => ctx.set({ chordType: v }))),
      h("div", { class: "field" }, h("span", {}, "View"), seg([["position", "One shape"], ["neck", "Whole neck"]], whole ? "neck" : "position", (v) => ctx.set({ view: v }))),
      toggle("Scale behind", st.behind, (v) => ctx.set({ behind: v }))),
    diatonicChips(ctx, (c) => ctx.set({ chordRoot: c.root, chordType: c.type })),
  ];
  if (!whole) toolbar.push(h("div", { class: "toolbar" }, positionPicker(ctx, parentRoot(st.key, "major"))));

  const title = chordName(chord, ctx.flats());
  const sub = `${t.degrees.join(" ")} · ${tones.map(name).join(" ")}${whole ? "" : ` · ${pos.shape} shape, frets ${pos.start}–${pos.start + 3}`}`;
  const info = [
    h("div", { class: "hint" }, `Chord scale: ${name(st.chordRoot)} ${SCALES[t.scale].name}${st.behind ? " (dimmed)" : ""}. Step through the chord chips without moving your hand: that's one shape's worth of arpeggios.`),
  ];
  const panels = [panel("arp-practice", "Practice playback", { badge: `${st.bpm} BPM` }, practiceFields(ctx, { sequences: false }))];
  return {
    toolbar, title, sub, dots, info, panels,
    foot: [playButton(ctx, () => dots.filter((d) => !d.dim), { sequences: false })],
    legend: legend([["var(--dot-root)", "Root"], ["var(--dot-guide)", "3rd / 7th"], ["var(--dot-tone)", "Other chord tone"], ...(st.behind ? [["var(--dot-scale)", "Scale (dim)"]] : [])]),
    labels: whole ? ["interval", "note", "none"] : undefined,
    highlight: whole ? null : [pos.start, pos.start + 3],
  };
}
