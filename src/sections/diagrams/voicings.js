// Voicings mode: shells, drop 2 / 3 / 2&4 on each string set, every inversion,
// plus the diatonic walk (harmonise the scale with one shape).

import { h, field, select, toggle, fill, panel } from "../../ui/dom.js";
import { renderChordBox } from "../../ui/fretboardSvg.js";
import { mod12 } from "../../theory/notes.js";
import { scalePcs } from "../../theory/scales.js";
import { chordDegree, chordName, identifyChord } from "../../theory/chords.js";
import { VOICING_KINDS, voicingsFor, fretString, diatonicWalk } from "../../theory/voicings.js";
import { strum } from "../../audio/synth.js";
import { resumeAudio } from "../../audio/context.js";
import { keyOptions, keyField, legend } from "./common.js";
import { SEVENTH_TYPES, diatonicChips } from "./arpeggios.js";

let selected = null; // fretString of the chosen voicing, kept across renders

function list(st) {
  const sets = VOICING_KINDS[st.kind].stringSets;
  const strings = sets[Math.min(st.setIdx, sets.length - 1)];
  if (st.walk && st.kind !== "shell") {
    const inv = st.inversion === "all" ? 0 : +st.inversion;
    const first = voicingsFor({ root: st.key, type: "maj7" }, st.kind, { stringSets: [strings] }).find((v) => v.inversion === inv);
    if (!first) return [];
    return diatonicWalk(first, scalePcs(st.key, "major")).filter((v) => v.frets.every((f) => f >= 0 && f <= 17)).map((v) => {
      const c = identifyChord(v.midis.map(mod12));
      return { ...v, chord: c, degrees: v.midis.map((m) => (c ? chordDegree(c, mod12(m)) || "?" : "?")) };
    });
  }
  let out = voicingsFor({ root: st.chordRoot, type: st.chordType }, st.kind, { stringSets: [strings] });
  if (st.inversion !== "all") out = out.filter((v) => v.inversion === +st.inversion);
  return out;
}

export function view(ctx) {
  const { st } = ctx;
  const vs = list(st);
  const chosen = vs.find((v) => fretString(v) === selected) || null;
  const show = chosen ? [chosen] : vs;
  const dots = show.flatMap((v) => v.strings.map((s, i) => {
    const deg = v.degrees[i];
    const pc = mod12(v.midis[i]);
    const label = st.labels === "note" ? ctx.pcName(pc) : st.labels === "none" ? "" : deg;
    return { string: s, fret: v.frets[i], midi: v.midis[i], pc, kind: deg === "R" ? "root" : /^(b?3|b?b?7|6)$/.test(deg) ? "guide" : "tone", label };
  }));

  const sets = VOICING_KINDS[st.kind].stringSets;
  const invs = st.kind === "shell" ? [] : [0, 1, 2, 3];
  const toolbar = [
    h("div", { class: "toolbar" },
      keyField(ctx),
      field("Chord root", select(keyOptions(), st.chordRoot, (v) => ctx.set({ chordRoot: +v, walk: false }))),
      field("Chord type", select(SEVENTH_TYPES.map((x) => [x, x]), st.chordType, (v) => ctx.set({ chordType: v, walk: false }))),
      field("Voicing", select(Object.entries(VOICING_KINDS).filter(([k]) => k !== "triad").map(([k, v]) => [k, v.name]), st.kind, (v) => ctx.set({ kind: v, setIdx: 0, inversion: "all" }))),
      field("Strings", select(sets.map((x, i) => [i, x.join("-")]), Math.min(st.setIdx, sets.length - 1), (v) => ctx.set({ setIdx: +v }))),
      invs.length ? field("Inversion", select([["all", "All four"], ...invs.map((i) => [i, i === 0 ? "Root position" : `Inversion ${i}`])], st.inversion, (v) => ctx.set({ inversion: v }))) : null),
    diatonicChips(ctx, (c) => ctx.set({ chordRoot: c.root, chordType: c.type, walk: false })),
  ];

  const boxes = h("div", { class: "chordboxes" });
  fill(boxes, ...vs.map((v) => {
    const title = `${v.chord ? chordName(v.chord, ctx.flats()) : ""}${st.walk ? "" : ` ${v.bassDegree} bass`}`.trim();
    return h("button", { class: `chordbox-btn${v === chosen ? " on" : ""}`, title: `${fretString(v)}: click to hear`, onclick: async () => {
      selected = v === chosen ? null : fretString(v);
      await resumeAudio();
      strum(v.midis, 0, { dur: 1.6, gain: 0.35, spread: 0.03 });
      ctx.rerender();
    } }, renderChordBox(v, { title, labels: v.degrees }), h("div", { class: "muted small" }, fretString(v)));
  }));

  const title = st.walk ? `${VOICING_KINDS[st.kind].name}: walk through ${ctx.pcName(st.key)} major` : `${chordName({ root: st.chordRoot, type: st.chordType }, ctx.flats())} · ${VOICING_KINDS[st.kind].name}`;
  const sub = `${vs.length} shape${vs.length === 1 ? "" : "s"} on strings ${sets[Math.min(st.setIdx, sets.length - 1)].join("-")}${chosen ? " · showing the selected one" : ""}`;
  const foot = [
    st.kind === "shell" ? null : toggle(`Walk the scale in ${ctx.pcName(st.key)} major`, st.walk, (v) => ctx.set({ walk: v })),
    chosen ? h("button", { class: "btn small", onclick: () => { selected = null; ctx.rerender(); } }, "Show all") : null,
  ];
  const panels = [panel("voicing-boxes", "Chord boxes", { open: true, badge: "click one to hear it" },
    h("div", { class: "hint" }, st.walk ? "Each voice steps up one scale note: the shape changes, the hand barely moves." : "Every inversion on this string set. Click a box to hear it and show only that one on the neck."),
    boxes)];
  return {
    toolbar, title, sub, dots, foot, panels,
    labels: ["interval", "note", "none"],
    legend: legend([["var(--dot-root)", "Root"], ["var(--dot-guide)", "3rd / 7th"], ["var(--dot-tone)", "Other"]]),
  };
}
