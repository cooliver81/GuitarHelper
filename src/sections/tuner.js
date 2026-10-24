// Tuner: continuous reading (not one event per pluck), median-smoothed needle.

import { h, setMsg } from "../ui/dom.js";
import { startMic, stopMic } from "../audio/mic.js";
import { midiToName } from "../theory/notes.js";
import { STANDARD_TUNING } from "../theory/fretboard.js";

const ID = "tuner";
const OPEN_STRINGS = Object.entries(STANDARD_TUNING).map(([s, m]) => ({ string: Number(s), midi: m }));

export function mount(root) {
  const note = h("div", { class: "tuner-note" }, "♪");
  const hz = h("div", { class: "muted" }, "0.0 Hz");
  const needle = h("div", { class: "needle" });
  const centsEl = h("div", { class: "tuner-cents" }, "-- cents");
  const hint = h("div", { class: "muted" }, "");
  const msg = h("div", { class: "msg" }, "Click Start, then play one string at a time. Standard tuning, low to high: E A D G B E.");
  const startBtn = h("button", { class: "btn primary", onclick: start }, "Start tuner");
  const stopBtn = h("button", { class: "btn", onclick: stop, disabled: true }, "Stop");

  const scale = h("div", { class: "meter" },
    h("div", { class: "meter-zone" }),
    ...[-50, -25, 0, 25, 50].map((c) => h("span", { class: "tick", style: `left:${50 + c * 0.92}%` }, c > 0 ? `+${c}` : String(c))),
    needle);

  root.append(
    h("header", { class: "card-head" }, h("h2", {}, "Tuner"), h("p", { class: "muted" }, "Continuous reading: watch the needle while you turn the peg. Green = within ±3 cents.")),
    h("div", { class: "controls" }, startBtn, stopBtn),
    h("div", { class: "tuner" }, note, hz, scale, centsEl, hint),
    msg,
  );

  const recent = [];
  let lastSeen = 0;

  function onReading(r) {
    if (!r.hasPitch) {
      if (performance.now() - lastSeen > 1200) {
        note.textContent = "♪";
        needle.style.left = "50%";
        needle.dataset.state = "";
      }
      return;
    }
    lastSeen = performance.now();
    recent.push(r);
    if (recent.length > 5) recent.shift();
    // Median of the last few readings for each field keeps the needle steady.
    const sorted = recent.filter((x) => x.midi === r.midi).map((x) => x.cents).sort((a, b) => a - b);
    const cents = sorted[Math.floor(sorted.length / 2)];
    note.textContent = midiToName(r.midi);
    hz.textContent = `${r.freq.toFixed(1)} Hz`;
    const c = Math.max(-50, Math.min(50, cents));
    needle.style.left = `${50 + c}%`;
    const inTune = Math.abs(cents) <= 3;
    needle.dataset.state = inTune ? "good" : Math.abs(cents) <= 10 ? "close" : "off";
    centsEl.textContent = `${cents > 0 ? "+" : ""}${cents.toFixed(1)} cents${inTune ? " · in tune" : cents < 0 ? " · flat, tune up" : " · sharp, tune down"}`;
    const nearest = OPEN_STRINGS.reduce((a, b) => (Math.abs(b.midi - r.midi) < Math.abs(a.midi - r.midi) ? b : a));
    hint.textContent = nearest.midi === r.midi ? `String ${nearest.string} (${midiToName(nearest.midi)})` : `Nearest open string: ${nearest.string} (${midiToName(nearest.midi)})`;
  }

  async function start() {
    try {
      setMsg(msg, "Asking for the microphone…");
      await startMic({ id: ID, onReading, onStop: reset });
      startBtn.disabled = true;
      stopBtn.disabled = false;
      setMsg(msg, "Listening. Play one string at a time.", "good");
    } catch (e) {
      setMsg(msg, `Microphone error: ${e.message}`, "bad");
    }
  }

  function reset(reason) {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    note.textContent = "♪";
    needle.style.left = "50%";
    setMsg(msg, reason || "Stopped.");
  }

  function stop() {
    stopMic(ID);
    reset();
  }

  return { onHide: () => {} };
}
