// Note names: learn the notes of the neck and of scales. Click-based, so it works without a guitar.
//   name  - a dot on the neck: name it. Spaced repetition per fret, in stages.
//   find  - a note name: click it on all six strings.
//   fret  - a random fret: name it across the strings, low to high.
//   spell - write out a scale in any key, with the right letters.
//   shape - a scale shape you know: name each dot, walking up from the lowest note.
// Progress stays in this browser.

import { h, field, select, toggle, seg, setMsg, fill, panel } from "../ui/dom.js";
import { renderFretboard, fitRange } from "../ui/fretboardSvg.js";
import { midiAt, cagedPositions, dotsForPcs } from "../theory/fretboard.js";
import { mod12, parsePc } from "../theory/notes.js";
import { SCALES, scalePcs, parentRoot } from "../theory/scales.js";
import {
  STAGES, CYCLE_FOURTHS, SPELL_SCALES, FAST_MS, stageCells, namesOf, fretCells, stringsWith, spellScale, shapeWalk,
  gradeCard, cardLevel, stageProgress, pickCell, cellKey,
} from "../theory/noteNames.js";
import { pluck } from "../audio/synth.js";
import { resumeAudio } from "../audio/context.js";
import { load, loadRaw, save } from "../store.js";

const ROUND = 20;
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const MODES = [["name", "Name the note"], ["find", "Find the note"], ["fret", "Across a fret"], null, ["spell", "Spell the scale"], ["shape", "Name the shape"]];
const SHAPES = ["E", "D", "C", "A", "G"];
const DEFAULTS = { mode: "name", stage: "e", accidentals: false, scale: "major", key: 7, order: "cycle", shape: "any", degrees: true, sound: true };

const scaleTitle = (s) => SCALES[s].name.split(" (")[0].toLowerCase();
const rand = (a) => a[Math.floor(Math.random() * a.length)];
// A sounding octave for a pitch class with no place on the neck (spelled scales).
const midiNear = (pc) => 52 + mod12(pc - 52);

export function mount(root, { navigate }) {
  const st = load("notenames", DEFAULTS);
  const persist = () => save("notenames", st);
  const cards = loadRaw("notenames-cards", {});
  const keyStats = loadRaw("notenames-keys", {});
  let q = null;
  let timer = null;
  let lastCell = null;
  let lastFret = null;
  let session = { right: 0, wrong: 0, times: [] };

  const modesEl = h("div", { class: "modes" });
  const toolbarEl = h("div", { class: "surface toolbar" });
  const promptEl = h("div", { class: "small-prompt" });
  const seqEl = h("div", { class: "seq notes-seq" });
  const board = h("div", { class: "board-wrap" });
  const padEl = h("div", { class: "note-pad" });
  const msgEl = h("div", { class: "msg" });
  const statsEl = h("div", { class: "stats" });
  const nextEl = h("div", { class: "controls" });
  const keysEl = h("div", { class: "row chips" });
  const mapEl = h("div", { class: "board-wrap" });
  const panelsEl = h("div", { class: "panels" });

  const stage = () => STAGES.find((s) => s.id === st.stage) || STAGES[0];

  function sound(midi) {
    if (st.sound) resumeAudio().then(() => pluck(midi, 0));
  }

  async function playScale(names) {
    if (!st.sound) return;
    const ctx = await resumeAudio();
    const first = midiNear(parsePc(names[0]));
    const up = names.map((n) => first + mod12(parsePc(n) - parsePc(names[0])));
    [...up, first + 12].forEach((m, i) => pluck(m, ctx.currentTime + 0.05 + i * 0.22, { dur: 0.7 }));
  }

  function tally(ok, ms) {
    if (ok) { session.right++; if (ms != null) session.times.push(ms); } else session.wrong++;
  }

  function after(ms, fn) {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  }

  // ---------- Questions ----------

  function newQuestion() {
    clearTimeout(timer);
    setMsg(msgEl, "");
    if (st.mode === "name") askName();
    else if (st.mode === "find") askFind();
    else if (st.mode === "fret") askFret();
    else if (st.mode === "spell") askSpell();
    else askShape();
    renderAll();
  }

  function setMode(mode) {
    st.mode = mode;
    persist();
    session = { right: 0, wrong: 0, times: [] };
    newQuestion();
  }

  function askName(count = q && q.type === "name" && !q.finished ? q.count : 0) {
    if (count >= ROUND) { q = { type: "name", finished: true, count }; return; }
    const cell = pickCell(stageCells(stage()), cards, Date.now(), lastCell);
    lastCell = cellKey(cell);
    q = { type: "name", cell, count: count + 1, shownAt: performance.now(), answered: null };
  }

  function answerName(name) {
    if (!q.cell || q.answered) return;
    const ms = performance.now() - q.shownAt;
    const ok = namesOf(q.cell.pc).includes(name);
    const key = cellKey(q.cell);
    cards[key] = gradeCard(cards[key], { ok, ms, now: Date.now() });
    save("notenames-cards", cards);
    tally(ok, ms);
    q.answered = { ok, name };
    sound(q.cell.midi);
    const right = namesOf(q.cell.pc).join(" / ");
    if (!ok) setMsg(msgEl, `✗ That's ${right}, not ${name}.`, "bad");
    else if (ms > FAST_MS) setMsg(msgEl, `✓ ${right}, but ${(ms / 1000).toFixed(1)} s. It'll come back until it's under ${FAST_MS / 1000} s.`, "warn");
    else setMsg(msgEl, `✓ ${right} in ${(ms / 1000).toFixed(1)} s`, "good");
    renderAll();
    after(ok ? 650 : 1500, newQuestion);
  }

  function askFind() {
    const pcs = Array.from({ length: 12 }, (_, i) => i).filter((pc) => st.accidentals || namesOf(pc).length === 1);
    const pc = rand(pcs.filter((p) => !q || q.pc !== p));
    q = { type: "find", pc, where: stringsWith(pc), found: {}, wrong: null, shownAt: performance.now(), misses: 0 };
  }

  function clickFind(string, fret) {
    if (!q || q.type !== "find" || q.finished) return;
    const midi = midiAt(string, fret);
    if (mod12(midi) !== q.pc) {
      q.misses++;
      q.wrong = { string, fret, label: namesOf(mod12(midi))[0] };
      tally(false);
      renderAll();
      return;
    }
    q.wrong = null;
    if (!(string in q.found)) {
      q.found[string] = fret;
      sound(midi);
    }
    if (Object.keys(q.found).length === 6) {
      q.finished = true;
      const ms = performance.now() - q.shownAt;
      tally(true, ms); // wrong clicks were counted as they happened
      setMsg(msgEl, `✓ All six in ${(ms / 1000).toFixed(1)} s${q.misses ? `, ${q.misses} wrong` : ""}.`, q.misses ? "warn" : "good");
      after(1300, newQuestion);
    }
    renderAll();
  }

  // Sequence modes: the same answer flow, one item after another.
  function askFret() {
    // Jump well away from the last fret, so the one before doesn't give it away.
    const options = Array.from({ length: 11 }, (_, i) => i + 1).filter((f) => lastFret == null || Math.abs(f - lastFret) >= 3);
    const fret = rand(options);
    lastFret = fret;
    q = { type: "fret", fret, idx: 0, misses: 0, here: 0, shownAt: performance.now(),
      items: fretCells(fret).map((c) => ({ ...c, accept: namesOf(c.pc), name: namesOf(c.pc).join(" / ") })) };
  }

  function askSpell() {
    const { root: rootName, names } = spellScale(st.key, st.scale);
    q = { type: "spell", title: `${rootName} ${scaleTitle(st.scale)}`, names, idx: 0, misses: 0, here: 0, shownAt: performance.now(),
      items: names.slice(1).map((name, i) => ({ name, accept: [name], degree: SCALES[st.scale].degrees[i + 1], midi: midiNear(parsePc(name)) })) };
  }

  function askShape() {
    const positions = cagedPositions(parentRoot(st.key, st.scale));
    const pos = positions.find((p) => p.shape === (st.shape === "any" ? rand(SHAPES) : st.shape)) || positions[0];
    const { root: rootName } = spellScale(st.key, st.scale);
    q = { type: "shape", title: `${rootName} ${scaleTitle(st.scale)}, ${pos.shape} shape`, pos, idx: 0, misses: 0, here: 0, shownAt: performance.now(),
      items: shapeWalk(st.key, st.scale, pos.start).map((d) => ({ ...d, accept: [d.name] })) };
  }

  function advance() {
    q.idx++;
    q.here = 0;
    if (q.idx < q.items.length) return;
    q.finished = true;
    const ms = performance.now() - q.shownAt;
    tally(q.misses === 0, ms);
    const clean = q.misses === 0;
    setMsg(msgEl, `${clean ? "✓ Clean" : `Done, ${q.misses} wrong`} in ${(ms / 1000).toFixed(1)} s.`, clean ? "good" : "warn");
    if (q.type === "fret") { after(1400, newQuestion); return; }
    keyStats[`${q.type}:${st.scale}:${st.key}`] = { clean, ms: Math.round(ms) };
    save("notenames-keys", keyStats);
    if (q.type === "spell") playScale(q.names);
  }

  function answerSeq(name) {
    if (q.finished) return;
    const item = q.items[q.idx];
    if (item.accept.includes(name)) {
      item.state = q.here ? "helped" : "ok";
      setMsg(msgEl, "");
      sound(item.midi);
      advance();
    } else {
      q.misses++;
      q.here++;
      // The sound was right but not the letter: the point of spelling a scale.
      if (parsePc(name) === parsePc(item.accept[0])) setMsg(msgEl, `Right sound, wrong letter: in ${q.title.split(",")[0]} it's ${item.name}, not ${name}.`, "warn");
      else if (q.here >= 2) {
        setMsg(msgEl, `It's ${item.name}.`, "bad");
        item.state = "missed";
        sound(item.midi);
        advance();
      } else setMsg(msgEl, `Not ${name}. Try again.`, "bad");
    }
    renderAll();
  }

  function nextKey() {
    if (st.order === "random") st.key = rand(CYCLE_FOURTHS.filter((k) => k !== st.key));
    else st.key = CYCLE_FOURTHS[(CYCLE_FOURTHS.indexOf(st.key) + 1) % 12];
    persist();
    newQuestion();
  }

  function answer(name) {
    if (!q) return;
    if (q.type === "name") answerName(name);
    else answerSeq(name);
  }

  // ---------- UI ----------

  function renderToolbar() {
    fill(modesEl, ...MODES.map((m) => (m
      ? h("button", { class: `mode${st.mode === m[0] ? " on" : ""}`, onclick: () => setMode(m[0]) }, m[1])
      : h("span", { class: "sep" }))));
    // Rebuilt tabs lose their scroll on phones: keep the active one in view.
    modesEl.scrollLeft = Math.max(0, modesEl.querySelector(".on").offsetLeft - modesEl.offsetLeft - 12);
    const scaleOptions = SPELL_SCALES.map((id) => [id, SCALES[id].name]);
    const change = (patch) => { Object.assign(st, patch); persist(); newQuestion(); };
    fill(toolbarEl,
      st.mode === "name" ? h("label", { class: "field grow" }, h("span", {}, "Stage"), select(STAGES.map((s) => [s.id, s.name]), st.stage, (v) => { lastCell = null; q = null; change({ stage: v }); })) : null,
      st.mode === "find" ? toggle("Include sharps and flats", st.accidentals, (v) => change({ accidentals: v })) : null,
      st.mode === "spell" || st.mode === "shape" ? field("Scale", select(scaleOptions, st.scale, (v) => change({ scale: v }))) : null,
      st.mode === "shape" ? field("Shape", select([["any", "Any"], ...SHAPES.map((s) => [s, `${s} shape`])], st.shape, (v) => change({ shape: v }))) : null,
    );
  }

  function renderKeys() {
    if (st.mode !== "spell" && st.mode !== "shape") { fill(keysEl); return; }
    fill(keysEl, ...CYCLE_FOURTHS.map((pc) => {
      const stat = keyStats[`${st.mode}:${st.scale}:${pc}`];
      return h("button", { class: `chip${pc === st.key ? " on" : ""}${stat && stat.clean ? " clean" : ""}`, title: stat ? `${stat.clean ? "Clean" : "Had mistakes"} last time, ${(stat.ms / 1000).toFixed(1)} s` : "Not done yet",
        onclick: () => { st.key = pc; persist(); newQuestion(); } }, spellScale(pc, st.scale).root);
    }));
  }

  function renderPrompt() {
    fill(seqEl);
    if (q.type === "name") {
      if (q.finished) {
        const p = stageProgress(stageCells(stage()), cards, Date.now());
        fill(promptEl, `Round done: ${p.solid} of ${p.total} notes solid in this stage, ${p.due} still due.`);
        return;
      }
      fill(promptEl, `Name this note`, h("span", { class: "muted small notes-count" }, ` ${q.count} of ${ROUND}`));
    } else if (q.type === "find") {
      fill(promptEl, "Find ", h("b", { class: "notes-target" }, namesOf(q.pc).join(" / ")), ` on every string (${Object.keys(q.found).length} of 6)`);
    } else if (q.type === "fret") {
      const item = q.items[q.idx];
      fill(promptEl, q.finished ? `Fret ${q.fret} done` : `Fret ${q.fret}: name each string, low to high (${item.string === 1 ? "high E" : `string ${item.string}`})`);
    } else if (q.type === "spell") {
      fill(promptEl, "Spell ", h("b", { class: "notes-target" }, q.title));
      fill(seqEl,
        h("span", { class: "seq-note done" }, q.names[0], st.degrees ? h("small", {}, "1") : null),
        ...q.items.map((it, i) => h("span", { class: `seq-note${it.state === "ok" ? " done" : it.state ? " missed" : ""}${i === q.idx && !q.finished ? " now" : ""}` },
          it.state ? it.name : "?", st.degrees ? h("small", {}, it.degree) : null)));
    } else {
      const item = q.items[q.idx];
      fill(promptEl, h("b", { class: "notes-target" }, q.title), q.finished ? "" : `: name the white dot${st.degrees ? `, the ${item.degree}` : ""} (${q.idx + 1} of ${q.items.length})`);
    }
  }

  function renderBoard() {
    const keep = board.scrollLeft;
    if (q.type === "name") {
      if (q.finished) { fill(board); return; }
      const a = q.answered;
      const dots = [a
        ? { string: q.cell.string, fret: q.cell.fret, kind: a.ok ? "hit" : "miss", label: namesOf(q.cell.pc)[0] }
        : { string: q.cell.string, fret: q.cell.fret, kind: "ask", label: "?" }];
      renderFretboard(board, { ...fitRange(board, [q.cell.fret, q.cell.fret], { fretMax: 12 }), dots });
    } else if (q.type === "find") {
      const dots = Object.entries(q.found).map(([s, f]) => ({ string: +s, fret: f, kind: "hit", label: namesOf(q.pc)[0] }));
      if (q.wrong) dots.push({ string: q.wrong.string, fret: q.wrong.fret, kind: "miss", label: q.wrong.label });
      renderFretboard(board, { fretMin: 0, fretMax: 12, dots, onCellClick: clickFind });
      board.scrollLeft = keep;
    } else if (q.type === "fret") {
      const dots = q.items.map((it, i) => (i < q.idx
        ? { string: it.string, fret: it.fret, kind: it.state === "ok" ? "hit" : "miss", label: namesOf(it.pc)[0] }
        : { string: it.string, fret: it.fret, kind: i === q.idx ? "ask" : "scale", label: i === q.idx ? "?" : "" }));
      renderFretboard(board, { ...fitRange(board, [q.fret, q.fret], { fretMax: 12 }), dots, highlightFrets: [q.fret, q.fret] });
    } else if (q.type === "spell") {
      if (!q.finished) { fill(board); return; }
      // Answer in: show where these notes live.
      const pcs = scalePcs(st.key, st.scale);
      const dots = dotsForPcs(pcs, { fretMax: 12 }).map((d) => ({ string: d.string, fret: d.fret, kind: d.pc === st.key ? "root" : "tone", label: q.names[pcs.indexOf(d.pc)] }));
      renderFretboard(board, { fretMin: 0, fretMax: 12, dots });
    } else {
      const dots = q.items.map((it, i) => {
        const isRoot = it.pc === st.key;
        if (i < q.idx) return { string: it.string, fret: it.fret, kind: it.state === "ok" ? (isRoot ? "root" : "tone") : "miss", label: it.name };
        if (i === q.idx) return { string: it.string, fret: it.fret, kind: "ask", label: "?" };
        return { string: it.string, fret: it.fret, kind: isRoot ? "root" : "scale", label: "" };
      });
      const hl = [q.pos.start, q.pos.start + 3];
      renderFretboard(board, { ...fitRange(board, hl), dots, highlightFrets: hl });
    }
  }

  function renderPad() {
    const hide = q.type === "find" || q.finished || (q.type === "name" && q.answered);
    padEl.hidden = q.type === "find" || (q.type === "name" && q.finished) || (q.finished && q.type !== "fret");
    const off = !!hide;
    const key = (name, label = name) => h("button", { class: "pad-btn", disabled: off, onclick: () => answer(name) }, label);
    if (q.type === "spell" || q.type === "shape") {
      padEl.className = "note-pad seven";
      // Sharps, naturals, flats: the letter is half the answer.
      fill(padEl, ...["#", "", "b"].flatMap((acc) => LETTERS.map((l) => key(l + acc))));
    } else if (q.type === "name" && stage().naturals) {
      padEl.className = "note-pad seven";
      fill(padEl, ...LETTERS.map((l) => key(l)));
    } else {
      padEl.className = "note-pad twelve";
      fill(padEl, ...Array.from({ length: 12 }, (_, pc) => key(namesOf(pc)[0], namesOf(pc).join("/"))));
    }
  }

  function renderNext() {
    if (q.type === "name" && q.finished) {
      const p = stageProgress(stageCells(stage()), cards, Date.now());
      const i = STAGES.indexOf(stage());
      fill(nextEl,
        h("button", { class: "btn primary", onclick: () => { q = null; newQuestion(); } }, "Another round"),
        p.solid / p.total >= 0.9 && STAGES[i + 1] ? h("button", { class: "btn", onclick: () => { st.stage = STAGES[i + 1].id; persist(); q = null; newQuestion(); } }, `On to ${STAGES[i + 1].name}`) : null);
    } else if ((q.type === "spell" || q.type === "shape") && q.finished) {
      fill(nextEl, h("button", { class: "btn primary", onclick: nextKey }, "Next key"),
        h("button", { class: "btn", onclick: newQuestion }, q.type === "shape" ? "Same key again" : "Again"));
    } else fill(nextEl);
  }

  function renderStats() {
    const avg = session.times.length ? session.times.reduce((a, b) => a + b, 0) / session.times.length / 1000 : null;
    statsEl.textContent = session.right + session.wrong ? `Right ${session.right} · Wrong ${session.wrong}${avg != null ? ` · Average ${avg.toFixed(1)} s` : ""}` : "";
  }

  // Colours only, so an open map doesn't give the answers away.
  function renderMap() {
    const LEVEL_KIND = { new: "scale", weak: "miss", learning: "guide", solid: "hit" };
    const dots = stageCells(stage()).map((c) => ({ string: c.string, fret: c.fret, kind: LEVEL_KIND[cardLevel(cards[cellKey(c)])], dim: !cards[cellKey(c)] }));
    renderFretboard(mapEl, { fretMin: 0, fretMax: 11, dots });
  }

  function renderPanels() {
    const p = stageProgress(stageCells(stage()), cards, Date.now());
    const scaleMode = st.mode === "spell" || st.mode === "shape";
    fill(panelsEl,
      panel("notes-options", "Options", { badge: st.sound ? "Sound on" : "Sound off" },
        h("div", { class: "toolbar" },
          scaleMode ? h("div", { class: "field" }, h("span", {}, "Next key"), seg([["cycle", "Cycle of 4ths"], ["random", "Random"]], st.order, (v) => { st.order = v; persist(); renderPanels(); })) : null,
          scaleMode ? toggle("Show degrees", st.degrees, (v) => { st.degrees = v; persist(); renderAll(); }) : null,
          toggle("Sound", st.sound, (v) => { st.sound = v; persist(); renderPanels(); }))),
      panel("notes-map", "Your neck map", { badge: `${p.solid} / ${p.total} solid · ${p.due} due` },
        h("p", { class: "hint" }, stage().hint),
        mapEl,
        h("p", { class: "hint" }, `Green = solid, amber = learning, red = missed last time, grey = not seen yet. A note turns solid after two answers under ${FAST_MS / 1000} s at least a day apart; each right answer spaces it further (1, 3, 7, then 21 days). Missed or slow notes come back straight away.`),
        h("div", { class: "controls" }, h("button", { class: "btn small ghost", onclick: () => {
          if (!confirm("Forget all your note progress?")) return;
          Object.keys(cards).forEach((k) => delete cards[k]);
          save("notenames-cards", cards);
          q = null;
          newQuestion();
        } }, "Reset progress"))),
      panel("notes-guitar", "With the guitar", {},
        h("ol", { class: "notes-list" },
          h("li", {}, h("b", {}, "Walk a string. "), "From the open string to fret 12, saying each natural note aloud as you play it. Then back down."),
          h("li", {}, h("b", {}, "One note, every string. "), "Pick a note. Play it on string 6, then on every string up to 1, saying its name."),
          h("li", {}, h("b", {}, "One fret, all strings. "), "Name a fret's notes across the strings, then jump far away to another fret."),
          h("li", {}, h("b", {}, "Say the scale. "), "Play a shape you know and say each note's name instead of its fret. Then the same shape in the next key round the cycle of 4ths."),
          h("li", {}, h("b", {}, "Use it. "), "Over a backing track, aim for a note by name: only the Cs for a chorus, then only the Es.")),
        h("div", { class: "controls" },
          h("button", { class: "btn small", onclick: () => navigate("notes") }, "Mic drill: Find the note →"),
          h("button", { class: "btn small", onclick: () => navigate("changes") }, "Backing track →"))));
    renderMap();
  }

  function renderAll() {
    renderToolbar();
    renderKeys();
    renderPrompt();
    renderBoard();
    renderPad();
    renderNext();
    renderStats();
    renderPanels();
  }

  root.append(
    h("header", { class: "card-head" }, h("div", {},
      h("h2", {}, "Note names"),
      h("p", {}, "Learn the note names on the neck and in every scale, starting from the shapes you already know. A few minutes a day, no guitar needed; say each note aloud as you answer."))),
    modesEl,
    toolbarEl,
    keysEl,
    h("div", { class: "board-card stack" }, promptEl, seqEl, board, padEl, msgEl, nextEl, statsEl),
    panelsEl,
  );
  newQuestion();

  return {
    // Don't count time spent on another tab, or while the tab hasn't been open yet.
    onShow: () => { if (q && !q.finished && !(q.type === "name" && q.answered)) q.shownAt = performance.now(); renderBoard(); },
    onHide: () => {},
  };
}
