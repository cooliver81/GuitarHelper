// Triad trainer: play a triad's notes low to high on a string set. After each triad the
// shape is drawn on the neck, so the ear test turns into a fingering you keep.

import { h, field, select, toggle, setMsg, fill } from "../ui/dom.js";
import { startMic, stopMic } from "../audio/mic.js";
import { renderFretboard } from "../ui/fretboardSvg.js";
import { voicingVoices, placeVoices, degreeOf } from "../theory/voicings.js";
import { chordName } from "../theory/chords.js";
import { pcName, mod12 } from "../theory/notes.js";
import { strum } from "../audio/synth.js";
import { resumeAudio } from "../audio/context.js";
import { load, save } from "../store.js";

const ID = "triads";
const SETS = { 6: [6, 5, 4], 5: [5, 4, 3], 4: [4, 3, 2], 3: [3, 2, 1] };
const INV_NAMES = ["root position", "1st inversion", "2nd inversion"];
const QUALITIES = [["maj", "Major"], ["m", "Minor"], ["dim", "Diminished"], ["aug", "Augmented"]];
const DEFAULTS = { qualities: ["maj", "m"], inversions: [0, 1, 2], set: "any", flats: false };

export function mount(root) {
  const st = load("triads", DEFAULTS);
  let q = null; // { chord, inversion, strings, seq: [pc], index }
  let last = null; // stays set after a triad is done, for "Hear it"
  let running = false;
  let score = { ok: 0, fail: 0 };

  const prompt = h("div", { class: "big-prompt" }, "Press Start");
  const seqEl = h("div", { class: "seq" });
  const msg = h("div", { class: "msg" }, "Choose qualities and inversions, then Start.");
  const scoreEl = h("div", { class: "stats" });
  const board = h("div", { class: "board-wrap" });
  const startBtn = h("button", { class: "btn primary", onclick: start }, "Start");
  const stopBtn = h("button", { class: "btn", onclick: stop, disabled: true }, "Stop");
  const hearBtn = h("button", { class: "btn", onclick: hear, disabled: true }, "Hear it");

  const rand = (a) => a[Math.floor(Math.random() * a.length)];

  function newQuestion() {
    const chord = { root: Math.floor(Math.random() * 12), type: rand(st.qualities.length ? st.qualities : ["maj"]) };
    const inversion = rand(st.inversions.length ? st.inversions : [0]);
    const strings = SETS[st.set === "any" ? rand(Object.keys(SETS)) : st.set];
    const voices = voicingVoices(chord.type, "triad", inversion);
    q = { chord, inversion, strings, voices, seq: voices.map((v) => mod12(chord.root + v)), index: 0 };
    last = q;
    fill(prompt, 
      h("span", { class: "note" }, chordName(q.chord, st.flats)), " ",
      h("span", { class: "muted" }, `${INV_NAMES[inversion]} · strings ${strings.join("–")}`));
    drawSeq();
    renderFretboard(board, { dots: [] });
    setMsg(msg, "Play the three notes, low to high.");
  }

  function drawSeq(showNames = false) {
    fill(seqEl, ...q.seq.map((pc, i) => h("span", { class: `seq-note${i < q.index ? " done" : ""}` },
      i < q.index || showNames ? pcName(pc, st.flats) : "?")));
  }

  function showShape() {
    const places = placeVoices(q.chord.root, q.voices, q.strings, { maxSpan: 5 });
    const dots = places.flatMap((p) => p.strings.map((s, i) => ({
      string: s, fret: p.frets[i], kind: q.voices[i] % 12 === 0 ? "root" : "tone", label: degreeOf(q.chord.type, q.voices[i]),
    })));
    renderFretboard(board, { dots, onDotClick: null });
  }

  function onNote(n) {
    if (!q) return;
    const pc = mod12(n.midi);
    if (pc === q.seq[q.index]) {
      q.index++;
      drawSeq();
      if (q.index === 3) {
        score.ok++;
        setMsg(msg, "✓ Triad complete. Here's the shape:", "good");
        showShape();
        q = null;
        showScore();
        setTimeout(() => { if (running) newQuestion(); }, 2500);
      }
    } else if (q.index > 0 || q.seq.includes(pc)) {
      score.fail++;
      setMsg(msg, `Heard ${pcName(pc, st.flats)}: start again from the lowest note.`, "bad");
      q.index = 0;
      drawSeq(true);
      showShape();
      showScore();
    }
  }

  function showScore() {
    scoreEl.textContent = `Triads ${score.ok} · Restarts ${score.fail}`;
  }

  async function hear() {
    const target = last;
    if (!target) return;
    await resumeAudio();
    const p = placeVoices(target.chord.root, target.voices, target.strings, { maxSpan: 5 })[0];
    if (p) strum(p.midis, 0, { spread: 0.25, dur: 1.5, gain: 0.4 });
  }

  async function start() {
    try {
      await startMic({ id: ID, onNote, onStop: halt });
      running = true;
      score = { ok: 0, fail: 0 };
      startBtn.disabled = true;
      stopBtn.disabled = false;
      hearBtn.disabled = false;
      showScore();
      newQuestion();
    } catch (e) {
      setMsg(msg, `Microphone error: ${e.message}`, "bad");
    }
  }

  function halt(reason) {
    running = false;
    q = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    hearBtn.disabled = true;
    prompt.textContent = "Press Start";
    setMsg(msg, reason || "Stopped.");
  }

  function stop() {
    stopMic(ID);
    halt();
  }

  const listToggle = (label, list, value) => toggle(label, st[list].includes(value), (on) => {
    st[list] = on ? [...new Set([...st[list], value])] : st[list].filter((x) => x !== value);
    save("triads", st);
  });

  root.append(
    h("header", { class: "card-head" }, h("h2", {}, "Triads"), h("p", { class: "muted" }, "Play the triad's notes from the lowest string up. After each one you see every place that shape sits on the neck.")),
    h("div", { class: "row" }, ...QUALITIES.map(([v, l]) => listToggle(l, "qualities", v))),
    h("div", { class: "row" }, ...INV_NAMES.map((l, i) => listToggle(l, "inversions", i)),
      field("Strings", select([["any", "Any set"], ["6", "6–5–4"], ["5", "5–4–3"], ["4", "4–3–2"], ["3", "3–2–1"]], st.set, (v) => { st.set = v; save("triads", st); })),
      toggle("Flats", st.flats, (v) => { st.flats = v; save("triads", st); })),
    h("div", { class: "controls" }, startBtn, stopBtn, hearBtn),
    prompt, seqEl, msg, scoreEl, board,
  );
  renderFretboard(board, { dots: [] });
  showScore();

  return { onHide: () => {} };
}
