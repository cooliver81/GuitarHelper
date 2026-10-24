// One AudioContext for the whole app: mic input, metronome, backing tracks.
// Sharing it means scheduled audio times and mic timestamps are on the same clock.

let ctx = null;
let master = null;

export function audioContext() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx({ latencyHint: "interactive" });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  return ctx;
}

export function masterOut() {
  audioContext();
  return master;
}

// Must be called from a click/tap the first time (browser autoplay rules).
export async function resumeAudio() {
  const c = audioContext();
  if (c.state !== "running") await c.resume();
  return c;
}

// Run `fn` when audio time `t` is actually heard (for UI that follows the music).
export function atAudioTime(t, fn) {
  const c = audioContext();
  const delayMs = (t - c.currentTime + outputLatency()) * 1000;
  return setTimeout(fn, Math.max(0, delayMs));
}

export function outputLatency() {
  const c = audioContext();
  return (c.outputLatency || 0) + (c.baseLatency || 0);
}
