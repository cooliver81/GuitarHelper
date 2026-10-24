// Play-along: practise over a real recording.
// Load a file or a YouTube video and pick what to show: a chord chart (your songs or a
// built-in form) or just a key and scale. Files are synced automatically (beats + where
// the chart's bar 1 is); YouTube is synced by tapping, since an embed can't be listened
// to. Then the chart and the fretboard follow the music. Slow down without changing
// pitch; loop any range of bars.
//
// Layout: no recording -> two big choices. With a recording -> media + transport on the
// left, current chord + chart + loop on the right, fretboard below, setup in panels.

import { h, field, select, toggle, setMsg, fill, seg, panel, fileButton } from "../ui/dom.js";
import { renderFretboard, fitRange } from "../ui/fretboardSvg.js";
import { chordToneDots } from "../ui/chordBoard.js";
import { SHARP_NAMES, FLAT_NAMES, pcName, prefersFlats, mod12 } from "../theory/notes.js";
import { CHORD_TYPES, chordName, guideTones } from "../theory/chords.js";
import { SCALES, scalePcs, scaleDegree, parentRoot } from "../theory/scales.js";
import { cagedPositions, positionDots, dotsForPcs } from "../theory/fretboard.js";
import { FORMS, parseChart, transposeBars } from "../theory/progressions.js";
import { barAt, barStart, barLength, chartPosition, nextChordPosition, tappedBpm } from "../theory/sync.js";
import { syncFromBeats } from "../audio/beats.js";
import { analyseFile } from "../audio/autoSync.js";
import { FilePlayer, YouTubePlayer, youtubeId } from "../audio/media.js";
import { load, loadRaw, save } from "../store.js";

const BEATS = 4;
const KEY_ONLY = "key";
const DEFAULTS = {
  chart: "form:major-minor", key: 7, transpose: 0, rate: 1, mediaKind: "file", ytUrl: "",
  pos: 1, showScale: false, showNext: true, focus: "all", loopOn: false, loopFrom: 1, loopTo: 4,
  scaleKey: 4, scaleId: "minorPent", videoSmall: false,
};
const KEY_SCALES = ["minorPent", "majorPent", "blues", "major", "aeolian", "dorian", "mixolydian"];

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const keyOptions = () => SHARP_NAMES.map((n, i) => [i, n === FLAT_NAMES[i] ? n : `${n}/${FLAT_NAMES[i]}`]);

export function mount(root, { navigate }) {
  const st = load("playalong", DEFAULTS);
  const persist = () => save("playalong", st);
  let syncs = loadRaw("playalong-sync", {});
  let player = null;
  let tapping = null;     // { kept: [...], fresh: [...] } while recording taps
  let analysing = false;  // auto-sync running
  let lastKey = "";
  let raf = 0;
  let lastClock = 0;
  let seeking = false;

  // ---------- What to show ----------

  const songs = () => loadRaw("songs", []);
  const keyOnly = () => st.chart === KEY_ONLY;

  function chart() {
    if (keyOnly()) return { name: `${pcName(st.scaleKey, prefersFlats(parentRoot(st.scaleKey, st.scaleId)))} ${SCALES[st.scaleId].name}`, bars: [], errors: [], centre: parentRoot(st.scaleKey, st.scaleId) };
    if (st.chart.startsWith("song:")) {
      const s = songs().find((x) => `song:${x.id}` === st.chart);
      if (s) {
        // Parse in the song's key, then shift: works for chord symbols and roman numerals.
        const { bars, errors } = parseChart(s.chart, { key: s.key ?? 0 });
        return { name: s.name, bars: transposeBars(bars, st.transpose), errors, centre: mod12((s.key ?? 0) + st.transpose) };
      }
      st.chart = DEFAULTS.chart;
    }
    const f = FORMS.find((x) => `form:${x.id}` === st.chart) || FORMS[0];
    const { bars, errors } = parseChart(f.chart, { key: st.key });
    return { name: f.name, bars, errors, centre: f.mode === "minor" ? mod12(st.key + 3) : st.key };
  }

  // ---------- Sync ----------
  // Per recording + chart: { mode: "auto" | "grid" | "taps", bpm, offset, taps, auto: { beats, start, score, margin }, saved }

  const syncKey = () => (player ? `${player.id}|${st.chart}` : null);

  function sync() {
    const k = syncKey();
    if (!k || keyOnly()) return null;
    // Unsaved until something is set, so "saved sync" means a real one.
    if (!syncs[k]) syncs[k] = { mode: player.file ? "auto" : "taps", bpm: 120, beatsPerBar: BEATS, offset: 0, taps: [], saved: false };
    return syncs[k];
  }

  function saveSync() {
    const s = sync();
    if (s) s.saved = true;
    save("playalong-sync", Object.fromEntries(Object.entries(syncs).filter(([, v]) => v.saved)));
  }

  // The sync used for timing (taps need at least two bar lines).
  function activeSync() {
    const s = sync();
    if (!s) return null;
    if (tapping) {
      const taps = [...tapping.kept, ...tapping.fresh];
      return taps.length >= 2 ? { mode: "taps", taps } : null;
    }
    if (s.mode === "auto") return s.auto ? { mode: "taps", taps: syncFromBeats(s.auto.beats, s.auto.start, BEATS).taps } : null;
    if (s.mode === "taps") return s.taps.length >= 2 ? { mode: "taps", taps: s.taps } : null;
    return { mode: "grid", bpm: s.bpm, beatsPerBar: BEATS, offset: s.offset };
  }

  async function runAutoSync() {
    const s = sync();
    if (!s || !player || !player.file || analysing) return;
    const c = chart();
    analysing = true;
    renderAll();
    try {
      const r = await analyseFile(player.file, c.bars);
      if (sync() !== s) return; // recording or chart changed meanwhile
      s.mode = "auto";
      s.auto = { beats: r.beats, start: r.start, score: r.score, margin: r.margin };
      saveSync();
      const weak = r.margin < 0.03 || r.score < 0.2;
      setMsg(msg, `Synced: about ${Math.round(r.bpm)} BPM, bar 1 at ${r.taps[0].toFixed(1)} s.${weak ? " The chords didn't match strongly; check bar 1 by ear and shift it in Bar sync if needed." : " Press play and check by ear."}`, weak ? "warn" : "good");
    } catch (e) {
      setMsg(msg, `${e.message} Use “Steady tempo” or “Tap the bars” in Bar sync instead.`, "bad");
      s.mode = "grid";
    } finally {
      analysing = false;
      lastKey = "";
      renderAll();
    }
  }

  // Shift bar 1 by whole beats, or halve / double the beat grid.
  function shiftAuto(beats) {
    const s = sync();
    s.auto.start = Math.max(0, Math.min(s.auto.beats.length - 1, s.auto.start + beats));
    saveSync(); lastKey = ""; renderAll();
  }
  function rescaleAuto(factor) {
    const s = sync();
    const { beats, start } = s.auto;
    if (factor === 2) {
      s.auto.beats = beats.flatMap((b, i) => (i + 1 < beats.length ? [b, +((b + beats[i + 1]) / 2).toFixed(3)] : [b]));
      s.auto.start = start * 2;
    } else {
      s.auto.beats = beats.filter((_, i) => i % 2 === start % 2);
      s.auto.start = Math.floor(start / 2);
    }
    saveSync(); lastKey = ""; renderAll();
  }

  // ---------- Elements ----------

  const head = h("header", { class: "card-head" });
  const setupEl = h("div", { class: "stack" });
  const practiceEl = h("div", { class: "stack" });
  const mediaBox = h("div", { class: "media" });
  const transportEl = h("div", { class: "transport" });
  const seekEl = h("input", { type: "range", min: 0, max: 1, step: 0.01, value: 0, "aria-label": "Position in recording", style: "width:100%",
    oninput: () => { seeking = true; }, onchange: (e) => { seeking = false; if (player) player.seek(+e.target.value); } });
  const timeEl = h("span", { class: "timecode" }, "0:00");
  const nowEl = h("div", { class: "nowbar" });
  const chartEl = h("div", { class: "chart" });
  const loopEl = h("div", { class: "row" });
  const boardHead = h("div", { class: "board-head" });
  const board = h("div", { class: "board-wrap" });
  const panelsEl = h("div", { class: "panels" });
  const msg = h("div", { class: "msg", role: "status" });
  const setupMsg = h("div");     // msg lives in whichever screen is showing
  const practiceMsg = h("div");

  // ---------- Loading ----------

  async function attach(p) {
    if (player) player.destroy();
    player = p;
    renderAll();
    try {
      await p.ready();
      p.setRate(st.rate);
      const s = sync();
      if (s && s.saved) setMsg(msg, `Loaded ${p.label}. Using your saved sync for this chart.`, "good");
      else if (s && p.file) { setMsg(msg, `Loaded ${p.label}. Finding the beats and bar 1…`, ""); runAutoSync(); }
      else if (s) setMsg(msg, `Loaded ${p.label}. Next: tap along to sync the bars (Bar sync, below).`, "");
      else setMsg(msg, `Loaded ${p.label}.`, "good");
    } catch (e) {
      setMsg(msg, e.message, "bad");
    }
    renderAll();
    startLoop();
  }

  function loadFile(file) {
    st.mediaKind = "file"; persist();
    attach(new FilePlayer(mediaBox, file));
  }

  function loadYouTube(input) {
    const id = youtubeId(input);
    if (!id) { setMsg(msg, "That doesn't look like a YouTube link.", "bad"); return; }
    st.ytUrl = input.trim();
    st.mediaKind = "youtube";
    persist();
    attach(new YouTubePlayer(mediaBox, id, { onError: (e) => setMsg(msg, e.message, "bad") }));
  }

  function unload() {
    if (player) player.destroy();
    player = null;
    tapping = null;
    fill(mediaBox);
    setMsg(msg, "");
    renderAll();
  }

  // ---------- Transport ----------

  function togglePlay() {
    if (!player) return;
    if (player.paused) player.play(); else player.pause();
    setTimeout(renderTransport, 50);
  }

  function setRate(r) {
    st.rate = r;
    persist();
    const actual = player && player.setRate(r);
    if (actual && actual !== r) setMsg(msg, `YouTube only offers ${actual * 100}% here.`, "warn");
  }

  function jumpBars(n) {
    const s = activeSync();
    if (!player || !s) return;
    const p = barAt(s, player.time);
    player.seek(barStart(s, Math.max(0, p.bar + n)));
  }

  function renderTransport() {
    const synced = !!activeSync();
    fill(transportEl,
      h("button", { class: "btn primary", onclick: togglePlay, disabled: !player, "aria-label": "Play or pause (Space)" }, player && !player.paused ? "❚❚ Pause" : "▶ Play"),
      h("button", { class: "btn small", onclick: () => jumpBars(-1), disabled: !synced, title: "Back one bar (←)" }, "◀ bar"),
      h("button", { class: "btn small", onclick: () => jumpBars(1), disabled: !synced, title: "Forward one bar (→)" }, "bar ▶"),
      select([0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1].map((r) => [r, `${Math.round(r * 100)}% speed`]), st.rate, (v) => setRate(+v), { "aria-label": "Playback speed", title: "Slower without changing pitch" }),
      h("span", { class: "spacer" }),
      timeEl,
    );
  }

  // ---------- Setup screen (no recording yet) ----------

  function chartPicker() {
    const list = songs();
    const isSong = st.chart.startsWith("song:");
    const change = (patch) => {
      Object.assign(st, patch); persist(); lastKey = ""; renderAll();
      // A new chart for a loaded file: find its bar 1 too.
      const sy = player && player.file ? sync() : null;
      if (sy && !sy.saved && sy.mode === "auto") runAutoSync();
    };
    return h("div", { class: "toolbar" },
      field("Show", select([
        [KEY_ONLY, "Just a key and scale (no chords)"],
        ...(list.length ? [{ group: "My songs", options: list.map((s) => [`song:${s.id}`, s.name]) }] : []),
        { group: "Practice progressions", options: FORMS.map((f) => [`form:${f.id}`, f.name]) },
      ], st.chart, (v) => change({ chart: v, transpose: 0, ...(v === KEY_ONLY && st.chart !== KEY_ONLY ? { scaleKey: chart().centre } : {}) }))),
      keyOnly() ? [
        field("Key", select(keyOptions(), st.scaleKey, (v) => change({ scaleKey: +v }))),
        field("Scale", select(KEY_SCALES.map((id) => [id, SCALES[id].name]), st.scaleId, (v) => change({ scaleId: v }))),
      ] : isSong
        ? field("Transpose", select(Array.from({ length: 13 }, (_, i) => [i - 6, i - 6 > 0 ? `+${i - 6}` : String(i - 6)]), st.transpose, (v) => change({ transpose: +v })))
        : field("Key", select(keyOptions(), st.key, (v) => change({ key: +v }))),
      keyOnly() ? null : h("button", { class: "btn small ghost", onclick: () => navigate("changes") }, list.length ? "Edit my songs →" : "Type in a song's chords →"),
    );
  }

  function renderSetup() {
    const url = h("input", { type: "url", value: st.ytUrl, placeholder: "https://www.youtube.com/watch?v=…", class: "wide", "aria-label": "YouTube link",
      onkeydown: (e) => { if (e.key === "Enter") loadYouTube(url.value); } });
    fill(setupEl,
      h("div", { class: "source-pick" },
        h("div", { class: "surface" },
          h("b", {}, "A file on this computer"),
          h("div", { class: "hint" }, "MP3, M4A, WAV or MP4. It never leaves your computer. Beats and bar 1 are found automatically."),
          h("div", { class: "controls" }, fileButton("Choose audio or video file", "audio/*,video/*", loadFile, "btn primary"))),
        h("div", { class: "surface" },
          h("b", {}, "A YouTube video"),
          h("div", { class: "hint" }, "Paste a link. YouTube doesn't let other pages hear the audio, so you'll sync by tapping along once."),
          h("div", { class: "controls" }, url, h("button", { class: "btn", onclick: () => loadYouTube(url.value) }, "Load")))),
      h("div", { class: "surface stack" },
        h("b", {}, "What to show while it plays"),
        chartPicker(),
        h("div", { class: "hint" }, "No chart for the song? Pick “Just a key and scale”: the board shows the scale, no syncing needed.")),
      setupMsg,
    );
  }

  // ---------- Practice screen ----------

  function renderHead() {
    fill(head,
      h("div", {}, h("h2", {}, "Play over a recording"),
        h("p", {}, player ? `${player.label} · ${chart().name}` : "Load a song, see the chords and where to play them, loop the hard bits at any speed.")),
      player ? h("div", { class: "head-actions" },
        player.canPopOut ? h("button", { class: "btn small", onclick: () => player.popOut().catch(() => {}), title: "Float the video in its own window" }, "Pop out video") : null,
        player.isVideo || player.videoId ? h("button", { class: "btn small", onclick: () => { st.videoSmall = !st.videoSmall; persist(); mediaBox.classList.toggle("small", st.videoSmall); renderHead(); } }, st.videoSmall ? "Bigger video" : "Smaller video") : null,
        h("button", { class: "btn small ghost", onclick: unload }, "Change recording")) : null);
  }

  function renderLoop() {
    const c = chart();
    const s = activeSync();
    if (keyOnly() || !s) { fill(loopEl); return; }
    const here = player ? barAt(s, player.time) : null;
    const setLoop = (from, to) => { st.loopFrom = Math.max(1, from); st.loopTo = Math.max(st.loopFrom, to); st.loopOn = true; persist(); lastKey = ""; renderLoop(); renderLive(true); };
    const inBar = here && here.bar >= 0;
    fill(loopEl,
      toggle("Loop bars", st.loopOn, (v) => { st.loopOn = v; persist(); lastKey = ""; renderLive(true); }),
      h("input", { type: "number", class: "num", min: 1, value: st.loopFrom, "aria-label": "Loop from bar", onchange: (e) => setLoop(+e.target.value, st.loopTo) }),
      h("span", { class: "muted" }, "to"),
      h("input", { type: "number", class: "num", min: 1, value: st.loopTo, "aria-label": "Loop to bar", onchange: (e) => setLoop(st.loopFrom, +e.target.value) }),
      inBar ? h("button", { class: "btn small", onclick: () => setLoop(here.bar + 1, here.bar + 1) }, "This bar") : null,
      inBar ? h("button", { class: "btn small", onclick: () => { const b0 = Math.floor(here.bar / 4) * 4; setLoop(b0 + 1, b0 + 4); } }, "These 4") : null,
      inBar && c.bars.length ? h("button", { class: "btn small", onclick: () => { const n = c.bars.length; const b0 = Math.floor(here.bar / n) * n; setLoop(b0 + 1, b0 + n); } }, "This chorus") : null,
    );
  }

  function renderBoardHead() {
    const c = chart();
    const change = (patch) => { Object.assign(st, patch); persist(); lastKey = ""; renderLive(true); };
    fill(boardHead,
      h("div", { class: "board-title" }, keyOnly() ? c.name : "Where to play"),
      h("div", { class: "board-opts" },
        select([[-1, "Whole neck"], ...cagedPositions(c.centre).map((p, i) => [i, `${p.shape} shape (fret ${p.start})`])], st.pos, (v) => change({ pos: +v }), { "aria-label": "Shape" }),
        keyOnly() ? null : select([["all", "All chord tones"], ["guide", "3rds and 7ths"], ["roots", "Roots only"]], st.focus, (v) => change({ focus: v }), { "aria-label": "Which notes" }),
        keyOnly() ? null : toggle("Scale too", st.showScale, (v) => change({ showScale: v })),
        keyOnly() ? null : toggle("Next chord", st.showNext, (v) => change({ showNext: v }))));
  }

  function syncBadge() {
    if (analysing) return ["Finding beats…", ""];
    const s = sync();
    if (!s) return ["", ""];
    const a = activeSync();
    if (!a) return ["Not synced yet", "warn"];
    if (s.mode === "auto") return [`Automatic · ~${Math.round(tappedBpm(a) || 0)} BPM`, "good"];
    if (s.mode === "taps") return [`Tapped · ${s.taps.length} bars`, "good"];
    return [`Steady · ${s.bpm} BPM`, "good"];
  }

  function renderSyncBody() {
    const s = sync();
    const modes = [...(player.file ? [["auto", "Automatic"]] : []), ["grid", "Steady tempo"], ["taps", "Tap the bars"]];
    const out = [seg(modes, s.mode, (v) => { s.mode = v; saveSync(); lastKey = ""; renderAll(); if (v === "auto" && !s.auto) runAutoSync(); })];

    if (s.mode === "auto") {
      if (analysing) out.push(h("div", { class: "progress-line" }, h("i")), h("div", { class: "hint" }, "Listening to the file for beats and matching the chart's chords…"));
      else if (!s.auto) out.push(h("button", { class: "btn primary", onclick: runAutoSync }, "Find beats and bar 1"));
      else {
        const taps = syncFromBeats(s.auto.beats, s.auto.start, BEATS).taps;
        out.push(
          h("div", { class: "hint" }, `Bar 1 at ${(taps[0] ?? 0).toFixed(2)} s · about ${Math.round(tappedBpm({ mode: "taps", taps }) || 0)} BPM · follows tempo changes. If the chords land early or late, shift bar 1:`),
          h("div", { class: "controls" },
            h("button", { class: "btn small", onclick: () => shiftAuto(-BEATS) }, "◀ 1 bar"),
            h("button", { class: "btn small", onclick: () => shiftAuto(-1) }, "◀ 1 beat"),
            h("button", { class: "btn small", onclick: () => shiftAuto(1) }, "1 beat ▶"),
            h("button", { class: "btn small", onclick: () => shiftAuto(BEATS) }, "1 bar ▶"),
            h("button", { class: "btn small ghost", onclick: () => rescaleAuto(0.5), title: "If the bars fly by twice as fast as the music" }, "Half tempo"),
            h("button", { class: "btn small ghost", onclick: () => rescaleAuto(2), title: "If each bar lasts two bars of music" }, "Double tempo"),
            h("button", { class: "btn small ghost", onclick: runAutoSync }, "Run again")));
      }
    } else if (s.mode === "grid") {
      const nudge = (d) => { s.offset = Math.max(0, +(s.offset + d).toFixed(3)); saveSync(); lastKey = ""; renderAll(); };
      out.push(
        h("div", { class: "hint" }, "For recordings with a click-steady tempo. Pause right on beat 1 of the first bar and press “Bar 1 is here”, then set the tempo (type it, or tap Tap beat along with the music)."),
        h("div", { class: "toolbar" },
          h("button", { class: "btn small", onclick: () => { s.offset = +player.time.toFixed(3); saveSync(); lastKey = ""; renderAll(); } }, "Bar 1 is here"),
          field("Bar 1 at (s)", h("input", { type: "number", class: "num", step: 0.01, value: s.offset, onchange: (e) => { s.offset = Math.max(0, +e.target.value); saveSync(); renderAll(); } })),
          h("button", { class: "btn small", onclick: () => nudge(-0.05) }, "−50 ms"),
          h("button", { class: "btn small", onclick: () => nudge(0.05) }, "+50 ms"),
          field("BPM", h("input", { type: "number", class: "num", step: 0.1, min: 30, max: 400, value: s.bpm, onchange: (e) => { s.bpm = Math.max(30, +e.target.value); saveSync(); renderAll(); } })),
          h("button", { class: "btn small", onclick: tapTempo }, "Tap beat")));
    } else {
      const n = s.taps.length;
      out.push(
        h("div", { class: "hint" }, h("span", {}, "Start a little before bar 1, press Start tapping, then press "), h("span", { class: "kbd" }, "T"), h("span", {}, " (or the big button) on beat 1 of every bar. Stop whenever you like: after your last tap it carries on at the same tempo. Tapping again later keeps the earlier taps.")),
        h("div", { class: "controls" },
          tapping
            ? h("button", { class: "btn primary big-tap", onclick: tapBar }, `Tap bar ${tapping.kept.length + tapping.fresh.length + 1}`)
            : h("button", { class: "btn primary", onclick: startTapping }, n ? "Tap again from here" : "Start tapping"),
          tapping ? h("button", { class: "btn", onclick: stopTapping }, "Done") : null,
          !tapping && n ? h("button", { class: "btn small ghost", onclick: () => { if (confirm("Clear all taps for this recording and chart?")) { s.taps = []; saveSync(); renderAll(); } } }, "Clear taps") : null,
          h("span", { class: "hint" }, n ? `${n} bars tapped · ≈${tappedBpm({ mode: "taps", taps: s.taps })?.toFixed(0) ?? "–"} BPM` : "")));
    }
    return out;
  }

  function renderPanels() {
    const [badge, level] = syncBadge();
    const needsSync = !keyOnly() && !activeSync();
    fill(panelsEl,
      panel("pa-chart", "What to show", { badge: chart().name }, chartPicker()),
      keyOnly() ? null : panel("pa-sync", "Bar sync", { badge, badgeLevel: level, force: needsSync || !!tapping || analysing }, ...renderSyncBody()),
      h("div", { class: "hint" }, "Keys: ", h("span", { class: "kbd" }, "Space"), " play/pause · ", h("span", { class: "kbd" }, "←"), " ", h("span", { class: "kbd" }, "→"), " one bar · ", h("span", { class: "kbd" }, "T"), " tap a bar · ", h("span", { class: "kbd" }, "L"), " loop on/off"));
  }

  function renderPractice() {
    mediaBox.classList.toggle("small", !!st.videoSmall);
    fill(practiceEl,
      h("div", { class: "split" },
        h("div", { class: "surface stack" }, mediaBox, seekEl, transportEl, loopEl),
        h("div", { class: "surface stack" }, nowEl, chartEl)),
      practiceMsg,
      h("div", { class: "board-card" }, boardHead, board),
      panelsEl);
  }

  // ---------- Tapping ----------

  const beatTaps = [];
  function tapTempo() {
    const s = sync();
    const now = performance.now();
    if (beatTaps.length && now - beatTaps[beatTaps.length - 1] > 2000) beatTaps.length = 0;
    beatTaps.push(now);
    if (beatTaps.length > 8) beatTaps.shift();
    if (beatTaps.length >= 3) {
      const avg = (beatTaps[beatTaps.length - 1] - beatTaps[0]) / (beatTaps.length - 1);
      // Taps are in real time; the recording may be slowed down.
      s.bpm = +((60000 / avg) * (1 / st.rate)).toFixed(1);
      saveSync();
      renderPanels();
    }
  }

  function startTapping() {
    const s = sync();
    const from = player.time;
    tapping = { kept: s.taps.filter((t) => t < from - 0.2), fresh: [] };
    s.mode = "taps";
    if (player.paused) player.play();
    renderAll();
  }

  function tapBar() {
    if (!tapping || !player) return;
    tapping.fresh.push(+player.time.toFixed(3));
    renderPanels();
  }

  function stopTapping() {
    const s = sync();
    s.taps = [...tapping.kept, ...tapping.fresh].sort((a, b) => a - b);
    tapping = null;
    saveSync();
    renderAll();
  }

  // ---------- Live display ----------

  function current() {
    const c = chart();
    const s = activeSync();
    if (!player || !s || !c.bars.length) return { c, pos: null };
    const at = barAt(s, player.time);
    return { c, at, s, pos: chartPosition(c.bars, at.bar, at.frac, BEATS) };
  }

  function renderLive(force = false) {
    if (!player) return;
    if (keyOnly()) {
      if (!force && lastKey === "key") return;
      lastKey = "key";
      const flats = prefersFlats(parentRoot(st.scaleKey, st.scaleId));
      fill(nowEl, h("div", {}, h("div", { class: "label" }, "Play in"),
        h("div", { class: "now-chord" }, `${pcName(st.scaleKey, flats)} ${SCALES[st.scaleId].name.split(" (")[0]}`),
        h("div", { class: "muted small" }, scalePcs(st.scaleKey, st.scaleId).map((pc) => pcName(pc, flats)).join(" "))));
      renderScaleBoard();
      return;
    }
    const { c, at, s, pos } = current();
    const key = pos ? `${pos.chorus}:${pos.barIndex}:${pos.chordIndex}` : `none:${at ? at.bar : "x"}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    const fl = prefersFlats(c.centre);
    const chorus = pos ? pos.chorus : 0;
    const n = c.bars.length;

    fill(chartEl,
      ...c.bars.map((bar, bi) => {
        const abs = chorus * n + bi + 1;
        const inLoop = st.loopOn && abs >= st.loopFrom && abs <= st.loopTo;
        return h("div", {
          class: `chart-bar${pos && pos.barIndex === bi ? " here" : ""}${inLoop ? " in-loop" : ""}${s ? " clickable" : ""}`,
          title: s ? `Bar ${abs}: click to jump here` : null,
          onclick: s ? () => player.seek(barStart(s, abs - 1)) : null,
        },
        h("span", { class: "bar-num" }, String(abs)),
        ...bar.map((ch, ci) => h("span", { class: `chart-chord${pos && pos.barIndex === bi && pos.chordIndex === ci ? " on" : ""}` }, chordName(ch.chord, fl))));
      }),
      c.errors.length ? h("div", { class: "msg", "data-level": "warn" }, `Couldn't read: ${c.errors.join(", ")}`) : null);

    if (!pos) {
      const why = analysing ? "Finding the beats…" : !activeSync() ? "Sync the bars (below) and the chords will follow the music." : at && at.bar < 0 ? `Intro: the chart starts in ${Math.max(0, (barStart(s, 0) - player.time) / st.rate).toFixed(1)} s.` : "";
      fill(nowEl, h("div", {}, h("div", { class: "label" }, "Now"), h("div", { class: "now-chord faint" }, "–"), h("div", { class: "muted small" }, why)));
      const first = c.bars[0][0];
      renderChordBoard(c, first.chord, (c.bars[0][1] || c.bars[1 % n][0]).chord);
      return;
    }
    const cur = c.bars[pos.barIndex][pos.chordIndex].chord;
    const np = nextChordPosition(c.bars, pos.barIndex, pos.chordIndex);
    const next = c.bars[np.barIndex][np.chordIndex].chord;
    const t = CHORD_TYPES[cur.type];
    fill(nowEl,
      h("div", {}, h("div", { class: "label" }, `Now · bar ${chorus * n + pos.barIndex + 1}`), h("div", { class: "now-chord" }, chordName(cur, fl)),
        h("div", { class: "muted small" }, t.degrees.map((d, k) => `${d}=${pcName(mod12(cur.root + t.tones[k]), fl)}`).join(" ")),
        h("div", { class: "muted small" }, `Scale: ${pcName(cur.root, fl)} ${SCALES[t.scale].name}`)),
      h("div", {}, h("div", { class: "label" }, "Next"), h("div", { class: "next-chord" }, chordName(next, fl)),
        h("div", { class: "muted small" }, `3rd & 7th: ${guideTones(next).map((pc) => pcName(pc, fl)).join(" ")}`)),
    );
    renderChordBoard(c, cur, next);
  }

  function drawBoard(dots, start) {
    const hl = start == null ? null : [start, start + 3];
    renderFretboard(board, { ...fitRange(board, hl), dots, highlightFrets: hl });
  }

  function renderChordBoard(c, chord, next) {
    const start = st.pos >= 0 ? cagedPositions(c.centre)[st.pos].start : null;
    const focus = (ch) => (st.focus === "guide" ? guideTones(ch) : st.focus === "roots" ? [ch.root] : null);
    drawBoard(chordToneDots({
      chord, start, showScale: st.showScale, targets: focus(chord),
      nextTargets: st.showNext ? (focus(next) || guideTones(next)) : null,
    }), start);
  }

  function renderScaleBoard() {
    const pcs = scalePcs(st.scaleKey, st.scaleId);
    const start = st.pos >= 0 ? cagedPositions(parentRoot(st.scaleKey, st.scaleId))[st.pos].start : null;
    const flats = prefersFlats(parentRoot(st.scaleKey, st.scaleId));
    const dots = (start == null ? dotsForPcs(pcs) : positionDots(pcs, start)).map((d) => ({
      ...d, kind: d.pc === st.scaleKey ? "root" : "scale", label: d.pc === st.scaleKey ? "R" : scaleDegree(st.scaleKey, st.scaleId, d.pc), title: pcName(d.pc, flats),
    }));
    drawBoard(dots, start);
  }

  // ---------- Clock: follow the recording ----------

  let wasPaused = true;

  function tick() {
    raf = requestAnimationFrame(tick);
    if (!player || root.hidden) return;
    // Keep the Play/Pause button honest when the media's own controls are used.
    if (player.paused !== wasPaused) {
      wasPaused = player.paused;
      renderTransport();
    }
    const s = activeSync();
    // Loop: jump back (one beat early) when the end bar is over.
    if (st.loopOn && s && !tapping && !player.paused && !keyOnly()) {
      const end = barStart(s, st.loopTo);
      if (player.time >= end) player.seek(barStart(s, st.loopFrom - 1) - barLength(s) / BEATS);
    }
    renderLive();
    const now = performance.now();
    if (now - lastClock > 250) {
      lastClock = now;
      const at = s && !keyOnly() ? barAt(s, player.time) : null;
      timeEl.textContent = `${fmt(player.time)} / ${fmt(player.duration || 0)}${at ? ` · bar ${at.bar >= 0 ? at.bar + 1 : "intro"}` : ""}`;
      if (!seeking) { seekEl.max = player.duration || 1; seekEl.value = player.time; }
      if (s) renderLoopIfBarChanged(at);
    }
  }

  // The "This bar / These 4" buttons depend on where we are.
  let loopBar = null;
  function renderLoopIfBarChanged(at) {
    const b = at ? at.bar : null;
    if (b !== loopBar) { loopBar = b; renderLoop(); }
  }

  function startLoop() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  // ---------- Keyboard ----------

  function onKey(e) {
    if (root.hidden || !player || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.key === "t" || e.key === "T") { if (tapping) tapBar(); }
    else if (e.key === "l" || e.key === "L") { st.loopOn = !st.loopOn; persist(); lastKey = ""; renderLoop(); renderLive(true); }
    else if (e.key === "ArrowLeft") jumpBars(-1);
    else if (e.key === "ArrowRight") jumpBars(1);
  }
  document.addEventListener("keydown", onKey);

  function renderAll() {
    renderHead();
    setupEl.hidden = !!player;
    practiceEl.hidden = !player;
    if (!player) { renderSetup(); setupMsg.append(msg); return; }
    // Built once: moving a YouTube iframe in the page would reload it.
    if (!practiceEl.contains(mediaBox)) renderPractice();
    practiceMsg.append(msg);
    chartEl.hidden = keyOnly();
    renderTransport();
    renderLoop();
    renderBoardHead();
    renderPanels();
    renderLive(true);
  }

  root.append(head, setupEl, practiceEl);
  renderAll();

  return {
    onHide: () => { if (player && !player.paused) player.pause(); },
    preset: (p) => { Object.assign(st, p); persist(); lastKey = ""; renderAll(); },
  };
}
