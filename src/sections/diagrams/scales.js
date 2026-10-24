// Scales mode. Views:
//   position - one CAGED shape (index finger at the start fret)
//   connect  - two neighbouring shapes; shared notes are where you shift
//   pattern  - 2 or 3 notes per string
//   neck     - whole neck, each note coloured by the shape it belongs to
// Highlights: a diatonic chord's tones, a pentatonic hidden in the scale, the CAGED chord
// shape the position hangs on, and the scale's signature ("colour") notes.

import { h, field, select, toggle, panel } from "../../ui/dom.js";
import { SCALES, scalePcs, scaleDegree, parentRoot } from "../../theory/scales.js";
import { chordPcs, chordDegree, chordName, guideTones, scaleSevenths } from "../../theory/chords.js";
import { positionDots, cagedPositions, notesPerStringDots } from "../../theory/fretboard.js";
import { positionFinger, patternFingers, pentatonicsInside, positionMembership, connectPositions, anchorTriad, SEQUENCES } from "../../theory/shapes.js";
import { seg, keyField, scaleOptions, positionPicker, legend, playButton, practiceFields } from "./common.js";

const POS_COLOURS = ["var(--pos0)", "var(--pos1)", "var(--pos2)", "var(--pos3)", "var(--pos4)"];
const short = (s) => s.name.split(" (")[0];

export function view(ctx) {
  const { st } = ctx;
  const s = SCALES[st.scale];
  const n = s.intervals.length;
  const pcs = scalePcs(st.key, st.scale);
  const parent = parentRoot(st.key, st.scale);
  const positions = cagedPositions(parent);
  const pos = positions[Math.min(st.pos, 4)];
  const nextPos = positions[(Math.min(st.pos, 4) + 1) % 5];
  const startB = nextPos.start > pos.start ? nextPos.start : nextPos.start + 12;
  const name = (pc) => ctx.pcName(pc);
  const hasPattern = n === 5 || n >= 7;
  const view = st.view === "pattern" && !hasPattern ? "position" : st.view;

  // ---------- Base dots for the view ----------
  let dots;
  let highlight = null;
  let fingers = null;
  if (view === "position") {
    dots = positionDots(pcs, pos.start);
    highlight = [pos.start, pos.start + 3];
    fingers = dots.map((d) => positionFinger(d.fret, pos.start));
  } else if (view === "connect") {
    dots = connectPositions(pcs, pos.start, startB).filter((d) => d.fret <= 15);
    highlight = [pos.start, Math.min(15, startB + 3)];
    fingers = dots.map((d) => positionFinger(d.fret, d.side === "b" ? startB : pos.start));
  } else if (view === "pattern") {
    dots = notesPerStringDots(st.key, s.intervals, st.pattern % n, n === 5 ? 2 : 3);
    fingers = patternFingers(dots);
    const frets = dots.map((d) => d.fret);
    highlight = [Math.min(...frets), Math.max(...frets)];
  } else {
    dots = positionMembership(st.key, st.scale);
  }

  // ---------- Highlights ----------
  const chords = n === 7 ? scaleSevenths(pcs) : [];
  const chord = st.overlay >= 0 ? chords[st.overlay] : null;
  const pents = n > 5 ? pentatonicsInside(st.key, st.scale) : [];
  const pent = st.pent >= 0 ? pents[st.pent] : null;
  const anchor = st.anchor ? anchorTriad(st.key, st.scale) : null;
  // On the neck map the outlines mean "shared"; signature notes would clash with them.
  const colourDegrees = st.colour && view !== "neck" ? s.colour : [];

  dots = dots.map((d, i) => {
    const degree = scaleDegree(st.key, st.scale, d.pc);
    let kind = d.pc === st.key ? "root" : "scale";
    let dim = false;
    let label = degree;

    if (view === "neck") kind = d.home >= 0 ? `p${d.home}` : "scale";
    else if (view === "connect") kind = d.side === "both" ? "both" : d.side;

    if (chord) {
      const cd = chordDegree(chord, d.pc);
      if (cd) { kind = d.pc === chord.root ? "root" : guideTones(chord).includes(d.pc) ? "guide" : "tone"; label = cd; }
      else dim = true;
    } else if (pent) {
      if (pent.pcs.includes(d.pc)) kind = d.pc === pent.minorRoot ? "root" : "tone";
      else dim = true;
    }

    if (st.labels === "note") label = name(d.pc);
    else if (st.labels === "finger") label = fingers ? String(fingers[i]) : "";
    else if (st.labels === "none") label = "";

    let mark = view === "neck" && d.positions.length >= 2 ? "shared" : null;
    if (anchor && anchor.includes(d.pc)) mark = "anchor";
    if (colourDegrees.includes(degree)) mark = "colour";
    return { ...d, kind, dim, label, mark, title: `${name(d.pc)} · ${degree}` };
  });

  // ---------- Toolbar ----------
  const views = [["position", "One shape"], ["connect", "Join two shapes"]];
  if (hasPattern) views.push(["pattern", n === 5 ? "2 notes per string" : "3 notes per string"]);
  views.push(["neck", "Whole neck"]);

  const toolbar = [h("div", { class: "toolbar" },
    keyField(ctx),
    field("Scale", select(scaleOptions(), st.scale, (v) => ctx.set({ scale: v, overlay: -1, pent: -1 }))),
    h("div", { class: "field" }, h("span", {}, "View"), seg(views, view, (v) => ctx.set({ view: v }))))];
  if (view === "position" || view === "connect") {
    toolbar.push(h("div", { class: "toolbar" }, positionPicker(ctx, parent, { label: view === "connect" ? "From shape" : "Shape" })));
  }
  if (view === "pattern") {
    toolbar.push(h("div", { class: "toolbar" }, h("div", { class: "field" }, h("span", {}, "Start on degree"),
      seg(s.degrees.map((d, i) => [i, d]), st.pattern % n, (v) => ctx.set({ pattern: +v })))));
  }

  // ---------- Caption ----------
  const title = `${name(st.key)} ${s.name}`;
  const where = view === "position" ? `${pos.shape} shape · frets ${pos.start}–${pos.start + 3}`
    : view === "connect" ? `${pos.shape} shape → ${nextPos.shape} shape`
    : view === "pattern" ? `${n === 5 ? 2 : 3} notes per string from the ${s.degrees[st.pattern % n]}`
    : "all five shapes";
  const sub = `${where} · ${pcs.map(name).join(" ")}${parent !== st.key && n === 7 ? ` (same notes as ${name(parent)} major)` : ""}`;

  // ---------- Legend + footer ----------
  let leg;
  if (view === "connect") {
    leg = legend([["var(--side-a)", `${pos.shape} shape`], ["var(--side-b)", `${nextPos.shape} shape`], ["var(--side-both)", "In both: shift here"]]);
  } else if (view === "neck") {
    leg = legend(positions.map((p, i) => [POS_COLOURS[i], `${p.shape} shape`]));
  } else {
    const items = [["var(--dot-root)", "Root"], ["var(--dot-scale)", "Scale note"]];
    if (chord) items.push(["var(--dot-guide)", "3rd / 7th"], ["var(--dot-tone)", "Chord tone"]);
    else if (pent) items.push(["var(--dot-tone)", "Pentatonic note"]);
    if (colourDegrees.length) items.push([null, "Signature note", true]);
    leg = legend(items);
  }

  const foot = [playButton(ctx, () => dots.filter((d) => !d.dim))];
  if (view === "position") {
    const p = ctx.getProgress(st.scale, pos.shape);
    const score = (p.memory || 0) + (p.perfect || 0);
    foot.push(h("button", {
      class: "btn small", title: "Counts towards this shape in Progress (any key)",
      onclick: () => { ctx.record(st.scale, pos.shape, { memory: 1 }); ctx.message(`Noted: ${short(s)}, ${pos.shape} shape (${score + 1}).`, "good"); ctx.rerender(); },
    }, "✓ I know this shape"), score ? h("span", { class: "pill good", title: "Memory checks + perfect quizzes" }, `${score}×`) : null);
  }

  // ---------- Info (only what the current view needs explained) ----------
  const info = [];
  if (view === "connect") info.push(h("div", { class: "hint" }, "Play up the first shape; on any white note, slide or stretch into the next one. Then come back down the other way."));
  if (view === "neck") info.push(h("div", { class: "hint" }, "Each note is coloured by the shape it sits in most centrally. A white outline means the neighbouring shape uses it too: that's where you move between them."));
  if (colourDegrees.length) {
    const colourPcs = s.colour.map((d) => name(pcs[s.degrees.indexOf(d)]));
    info.push(h("div", { class: "hint" }, `Signature note${s.colour.length > 1 ? "s" : ""}: ${s.colour.map((d, i) => `${d} (${colourPcs[i]})`).join(", ")}, what makes ${short(s)} sound like itself. Lean on ${s.colour.length > 1 ? "them" : "it"}.`));
  }
  if (chord) info.push(h("div", { class: "hint" }, `Lit: ${chordName(chord, ctx.flats())} = ${chordPcs(chord).map(name).join(" ")}. The rest of the scale is dimmed.`));
  if (pent) info.push(h("div", { class: "hint" }, `${name(pent.minorRoot)} minor pentatonic (= ${name(pent.majorRoot)} major pentatonic) hides inside ${name(st.key)} ${short(s)}: your pentatonic box, plus two notes.`));
  if (anchor) info.push(h("div", { class: "hint" }, `White ring = the ${name(st.key)} ${/b3/.test(s.degrees.join()) ? "minor" : "major"} chord this shape is built around.`));

  // ---------- Panels ----------
  const activeHighlight = chord ? chordName(chord, ctx.flats()) : pent ? `${name(pent.minorRoot)}m pentatonic` : null;
  const highlightBits = [activeHighlight, st.anchor ? "chord shape" : null, colourDegrees.length ? "signature notes" : null].filter(Boolean);
  const highlightBody = [];
  if (chords.length) {
    highlightBody.push(h("div", { class: "row chips" }, h("span", { class: "label" }, "Chord tones of"),
      h("button", { class: `chip${!chord ? " on" : ""}`, onclick: () => ctx.set({ overlay: -1 }) }, "none"),
      ...chords.map((c, i) => c && h("button", { class: `chip${st.overlay === i ? " on" : ""}`, onclick: () => ctx.set({ overlay: i, pent: -1 }) }, chordName(c, ctx.flats())))));
  }
  if (pents.length) {
    highlightBody.push(h("div", { class: "row chips" }, h("span", { class: "label" }, "Pentatonic inside"),
      h("button", { class: `chip${!pent ? " on" : ""}`, onclick: () => ctx.set({ pent: -1 }) }, "none"),
      ...pents.map((p, i) => h("button", { class: `chip${st.pent === i ? " on" : ""}`, onclick: () => ctx.set({ pent: i, overlay: -1 }) },
        `${name(p.minorRoot)}m / ${name(p.majorRoot)}`))));
  }
  highlightBody.push(h("div", { class: "row" },
    h("span", { title: "Ring the root chord's notes: the open-chord shape (C, A, G, E or D) this position is built on" }, toggle("Chord shape (CAGED)", st.anchor, (v) => ctx.set({ anchor: v }))),
    s.colour.length ? h("span", { title: "The note(s) that make this scale sound different from plain major or minor" }, toggle(`Signature note${s.colour.length > 1 ? "s" : ""} (${s.colour.join(", ")})`, st.colour, (v) => ctx.set({ colour: v }))) : null));

  const panels = [
    panel("scale-highlight", "Highlight", { badge: highlightBits.length ? highlightBits.join(" · ") : "Off" }, ...highlightBody),
    panel("scale-practice", "Practice playback", { badge: `${SEQUENCES[st.seq].name.split(" (")[0]} · ${st.bpm} BPM` },
      practiceFields(ctx),
      h("div", { class: "hint" }, "Sequences like 3rds and groups of 4 turn a shape into music. Start slow; speed comes from playing it clean.")),
  ];

  return { toolbar, title, sub, dots, highlight, foot, legend: leg, info, panels };
}
