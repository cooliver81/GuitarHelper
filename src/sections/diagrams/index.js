// Diagrams tab: shell shared by its modes (Scales, Compare, Arpeggios, Chords, Quiz,
// Progress). Owns the state, the fretboard, sequence playback and shape progress.
//
// Layout, top to bottom: mode tabs · toolbar (the few controls you always need) ·
// board card (caption, labels, the fretboard, a footer row for play/quiz actions) ·
// collapsible panels (overlays, practice options) · extra content.
//
// Each mode module exports view(ctx) -> {
//   toolbar, title, sub, labels, dots, highlight, onDotClick, onCellClick, hideBoard,
//   foot, legend, info, panels, body }
// and is re-rendered whenever state changes.

import { h, fill, toggle, select } from "../../ui/dom.js";
import { renderFretboard, fitRange } from "../../ui/fretboardSvg.js";
import { pcName, prefersFlats, midiToName } from "../../theory/notes.js";
import { parentRoot } from "../../theory/scales.js";
import { Clock } from "../../audio/clock.js";
import { pluck, click } from "../../audio/synth.js";
import { resumeAudio, atAudioTime } from "../../audio/context.js";
import { load, loadRaw, save } from "../../store.js";

import * as scales from "./scales.js";
import * as compare from "./compare.js";
import * as arpeggios from "./arpeggios.js";
import * as voicings from "./voicings.js";
import * as quiz from "./quiz.js";
import * as progress from "./progress.js";

// [id, label, module, tooltip]; null = separator between "explore" and "practise".
const MODES = [
  ["scale", "Scales", scales, "Scale shapes, positions and the whole neck"],
  ["compare", "Compare", compare, "Two scales on one board: what's different"],
  ["arpeggio", "Arpeggios", arpeggios, "Chord tones of one chord"],
  ["voicing", "Chords", voicings, "Chord voicings: shells, drop 2, drop 3, triads"],
  null,
  ["quiz", "Quiz", quiz, "Test yourself: fill in shapes, name degrees"],
  ["progress", "Progress", progress, "Which shapes you know, and what to study next"],
];

export const LABEL_OPTIONS = {
  interval: "Intervals", note: "Note names", finger: "Fingers", none: "No labels",
};

export const DEFAULTS = {
  mode: "scale", key: 7, scale: "major", view: "position", pos: 1, pattern: 0, labels: "interval",
  overlay: -1, pent: -1, anchor: false, colour: true, seq: "straight", bpm: 90, seqClick: true, loop: true,
  chordRoot: 7, chordType: "maj7", behind: true, kind: "drop2", setIdx: 0, inversion: "all", walk: false,
  cmpA: "dorian", cmpB: "aeolian",
  quiz: "fill", quizSource: "rotation", quizRandomKey: false, showAllScales: false,
  rotation: ["major", "aeolian", "majorPent", "minorPent"],
  flip: false,
};

export function mount(root) {
  const st = load("diagrams", DEFAULTS);
  // Older saved state may lack new arrays.
  if (!Array.isArray(st.rotation)) st.rotation = DEFAULTS.rotation.slice();
  const persist = () => save("diagrams", st);
  let prog = loadRaw("shape-progress", {});

  const modeBar = h("nav", { class: "modes", "aria-label": "Diagram modes" });
  const toolbar = h("div", { class: "surface toolbar-wrap" });
  const boardCard = h("div", { class: "board-card" });
  const boardHead = h("div", { class: "board-head" });
  const board = h("div", { class: "board-wrap" });
  const boardFoot = h("div", { class: "board-foot" });
  const info = h("div", { class: "info" });
  boardCard.append(boardHead, board, boardFoot, info);
  const panelsEl = h("div", { class: "panels" });
  const body = h("div", { class: "stack" });
  const msg = h("div", { class: "msg", role: "status" });
  let lastView = null;

  // ---------- Playback of a sequence of dots ----------

  let player = null; // { clock }
  let nowKey = null;

  function stopPlaying() {
    if (player) player.clock.stop();
    player = null;
    nowKey = null;
  }

  // Play `order` (dots) as 8th notes, with a one-bar count-in.
  async function playSequence(order, { bpm = st.bpm, withClick = st.seqClick, loop = st.loop } = {}) {
    stopPlaying();
    if (!order.length) return;
    const ctx = await resumeAudio();
    const countIn = 8; // 4 beats of 8ths
    const clock = new Clock(ctx, ({ step, sub, time }) => {
      if (withClick && sub === 0) click(time, step % 8 === 0);
      if (step < countIn) return;
      const k = step - countIn;
      if (!loop && k >= order.length) {
        atAudioTime(time, () => { if (player && player.clock === clock) { stopPlaying(); render(); } });
        clock.stop();
        return;
      }
      const d = order[k % order.length];
      pluck(d.midi, time, { gain: 0.55, dur: 0.5 });
      atAudioTime(time, () => {
        if (!player || player.clock !== clock) return;
        nowKey = `${d.string}:${d.fret}`;
        drawBoard();
      });
    });
    player = { clock };
    clock.start({ bpm, stepsPerBeat: 2, swing: 0.5 });
    render();
  }

  async function playNote(midi) {
    await resumeAudio();
    pluck(midi, 0, { gain: 0.6, dur: 1.4 });
  }

  // ---------- Progress (per scale and CAGED shape, key-independent) ----------

  const progressKey = (scaleId, shape) => `${scaleId}|${shape}`;
  function getProgress(scaleId, shape) {
    return prog[progressKey(scaleId, shape)] || { perfect: 0, attempts: 0, memory: 0, last: null };
  }
  function record(scaleId, shape, patch) {
    const k = progressKey(scaleId, shape);
    const p = { ...getProgress(scaleId, shape) };
    for (const [f, v] of Object.entries(patch)) p[f] = (p[f] || 0) + v;
    p.last = new Date().toISOString().slice(0, 10);
    prog[k] = p;
    save("shape-progress", prog);
  }
  function resetProgress() {
    prog = {};
    save("shape-progress", prog);
  }

  // ---------- Context passed to modes ----------

  const ctx = {
    st,
    set(patch) {
      Object.assign(st, patch);
      persist();
      stopPlaying();
      render();
    },
    flats: () => prefersFlats(parentRoot(st.key, st.scale)),
    pcName: (pc) => pcName(pc, prefersFlats(parentRoot(st.key, st.scale))),
    midiName: (m) => midiToName(m, prefersFlats(parentRoot(st.key, st.scale))),
    playSequence,
    stopPlaying,
    get playing() { return !!player; },
    playNote,
    getProgress,
    record,
    resetProgress,
    message: (text, level) => { msg.textContent = text; msg.dataset.level = level || ""; },
    rerender: () => render(),
    redrawBoard: () => drawBoard(),
  };

  // ---------- Rendering ----------

  function drawBoard() {
    if (!lastView || lastView.hideBoard) return;
    const dots = (lastView.dots || []).map((d) => {
      // Roots read "R" everywhere (intervals would say "1"; fingers keep their 1).
      const label = st.labels === "interval" && d.label === "1" ? "R" : d.label;
      return nowKey && `${d.string}:${d.fret}` === nowKey ? { ...d, label, mark: "now", dim: false } : { ...d, label };
    });
    const range = fitRange(board, lastView.highlight, { fretMax: lastView.fretMax || 15 });
    renderFretboard(board, {
      ...range, dots, flip: st.flip,
      highlightFrets: lastView.highlight || null,
      onDotClick: lastView.onDotClick || ((d) => d.midi != null && playNote(d.midi)),
      onCellClick: lastView.onCellClick || null,
    });
  }

  function renderModes() {
    fill(modeBar, ...MODES.map((m) => {
      if (!m) return h("span", { class: "sep", "aria-hidden": "true" });
      const [id, label, , tip] = m;
      return h("button", {
        class: `mode${st.mode === id ? " on" : ""}`, title: tip, "aria-current": st.mode === id ? "page" : "false",
        onclick: () => { msg.textContent = ""; ctx.set({ mode: id }); },
      }, label);
    }));
  }

  function render() {
    renderModes();
    const mod = (MODES.find((m) => m && m[0] === st.mode) || MODES[0])[2];
    lastView = mod.view(ctx);
    const v = lastView;

    toolbar.hidden = !(v.toolbar && v.toolbar.length);
    fill(toolbar, ...(v.toolbar || []));

    boardCard.hidden = !!v.hideBoard;
    if (!v.hideBoard) {
      const labelOpts = v.labels === undefined ? Object.keys(LABEL_OPTIONS) : v.labels;
      fill(boardHead,
        h("div", {}, v.title ? h("div", { class: "board-title" }, v.title) : null, v.sub ? h("div", { class: "board-sub" }, v.sub) : null),
        h("div", { class: "board-opts" },
          labelOpts && labelOpts.length
            ? select(labelOpts.map((k) => [k, LABEL_OPTIONS[k]]), labelOpts.includes(st.labels) ? st.labels : labelOpts[0], (val) => ctx.set({ labels: val }), { "aria-label": "Dot labels", title: "What the dots show" })
            : null,
          toggle("Low E on top", st.flip, (val) => ctx.set({ flip: val }))));
      fill(boardFoot, ...(v.foot || []), v.legend ? h("span", { class: "spacer" }) : null, v.legend || null);
      fill(info, ...(v.info || []));
    }
    fill(panelsEl, ...(v.panels || []));
    fill(body, ...(v.body || []));
    drawBoard();
  }

  root.append(
    h("header", { class: "card-head" },
      h("div", {}, h("h2", {}, "Diagrams"),
        h("p", {}, "Learn scale shapes, positions and chords on the neck. Click any dot to hear it."))),
    modeBar, toolbar, boardCard, msg, panelsEl, body,
  );
  render();

  // Redraw on resize (phones switch between a window of frets and the whole neck).
  let lastWide = innerWidth >= 700;
  addEventListener("resize", () => {
    const wide = innerWidth >= 700;
    if (wide !== lastWide && !root.hidden) { lastWide = wide; drawBoard(); }
  });

  return {
    onHide: () => { stopPlaying(); },
    onShow: () => drawBoard(),
    preset: (p) => ctx.set({ ...p }),
  };
}
