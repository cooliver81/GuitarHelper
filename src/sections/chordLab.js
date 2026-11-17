// Progressions: hear chord progressions away from the guitar.
// One working progression of 1–4 chords, written as scale degrees so it plays in any key.
// Presets load into it; every chord can be changed by hand or picked from the key's palette.
// Plays block chords or arpeggios on the look-ahead clock. Saved progressions stay in this browser.

import { h, field, select, toggle, fill, panel, seg } from "../ui/dom.js";
import { SHARP_NAMES, FLAT_NAMES, pcName, prefersFlats } from "../theory/notes.js";
import {
  PRESETS, MAX_CHORDS, LAB_TYPES, presetChords, toSeventh, toTriad, romanLabel, palette,
  resolveChord, voiceProgression, arpeggio, spellLab,
} from "../theory/chordLab.js";
import { resumeAudio, atAudioTime } from "../audio/context.js";
import { Clock } from "../audio/clock.js";
import { strum, pluck, click, bus } from "../audio/synth.js";
import { load, loadRaw, save } from "../store.js";

const TYPE_NAMES = {
  maj: "Major", m: "Minor", dim: "Diminished", aug: "Augmented",
  maj7: "Major 7", m7: "Minor 7", 7: "Dominant 7", m7b5: "Half-diminished (m7b5)", dim7: "Diminished 7",
};

// A <label> would forward clicks on its caption to the first button, so segments get a div.
const segField = (label, control) => h("div", { class: "field" }, h("span", {}, label), control);

const DEFAULTS = {
  key: 0, mode: "major", chords: presetChords(PRESETS[0]), preset: PRESETS[0].id, size: "triad",
  sound: "chords", rhythm: "held", pattern: "up", arpRate: 2, beats: 4, bpm: 80,
  smooth: true, loop: true, click: false, hidden: false,
};

export function mount(root) {
  const st = load("chordlab", DEFAULTS);
  const persist = () => save("chordlab", st);
  let mine = loadRaw("my-progressions", []);
  let clock = null;
  let pos = null;     // playback position: { chord, sub }
  let current = -1;   // chord being heard, for the highlight
  let sel = 0;        // chord slot being edited

  const flats = () => prefersFlats(st.key, st.mode);
  const spell = (c) => spellLab(c, st.key, st.mode);
  const resolved = () => st.chords.map((c) => resolveChord(c, st.key));
  const voiced = () => voiceProgression(resolved(), { smooth: st.smooth });
  const notesOf = (v) => [v.bass, ...v.upper];
  const out = () => bus("progressions", 0.9);

  // ---------- Playback ----------

  async function play() {
    const ctx = await resumeAudio();
    pos = { chord: 0, sub: 0 };
    clock = new Clock(ctx, onStep);
    clock.start({ bpm: st.bpm, stepsPerBeat: 2, swing: 0.5 });
    renderAll();
  }

  function stop() {
    if (clock) clock.stop();
    clock = null;
    current = -1;
    renderAll();
  }

  // One call per 8th note. Reads the settings every step, so edits are heard on the next chord.
  function onStep({ time, dur }) {
    const per = st.beats * 2;
    if (pos.sub >= per) { pos.sub = 0; pos.chord++; }
    if (pos.chord >= st.chords.length) {
      if (!st.loop) {
        clock.stop();
        atAudioTime(time, () => { if (clock && !clock.running) stop(); });
        return;
      }
      pos.chord = 0;
    }
    const i = pos.chord;
    const s = pos.sub++;
    const notes = notesOf(voiced()[i]);
    const chordLeft = (per - s) * dur;

    if (s === 0) atAudioTime(time, () => { if (clock) { current = i; renderChords(); } });
    if (st.click && s % 2 === 0) click(time, s === 0);

    if (st.sound === "chords") {
      if (st.rhythm === "held" && s === 0) strum(notes, time, { dur: chordLeft * 0.98, gain: 0.26, spread: 0.018, dest: out() });
      if (st.rhythm === "beats" && s % 2 === 0) strum(notes, time, { dur: dur * 1.8, gain: 0.22, spread: 0.01, dest: out() });
      return;
    }
    if (st.arpRate === 1 && s % 2) return;
    const k = st.arpRate === 2 ? s : s / 2;
    const seq = arpeggio(notes, st.pattern, st.arpRate === 2 ? per : per / 2);
    // Let each note ring to the end of the chord, like fingerpicking.
    pluck(seq[k], time, { gain: 0.42, dur: Math.min(2, Math.max(0.3, chordLeft)), dest: out() });
  }

  async function audition(chordIndex) {
    if (clock) return; // don't play over the progression
    await resumeAudio();
    strum(notesOf(voiced()[chordIndex]), 0, { dur: 1.6, gain: 0.28, spread: 0.02, dest: out() });
  }

  // ---------- Editing ----------

  function set(patch) {
    Object.assign(st, patch);
    persist();
    if (clock && "bpm" in patch) clock.set({ bpm: st.bpm });
    renderAll();
  }

  // Any change by hand makes it a custom progression.
  function setChords(chords, extra = {}) {
    set({ chords, preset: null, ...extra });
  }

  function loadPreset(id) {
    sel = 0;
    if (id.startsWith("mine:")) {
      const p = mine.find((x) => `mine:${x.id}` === id);
      if (p) set({ preset: id, key: p.key, mode: p.mode, chords: p.chords.map((c) => ({ ...c })) });
      return;
    }
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    const chords = presetChords(p).map(st.size === "seventh" ? toSeventh : (c) => c);
    // Minor forms default to A minor, major to C, unless the key is already set by hand.
    const key = p.mode !== st.mode ? (p.mode === "minor" ? 9 : 0) : st.key;
    set({ preset: id, mode: p.mode, key, chords });
  }

  function pickChord(c) {
    const chords = st.chords.slice();
    chords[Math.min(sel, chords.length)] = { degree: c.degree, type: c.type };
    const at = Math.min(sel, chords.length - 1);
    sel = Math.min(at + 1, MAX_CHORDS - 1);
    setChords(chords);
    audition(at);
  }

  function quiz() {
    const others = PRESETS.filter((p) => p.id !== st.preset);
    const p = others[Math.floor(Math.random() * others.length)];
    const chords = presetChords(p).map(st.size === "seventh" ? toSeventh : (c) => c);
    sel = 0;
    set({ preset: p.id, mode: p.mode, key: Math.floor(Math.random() * 12), chords, hidden: true });
    if (!clock) play();
  }

  // ---------- UI ----------

  const controlsEl = h("div", { class: "surface toolbar" });
  const chordsEl = h("div", { class: "lab-chords" });
  const editEl = h("div", { class: "lab-edit" });
  const paletteEl = h("div", { class: "stack" });
  const quizEl = h("div", { class: "row" });
  const panelsEl = h("div", { class: "panels" });

  function keyOptions() {
    return SHARP_NAMES.map((n, i) => [i, n === FLAT_NAMES[i] ? n : `${n}/${FLAT_NAMES[i]}`]);
  }

  function renderControls() {
    const options = st.hidden
      ? [["hidden", "Hidden: guess by ear"]]
      : [
        ...(st.preset ? [] : [["", "Custom (edited)"]]),
        { group: "Major", options: PRESETS.filter((p) => p.mode === "major").map((p) => [p.id, p.name]) },
        { group: "Minor", options: PRESETS.filter((p) => p.mode === "minor").map((p) => [p.id, p.name]) },
        ...(mine.length ? [{ group: "My progressions", options: mine.map((p) => [`mine:${p.id}`, p.name]) }] : []),
      ];
    fill(controlsEl,
      h("div", { class: "field grow" }, h("span", {}, "Progression"),
        select(options, st.hidden ? "hidden" : st.preset || "", loadPreset, { disabled: st.hidden })),
      field("Key", select(keyOptions(), st.key, (v) => set({ key: +v }))),
      segField("Mode", seg([["major", "Major"], ["minor", "Minor"]], st.mode, (v) => set({ mode: v }))),
      segField("Chords", seg([["triad", "Triads"], ["seventh", "7ths"]], st.size, (v) =>
        set({ size: v, chords: st.chords.map(v === "seventh" ? toSeventh : toTriad) }))),
      segField("Sound", seg([["chords", "Chords"], ["arp", "Arpeggio"]], st.sound, (v) => set({ sound: v }))),
      field("Tempo", h("input", { type: "number", class: "num", min: 30, max: 240, value: st.bpm, "aria-label": "Tempo in BPM",
        onchange: (e) => set({ bpm: Math.max(30, Math.min(240, +e.target.value || 80)) }) })),
      h("div", { class: "controls" },
        h("button", { class: "btn primary big", onclick: () => (clock ? stop() : play()) }, clock ? "■ Stop" : "▶ Play")),
    );
  }

  function renderChords() {
    const cards = st.chords.map((c, i) => {
      const sp = spell(c);
      const cls = `lab-chord${i === current ? " on" : ""}${i === sel && !st.hidden ? " sel" : ""}`;
      return h("button", { class: cls, onclick: () => { sel = i; audition(i); renderAll(); },
        title: st.hidden ? "Click to hear this chord" : "Click to hear and edit" },
        h("span", { class: "lab-num" }, String(i + 1)),
        h("span", { class: "lab-roman" }, st.hidden ? "?" : romanLabel(c)),
        h("span", { class: "lab-name" }, st.hidden ? " " : sp.name),
        h("span", { class: "lab-notes" }, st.hidden ? " " : sp.tones.join(" ")));
    });
    const canAdd = st.chords.length < MAX_CHORDS && !st.hidden;
    fill(chordsEl, ...cards,
      canAdd ? h("button", { class: `lab-chord add${sel >= st.chords.length ? " sel" : ""}`, title: "Add a chord",
        onclick: () => { sel = st.chords.length; renderAll(); } }, "+") : null);
  }

  function renderEditor() {
    if (st.hidden) { fill(editEl); fill(paletteEl); return; }
    const fl = flats();
    const c = st.chords[sel];
    const degreeOptions = Array.from({ length: 12 }, (_, d) =>
      [d, `${romanLabel({ degree: d, type: "maj" })} · ${spell({ degree: d, type: "maj" }).name}`]);

    fill(editEl, c
      ? [
        h("span", { class: "label lab-edit-title" }, `Chord ${sel + 1}`),
        field("Root", select(degreeOptions, c.degree, (v) => {
          const chords = st.chords.slice();
          chords[sel] = { ...c, degree: +v };
          setChords(chords);
          audition(sel);
        })),
        field("Type", select(LAB_TYPES.map((t) => [t, TYPE_NAMES[t]]), c.type, (v) => {
          const chords = st.chords.slice();
          chords[sel] = { ...c, type: v };
          setChords(chords);
          audition(sel);
        })),
        st.chords.length > 1 ? h("button", { class: "btn small ghost", onclick: () => {
          const chords = st.chords.filter((_, i) => i !== sel);
          sel = Math.min(sel, chords.length - 1);
          setChords(chords);
        } }, "Remove") : null,
      ]
      : h("span", { class: "hint" }, `Chord ${sel + 1}: pick one from the palette below.`));

    const pal = palette(st.mode, st.size);
    const chip = (p) => {
      const on = c && c.degree === p.degree && c.type === p.type;
      return h("button", { class: `chip${on ? " on" : ""}${p.extra ? " extra" : ""}`, onclick: () => pickChord(p),
        title: `${spell(p).tones.join(" ")}${p.extra ? " (borrowed from the parallel key)" : ""}` },
        `${romanLabel(p)} · ${spell(p).name}`);
    };
    fill(paletteEl,
      h("div", { class: "label" }, `In ${pcName(st.key, fl)} ${st.mode}: click to put it in chord ${Math.min(sel, st.chords.length) + 1}`),
      h("div", { class: "row chips" }, ...pal.filter((p) => !p.extra).map(chip)),
      h("div", { class: "row chips" }, h("span", { class: "hint" }, "Borrowed:"), ...pal.filter((p) => p.extra).map(chip)));
  }

  function renderQuiz() {
    fill(quizEl,
      h("button", { class: "btn small", onclick: quiz, title: "Random progression in a random key, names hidden" }, "Quiz me"),
      st.hidden
        ? h("button", { class: "btn small primary", onclick: () => set({ hidden: false }) }, "Reveal")
        : toggle("Hide names (guess by ear)", st.hidden, (v) => set({ hidden: v })),
      st.hidden ? h("span", { class: "hint" }, `Key: ${pcName(st.key, flats())} ${st.mode}. Name each chord's numeral, then reveal.`) : null);
  }

  function renderPanels() {
    const nameIn = h("input", { type: "text", placeholder: "Name", "aria-label": "Progression name" });
    const playback = st.sound === "chords"
      ? field("Chords played", select([["held", "Held, once per chord"], ["beats", "Every beat"]], st.rhythm, (v) => set({ rhythm: v })))
      : [
        field("Pattern", select([["up", "Up"], ["down", "Down"], ["updown", "Up and down"]], st.pattern, (v) => set({ pattern: v }))),
        field("Notes", select([[2, "8ths"], [1, "Quarters"]], st.arpRate, (v) => set({ arpRate: +v }))),
      ];
    fill(panelsEl,
      panel("chordlab-playback", "Playback", { open: true, badge: `${st.beats === 2 ? "½ bar" : st.beats === 4 ? "1 bar" : "2 bars"} per chord${st.loop ? " · loop" : ""}` },
        h("div", { class: "toolbar" },
          playback,
          field("Each chord lasts", select([[2, "Half a bar (2 beats)"], [4, "1 bar (4 beats)"], [8, "2 bars (8 beats)"]], st.beats, (v) => set({ beats: +v }))),
          segField("Voicing", seg([["smooth", "Smooth"], ["root", "Root position"]], st.smooth ? "smooth" : "root", (v) => set({ smooth: v === "smooth" })))),
        h("div", { class: "row" },
          toggle("Loop", st.loop, (v) => set({ loop: v })),
          toggle("Click", st.click, (v) => set({ click: v }))),
        h("div", { class: "hint" }, "Smooth voicing keeps common notes and moves the others by the smallest step, the way a pianist or a comping guitarist would. Root position stacks every chord from its root, so you hear each one on its own.")),
      panel("chordlab-mine", "My progressions", { badge: `${mine.length} saved` },
        h("p", { class: "hint" }, "Saved with their key, in this browser only. They appear in the Progression list."),
        h("div", { class: "row" }, nameIn,
          h("button", { class: "btn", onclick: () => {
            const name = nameIn.value.trim();
            if (!name) { nameIn.focus(); return; }
            const id = Date.now().toString(36);
            mine.push({ id, name, key: st.key, mode: st.mode, chords: st.chords.map((c) => ({ ...c })) });
            save("my-progressions", mine);
            set({ preset: `mine:${id}`, hidden: false });
          } }, "Save current")),
        mine.length ? h("ul", { class: "lab-saved" }, ...mine.map((p) => h("li", {},
          h("button", { class: "btn small ghost", onclick: () => loadPreset(`mine:${p.id}`) }, p.name),
          h("span", { class: "muted small" }, p.chords.map(romanLabel).join(" – ")),
          h("button", { class: "btn small ghost", "aria-label": `Delete ${p.name}`, onclick: () => {
            if (!confirm(`Delete “${p.name}”?`)) return;
            mine = mine.filter((x) => x !== p);
            save("my-progressions", mine);
            if (st.preset === `mine:${p.id}`) st.preset = null;
            set({});
          } }, "Delete")))) : null),
    );
  }

  function renderAll() {
    renderControls();
    renderChords();
    renderEditor();
    renderQuiz();
    renderPanels();
  }

  root.append(
    h("header", { class: "card-head" }, h("div", {},
      h("h2", {}, "Progressions"),
      h("p", {}, "Hear chord progressions without a guitar. Pick a common one or build your own from up to four chords, in any key, as chords or arpeggios."))),
    controlsEl,
    h("div", { class: "board-card stack" }, chordsEl, quizEl, editEl, paletteEl),
    panelsEl,
  );
  renderAll();

  return {
    // Keep playing on other tabs, like the backing track.
    onHide: () => {},
    preset: (p) => set({ ...p }),
  };
}
