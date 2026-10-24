// Pitch detection: YIN (de Cheveigné & Kawahara, 2002) with parabolic interpolation.
// Pure function of a sample buffer, so it runs (and is tested) in Node.
//
// Why not plain autocorrelation (the first version): autocorrelation is largest at the
// smallest lags, so a low note with a strong fundamental can read as ~1000 Hz, and an
// integer-lag peak quantises the reading by up to ~12 cents high on the neck.

export const DEFAULTS = {
  minFreq: 70,       // below drop-D low D (73.4 Hz)
  maxFreq: 1100,     // above high E 19th fret
  threshold: 0.12,   // YIN absolute threshold; lower = stricter
  minRms: 0.01,      // quieter than this = silence
};

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

// Returns { freq, clarity } or null. clarity is 1 - YIN aperiodicity (1 = perfectly periodic).
export function detectPitch(buf, sampleRate, opts = {}) {
  const { minFreq, maxFreq, threshold, minRms } = { ...DEFAULTS, ...opts };
  if (rms(buf) < minRms) return null;

  const maxTau = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const W = buf.length - maxTau;
  if (W <= 0 || minTau >= maxTau) return null;

  // Step 1-2: difference function d(tau)
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Step 3: cumulative mean normalised difference d'(tau)
  const dn = new Float32Array(maxTau + 1);
  dn[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    dn[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  // Step 4: first dip under the threshold, then walk to its local minimum.
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (dn[t] < threshold) {
      while (t + 1 <= maxTau && dn[t + 1] < dn[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  // Step 5: parabolic interpolation around the minimum for sub-sample accuracy.
  let better = tau;
  if (tau > 1 && tau < maxTau) {
    const a = dn[tau - 1], b = dn[tau], c = dn[tau + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) better = tau + (a - c) / (2 * denom);
  }

  const freq = sampleRate / better;
  if (freq < minFreq || freq > maxFreq) return null;
  return { freq, clarity: 1 - dn[tau] };
}

// Mix or pick input channels: "auto" uses whichever channel is loudest.
export function pickChannel(channels, mode = "auto") {
  if (channels.length === 1) return channels[0];
  if (mode === "1") return channels[0];
  if (mode === "2") return channels[1];
  return rms(channels[0]) >= rms(channels[1]) ? channels[0] : channels[1];
}
