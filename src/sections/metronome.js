// Metronome + drone on the look-ahead clock. Tempo, subdivision and swing change live;
// the drone keeps sounding through tempo changes.

import { h, select, field, toggle, setMsg, fill } from "../ui/dom.js";
import { resumeAudio, atAudioTime } from "../audio/context.js";
import { Clock } from "../audio/clock.js";
import { click, Drone } from "../audio/synth.js";
import { SHARP_NAMES, midiToFreq } from "../theory/notes.js";
import { load, save } from "../store.js";

const DEFAULTS = { bpm: 90, beats: 4, sub: 1, swing: 0.5, accent: true, only24: false, drone: false, droneNote: 7, droneOct: 2, timbre: "warm" };

export function mount(root) {
  const st = load("metronome", DEFAULTS);
  const persist = () => save("metronome", st);
  let clock = null;
  const drone = new Drone();
  const taps = [];

  const bpmVal = h("input", { type: "number", min: 30, max: 300, value: st.bpm, class: "num", oninput: (e) => setBpm(+e.target.value) });
  const bpmRange = h("input", { type: "range", min: 30, max: 300, value: st.bpm, oninput: (e) => setBpm(+e.target.value) });
  const lights = h("div", { class: "beat-lights" });
  const msg = h("div", { class: "msg" }, "Ready.");
  const startBtn = h("button", { class: "btn primary", onclick: start }, "Start");
  const stopBtn = h("button", { class: "btn", onclick: stop, disabled: true }, "Stop");

  function drawLights(active = -1) {
    fill(lights, ...Array.from({ length: st.beats }, (_, i) => h("span", { class: `beat${i === active ? " on" : ""}${i === 0 && st.accent ? " accent" : ""}` })));
  }

  function setBpm(v) {
    if (!(v >= 30 && v <= 300)) return;
    st.bpm = v;
    bpmVal.value = v;
    bpmRange.value = v;
    if (clock) clock.set({ bpm: v });
    persist();
  }

  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length >= 2) {
      const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      setBpm(Math.round(60000 / avg));
    }
  }

  const droneFreq = () => midiToFreq((st.droneOct + 1) * 12 + st.droneNote);

  function updateDrone() {
    persist();
    if (!clock) return;
    if (st.drone && !drone.running) drone.start(droneFreq(), st.timbre);
    else if (!st.drone && drone.running) drone.stop();
    else if (drone.running) drone.start(droneFreq(), st.timbre);
  }

  async function start() {
    const ctx = await resumeAudio();
    clock = new Clock(ctx, ({ beat, sub, time }) => {
      const inBar = beat % st.beats;
      // "2 and 4 only": the click becomes the hi-hat; you feel 1 and 3 yourself.
      const silent = st.only24 && inBar % 2 === 0;
      if (sub === 0) {
        if (!silent) click(time, st.accent && inBar === 0);
        atAudioTime(time, () => drawLights(inBar));
      } else if (!st.only24) click(time, false);
    });
    clock.start({ bpm: st.bpm, stepsPerBeat: st.sub, swing: st.swing });
    if (st.drone) drone.start(droneFreq(), st.timbre);
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setMsg(msg, `Running at ${st.bpm} BPM.`, "good");
  }

  function stop() {
    if (clock) clock.stop();
    clock = null;
    drone.stop();
    drawLights();
    startBtn.disabled = false;
    stopBtn.disabled = true;
    setMsg(msg, "Stopped.");
  }

  const noteOptions = SHARP_NAMES.map((n, i) => [i, n]);

  root.append(
    h("header", { class: "card-head" }, h("h2", {}, "Metronome + drone"), h("p", { class: "muted" }, "A steady click with optional swing, plus a drone on any note to practise scales against. Change anything while it runs.")),
    h("div", { class: "row" }, field("BPM", bpmVal), bpmRange, h("button", { class: "btn small", onclick: tap }, "Tap")),
    h("div", { class: "row" },
      field("Beats per bar", select([2, 3, 4, 5, 6, 7], st.beats, (v) => { st.beats = +v; drawLights(); persist(); })),
      field("Subdivision", select([[1, "Quarters"], [2, "8ths"], [3, "Triplets"], [4, "16ths"]], st.sub, (v) => { st.sub = +v; if (clock) clock.set({ stepsPerBeat: st.sub }); persist(); })),
      field("Swing (8ths)", select([[0.5, "Straight"], [0.6, "Light"], [0.67, "Triplet"]], st.swing, (v) => { st.swing = +v; if (clock) clock.set({ swing: st.swing }); persist(); })),
      toggle("Accent beat 1", st.accent, (v) => { st.accent = v; drawLights(); persist(); }),
      toggle("Click on 2 & 4 only", st.only24, (v) => { st.only24 = v; persist(); }),
    ),
    h("div", { class: "row" },
      toggle("Drone", st.drone, (v) => { st.drone = v; updateDrone(); }),
      field("Note", select(noteOptions, st.droneNote, (v) => { st.droneNote = +v; if (drone.running) drone.setFreq(droneFreq()); persist(); })),
      field("Octave", select([1, 2, 3, 4], st.droneOct, (v) => { st.droneOct = +v; if (drone.running) drone.setFreq(droneFreq()); persist(); })),
      field("Sound", select([["warm", "Warm pad"], ["sine", "Pure sine"]], st.timbre, (v) => { st.timbre = v; updateDrone(); })),
    ),
    h("div", { class: "controls" }, startBtn, stopBtn),
    lights,
    msg,
  );
  drawLights();

  return { onHide: () => {} };
}
