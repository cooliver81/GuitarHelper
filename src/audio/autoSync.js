// Browser side of auto-sync: decode a file's audio at 11 kHz mono and hand it to the
// beat worker. Only files: a YouTube embed never lets a page hear its audio.

const SR = 11025;
const MAX_SECONDS = 600;

export async function analyseFile(file, bars) {
  const data = await file.arrayBuffer();
  // An OfflineAudioContext at 11025 Hz resamples while decoding.
  const ctx = new OfflineAudioContext(1, 1, SR);
  let audio;
  try {
    audio = await ctx.decodeAudioData(data);
  } catch {
    throw new Error("Couldn't read the audio in this file for auto-sync.");
  }
  const n = Math.min(audio.length, MAX_SECONDS * SR);
  const mono = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += ch[i] / audio.numberOfChannels;
  }
  const worker = new Worker(new URL("./beatWorker.js", import.meta.url), { type: "module" });
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = (e) => (e.data.ok ? resolve(e.data.result) : reject(new Error(e.data.error)));
      worker.onerror = (e) => reject(new Error(e.message || "Beat analysis failed."));
      worker.postMessage({ samples: mono, sr: SR, bars }, [mono.buffer]);
    });
  } finally {
    worker.terminate();
  }
}
