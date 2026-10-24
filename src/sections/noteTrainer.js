// Fretboard note trainer. Checks the exact pitch by default (string 6 "G" means the G at
// fret 3, not any G). Targets you're slow on or miss come up more often.

import { h, field, select, toggle, setMsg, fill } from "../ui/dom.js";
import { startMic, stopMic } from "../audio/mic.js";
import { renderFretboard } from "../ui/fretboardSvg.js";
import { midiAt } from "../theory/fretboard.js";
import { pcName, midiToName, mod12 } from "../theory/notes.js";
import { pluck } from "../audio/synth.js";
import { resumeAudio } from "../audio/context.js";
import { load, loadRaw, save } from "../store.js";

const ID = "notes";
const DEFAULTS = { strings: [6, 5, 4, 3, 2, 1], fretMin: 0, fretMax: 12, exact: true, naturalsOnly: false, flats: false };

export function mount(root) {
  const st = load("notes", DEFAULTS);
  let stats = loadRaw("notes-stats", {});
  let target = null;
  let shownAt = 0;
  let missesThis = 0;
  let running = false;
  let session = { correct: 0, misses: 0, times: [] };

  const prompt = h("div", { class: "big-prompt" }, "Press Start");
  const msg = h("div", { class: "msg" }, "Pick strings and frets, then Start.");
  const sessionEl = h("div", { class: "stats" });
  const board = h("div", { class: "board-wrap" });
  const weakEl = h("div", { class: "muted small" });
  const startBtn = h("button", { class: "btn primary", onclick: start }, "Start");
  const stopBtn = h("button", { class: "btn", onclick: stop, disabled: true }, "Stop");
  const skipBtn = h("button", { class: "btn", onclick: () => { reveal(); setTimeout(next, 900); }, disabled: true }, "Show me");

  const key = (t) => `${t.string}:${t.fret}`;

  function candidates() {
    const out = [];
    for (const string of st.strings) {
      for (let fret = st.fretMin; fret <= st.fretMax; fret++) {
        const midi = midiAt(string, fret);
        if (st.naturalsOnly && pcName(midi).includes("#")) continue;
        out.push({ string, fret, midi });
      }
    }
    return out;
  }

  // Unseen and weak notes weigh more; well-known fast ones less.
  function weight(t) {
    const s = stats[key(t)];
    if (!s) return 3;
    const missRate = s.misses / Math.max(1, s.seen);
    const slow = Math.min(3, (s.avgMs || 3000) / 2000);
    return 0.5 + 3 * missRate + slow;
  }

  function pick() {
    const c = candidates().filter((t) => !target || key(t) !== key(target));
    if (!c.length) return null;
    const ws = c.map(weight);
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < c.length; i++) { r -= ws[i]; if (r <= 0) return c[i]; }
    return c[c.length - 1];
  }

  function draw(revealed = false, heard = null) {
    const dots = [];
    if (target && revealed) dots.push({ string: target.string, fret: target.fret, kind: "hit", label: pcName(target.midi, st.flats) });
    if (heard) dots.push({ ...heard, kind: "miss", label: pcName(heard.midi, st.flats) });
    renderFretboard(board, { fretMin: 0, fretMax: Math.max(12, st.fretMax), dots, highlightFrets: [st.fretMin, st.fretMax] });
  }

  function next() {
    if (!running) return;
    target = pick();
    missesThis = 0;
    shownAt = performance.now();
    if (!target) { setMsg(msg, "No notes match these settings.", "warn"); return; }
    const name = st.exact ? midiToName(target.midi, st.flats) : pcName(target.midi, st.flats);
    fill(prompt, h("span", { class: "str" }, `String ${target.string}`), " · ", h("span", { class: "note" }, name));
    setMsg(msg, "Find it and play it.");
    draw(false);
  }

  function record(t, ok, ms) {
    const s = stats[key(t)] || { seen: 0, misses: 0, avgMs: null };
    s.seen++;
    if (!ok) s.misses++;
    if (ok && ms != null) s.avgMs = s.avgMs == null ? ms : 0.7 * s.avgMs + 0.3 * ms;
    stats[key(t)] = s;
    save("notes-stats", stats);
  }

  // Show and play the answer.
  async function reveal() {
    if (!target) return;
    record(target, false, null);
    draw(true);
    await resumeAudio();
    pluck(target.midi, 0);
  }

  function onNote(n) {
    if (!target) return;
    const ok = st.exact ? n.midi === target.midi : mod12(n.midi) === mod12(target.midi);
    if (ok) {
      const ms = performance.now() - shownAt;
      record(target, missesThis === 0, ms);
      session.correct++;
      session.times.push(ms);
      setMsg(msg, `✓ ${midiToName(n.midi, st.flats)} in ${(ms / 1000).toFixed(1)} s`, "good");
      draw(true);
      target = null;
      setTimeout(() => { if (running && !target) next(); }, 700);
    } else {
      missesThis++;
      session.misses++;
      const octaveOff = mod12(n.midi) === mod12(target.midi);
      setMsg(msg, octaveOff ? `${midiToName(n.midi, st.flats)}: right note, wrong octave` : `Heard ${midiToName(n.midi, st.flats)}`, "bad");
      if (missesThis >= 3) { reveal(); setTimeout(next, 1500); }
    }
    showSession();
  }

  function showSession() {
    const avg = session.times.length ? session.times.reduce((a, b) => a + b, 0) / session.times.length / 1000 : null;
    sessionEl.textContent = `Correct ${session.correct} · Misses ${session.misses}${avg ? ` · Avg ${avg.toFixed(1)} s` : ""}`;
    const weak = Object.entries(stats)
      .map(([k, s]) => ({ k, score: s.misses / Math.max(1, s.seen) + (s.avgMs || 0) / 4000 }))
      .sort((a, b) => b.score - a.score).slice(0, 5)
      .map(({ k }) => { const [s, f] = k.split(":").map(Number); return `${pcName(midiAt(s, f), st.flats)} on ${s} (fret ${f})`; });
    weakEl.textContent = weak.length ? `Slowest so far: ${weak.join(", ")}` : "";
  }

  async function start() {
    try {
      await startMic({ id: ID, onNote, onStop: halt });
      running = true;
      session = { correct: 0, misses: 0, times: [] };
      startBtn.disabled = true;
      stopBtn.disabled = false;
      skipBtn.disabled = false;
      next();
      showSession();
    } catch (e) {
      setMsg(msg, `Microphone error: ${e.message}`, "bad");
    }
  }

  function halt(reason) {
    running = false;
    target = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    skipBtn.disabled = true;
    prompt.textContent = "Press Start";
    setMsg(msg, reason || "Stopped.");
  }

  function stop() {
    stopMic(ID);
    halt();
  }

  const stringBoxes = h("div", { class: "row" }, h("span", { class: "muted" }, "Strings"),
    ...[6, 5, 4, 3, 2, 1].map((s) => toggle(String(s), st.strings.includes(s), (on) => {
      st.strings = on ? [...new Set([...st.strings, s])] : st.strings.filter((x) => x !== s);
      save("notes", st);
    })));

  const frets = Array.from({ length: 16 }, (_, i) => i);
  root.append(
    h("header", { class: "card-head" }, h("h2", {}, "Fretboard notes"), h("p", { class: "muted" }, "A string and a note appear; play that exact note. Notes you miss or find slowly come back more often.")),
    stringBoxes,
    h("div", { class: "row" },
      field("From fret", select(frets, st.fretMin, (v) => { st.fretMin = +v; save("notes", st); draw(); })),
      field("To fret", select(frets, st.fretMax, (v) => { st.fretMax = +v; save("notes", st); draw(); })),
      toggle("Exact octave", st.exact, (v) => { st.exact = v; save("notes", st); }),
      toggle("Naturals only", st.naturalsOnly, (v) => { st.naturalsOnly = v; save("notes", st); }),
      toggle("Flats", st.flats, (v) => { st.flats = v; save("notes", st); }),
      h("button", { class: "btn small", onclick: () => { stats = {}; save("notes-stats", stats); showSession(); } }, "Reset history"),
    ),
    h("div", { class: "controls" }, startBtn, stopBtn, skipBtn),
    prompt, msg, sessionEl, board, weakEl,
  );
  draw();
  showSession();

  return { onHide: () => {} };
}
