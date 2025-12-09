// triads.js
(function () {
  // ---------- Basic pitch-class helpers ----------

  const NOTE_ORDER_SHARP = [
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B"
  ];

  const FLAT_TO_SHARP = {
    "Db": "C#",
    "Eb": "D#",
    "Gb": "F#",
    "Ab": "G#",
    "Bb": "A#"
  };

  function normalizePitchClass(note) {
    // Accept "C", "C4", "f#3", "Db", etc → "C", "C#", ...
    if (!note) throw new Error("normalizePitchClass: empty note");

    const trimmed = String(note).trim();
    const m = trimmed.match(/^([A-Ga-g][b#]?)(\d+)?$/);

    if (!m) {
      throw new Error(`Unrecognized note format: ${note}`);
    }

    let base = m[1];
    const letter = base[0].toUpperCase();
    const accidental = base[1] || "";
    base = letter + accidental; // e.g. "Db", "F#", "E"

    if (FLAT_TO_SHARP[base]) {
      base = FLAT_TO_SHARP[base];
    }

    if (!NOTE_ORDER_SHARP.includes(base)) {
      throw new Error(`Unsupported note after normalization: ${note} -> ${base}`);
    }

    return base;
  }

  function semitoneIndex(pc) {
    return NOTE_ORDER_SHARP.indexOf(normalizePitchClass(pc));
  }

  function transpose(pc, semitones) {
    const idx = semitoneIndex(pc);
    const newIdx = (idx + semitones) % 12;
    return NOTE_ORDER_SHARP[(newIdx + 12) % 12];
  }

  // ---------- Triad model ----------

  const TriadQuality = Object.freeze({
    MAJOR: "MAJOR",
    // MINOR: "MINOR",
    // DIMINISHED: "DIMINISHED",
    // AUGMENTED: "AUGMENTED"
  });

  const INTERVAL_PATTERNS = {
    [TriadQuality.MAJOR]: [0, 4, 7],
    // [TriadQuality.MINOR]: [0, 3, 7],
    // [TriadQuality.DIMINISHED]: [0, 3, 6],
    // [TriadQuality.AUGMENTED]: [0, 4, 8],
  };

  const TriadInversion = Object.freeze({
    ROOT_POSITION: 0,   // root–3rd–5th
    FIRST_INVERSION: 1, // 3rd–5th–root
    SECOND_INVERSION: 2 // 5th–root–3rd
  });

  const QUALITY_LABEL = {
    [TriadQuality.MAJOR]: "major",
  };

  const INVERSION_LABEL = {
    [TriadInversion.ROOT_POSITION]: "",
    [TriadInversion.FIRST_INVERSION]: "1st inv",
    [TriadInversion.SECOND_INVERSION]: "2nd inv"
  };

  class Triad {
    constructor(root, quality, inversion = TriadInversion.ROOT_POSITION) {
      this.root = normalizePitchClass(root);
      this.quality = quality;
      this.inversion = inversion;
    }

    normalizedRoot() {
      return this.root;
    }

    // Root-position chord tones: [root, 3rd, 5th]
    basicPitches() {
      const pattern = INTERVAL_PATTERNS[this.quality];
      const r = this.normalizedRoot();
      return pattern.map(semi => transpose(r, semi));
    }

    // Ordered tones **respecting inversion**
    pitches() {
      const base = this.basicPitches();
      const shift = this.inversion; // 0,1,2
      return base.slice(shift).concat(base.slice(0, shift));
    }

    label() {
    const qualityName = QUALITY_LABEL[this.quality]; // e.g. "major"
    const inv = INVERSION_LABEL[this.inversion];

    // Root position: "E major"
    // 1st/2nd:      "E major (1st inv)"
    if (!inv) {
        return `${this.root} ${qualityName}`;
    }
    return `${this.root} ${qualityName} (${inv})`;
    }
  }

  // ---------- Checking utilities (ORDER ONLY) ----------

  function normalizeSequence(notes) {
    return notes.map(normalizePitchClass);
  }

  // Global default – tweak this to change app-wide tolerance
  const DEFAULT_MAX_ERRORS = 3; // e.g. allow 1 random wrong note before "fail"

  /**
   * Batch check: you already have an array of played notes
   * and want to know if they contain the correct sequence
   * in order, with at most `maxErrors` wrong notes.
   *
   * Example:
   *   expected = C E G
   *   played   = C X E G   (X ≠ C/E/G)
   *   maxErrors = 1 → still success
   */
  function checkTriadAnswerOrdered(expectedTriad, playedNotes, maxErrors = DEFAULT_MAX_ERRORS) {
    const expected = expectedTriad.pitches(); // e.g. ["C","E","G"]
    const normPlayed = normalizeSequence(playedNotes);

    let idx = 0;           // how many correct notes we've hit in order
    let wrongCount = 0;

    for (const pc of normPlayed) {
      if (idx < expected.length && pc === expected[idx]) {
        idx += 1;
        if (idx === expected.length) {
          // We've matched all notes; we can ignore any trailing stuff
          break;
        }
      } else {
        wrongCount += 1;
        if (wrongCount > maxErrors) {
          break;
        }
      }
    }

    const success = idx === expected.length && wrongCount <= maxErrors;

    return {
      success,
      matchedCount: idx,
      wrongCount,
      maxErrors,
      expectedSequence: expected,
      givenPitchesNormalized: normPlayed
    };
  }

  /**
   * Streaming session:
   * Feed notes one-by-one from your audio code.
   * It keeps track of current position and wrong notes for you.
   */
  class TriadSequenceSession {
    constructor(triad, options = {}) {
      this.triad = triad;
      this.expected = triad.pitches(); // ["C","E","G"] or inversion
      this.maxErrors = options.maxErrors != null ? options.maxErrors : DEFAULT_MAX_ERRORS;
      this.reset();
    }

    reset() {
      this.index = 0;       // 0..3
      this.wrongCount = 0;
      this.done = false;
      this.success = false;
    }

    /**
     * Call this every time your pitch detector thinks it heard a note.
     *
     * Returns an object:
     *  {
     *    status: "pending" | "success" | "fail",
     *    correct: true/false for this note,
     *    expectedNote: (next target note),
     *    matchedCount,
     *    wrongCount,
     *    maxErrors
     *  }
     */
    acceptNote(note) {
      if (this.done) {
        return {
          status: this.success ? "success" : "fail",
          correct: false,
          expectedNote: null,
          matchedCount: this.index,
          wrongCount: this.wrongCount,
          maxErrors: this.maxErrors
        };
      }

      const pc = normalizePitchClass(note);
      const expectedNote = this.expected[this.index];

      let correct = false;

      if (pc === expectedNote) {
        correct = true;
        this.index += 1;
        if (this.index >= this.expected.length) {
          this.done = true;
          this.success = true;
        }
      } else {
        this.wrongCount += 1;
        if (this.wrongCount > this.maxErrors) {
          this.done = true;
          this.success = false;
        }
      }

      let status = "pending";
      if (this.done) {
        status = this.success ? "success" : "fail";
      }

      return {
        status,
        correct,
        expectedNote: this.done ? null : this.expected[this.index],
        matchedCount: this.index,
        wrongCount: this.wrongCount,
        maxErrors: this.maxErrors
      };
    }
  }

  // ---------- Trainer / question generation ----------

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

    // ⬇⬇⬇ REPLACE THIS FUNCTION WITH THIS VERSION ⬇⬇⬇
    nextQuestion() {
        const triad = this.randomTriad();

        // Only allow strings 6, 5, 4
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
    TriadQuality,
    TriadInversion,
    Triad,
    TriadTrainer,
    DEFAULT_MAX_ERRORS,
    checkTriadAnswerOrdered,
    TriadSequenceSession
  };
})();
