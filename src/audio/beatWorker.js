// Runs auto-sync off the main thread (a 5-minute song takes a second or two).
import { autoSync } from "./beats.js";

self.onmessage = (e) => {
  const { samples, sr, bars } = e.data;
  try {
    self.postMessage({ ok: true, result: autoSync(samples, sr, bars) });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
