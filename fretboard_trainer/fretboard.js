// fretboard.js

(function () {
  const NOTE_NAMES = [
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B"
  ];

  const STRING_TUNING_MIDI = {
    6: 40, // E2
    5: 45, // A2
    4: 50, // D3
    3: 55, // G3
    2: 59, // B3
    1: 64  // E4
  };

  // Only frets 0–11 (no 12th-fret duplicates)
  const MAX_FRET = 11;

  const FRETBOARD = [];

  for (const key in STRING_TUNING_MIDI) {
    const s = parseInt(key, 10);
    const openMidi = STRING_TUNING_MIDI[key];
    for (let fret = 0; fret <= MAX_FRET; fret++) {
      const midi = openMidi + fret;
      const name = midiToNoteName(midi);
      const pitchClass = pitchClassName(midi);
      FRETBOARD.push({ string: s, fret, midi, name, pitchClass });
    }
  }

  function midiToNoteName(midi) {
    const name = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return name + octave;
  }

  function pitchClassName(midi) {
    return NOTE_NAMES[midi % 12];
  }

  function freqToMidi(freq) {
    if (!freq || freq <= 0) return null;
    return 69 + 12 * Math.log2(freq / 440);
  }

  function randomTarget() {
    const strings = Object.keys(STRING_TUNING_MIDI).map(Number);
    const string = strings[Math.floor(Math.random() * strings.length)];
    const openMidi = STRING_TUNING_MIDI[string];
    const fret = Math.floor(Math.random() * (MAX_FRET + 1));
    const midi = openMidi + fret;
    const pitchClass = pitchClassName(midi);
    const fullName = midiToNoteName(midi);
    return { string, fret, midi, pitchClass, fullName };
  }

  function nearestFretFromFreq(freq) {
    const midiEst = freqToMidi(freq);
    if (midiEst == null) return null;

    let best = null;
    let bestDist = Infinity;

    for (const n of FRETBOARD) {
      const dist = Math.abs(midiEst - n.midi);
      if (dist < bestDist) {
        bestDist = dist;
        best = n;
      }
    }
    return best;
  }

  window.Fretboard = {
    randomTarget,
    nearestFretFromFreq,
    pitchClassName,
    midiToNoteName,
    freqToMidi
  };
})();
