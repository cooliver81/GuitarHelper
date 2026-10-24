// Input setup: which channel, how sensitive, reference pitch. Live level meter to check it.

import { h, field, select, toggle, setMsg } from "../ui/dom.js";
import { startMic, stopMic, applySettings } from "../audio/mic.js";
import { settings, saveSettings } from "../store.js";
import { midiToName } from "../theory/notes.js";

const ID = "setup";

export function mount(root) {
  const s = settings();
  const meter = h("div", { class: "level" }, h("div", { class: "level-fill" }));
  const thresholdMark = h("div", { class: "level-mark" });
  meter.append(thresholdMark);
  const readout = h("div", { class: "muted" }, "Not listening yet.");
  const msg = h("div", { class: "msg" }, "Start the test, play a few notes, and check the bar moves past the line.");
  const startBtn = h("button", { class: "btn primary", onclick: start }, "Test input");
  const stopBtn = h("button", { class: "btn", onclick: stop, disabled: true }, "Stop");

  const levelToPct = (rms) => Math.min(100, Math.max(0, (20 * Math.log10(rms + 1e-9) + 60) / 60 * 100)); // -60..0 dBFS

  function update(patch) {
    Object.assign(s, patch);
    saveSettings(s);
    applySettings();
    thresholdMark.style.left = `${levelToPct(s.sensitivity)}%`;
  }

  function onReading(r) {
    meter.firstChild.style.width = `${levelToPct(r.level)}%`;
    meter.dataset.over = r.level >= s.sensitivity ? "yes" : "no";
    if (r.hasPitch) readout.textContent = `${midiToName(r.midi)} · ${r.freq.toFixed(1)} Hz · clarity ${(r.clarity * 100).toFixed(0)}%`;
  }

  async function start() {
    try {
      await startMic({ id: ID, onReading, onStop: halt });
      startBtn.disabled = true;
      stopBtn.disabled = false;
      setMsg(msg, "Listening.", "good");
    } catch (e) {
      setMsg(msg, `Microphone error: ${e.message}`, "bad");
    }
  }

  function halt(reason) {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    setMsg(msg, reason || "Stopped.");
  }

  function stop() {
    stopMic(ID);
    halt();
  }

  root.append(
    h("header", { class: "card-head" }, h("h2", {}, "Input setup"), h("p", { class: "muted" }, "Applies to every listening tool. Saved in this browser.")),
    h("div", { class: "row" },
      field("Input channel", select([["auto", "Auto (louder one)"], ["1", "Input 1 / left"], ["2", "Input 2 / right"]], s.channel, (v) => update({ channel: v }))),
      field("A4 =", select([432, 438, 439, 440, 441, 442, 443].map((f) => [f, `${f} Hz`]), s.a4, (v) => update({ a4: +v }))),
      field("Note must hold", select([[80, "80 ms (fast lines)"], [120, "120 ms"], [180, "180 ms (noisy room)"]], s.sustainMs, (v) => update({ sustainMs: +v }))),
    ),
    h("div", { class: "row" },
      field("Sensitivity", h("input", { type: "range", min: 0.002, max: 0.08, step: 0.001, value: s.sensitivity, oninput: (e) => update({ sensitivity: +e.target.value }) })),
      toggle("Echo cancellation (playing backing tracks through speakers)", s.echoCancellation, (v) => update({ echoCancellation: v })),
    ),
    h("p", { class: "muted small" }, "Echo cancellation lets the mic ignore the backing track from your speakers, but it can also eat sustained notes. Headphones or a direct guitar input are better. The change applies the next time a tool starts the mic."),
    h("div", { class: "controls" }, startBtn, stopBtn),
    meter, readout, msg,
  );
  update({});
  return { onHide: () => stop() };
}
