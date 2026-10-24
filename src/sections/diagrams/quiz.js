// Quiz mode (click-based, no mic):
//   fill   - an empty position with the roots shown: click every scale note, then Check.
//   degree - the shape is shown; one dot is marked: name its degree.
//   find   - find every <degree> of a key between frets 0 and 12, using the roots as anchors.
// Questions mix the scales in your rotation (weakest shapes come up more) and, by
// default, random keys — so you learn shapes, not fret numbers.

import { h, field, select, toggle } from "../../ui/dom.js";
import { legend } from "./common.js";
import { pcName, prefersFlats } from "../../theory/notes.js";
import { SCALES, scalePcs, scaleDegree, parentRoot } from "../../theory/scales.js";
import { positionDots, cagedPositions, dotsForPcs } from "../../theory/fretboard.js";
import { checkCells } from "../../theory/shapes.js";
import { seg, scaleOptions, keyOptions } from "./common.js";

const short = (id) => SCALES[id].name.split(" (")[0];

const SHAPES = ["E", "D", "C", "A", "G"];
const cell = (d) => `${d.string}:${d.fret}`;
const rand = (a) => a[Math.floor(Math.random() * a.length)];

let q = null;
let session = { right: 0, wrong: 0, streak: 0, best: 0 };

function pickScaleAndShape(ctx) {
  const { st } = ctx;
  if (st.quizSource === "current") return { scaleId: st.scale, shape: rand(SHAPES) };
  const pool = (st.rotation.length ? st.rotation : ["major"]).flatMap((scaleId) => SHAPES.map((shape) => {
    const p = ctx.getProgress(scaleId, shape);
    const score = (p.perfect || 0) + (p.memory || 0);
    return { scaleId, shape, w: (p.attempts ? 1 : 2) * (3 / (1 + score)) };
  }));
  let r = Math.random() * pool.reduce((a, b) => a + b.w, 0);
  for (const x of pool) { r -= x.w; if (r <= 0) return x; }
  return pool[pool.length - 1];
}

function newQuestion(ctx) {
  const { st } = ctx;
  const key = st.quizRandomKey ? Math.floor(Math.random() * 12) : st.key;
  const { scaleId, shape } = pickScaleAndShape(ctx);
  const positions = cagedPositions(parentRoot(key, scaleId));
  const pos = positions.find((p) => p.shape === shape) || positions[0];
  const pcs = scalePcs(key, scaleId);
  const shapeDots = positionDots(pcs, pos.start);

  if (st.quiz === "fill") {
    const roots = shapeDots.filter((d) => d.pc === key).map(cell);
    q = { type: "fill", key, scaleId, pos, answer: shapeDots.map(cell), dots: shapeDots, clicked: new Set(roots), roots: new Set(roots), result: null };
  } else if (st.quiz === "degree") {
    const candidates = shapeDots.filter((d) => d.pc !== key);
    const ask = rand(candidates);
    q = { type: "degree", key, scaleId, pos, dots: shapeDots, ask, answer: scaleDegree(key, scaleId, ask.pc), picked: null };
  } else {
    const degrees = SCALES[scaleId].degrees.filter((d) => d !== "1");
    const degree = rand(degrees);
    const pc = pcs[SCALES[scaleId].degrees.indexOf(degree)];
    const answer = dotsForPcs([pc], { fretMax: 12 });
    const roots = dotsForPcs([key], { fretMax: 12 });
    q = { type: "find", key, scaleId, degree, pc, answer: answer.map(cell), roots, clicked: new Set(), result: null };
  }
}

function toggleCell(ctx, string, fret) {
  if (!q || q.result || q.type === "degree") return;
  const c = `${string}:${fret}`;
  if (q.type === "fill" && q.roots.has(c)) return;
  if (q.clicked.has(c)) q.clicked.delete(c); else q.clicked.add(c);
  ctx.rerender();
}

function score(ctx, ok) {
  if (ok) { session.right++; session.streak++; session.best = Math.max(session.best, session.streak); }
  else { session.wrong++; session.streak = 0; }
}

function check(ctx) {
  if (!q || q.result) return;
  const clicked = [...q.clicked].filter((c) => !(q.roots instanceof Set && q.roots.has(c)));
  const answer = q.type === "fill" ? q.answer.filter((c) => !q.roots.has(c)) : q.answer;
  q.result = checkCells(answer, clicked);
  score(ctx, q.result.perfect);
  if (q.type === "fill") ctx.record(q.scaleId, q.pos.shape, { attempts: 1, perfect: q.result.perfect ? 1 : 0 });
  ctx.rerender();
}

function answerDegree(ctx, deg) {
  if (!q || q.picked) return;
  q.picked = deg;
  score(ctx, deg === q.answer);
  ctx.rerender();
  if (deg === q.answer) setTimeout(() => { if (q && q.picked) { newQuestion(ctx); ctx.rerender(); } }, 700);
}

const parse = (c) => { const [s, f] = c.split(":").map(Number); return { string: s, fret: f }; };

export function view(ctx) {
  const { st } = ctx;
  if (!q || q.type !== st.quiz) newQuestion(ctx);
  const name = (pc) => pcName(pc, prefersFlats(parentRoot(q.key, q.scaleId)));
  const sname = short(q.scaleId);
  const next = () => { newQuestion(ctx); ctx.rerender(); };
  let dots = [];
  let title, sub = "";
  let foot = [];
  let leg = null;
  let highlight = null;

  if (q.type === "fill") {
    const frets = q.dots.map((d) => d.fret);
    highlight = [Math.min(...frets), Math.max(...frets)];
    title = `Fill in ${name(q.key)} ${sname}, ${q.pos.shape} shape`;
    sub = `Click every scale note in the shaded frets (${highlight[0]}–${highlight[1]}, including the shape's stretches). Roots are given.`;
    if (!q.result) {
      dots = [...q.clicked].map((c) => ({ ...parse(c), kind: q.roots.has(c) ? "root" : "picked", label: q.roots.has(c) ? "R" : "" }));
      foot = [h("button", { class: "btn primary", onclick: () => check(ctx) }, "Check"),
        h("span", { class: "hint" }, `${q.clicked.size - q.roots.size} placed · ${q.answer.length - q.roots.size} to find · click again to remove`)];
    } else {
      const deg = (c) => { const d = q.dots.find((x) => cell(x) === c); return d ? scaleDegree(q.key, q.scaleId, d.pc) : ""; };
      dots = [
        ...[...q.roots].map((c) => ({ ...parse(c), kind: "root", label: "R" })),
        ...q.result.correct.map((c) => ({ ...parse(c), kind: "hit", label: deg(c) })),
        ...q.result.wrong.map((c) => ({ ...parse(c), kind: "wrong", label: "✗" })),
        ...q.result.missed.map((c) => ({ ...parse(c), kind: "missed", label: deg(c) })),
      ];
      foot = [h("button", { class: "btn primary", onclick: next }, "Next question"),
        h("span", { class: q.result.perfect ? "pill good" : "hint" }, q.result.perfect ? "✓ Perfect" : `${q.result.correct.length} right · ${q.result.wrong.length} wrong · ${q.result.missed.length} missed`)];
      leg = legend([["var(--good)", "Right"], ["var(--bad)", "Wrong"], [null, "Missed (dashed)", true]]);
    }
  } else if (q.type === "degree") {
    highlight = [q.pos.start, q.pos.start + 3];
    title = `${name(q.key)} ${sname}, ${q.pos.shape} shape`;
    sub = "Which scale degree is the white “?” note? Count up from the nearest root (R).";
    dots = q.dots.map((d) => {
      if (d === q.ask) return { ...d, kind: q.picked ? (q.picked === q.answer ? "hit" : "wrong") : "ask", label: q.picked ? q.answer : "?" };
      return { ...d, kind: d.pc === q.key ? "root" : "scale", label: d.pc === q.key ? "R" : "" };
    });
    foot = [h("div", { class: "answer-btns" }, ...SCALES[q.scaleId].degrees.filter((d) => d !== "1").map((d) =>
      h("button", { class: `btn${q.picked === d ? (d === q.answer ? " on" : " danger") : ""}`, onclick: () => answerDegree(ctx, d) }, d)))];
    if (q.picked && q.picked !== q.answer) foot.push(h("button", { class: "btn primary", onclick: next }, `It's ${q.answer} (${name(q.ask.pc)}) · Next`));
  } else {
    title = `Find every ${q.degree} of ${name(q.key)} ${sname}`;
    sub = "Anywhere from the nut to fret 12. Roots are shown faintly as landmarks.";
    const rootDots = q.roots.map((d) => ({ ...d, kind: "root", label: "R", dim: true }));
    if (!q.result) {
      dots = [...rootDots, ...[...q.clicked].map((c) => ({ ...parse(c), kind: "picked", label: "" }))];
      foot = [h("button", { class: "btn primary", onclick: () => check(ctx) }, "Check"), h("span", { class: "hint" }, `${q.clicked.size} placed`)];
    } else {
      dots = [...rootDots,
        ...q.result.correct.map((c) => ({ ...parse(c), kind: "hit", label: q.degree })),
        ...q.result.wrong.map((c) => ({ ...parse(c), kind: "wrong", label: "✗" })),
        ...q.result.missed.map((c) => ({ ...parse(c), kind: "missed", label: q.degree }))];
      foot = [h("button", { class: "btn primary", onclick: next }, "Next question"),
        h("span", { class: q.result.perfect ? "pill good" : "hint" }, `${q.degree} of ${name(q.key)} = ${name(q.pc)}. ${q.result.perfect ? "✓ All found" : `${q.result.missed.length} missed · ${q.result.wrong.length} wrong`}`)];
      leg = legend([["var(--good)", "Right"], ["var(--bad)", "Wrong"], [null, "Missed (dashed)", true]]);
    }
  }
  foot.push(h("span", { class: "spacer" }), h("button", { class: "btn small ghost", onclick: next, title: "New question" }, "Skip ↷"));

  const reset = (patch) => { q = null; ctx.set(patch); };
  const fromRotation = st.quizSource === "rotation";
  const rotationNames = (st.rotation.length ? st.rotation : ["major"]).map(short);
  const toolbar = [
    h("div", { class: "toolbar" },
      h("div", { class: "field" }, h("span", {}, "Question"),
        seg([["fill", "Fill in a shape"], ["degree", "Name the degree"], ["find", "Find every…"]], st.quiz, (v) => reset({ quiz: v }))),
      field("Scales", select([["rotation", "My scales (from Progress)"], ["current", "One scale"]], st.quizSource, (v) => reset({ quizSource: v }))),
      !fromRotation ? field("Scale", select(scaleOptions(), st.scale, (v) => reset({ scale: v }))) : null,
      field("Key", select([["random", "Random key"], ...keyOptions()], st.quizRandomKey ? "random" : st.key, (v) => (v === "random" ? reset({ quizRandomKey: true }) : reset({ quizRandomKey: false, key: +v }))))),
    fromRotation ? h("div", { class: "row" }, h("span", { class: "hint" }, `Questions mix: ${rotationNames.join(", ")}. Shapes you score low on come up more.`),
      h("button", { class: "btn small ghost", onclick: () => { q = null; ctx.set({ mode: "progress" }); } }, "Change my scales →")) : null,
  ];
  const total = session.right + session.wrong;
  const info = [h("div", { class: "stat-row" },
    h("div", { class: "stat" }, h("b", {}, `${session.right}/${total}`), h("span", {}, "right this session")),
    h("div", { class: "stat" }, h("b", {}, String(session.streak)), h("span", {}, "streak")),
    h("div", { class: "stat" }, h("b", {}, String(session.best)), h("span", {}, "best streak")))];
  return {
    toolbar, title, sub, dots, highlight, foot, info, labels: null, legend: leg,
    fretMax: q.type === "find" ? 12 : 15,
    onCellClick: q.type === "degree" ? null : (s, f) => toggleCell(ctx, s, f),
    onDotClick: q.type === "degree" ? (d) => d.midi != null && ctx.playNote(d.midi) : (d) => toggleCell(ctx, d.string, d.fret),
  };
}
