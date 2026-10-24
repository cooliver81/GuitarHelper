// Note names, pitch classes, MIDI and frequency.
// Pitch class (pc) = 0..11 with C = 0. MIDI 69 = A4.

export const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Major keys spelled with flats. Minor keys borrow from their relative major.
const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb

export function mod12(n) {
  return ((n % 12) + 12) % 12;
}

// "C", "f#", "Bb", "Cb", "E#4" -> pitch class. Throws on anything else.
export function parsePc(name) {
  const m = String(name).trim().match(/^([A-Ga-g])([#b]*)(-?\d+)?$/);
  if (!m) throw new Error(`Not a note name: ${name}`);
  let pc = LETTER_PC[m[1].toUpperCase()];
  for (const ch of m[2]) pc += ch === "#" ? 1 : -1;
  return mod12(pc);
}

export function prefersFlats(keyPc, mode = "major") {
  const majorPc = mode === "minor" ? mod12(keyPc + 3) : mod12(keyPc);
  return FLAT_MAJOR_KEYS.has(majorPc);
}

export function pcName(pc, flats = false) {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
}

export function midiToName(midi, flats = false) {
  return pcName(midi, flats) + (Math.floor(midi / 12) - 1);
}

export function midiToFreq(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

// Fractional MIDI number; round it for the nearest note.
export function freqToMidi(freq, a4 = 440) {
  if (!(freq > 0)) return null;
  return 69 + 12 * Math.log2(freq / a4);
}

export function centsBetween(freq, refFreq) {
  return 1200 * Math.log2(freq / refFreq);
}

// Nearest note and how far off it is, for the tuner.
export function nearestNote(freq, a4 = 440) {
  const exact = freqToMidi(freq, a4);
  if (exact == null) return null;
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}
