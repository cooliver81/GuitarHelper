// triads.js
(function () {
  // ---------- Pitch-class helpers ----------
  const NOTE_ORDER_SHARP = Object.freeze([
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B"
  ]);

  const FLAT_TO_SHARP = Object.freeze({
    "Db": "C#",
    "Eb": "D#",
    "Gb": "F#",
    "Ab": "G#",
    "Bb": "A#"
  });

  const ENHARMONIC_TO_SHARP = Object.freeze({
    "Cb": "B",
    "B#": "C",
    "E#": "F",
    "Fb": "E"
  });

  // ---------- Progress lights helpers ----------
  const TriadsProgress = {
    lights(matchedCount, total = 3) {
      const out = [];
      for (let i = 0; i < total; i++) out.push(i < matchedCount);
      return out;
    },

    render(containerEl, matchedCount, total = 3) {
      if (!containerEl) return;
      const on = this.lights(matchedCount, total);

      containerEl.innerHTML = on
        .map((lit) => `<span class="triad-light ${lit ? "on" : "off"}"></span>`)
        .join("");
    }
  };

  function normalizePitchClass(note) {
    if (note == null) throw new Error("normalizePitchClass: empty note");

    const trimmed = String(note).trim();
    const m = trimmed.match(/^([A-Ga-g])([b#]?)(-?\d+)?$/);
    if (!m) throw new Error(`Unrecognized note format: ${note}`);

    const letter = m[1].toUpperCase();
    const accidental = m[2] || "";
    let pc = letter + accidental;

    if (FLAT_TO_SHARP[pc]) pc = FLAT_TO_SHARP[pc];
    if (ENHARMONIC_TO_SHARP[pc]) pc = ENHARMONIC_TO_SHARP[pc];

    if (!NOTE_ORDER_SHARP.includes(pc)) {
      throw new Error(`Unsupported note after normalization: ${note} -> ${pc}`);
    }
    return pc;
  }

  function semitoneIndex(pc) {
    return NOTE_ORDER_SHARP.indexOf(normalizePitchClass(pc));
  }

  function transpose(pc, semitones) {
    const idx = semitoneIndex(pc);
    const newIdx = (idx + semitones) % 12;
    return NOTE_ORDER_SHARP[(newIdx + 12) % 12];
  }

  // ---------- Frequency → pitch class ----------
  function freqToMidi(freq) {
    return Math.round(69 + 12 * Math.log2(freq / 440));
  }

  function midiToPitchClass(midi) {
    const pc = ((midi % 12) + 12) % 12;
    return NOTE_ORDER_SHARP[pc];
  }

  function toPitchClass(noteOrFreq) {
    if (typeof noteOrFreq === "number") {
      if (!isFinite(noteOrFreq) || noteOrFreq <= 0) return null;
      return midiToPitchClass(freqToMidi(noteOrFreq));
    }
    return normalizePitchClass(noteOrFreq);
  }

  // ---------- Triad model ----------
  const TriadQuality = Object.freeze({
    MAJOR: "MAJOR",
    MINOR: "MINOR",
    DIMINISHED: "DIMINISHED",
    AUGMENTED: "AUGMENTED"
  });

  const INTERVAL_PATTERNS = Object.freeze({
    [TriadQuality.MAJOR]: [0, 4, 7],
    [TriadQuality.MINOR]: [0, 3, 7],
    [TriadQuality.DIMINISHED]: [0, 3, 6],
    [TriadQuality.AUGMENTED]: [0, 4, 8],
  });

  const TriadInversion = Object.freeze({
    ROOT_POSITION: 0,
    FIRST_INVERSION: 1,
    SECOND_INVERSION: 2
  });

  const QUALITY_LABEL = Object.freeze({
    [TriadQuality.MAJOR]: "major",
    [TriadQuality.MINOR]: "minor",
    [TriadQuality.DIMINISHED]: "dim",
    [TriadQuality.AUGMENTED]: "aug",
  });

  const INVERSION_LABEL = Object.freeze({
    [TriadInversion.ROOT_POSITION]: "",
    [TriadInversion.FIRST_INVERSION]: "1st inv",
    [TriadInversion.SECOND_INVERSION]: "2nd inv"
  });

  class Triad {
    constructor(root, quality, inversion = TriadInversion.ROOT_POSITION) {
      this.root = normalizePitchClass(root);
      this.quality = quality;
      this.inversion = inversion;

      if (!INTERVAL_PATTERNS[this.quality]) {
        throw new Error(`Unsupported triad quality: ${quality}`);
      }
    }

    basicPitches() {
      const pattern = INTERVAL_PATTERNS[this.quality];
      return pattern.map(semi => transpose(this.root, semi));
    }

    pitches() {
      const base = this.basicPitches();
      const shift = this.inversion;
      return base.slice(shift).concat(base.slice(0, shift));
    }

    label() {
      const qualityName = QUALITY_LABEL[this.quality] || String(this.quality).toLowerCase();
      const inv = INVERSION_LABEL[this.inversion];
      if (!inv) return `${this.root} ${qualityName}`;
      return `${this.root} ${qualityName} (${inv})`;
    }
  }

  // ---------- Checking utilities (ORDER ONLY) ----------
  const DEFAULT_MAX_ERRORS = 0;
  const DEFAULT_STRICT_FAIL_FAST = true;

  function normalizeSequence(notesOrFreqs) {
    const out = [];
    for (const x of notesOrFreqs) {
      const pc = toPitchClass(x);
      if (pc) out.push(pc);
    }
    return out;
  }

  function checkTriadAnswerOrdered(expectedTriad, playedNotesOrFreqs, options = {}) {
    const {
      maxErrors = DEFAULT_MAX_ERRORS,
      failFast = DEFAULT_STRICT_FAIL_FAST,
      dedupe = true,
    } = options;

    const expected = expectedTriad.pitches();
    const normPlayed = normalizeSequence(playedNotesOrFreqs);

    let idx = 0;
    let wrongCount = 0;
    let prev = null;

    for (const pc of normPlayed) {
      if (dedupe && pc === prev) continue;
      prev = pc;

      if (idx < expected.length && pc === expected[idx]) {
        idx += 1;
        if (idx === expected.length) break;
      } else {
        wrongCount += 1;
        if (failFast || wrongCount > maxErrors) break;
      }
    }

    return {
      success: idx === expected.length && wrongCount <= maxErrors,
      matchedCount: idx,
      wrongCount,
      maxErrors,
      expectedSequence: expected,
      givenPitchesNormalized: normPlayed
    };
  }

  // ---------- Streaming session ----------
  class TriadSequenceSession {
    constructor(triad, options = {}) {
      this.triad = triad;
      this.expected = triad.pitches();

      this.resetOnWrong = options.resetOnWrong != null ? options.resetOnWrong : true;
      this.dedupeMs = options.dedupeMs != null ? options.dedupeMs : 180;
      this.countNonChordTonesAsError =
        options.countNonChordTonesAsError != null ? options.countNonChordTonesAsError : true;

      this.reset();
    }

    reset() {
      this.index = 0;
      this.wrongCount = 0;
      this.done = false;
      this.success = false;

      this._lastPc = null;
      this._lastPcAt = 0;
      this._expectedSet = new Set(this.expected);
    }

    acceptNote(noteOrFreq) {
      if (this.done) {
        return this._payload("success", true, null, { heard: null, reset: false });
      }

      const pc = toPitchClass(noteOrFreq);
      if (!pc) {
        return this._payload("pending", false, this.expected[this.index], { heard: null, reset: false });
      }

      const now = performance.now();

      if (this._lastPc === pc && (now - this._lastPcAt) < this.dedupeMs) {
        return this._payload("pending", false, this.expected[this.index], { heard: pc, ignored: true, reset: false });
      }

      this._lastPc = pc;
      this._lastPcAt = now;

      const expectedNote = this.expected[this.index];

      if (pc === expectedNote) {
        this.index += 1;

        if (this.index >= this.expected.length) {
          this.done = true;
          this.success = true;
          return this._payload("success", true, null, { heard: pc, reset: false });
        }

        return this._payload("pending", true, this.expected[this.index], { heard: pc, reset: false });
      }

      const isChordTone = this._expectedSet.has(pc);

      if (!this.countNonChordTonesAsError && !isChordTone) {
        return this._payload("pending", false, expectedNote, { heard: pc, ignored: true, reset: false });
      }

      this.wrongCount += 1;

      if (this.resetOnWrong) {
        this.index = 0;
        this._lastPc = null;
        this._lastPcAt = 0;
        return this._payload("pending", false, this.expected[0], { heard: pc, reset: true });
      }

      return this._payload("pending", false, expectedNote, { heard: pc, reset: false });
    }

    _payload(status, correct, expectedNote, extra = {}) {
      const lights = TriadsProgress.lights(this.index, this.expected.length);

      return {
        status,
        correct,
        reset: !!extra.reset,            // ✅ always correct
        expectedNote,
        matchedCount: this.index,
        wrongCount: this.wrongCount,
        expectedSequence: this.expected.slice(),
        lights,
        ...extra
      };
    }
  }

  // ---------- Trainer ----------
  class TriadTrainer {
    constructor(options = {}) {
      const {
        allowedRoots = NOTE_ORDER_SHARP.slice(),
        allowedQualities = [TriadQuality.MAJOR],
        allowedInversions = [
          TriadInversion.ROOT_POSITION,
          TriadInversion.FIRST_INVERSION,
          TriadInversion.SECOND_INVERSION
        ]
      } = options;

      this.allowedRoots = allowedRoots.map(normalizePitchClass);
      this.allowedQualities = allowedQualities.slice();
      this.allowedInversions = allowedInversions.slice();
    }

    randomTriad() {
      const root = randomChoice(this.allowedRoots);
      const quality = randomChoice(this.allowedQualities);
      const inversion = randomChoice(this.allowedInversions);
      return new Triad(root, quality, inversion);
    }

    nextQuestion() {
      const triad = this.randomTriad();
      const possibleStrings = [6, 5, 4];
      const string = randomChoice(possibleStrings);
      return { triad, string };
    }
  }

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ---------- Public API ----------
  window.Triads = {
    NOTE_ORDER_SHARP,
    normalizePitchClass,
    toPitchClass,
    TriadQuality,
    TriadInversion,
    Triad,
    TriadTrainer,
    DEFAULT_MAX_ERRORS,
    checkTriadAnswerOrdered,
    TriadSequenceSession,
    TriadsProgress
  };
})();
