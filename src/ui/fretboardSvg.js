// The fretboard used by every section: high E on top (like tab), frets left to right.
//
// dots: [{ string, fret, label, kind, ring, dim, title, data }]
//   kind  -> colour: "root" | "tone" | "guide" | "target" | "scale" | "active" | "hit" | "miss" | "next"
//   ring  -> outline only (e.g. the next chord's target)
//   dim   -> faded (scale notes behind an arpeggio)

const NS = "http://www.w3.org/2000/svg";
const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];

function s(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

// flip: low E on top (some players read diagrams that way).
// onCellClick(string, fret): every fret on every string becomes clickable (quizzes).
export function renderFretboard(container, { fretMin = 0, fretMax = 15, dots = [], onDotClick = null, onCellClick = null, highlightFrets = null, flip = false } = {}) {
  const showNut = fretMin === 0;
  const first = showNut ? 1 : fretMin;
  const fretCount = fretMax - first + 1;
  const fretW = 56;
  const openW = showNut ? 34 : 0;
  const left = 22;
  const top = 18;
  const strGap = 24;
  const width = left + openW + fretCount * fretW + 12;
  const height = top + strGap * 5 + 34;

  const svg = s("svg", { viewBox: `0 0 ${width} ${height}`, class: "fretboard", role: "img", "aria-label": "Fretboard diagram", style: `min-width:${Math.round(width * 0.8)}px` });
  const fx = (fret) => (fret === 0 ? left + openW / 2 : left + openW + (fret - first + 0.5) * fretW);
  const sy = (string) => top + (flip ? 6 - string : string - 1) * strGap;

  svg.append(s("rect", { x: left + openW, y: top - 8, width: fretCount * fretW, height: strGap * 5 + 16, class: "fb-wood", rx: 3 }));

  if (highlightFrets) {
    const [a, b] = highlightFrets;
    const x0 = left + openW + (Math.max(a, first) - first) * fretW;
    const x1 = left + openW + (Math.min(b, fretMax) - first + 1) * fretW;
    if (x1 > x0) svg.append(s("rect", { x: x0, y: top - 8, width: x1 - x0, height: strGap * 5 + 16, class: "fb-window" }));
  }

  // Inlays
  for (let f = first; f <= fretMax; f++) {
    const cy = top + strGap * 2.5;
    if (INLAYS.includes(f)) svg.append(s("circle", { cx: fx(f), cy, r: 5, class: "fb-inlay" }));
    if (f === 12 || f === 24) {
      svg.append(s("circle", { cx: fx(f), cy: cy - strGap, r: 5, class: "fb-inlay" }));
      svg.append(s("circle", { cx: fx(f), cy: cy + strGap, r: 5, class: "fb-inlay" }));
    }
  }

  // Frets and nut
  for (let f = first - 1; f <= fretMax; f++) {
    const x = left + openW + (f - first + 1) * fretW;
    const isNut = showNut && f === 0;
    svg.append(s("line", { x1: x, y1: top - 8, x2: x, y2: top + strGap * 5 + 8, class: isNut ? "fb-nut" : "fb-fret" }));
    if (f >= first) svg.append(s("text", { x: fx(f), y: height - 6, class: "fb-fretnum" }, String(f)));
  }

  // Strings (thicker low strings)
  for (let st = 1; st <= 6; st++) {
    svg.append(s("line", { x1: left + (showNut ? 0 : openW), y1: sy(st), x2: width - 12, y2: sy(st), class: "fb-string", "stroke-width": 0.8 + (st - 1) * 0.35 }));
    svg.append(s("text", { x: 8, y: sy(st) + 4, class: "fb-strnum" }, ["e", "B", "G", "D", "A", "E"][st - 1]));
  }

  if (onCellClick) {
    for (let st = 1; st <= 6; st++) {
      for (let f = showNut ? 0 : first; f <= fretMax; f++) {
        const w = f === 0 ? openW : fretW;
        const cell = s("rect", { x: fx(f) - w / 2, y: sy(st) - strGap / 2, width: w, height: strGap, class: "fb-cell" });
        cell.addEventListener("click", () => onCellClick(st, f));
        svg.append(cell);
      }
    }
  }

  for (const d of dots) {
    if (d.fret < fretMin || d.fret > fretMax) continue;
    const g = s("g", { class: `fb-dot kind-${d.kind || "tone"}${d.ring ? " ring" : ""}${d.dim ? " dim" : ""}${d.mark ? ` mark-${d.mark}` : ""}${onDotClick ? " clickable" : ""}` });
    g.append(s("circle", { cx: fx(d.fret), cy: sy(d.string), r: 10.5 }));
    if (d.label) g.append(s("text", { x: fx(d.fret), y: sy(d.string) + 4 }, d.label));
    if (d.title) g.append(s("title", {}, d.title));
    if (onDotClick) g.addEventListener("click", () => onDotClick(d));
    svg.append(g);
  }

  container.replaceChildren(svg);
  // Scrolled boards (phones): bring the highlighted frets into view.
  if (highlightFrets && container.scrollWidth > container.clientWidth) {
    const scale = container.scrollWidth / width;
    container.scrollLeft = Math.max(0, (left + openW + (highlightFrets[0] - first - 1) * fretW) * scale);
  }
  return svg;
}

// The fret range to draw: the whole neck when there's room, else a window around `focus`.
export function fitRange(container, focus, { fretMax = 15, minFrets = 6 } = {}) {
  const w = container.clientWidth || (typeof innerWidth === "number" ? innerWidth : 1000);
  // The whole neck needs ~45 px per fret (the SVG's min-width): no sideways scrollbar.
  const needed = (68 + fretMax * 56) * 0.8;
  if (w >= needed || !focus) return { fretMin: 0, fretMax };
  const lo = Math.max(0, focus[0] - 1);
  const hi = Math.min(fretMax, Math.max(focus[1] + 1, lo + minFrets - 1));
  return { fretMin: lo <= 1 ? 0 : lo, fretMax: hi };
}

// Vertical chord box (strings left to right low E -> high E), for voicing lists.
export function renderChordBox(voicing, { title = "", labels = null } = {}) {
  const frets = { 6: null, 5: null, 4: null, 3: null, 2: null, 1: null };
  voicing.strings.forEach((st, i) => { frets[st] = { fret: voicing.frets[i], label: labels ? labels[i] : "" }; });
  const fretted = voicing.frets.filter((f) => f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 1;
  const base = Math.max(1, Math.max(...voicing.frets) <= 4 ? 1 : minF);
  const rows = 5;
  const w = 110, gap = 16, top = 30, left = 20, rowH = 18;
  const svg = s("svg", { viewBox: `0 0 ${w} ${top + rows * rowH + 10}`, class: "chordbox" });
  if (title) svg.append(s("text", { x: w / 2, y: 12, class: "cb-title" }, title));
  if (base === 1) svg.append(s("line", { x1: left, y1: top, x2: left + gap * 5, y2: top, class: "cb-nut" }));
  else svg.append(s("text", { x: left - 6, y: top + rowH * 0.7, class: "cb-base" }, `${base}`));
  for (let r = 0; r <= rows; r++) svg.append(s("line", { x1: left, y1: top + r * rowH, x2: left + gap * 5, y2: top + r * rowH, class: "cb-line" }));
  [6, 5, 4, 3, 2, 1].forEach((st, i) => {
    const x = left + i * gap;
    svg.append(s("line", { x1: x, y1: top, x2: x, y2: top + rows * rowH, class: "cb-line" }));
    const f = frets[st];
    if (!f) svg.append(s("text", { x, y: top - 5, class: "cb-x" }, "×"));
    else if (f.fret === 0) svg.append(s("circle", { cx: x, cy: top - 8, r: 4, class: "cb-open" }));
    else {
      const cy = top + (f.fret - base + 0.5) * rowH;
      svg.append(s("circle", { cx: x, cy, r: 7, class: "cb-dot" }));
      if (f.label) svg.append(s("text", { x, y: cy + 3.5, class: "cb-label" }, f.label));
    }
  });
  return svg;
}
