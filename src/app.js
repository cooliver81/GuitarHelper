// App shell: grouped navigation + hash routing (#diagrams, #changes, ...).
// Top bar = groups; a group with several tools shows them in a second row.
// Sections mount on first visit; the hash ids stay stable so links and presets keep working.

import * as path from "./sections/path.js";
import * as diagrams from "./sections/diagrams/index.js";
import * as changes from "./sections/changes.js";
import * as playalong from "./sections/playalong.js";
import * as tuner from "./sections/tuner.js";
import * as metronome from "./sections/metronome.js";
import * as noteTrainer from "./sections/noteTrainer.js";
import * as triadTrainer from "./sections/triadTrainer.js";
import * as setup from "./sections/setup.js";

const GROUPS = [
  { label: "Scales & shapes", short: "Shapes", tabs: [{ id: "diagrams", label: "Diagrams", mod: diagrams }] },
  { label: "Play along", short: "Play", tabs: [
    { id: "changes", label: "Backing track", mod: changes },
    { id: "playalong", label: "Over a recording", mod: playalong },
  ] },
  { label: "Mic drills", short: "Drills", tabs: [
    { id: "notes", panel: true, label: "Find the note", mod: noteTrainer },
    { id: "triads", panel: true, label: "Triads", mod: triadTrainer },
  ] },
  { label: "Tools", tabs: [
    { id: "tuner", panel: true, label: "Tuner", mod: tuner },
    { id: "metronome", panel: true, label: "Metronome", mod: metronome },
    { id: "setup", panel: true, label: "Mic setup", mod: setup },
  ] },
  { label: "Path", tabs: [{ id: "path", label: "Learning path", mod: path }] },
];
const TABS = GROUPS.flatMap((g) => g.tabs.map((t) => ({ ...t, group: g })));
const HOME = "diagrams";

const nav = document.getElementById("tabs");
const subnav = document.getElementById("subnav");
const main = document.getElementById("main");
const mounted = new Map(); // id -> { el, api }
const lastInGroup = new Map(); // group label -> last tab id used
let current = null;

function ensure(tab) {
  if (mounted.has(tab.id)) return mounted.get(tab.id);
  const el = document.createElement("section");
  el.className = "card";
  el.id = `tab-${tab.id}`;
  el.hidden = true;
  main.append(el);
  const api = tab.mod.mount(el, { navigate }) || {};
  // Simple tools build a flat page: put everything under the header on one panel.
  if (tab.panel) {
    const body = document.createElement("div");
    body.className = "surface stack tool-body";
    body.append(...[...el.children].filter((c) => !c.classList.contains("card-head")));
    el.append(body);
  }
  const entry = { el, api };
  mounted.set(tab.id, entry);
  return entry;
}

function renderNav(tab) {
  for (const b of nav.querySelectorAll("button")) {
    const on = b.dataset.group === tab.group.label;
    b.setAttribute("aria-current", on ? "page" : "false");
    if (on) b.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  subnav.replaceChildren();
  subnav.hidden = tab.group.tabs.length < 2;
  for (const t of tab.group.tabs) {
    const b = document.createElement("button");
    b.textContent = t.label;
    b.setAttribute("aria-current", t.id === tab.id ? "page" : "false");
    b.addEventListener("click", () => navigate(t.id));
    subnav.append(b);
  }
}

function show(id, preset) {
  const tab = TABS.find((t) => t.id === id) || TABS.find((t) => t.id === HOME);
  if (current && current !== tab.id) {
    const prev = mounted.get(current);
    prev.el.hidden = true;
    prev.api.onHide && prev.api.onHide();
  }
  const entry = ensure(tab);
  entry.el.hidden = false;
  if (preset && entry.api.preset) entry.api.preset(preset);
  entry.api.onShow && entry.api.onShow();
  current = tab.id;
  lastInGroup.set(tab.group.label, tab.id);
  renderNav(tab);
  document.title = tab.id === HOME ? "GuitarHelper" : `${tab.label} · GuitarHelper`;
}

// Used by the learning path and cross-links: open a tool with settings applied.
function navigate(id, preset) {
  if (location.hash !== `#${id}`) history.pushState(null, "", `#${id}`);
  show(id, preset);
  window.scrollTo({ top: 0 });
}

for (const g of GROUPS) {
  const b = document.createElement("button");
  const long = document.createElement("span");
  long.className = "nav-long";
  long.textContent = g.label;
  const short = document.createElement("span");
  short.className = "nav-short";
  short.textContent = g.short || g.label;
  b.append(long, short);
  b.dataset.group = g.label;
  b.addEventListener("click", () => navigate(lastInGroup.get(g.label) || g.tabs[0].id));
  nav.append(b);
}
document.getElementById("brand").addEventListener("click", () => navigate(HOME));

window.addEventListener("popstate", () => show(location.hash.slice(1)));
show(location.hash.slice(1) || HOME);
