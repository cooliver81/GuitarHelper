// Changes: play over a chord progression.
// Backing track (voice-led comping, walking bass, ride cymbal) on the look-ahead clock,
// the current chord's tones on the fretboard, and mic-scored exercises
// (guide tones, nearest chord tone, approach notes, enclosures).
// Songs are typed in by the user and stay in this browser (localStorage).

import { h, field, select, toggle, setMsg, fill, panel } from "../ui/dom.js";
import { renderFretboard, renderChordBox, fitRange } from "../ui/fretboardSvg.js";
import { chordToneDots } from "../ui/chordBoard.js";
import { SHARP_NAMES, FLAT_NAMES, pcName, prefersFlats, mod12 } from "../theory/notes.js";
import { CHORD_TYPES, chordDegree, chordName, guideTones } from "../theory/chords.js";
import { SCALES } from "../theory/scales.js";
import { cagedPositions, dotsForPcs } from "../theory/fretboard.js";
import { FORMS, parseChart, transposeBars, timeline, walkingBass } from "../theory/progressions.js";
import { voiceLead, voicingsFor, fretString } from "../theory/voicings.js";
import { EXERCISES, ExerciseScorer, targetPcs } from "../theory/exercises.js";
import { resumeAudio, atAudioTime, outputLatency } from "../audio/context.js";
import { Clock } from "../audio/clock.js";
import { strum, bassNote, ride, hihat, click, setBusGain } from "../audio/synth.js";
import { startMic, stopMic } from "../audio/mic.js";
import { load, loadRaw, save } from "../store.js";

const ID = "changes";
const BEATS_PER_BAR = 4;

const COMP_KINDS = {
  "drop2-top": { name: "Drop 2, strings 4-3-2-1", kind: "drop2", sets: [[4, 3, 2, 1]] },
  "drop2-mid": { name: "Drop 2, strings 5-4-3-2", kind: "drop2", sets: [[5, 4, 3, 2]] },
  "drop2-mix": { name: "Drop 2, both sets", kind: "drop2", sets: [[4, 3, 2, 1], [5, 4, 3, 2]] },
  drop3:       { name: "Drop 3", kind: "drop3", sets: [[6, 4, 3, 2], [5, 3, 2, 1]] },
  shell:       { name: "Shells", kind: "shell", sets: [[6, 4, 3], [5, 4, 3]] },
};

const DEFAULTS = {
  source: "form:ii-V-I", key: 7, transpose: 0, songKey: 0, bpm: 90, swing: 0.62,
  comp: "charleston", compKind: "drop2-mid", bass: true, drums: true, keyStep: 0, countIn: true,
  exercise: "guide", pos: 1, showScale: false, showNext: true, view: "improv",
  vol: { comp: 0.9, bass: 0.9, drums: 0.7 },
};

export function mount(root) {
  const st = load("changes", DEFAULTS);
  const persist = () => save("changes", st);
  let songs = loadRaw("songs", []);
  let history = loadRaw("changes-history", []);

  let clock = null;
  let scorer = null;
  let micOn = false;
  let cache = new Map();   // key offset -> arrangement
  let now = null;          // { chorus, spanIndex, arr }
  let lastPlayed = null;   // { midi, verdict, at }
  let feed = [];

  // ---------- Source ----------

  function source() {
    if (st.source.startsWith("song:")) {
      const song = songs.find((s) => s.id === st.source.slice(5));
      if (song) return { name: song.name, chart: song.chart, key: song.key ?? 0, isSong: true, song };
      st.source = DEFAULTS.source;
    }
    const form = FORMS.find((f) => `form:${f.id}` === st.source) || FORMS[0];
    return { name: form.name, chart: form.chart, key: st.key, mode: form.mode, isSong: false };
  }

  function baseBars() {
    const src = source();
    const { bars, errors } = parseChart(src.chart, { key: src.key, beatsPerBar: BEATS_PER_BAR });
    return { bars: src.isSong ? transposeBars(bars, st.transpose) : bars, errors, src };
  }

  // Tonal centre for positions: the form's key, or the song's key setting.
  function centre(offset = 0) {
    const src = source();
    const k = src.isSong ? mod12(st.songKey + st.transpose) : st.key;
    const relMajor = src.mode === "minor" ? mod12(k + 3) : k;
    return mod12(relMajor + offset);
  }

  function arrangement(offset) {
    const k = mod12(offset);
    if (cache.has(k)) return cache.get(k);
    const { bars } = baseBars();
    const t = timeline(transposeBars(bars, k));
    const ck = COMP_KINDS[st.compKind];
    const chords = t.spans.map((s) => s.chord);
    const lead = voiceLead(chords, ck.kind, { stringSets: ck.sets, preferFret: 6 });
    const voicings = lead ? lead.path : chords.map((c) => voicingsFor(c, ck.kind, { stringSets: ck.sets })[0] || null);
    const arr = { ...t, voicings, bass: walkingBass(t.spans), startAt: new Map(t.spans.map((s, i) => [s.start, i])), offset: k };
    cache.set(k, arr);
    return arr;
  }

  const flats = () => prefersFlats(centre(now ? now.arr.offset : 0));

  // ---------- Playback ----------

  async function play() {
    const ctx = await resumeAudio();
    cache = new Map();
    applyVolumes();
    scorer = new ExerciseScorer(st.exercise);
    feed = [];
    const countIn = st.countIn ? BEATS_PER_BAR : 0;
    clock = new Clock(ctx, (step) => onStep(step, countIn));
    clock.start({ bpm: st.bpm, stepsPerBeat: 2, swing: st.swing });
    renderAll();
  }

  function stop() {
    if (clock) clock.stop();
    clock = null;
    if (scorer) {
      const evs = scorer.finish();
      evs.forEach(pushFeed);
      saveHistory();
    }
    now = null;
    renderAll();
  }

  function onStep({ beat, sub, time, dur }, countIn) {
    const beatDur = 60 / st.bpm;
    if (beat < countIn) {
      if (sub === 0) click(time, beat === 0);
      return;
    }
    const mb = beat - countIn;
    const first = arrangement(0);
    const chorus = Math.floor(mb / first.totalBeats);
    const arr = arrangement(st.keyStep * chorus);
    const b = mb % arr.totalBeats;
    const barBeat = b % BEATS_PER_BAR;
    const spanIndex = arr.startAt.get(b);
    const curIndex = spanAt(arr, b);
    const span = arr.spans[curIndex];
    const v = arr.voicings[curIndex];

    if (sub === 0) {
      if (spanIndex != null) {
        const heardAt = time + outputLatency();
        if (scorer) scorer.chordStarted(span.chord, heardAt).forEach(pushFeed);
        atAudioTime(time, () => { now = { chorus, spanIndex, arr }; renderLive(); });
      }
      if (st.bass) bassNote(arr.bass[b].midi, time, beatDur * 0.95);
      if (st.drums) {
        ride(time, barBeat === 1 || barBeat === 3);
        if (barBeat === 1 || barBeat === 3) hihat(time);
      }
      if (v && st.comp !== "off") {
        if (st.comp === "four") strum(v.midis, time, { dur: beatDur * 0.45, gain: 0.2, spread: 0.008 });
        else if (st.comp === "whole" && spanIndex != null) strum(v.midis, time, { dur: span.beats * beatDur * 0.95, gain: 0.25, spread: 0.02 });
        else if (st.comp === "charleston" && spanIndex != null) strum(v.midis, time, { dur: beatDur * 0.7, gain: 0.26 });
      }
    } else {
      if (st.drums && (barBeat === 1 || barBeat === 3)) ride(time, false);
      // Charleston: beat 1 and the "and" of 2.
      if (v && st.comp === "charleston" && b === span.start + 1 && span.beats >= 4) strum(v.midis, time, { dur: dur * 1.6, gain: 0.22 });
    }
  }

  function spanAt(arr, b) {
    let idx = 0;
    arr.spans.forEach((s, i) => { if (s.start <= b) idx = i; });
    return idx;
  }

  // ---------- Mic + scoring ----------

  async function toggleMic() {
    if (micOn) {
      stopMic(ID);
      micOn = false;
      renderAll();
      return;
    }
    try {
      await startMic({ id: ID, onNote, onStop: () => { micOn = false; renderAll(); } });
      micOn = true;
    } catch (e) {
      setMsg(msgEl, `Microphone error: ${e.message}`, "bad");
    }
    renderAll();
  }

  function onNote(n) {
    lastPlayed = { midi: n.midi, verdict: null, at: performance.now() };
    if (scorer && clock) {
      const evs = scorer.noteOn(n.midi, n.onset);
      evs.forEach(pushFeed);
      const mine = evs[evs.length - 1];
      if (mine) lastPlayed.verdict = mine.verdict;
    }
    renderLive();
  }

  function pushFeed(ev) {
    feed.unshift(ev);
    feed = feed.slice(0, 8);
  }

  function saveHistory() {
    if (!scorer || scorer.hits + scorer.misses < 4 || st.exercise === "free") return;
    history.unshift({
      date: new Date().toISOString().slice(0, 10), source: source().name, exercise: st.exercise,
      bpm: st.bpm, hits: scorer.hits, misses: scorer.misses, best: scorer.best,
    });
    history = history.slice(0, 50);
    save("changes-history", history);
  }

  function applyVolumes() {
    setBusGain("comp", st.vol.comp);
    setBusGain("bass", st.vol.bass);
    setBusGain("drums", st.vol.drums);
  }

  // ---------- UI ----------

  const controlsEl = h("div", { class: "surface toolbar" });
  const boardOptsEl = h("div", { class: "board-opts" });
  const panelsEl = h("div", { class: "panels" });
  const chartEl = h("div", { class: "chart" });
  const nowEl = h("div", { class: "nowbar" });
  const board = h("div", { class: "board-wrap" });
  const compEl = h("div", { class: "chordboxes" });
  const scoreEl = h("div", { class: "scorebox" });
  const msgEl = h("div", { class: "msg" });
  const historyEl = h("div", { class: "history" });
  const editorEl = h("details", { class: "panel" });

  function set(patch, { rebuild = true } = {}) {
    Object.assign(st, patch);
    persist();
    if (rebuild) cache = new Map();
    if (clock && "bpm" in patch) clock.set({ bpm: st.bpm });
    if (clock && "swing" in patch) clock.set({ swing: st.swing });
    if (scorer && "exercise" in patch) scorer = new ExerciseScorer(st.exercise);
    renderAll();
  }

  function keyOptions() {
    return SHARP_NAMES.map((n, i) => [i, n === FLAT_NAMES[i] ? n : `${n}/${FLAT_NAMES[i]}`]);
  }

  function renderControls() {
    const src = source();
    const sourceOptions = [
      { group: "Practice progressions", options: FORMS.map((f) => [`form:${f.id}`, f.name]) },
      ...(songs.length ? [{ group: "My songs", options: songs.map((s) => [`song:${s.id}`, s.name]) }] : []),
    ];
    const playing = !!clock;
    const feel = { 0.5: "Straight", 0.62: "Swing", 0.67: "Hard swing" }[st.swing] || "Swing";
    const band = [feel, COMP_KINDS[st.compKind].name.split(",")[0], st.bass ? "bass" : null, st.drums ? "drums" : null].filter(Boolean).join(" · ");

    fill(controlsEl,
      h("div", { class: "field grow" }, h("span", {}, "Progression"), select(sourceOptions, st.source, (v) => {
        const f = FORMS.find((x) => `form:${x.id}` === v);
        const song = songs.find((x) => `song:${x.id}` === v);
        set({ source: v, ...(f ? { key: f.key } : {}), ...(song ? { songKey: song.key ?? 0, transpose: 0 } : {}) });
      })),
      src.isSong
        ? field("Transpose", select(Array.from({ length: 13 }, (_, i) => [i - 6, i - 6 > 0 ? `+${i - 6}` : String(i - 6)]), st.transpose, (v) => set({ transpose: +v })))
        : field(src.mode === "minor" ? "Key (minor)" : "Key", select(keyOptions(), st.key, (v) => set({ key: +v }))),
      field("Tempo", h("input", { type: "number", class: "num", min: 40, max: 320, value: st.bpm, "aria-label": "Tempo in BPM", onchange: (e) => set({ bpm: Math.max(40, Math.min(320, +e.target.value || 90)) }, { rebuild: false }) })),
      h("div", { class: "controls" },
        h("button", { class: "btn primary big", onclick: () => (playing ? stop() : play()) }, playing ? "■ Stop" : "▶ Play"),
        h("button", { class: `btn${micOn ? " on" : ""}`, onclick: toggleMic, title: "Listen to your guitar and score the exercise" }, micOn ? "● Mic on" : "Mic off")),
    );

    fill(boardOptsEl,
      select([["improv", "Where to solo"], ["comp", "Comping chords"]], st.view, (v) => set({ view: v }, { rebuild: false }), { "aria-label": "Board shows" }),
      st.view === "improv" ? select([[-1, "Whole neck"], ...cagedPositions(centre()).map((p, i) => [i, `${p.shape} shape (fret ${p.start})`])], st.pos, (v) => set({ pos: +v }, { rebuild: false }), { "aria-label": "Shape" }) : null,
      st.view === "improv" ? toggle("Scale too", st.showScale, (v) => set({ showScale: v }, { rebuild: false })) : null,
      st.view === "improv" ? toggle("Next chord", st.showNext, (v) => set({ showNext: v }, { rebuild: false })) : null);

    fill(panelsEl,
      panel("changes-exercise", "Exercise", { open: true, badge: `${EXERCISES[st.exercise].name}${micOn ? " · scoring" : ""}`, badgeLevel: micOn ? "good" : "" },
        field("What to aim for", select(Object.entries(EXERCISES).map(([k, v]) => [k, v.name]), st.exercise, (v) => set({ exercise: v }, { rebuild: false }))),
        h("div", { class: "hint" }, EXERCISES[st.exercise].hint, micOn ? "" : " Turn the mic on to be scored; use headphones so it hears you, not the backing."),
        scoreEl),
      panel("changes-band", "Backing band", { badge: band },
        h("div", { class: "toolbar" },
          field("Feel", select([[0.5, "Straight"], [0.62, "Swing"], [0.67, "Hard swing"]], st.swing, (v) => set({ swing: +v }, { rebuild: false }))),
          field("Chords played", select([["charleston", "Short stabs (beat 1, and of 2)"], ["four", "Every beat"], ["whole", "Held"], ["off", "No chords"]], st.comp, (v) => set({ comp: v }, { rebuild: false }))),
          field("Chord shapes", select(Object.entries(COMP_KINDS).map(([k, v]) => [k, v.name]), st.compKind, (v) => set({ compKind: v }))),
          field("Each chorus", select([[0, "Same key"], [5, "Up a 4th"], [7, "Up a 5th"], [1, "Up a half step"], [10, "Down a whole step"]], st.keyStep, (v) => set({ keyStep: +v })))),
        h("div", { class: "row" },
          toggle("Bass", st.bass, (v) => set({ bass: v }, { rebuild: false })),
          toggle("Drums", st.drums, (v) => set({ drums: v }, { rebuild: false })),
          toggle("Count-in", st.countIn, (v) => set({ countIn: v }, { rebuild: false }))),
        h("div", { class: "toolbar" },
          ...["comp", "bass", "drums"].map((part) => field(`${{ comp: "Chords", bass: "Bass", drums: "Drums" }[part]} volume`, h("input", { type: "range", min: 0, max: 1.5, step: 0.05, value: st.vol[part], oninput: (e) => { st.vol[part] = +e.target.value; applyVolumes(); persist(); } }))))),
      editorEl,
      history.length ? panel("changes-history", "Recent sessions", { badge: `${history.length}` }, historyEl) : null,
    );
  }

  function renderChart() {
    const arr = now ? now.arr : arrangement(0);
    const fl = flats();
    const { errors } = baseBars();
    const bars = [];
    arr.spans.forEach((s, i) => {
      (bars[s.barIndex] = bars[s.barIndex] || []).push(h("span", { class: `chart-chord${now && now.spanIndex === i ? " on" : ""}` }, chordName(s.chord, fl)));
    });
    fill(chartEl, ...bars.map((cs) => h("div", { class: "chart-bar" }, ...cs)),
      errors.length ? h("div", { class: "msg", "data-level": "warn" }, `Couldn't read: ${errors.join(", ")}`) : null);
  }

  function renderLive() {
    renderChart();
    const arr = now ? now.arr : arrangement(0);
    const i = now ? now.spanIndex : 0;
    const span = arr.spans[i];
    const next = arr.spans[(i + 1) % arr.spans.length];
    const fl = flats();
    const chord = span.chord;
    const scaleId = CHORD_TYPES[chord.type].scale;

    fill(nowEl, 
      h("div", { class: "now" }, h("div", { class: "muted small" }, "Now"), h("div", { class: "now-chord" }, chordName(chord, fl)),
        h("div", { class: "muted small" }, `${CHORD_TYPES[chord.type].degrees.map((d, k) => `${d}=${pcName(mod12(chord.root + CHORD_TYPES[chord.type].tones[k]), fl)}`).join(" ")}`),
        h("div", { class: "muted small" }, `Scale: ${pcName(chord.root, fl)} ${SCALES[scaleId].name}`)),
      h("div", { class: "next" }, h("div", { class: "muted small" }, "Next"), h("div", { class: "next-chord" }, chordName(next.chord, fl)),
        h("div", { class: "muted small" }, `3rd & 7th: ${guideTones(next.chord).map((pc) => pcName(pc, fl)).join(" ")}`)),
    );

    let dots;
    if (st.view === "comp") {
      const v = arr.voicings[i];
      dots = v ? v.strings.map((s, k) => {
        const deg = chordDegree(chord, mod12(v.midis[k])) || "?";
        return { string: s, fret: v.frets[k], kind: deg === "R" ? "root" : guideTones(chord).includes(mod12(v.midis[k])) ? "guide" : "tone", label: deg };
      }) : [];
      const nv = arr.voicings[(i + 1) % arr.spans.length];
      if (nv) nv.strings.forEach((s, k) => dots.push({ string: s, fret: nv.frets[k], ring: true, kind: "next", label: "" }));
      fill(compEl, ...arr.spans.map((sp, k) => {
        const v2 = arr.voicings[k];
        if (!v2) return null;
        return h("div", { class: `chordbox-btn${k === i ? " on" : ""}` }, renderChordBox(v2, { title: chordName(sp.chord, fl), labels: v2.midis.map((m) => chordDegree(sp.chord, mod12(m)) || "?") }), h("div", { class: "muted small" }, fretString(v2)));
      }));
    } else {
      fill(compEl);
      dots = chordToneDots({
        chord,
        start: st.pos >= 0 ? cagedPositions(centre(arr.offset))[st.pos].start : null,
        showScale: st.showScale,
        targets: targetPcs(st.exercise, chord),
        nextTargets: st.showNext ? targetPcs(st.exercise === "free" ? "guide" : st.exercise, next.chord) : null,
      });
    }
    if (lastPlayed && performance.now() - lastPlayed.at < 1500) {
      // Where you probably played it: inside the chosen position if there is one.
      const win = st.view === "improv" && st.pos >= 0 ? cagedPositions(centre(arr.offset))[st.pos].start : null;
      const cands = dotsForPcs([mod12(lastPlayed.midi)])
        .filter((d) => d.midi === lastPlayed.midi && (win == null || (d.fret >= win - 1 && d.fret <= win + 4)));
      const kind = lastPlayed.verdict === "miss" ? "miss" : lastPlayed.verdict === "hit" ? "hit" : "played";
      cands.forEach((d) => dots.push({ ...d, kind, label: pcName(d.pc, fl) }));
    }
    const hl = st.view === "improv" && st.pos >= 0 ? (() => { const s0 = cagedPositions(centre(arr.offset))[st.pos].start; return [s0, s0 + 3]; })() : null;
    renderFretboard(board, { ...fitRange(board, hl), dots, highlightFrets: hl });
    renderScore();
  }

  function renderScore() {
    if (!scorer || st.exercise === "free") {
      fill(scoreEl, h("div", { class: "muted" }, st.exercise === "free" ? "Free play: no scoring." : "Press Play (and turn the mic on) to be scored."));
      return;
    }
    const acc = scorer.accuracy;
    fill(scoreEl, 
      h("div", { class: "score-nums" },
        h("span", {}, h("b", {}, String(scorer.hits)), " hits"),
        h("span", {}, h("b", {}, String(scorer.misses)), " misses"),
        h("span", {}, h("b", {}, acc == null ? "–" : `${Math.round(acc * 100)}%`)),
        h("span", {}, "streak ", h("b", {}, String(scorer.streak)), ` (best ${scorer.best})`)),
      h("ul", { class: "feed" }, ...feed.map((e) => h("li", { "data-level": e.verdict === "hit" ? "good" : "bad" }, `${e.verdict === "hit" ? "✓" : "✗"} ${e.message}`))));
  }

  function renderHistory() {
    if (!history.length) { fill(historyEl); return; }
    fill(historyEl, h("table", {},
      h("tr", {}, ...["Date", "Progression", "Exercise", "BPM", "Score", "Best streak"].map((x) => h("th", {}, x))),
      ...history.slice(0, 10).map((r) => h("tr", {},
        h("td", {}, r.date), h("td", {}, r.source), h("td", {}, EXERCISES[r.exercise]?.name || r.exercise), h("td", {}, String(r.bpm)),
        h("td", {}, `${Math.round((100 * r.hits) / (r.hits + r.misses))}% (${r.hits}/${r.hits + r.misses})`), h("td", {}, String(r.best))))));
  }

  function renderEditor() {
    const editing = source().isSong ? source().song : null;
    const name = h("input", { type: "text", value: editing ? editing.name : "", placeholder: "Song name" });
    const chart = h("textarea", { rows: 6, class: "mono", placeholder: "| Cm7 | F7 | Bbmaj7 | Ebmaj7 |\n| Am7b5 | D7b9 | Gm6 | % |" }, editing ? editing.chart : "");
    const keySel = select(keyOptions(), editing ? editing.key ?? 0 : 0, () => {});
    const preview = h("div", { class: "muted small" });
    const updatePreview = () => {
      const { bars, errors } = parseChart(chart.value, { key: +keySel.value });
      preview.textContent = `${bars.length} bars${errors.length ? ` · couldn't read: ${errors.join(", ")}` : ""}`;
    };
    chart.addEventListener("input", updatePreview);
    keySel.addEventListener("change", updatePreview);
    updatePreview();

    const saveSong = (asNew) => {
      if (!name.value.trim() || !chart.value.trim()) { preview.textContent = "Needs a name and some chords."; return; }
      const data = { name: name.value.trim(), chart: chart.value, key: +keySel.value };
      if (editing && !asNew) Object.assign(editing, data);
      else { const id = Date.now().toString(36); songs.push({ id, ...data }); st.source = `song:${id}`; }
      save("songs", songs);
      set({ songKey: +keySel.value, transpose: 0 });
    };

    fill(editorEl,
      h("summary", {}, h("span", {}, editing ? `Edit “${editing.name}”` : "My songs: add one"), h("span", { class: "panel-badge" }, `${songs.length} saved`)),
      h("div", { class: "panel-body" },
      h("p", { class: "hint" }, "Type the changes bar by bar, separated by |. Two chords in a bar get two beats each; % repeats the last bar. Chord symbols (Cm7, F7, Bbmaj7, Am7b5, D7b9, Gm6) or roman numerals (iim7 V7 Imaj7). The key sets the roman numerals and the scale positions. Saved in this browser only."),
      h("div", { class: "row" }, field("Name", name), field("Key", keySel)),
      chart, preview,
      h("div", { class: "controls" },
        h("button", { class: "btn primary", onclick: () => saveSong(false) }, editing ? "Save changes" : "Save song"),
        editing ? h("button", { class: "btn", onclick: () => saveSong(true) }, "Save as new") : null,
        editing ? h("button", { class: "btn danger", onclick: () => {
          if (!confirm(`Delete “${editing.name}”?`)) return;
          songs = songs.filter((s) => s !== editing);
          save("songs", songs);
          set({ source: DEFAULTS.source });
        } }, "Delete") : null)));
  }

  function renderAll() {
    renderControls();
    renderLive();
    renderHistory();
    renderEditor();
  }

  root.append(
    h("header", { class: "card-head" }, h("div", {}, h("h2", {}, "Backing track"), h("p", {}, "Improvise over a progression with a band. The board shows where the current chord's notes are; dashed rings mark the next chord's targets."))),
    controlsEl,
    h("div", { class: "board-card stack" },
      h("div", { class: "board-head" }, nowEl, boardOptsEl),
      chartEl, board, compEl),
    msgEl, panelsEl,
  );
  renderAll();

  return {
    // Keep playing when you switch tabs: jam here, look up a shape in Diagrams.
    onHide: () => {},
    preset: (p) => set({ ...p }),
  };
}
