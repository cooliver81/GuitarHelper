// Learning path: what to practise next, in order, with buttons that open the right tool
// already set up. Ticks and notes are saved in this browser.

import { h, fill } from "../ui/dom.js";
import { loadRaw, save } from "../store.js";
import { EXERCISES } from "../theory/exercises.js";

// Each step: what, why, how to know you're done, and presets for the tools.
export const STAGES = [
  {
    id: "shells", title: "Shell voicings", done: true,
    why: "Root, 3rd and 7th: the smallest chord that still says what it is. You know these already.",
    goal: "Comp a ii–V–I and a 12-bar jazz blues with shells, no hesitation.",
    open: [
      ["Shells in Diagrams", "diagrams", { mode: "voicing", kind: "shell", chordRoot: 9, chordType: "m7", key: 7 }],
      ["Comp with shells", "changes", { source: "form:jazz-blues", key: 7, compKind: "shell", view: "comp", exercise: "free" }],
    ],
  },
  {
    id: "guide", title: "Guide-tone lines",
    why: "The 3rd and 7th carry the harmony. The 7th of one chord falls a half or whole step to the 3rd of the next — that small move is what makes a line sound like it follows the changes.",
    goal: "80% hits on “Guide tones” over the ii–V–I at 90 BPM, then over the relative-minor form.",
    open: [
      ["ii–V–I, guide tones", "changes", { source: "form:ii-V-I", key: 7, exercise: "guide", bpm: 80, pos: 1, view: "improv", showNext: true }],
      ["Major + relative minor", "changes", { source: "form:major-minor", key: 7, exercise: "guide", bpm: 80, view: "improv" }],
    ],
  },
  {
    id: "connect", title: "Connect arpeggios in one position",
    why: "You can play each diatonic arpeggio; now chain them. Keep 8th notes going and at every change step to the nearest note of the new chord instead of restarting from the root.",
    goal: "80% on “Nearest chord tone” in one position, ii–V–I first, then the cycle of 4ths.",
    open: [
      ["Diatonic arpeggios, position 2", "diagrams", { mode: "arpeggio", key: 7, chordRoot: 9, chordType: "m7", view: "position", pos: 1, behind: false }],
      ["ii–V–I, nearest tone", "changes", { source: "form:ii-V-I", key: 7, exercise: "nearest", bpm: 80, pos: 1, view: "improv" }],
      ["Cycle of 4ths, nearest tone", "changes", { source: "form:cycle", key: 7, exercise: "nearest", bpm: 80, pos: 1, view: "improv" }],
    ],
  },
  {
    id: "five", title: "The same arpeggios in all 5 positions",
    why: "One ii–V–I, one key, every position. Then move one position up each chorus so the neck becomes one map instead of five boxes.",
    goal: "Nearest-tone 80% in each of positions 1–5 (change Position each chorus).",
    open: [
      ["Am7 arpeggio, any position", "diagrams", { mode: "arpeggio", key: 7, chordRoot: 9, chordType: "m7", view: "position", pos: 0 }],
      ["ii–V–I, chord tones", "changes", { source: "form:ii-V-I", key: 7, exercise: "chordTone", pos: 0, view: "improv" }],
    ],
  },
  {
    id: "drop2", title: "Drop 2 voicings",
    why: "The standard four-note jazz chord on guitar: four adjacent strings, no stretches. Learn maj7, m7, 7 and m7b5 on strings 4-3-2-1 in all four inversions, then harmonise the scale with the diatonic walk.",
    goal: "Play the diatonic walk in G up and down from each inversion; then the same on strings 5-4-3-2.",
    open: [
      ["Drop 2 on 4-3-2-1", "diagrams", { mode: "voicing", kind: "drop2", setIdx: 0, chordRoot: 7, chordType: "maj7", key: 7, walk: false, inversion: "all" }],
      ["Diatonic drop 2 walk", "diagrams", { mode: "voicing", kind: "drop2", setIdx: 0, key: 7, walk: true, inversion: 0 }],
    ],
  },
  {
    id: "comp", title: "Voice-led comping",
    why: "Pick the inversion that moves least from the last chord. The Backing track (Play along) works this out: set the board to “Comping chords” — play along with it, then try to find it yourself before looking.",
    goal: "Comp the jazz blues and the relative-minor form in drop 2 with the backing comping turned off.",
    open: [
      ["Jazz blues, drop 2 comping", "changes", { source: "form:jazz-blues", key: 7, compKind: "drop2-mid", view: "comp", exercise: "free" }],
      ["ii–V–I, top-string drop 2", "changes", { source: "form:ii-V-I", key: 7, compKind: "drop2-top", view: "comp", exercise: "free" }],
    ],
  },
  {
    id: "minor", title: "Minor ii–V–i",
    why: "m7b5 – 7b9 – m6. The V7b9 takes harmonic minor (phrygian dominant). It's half of many standards.",
    goal: "80% on “Land on a chord tone” over the minor ii–V–i, then the relative-minor form.",
    open: [
      ["Phrygian dominant on B", "diagrams", { mode: "scale", key: 11, scale: "phrygianDom", view: "position", pos: 0 }],
      ["B7b9 arpeggio", "diagrams", { mode: "arpeggio", key: 7, chordRoot: 11, chordType: "7b9", behind: true }],
      ["Minor ii–V–i, chord tones", "changes", { source: "form:minor-ii-V-i", key: 4, exercise: "chordTone", view: "improv" }],
    ],
  },
  {
    id: "vocab", title: "Approach notes and enclosures",
    why: "Bebop language: aim at a chord tone and reach it from a half step below, or surround it (a step above, a half step below, then the target).",
    goal: "60% on “Chromatic approach”, then on “Enclosure”, over the ii–V–I.",
    open: [
      ["ii–V–I, approach", "changes", { source: "form:ii-V-I", key: 7, exercise: "approach", bpm: 70, view: "improv" }],
      ["ii–V–I, enclosure", "changes", { source: "form:ii-V-I", key: 7, exercise: "enclosure", bpm: 70, view: "improv" }],
    ],
  },
  {
    id: "drop3", title: "Drop 3, then drop 2&4",
    why: "Drop 3 puts the bass on string 6 or 5 with a skipped string — the classic comping sound. Drop 2&4 is wider; mostly for chord melody.",
    goal: "Comp the ii–V–I in drop 3 from both string sets.",
    open: [
      ["Drop 3 in Diagrams", "diagrams", { mode: "voicing", kind: "drop3", setIdx: 0, chordRoot: 7, chordType: "maj7", key: 7, walk: false }],
      ["Drop 2&4", "diagrams", { mode: "voicing", kind: "drop24", setIdx: 0, chordRoot: 7, chordType: "maj7", key: 7, walk: false }],
      ["ii–V–I comped in drop 3", "changes", { source: "form:ii-V-I", key: 7, compKind: "drop3", view: "comp", exercise: "free" }],
    ],
  },
  {
    id: "tunes", title: "Apply it to tunes",
    why: "Type in the changes of tunes you know (Play along → Backing track → My songs). Run each stage's exercise over the backing track, then play along with a real recording (Play along → Over a recording): it syncs itself, slow it down, loop the bars that trip you up.",
    goal: "Solo through a full chorus of the recording at 100% speed, landing on a guide tone at each change.",
    open: [["Add a song", "changes", { exercise: "guide" }], ["Play along with a recording", "playalong", {}]],
  },
];

export function mount(root, { navigate }) {
  const state = loadRaw("path", {});
  const list = h("ol", { class: "path" });

  function isDone(stage) {
    return state[stage.id]?.done ?? !!stage.done;
  }

  function render() {
    const firstOpen = STAGES.findIndex((s) => !isDone(s));
    const doneCount = STAGES.filter(isDone).length;
    fill(summary,
      h("div", { class: "stat" }, h("b", {}, `${doneCount} / ${STAGES.length}`), h("span", {}, "steps done")),
      firstOpen >= 0 ? h("div", { class: "stat" }, h("b", {}, STAGES[firstOpen].title), h("span", {}, "next up")) : null);
    fill(list, ...STAGES.map((s, i) => {
      const done = isDone(s);
      const note = h("textarea", { rows: 2, placeholder: "Your notes: tempo reached, what's hard…", oninput: (e) => { state[s.id] = { ...state[s.id], note: e.target.value }; save("path", state); } }, state[s.id]?.note || "");
      return h("li", {}, h("details", { class: `stage${done ? " done" : ""}${i === firstOpen ? " current" : ""}`, open: i === firstOpen },
        h("summary", {},
          h("span", { class: "stage-num" }, done ? "✓" : String(i + 1)),
          h("span", { class: "stage-title" }, s.title),
          i === firstOpen ? h("span", { class: "badge" }, "next up") : null),
        h("div", { class: "stage-body" },
          h("p", {}, s.why),
          h("p", { class: "hint" }, h("b", {}, "Done when: "), s.goal),
          h("div", { class: "controls" }, ...s.open.map(([label, tab, preset]) => h("button", { class: "btn small", onclick: () => navigate(tab, preset) }, `${label} →`))),
          note,
          h("label", { class: "toggle", style: "margin-top:8px" }, h("input", { type: "checkbox", checked: done, onchange: (e) => { state[s.id] = { ...state[s.id], done: e.target.checked }; save("path", state); render(); } }), "I've done this step"))));
    }));
  }

  const summary = h("div", { class: "stat-row", style: "margin-bottom:12px" });
  root.append(
    h("header", { class: "card-head" }, h("div", {}, h("h2", {}, "Learning path: jazz improvisation"),
      h("p", {}, "From one-position arpeggios to connecting them across the neck and comping with drop voicings. Each step says why it matters and when it's done; the buttons open the right tool already set up."))),
    summary,
    list,
  );
  render();
  return { onHide: () => {} };
}
