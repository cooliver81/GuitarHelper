// Turns a stream of per-frame pitch readings into note events.
// A note fires once it has been stable for `sustainMs`; it fires again only after the
// pitch changes or the sound stops. Pure logic (no audio APIs), so it's unit-tested.

export const GATE_DEFAULTS = {
  sustainMs: 120,    // stable this long before a note counts
  stableCents: 30,   // drift allowed while "stable"
};

export class NoteGate {
  constructor(opts = {}) {
    Object.assign(this, GATE_DEFAULTS, opts);
    this.reset();
  }

  reset() {
    this.freq = null;
    this.stableMs = 0;
    this.fired = false;
  }

  // reading = { freq } or null (silence / no pitch). Returns a note event or null.
  // Event: { freq, onsetMs } where onsetMs is when the stable stretch began.
  push(reading, frameMs, nowMs) {
    if (!reading) {
      this.reset();
      return null;
    }
    if (this.freq == null) {
      this.freq = reading.freq;
      this.stableMs = 0;
      this.startMs = nowMs - frameMs;
      return null;
    }
    const cents = Math.abs(1200 * Math.log2(reading.freq / this.freq));
    if (cents > this.stableCents) {
      this.freq = reading.freq;
      this.stableMs = 0;
      this.fired = false;
      this.startMs = nowMs - frameMs;
      return null;
    }
    this.stableMs += frameMs;
    this.freq = 0.8 * this.freq + 0.2 * reading.freq;
    if (!this.fired && this.stableMs >= this.sustainMs) {
      this.fired = true;
      return { freq: this.freq, onsetMs: this.startMs };
    }
    return null;
  }
}
