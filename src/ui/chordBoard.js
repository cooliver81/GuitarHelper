// Dots for "where are this chord's notes": used by Changes and Play-along.
// Chord tones coloured (root red, guide tones orange, others blue), optional chord scale
// dimmed behind, and the next chord's targets as rings.

import { chordPcs, chordDegree, guideTones, CHORD_TYPES } from "../theory/chords.js";
import { scalePcs } from "../theory/scales.js";
import { positionDots, dotsForPcs } from "../theory/fretboard.js";

// start: position start fret, or null for the whole neck.
// targets: pitch classes to show at full strength (others dimmed); null = all chord tones.
export function chordToneDots({ chord, start = null, showScale = false, targets = null, nextTargets = null }) {
  const where = (pcs) => (start == null ? dotsForPcs(pcs) : positionDots(pcs, start));
  const tones = chordPcs(chord);
  const pcs = showScale ? [...new Set([...tones, ...scalePcs(chord.root, CHORD_TYPES[chord.type].scale)])] : tones;
  const dots = where(pcs).map((d) => {
    const deg = chordDegree(chord, d.pc);
    if (!deg) return { ...d, kind: "scale", dim: true, label: "" };
    const kind = d.pc === chord.root ? "root" : guideTones(chord).includes(d.pc) ? "guide" : "tone";
    return { ...d, kind, dim: targets ? !targets.includes(d.pc) : false, label: deg };
  });
  if (nextTargets) where(nextTargets).forEach((d) => dots.push({ ...d, ring: true, kind: "next", label: "" }));
  return dots;
}
