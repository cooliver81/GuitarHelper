// Small DOM helpers shared by every section.

export const $ = (sel, root = document) => root.querySelector(sel);

// h("div", { class: "x", onclick: fn }, "text", child) -> element
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// <select> from [[value, label], ...] or [value, ...], with optional <optgroup>s.
export function select(options, value, onchange, attrs = {}) {
  const el = h("select", { ...attrs, onchange: (e) => onchange(e.target.value) });
  const add = (parent, opt) => {
    const [v, label] = Array.isArray(opt) ? opt : [opt, opt];
    parent.append(h("option", { value: v, selected: String(v) === String(value) }, label));
  };
  for (const opt of options) {
    if (opt && opt.group) {
      const g = h("optgroup", { label: opt.group });
      opt.options.forEach((o) => add(g, o));
      el.append(g);
    } else add(el, opt);
  }
  return el;
}

export function field(label, control) {
  return h("label", { class: "field" }, h("span", {}, label), control);
}

// A message line with good / bad / warn colouring.
export function setMsg(el, text, level = "info") {
  el.textContent = text;
  el.dataset.level = level;
}

export function toggle(label, checked, onchange) {
  return h("label", { class: "toggle" },
    h("input", { type: "checkbox", checked, onchange: (e) => onchange(e.target.checked) }),
    label);
}

// replaceChildren, skipping null/false (so conditional children can be written inline).
export function fill(el, ...children) {
  el.replaceChildren(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// Segmented buttons: [[value, label], ...]. A label can be an element.
export function seg(options, value, onpick) {
  return h("div", { class: "seg", role: "group" }, ...options.map(([v, label, title]) =>
    h("button", { class: `seg-btn${String(v) === String(value) ? " on" : ""}`, "aria-pressed": String(String(v) === String(value)), title, onclick: () => onpick(v) }, label)));
}

// Collapsible panel that remembers whether it was open (per id, in this browser).
const PANELS_KEY = "guitarhelper:ui-panels";
let panelState = null;
function panels() {
  if (!panelState) { try { panelState = JSON.parse(localStorage.getItem(PANELS_KEY)) || {}; } catch { panelState = {}; } }
  return panelState;
}
// `force` opens it this time without remembering (e.g. "you need to do this step").
export function panel(id, title, { open = false, force = false, badge = null, badgeLevel = "" } = {}, ...children) {
  const state = panels();
  const el = h("details", { class: "panel", open: force || (id in state ? state[id] : open) },
    h("summary", {
      // Only a click counts as the user's choice (opening from code fires "toggle" too).
      onclick: () => {
        state[id] = !el.open;
        try { localStorage.setItem(PANELS_KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
      },
    }, h("span", {}, title), badge ? h("span", { class: `panel-badge ${badgeLevel}` }, badge) : null),
    h("div", { class: "panel-body" }, ...children));
  return el;
}

// A styled file picker button.
export function fileButton(label, accept, onfile, cls = "btn") {
  return h("label", { class: `${cls} file-btn` }, label,
    h("input", { type: "file", accept, onchange: (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) onfile(f); } }));
}
