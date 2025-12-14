// audioEngine.js
(function () {
  // -----------------------------
  // Pitch detection range
  // -----------------------------
  const MIN_F0 = 70;
  const MAX_F0 = 1000;

  // ScriptProcessor buffer
  const BUFFER_SIZE = 2048;

  // Your existing peak amplitude gate (kept)
  const AMPLITUDE_THRESHOLD = 0.05;

  // -----------------------------
  // Sustain gate tuning
  // -----------------------------
  const SUSTAIN_MS = 140;       // pitch must be stable this long to count
  const STABLE_CENTS = 25;      // allowable drift while "stable"
  const REARM_MS = 120;         // cooldown after a trigger

  // Basic iOS detection
  const IS_IOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // Slightly lower threshold on iOS where input is quieter
  const EFFECTIVE_AMPLITUDE_THRESHOLD = IS_IOS ? 0.02 : AMPLITUDE_THRESHOLD;

  // Sustain gate: derive RMS thresholds from the same knob you already tune.
  // RMS is usually lower than peak, so scale down.
  const RMS_ON = EFFECTIVE_AMPLITUDE_THRESHOLD * 0.55;   // start tracking
  const RMS_OFF = EFFECTIVE_AMPLITUDE_THRESHOLD * 0.45;  // keep tracking (hysteresis)

  // -----------------------------
  // WebAudio state
  // -----------------------------
  let audioCtx = null;
  let mediaStream = null;
  let sourceNode = null;
  let gainNode = null;
  let processorNode = null;
  let sampleRate = 44100;
  let onPitch = null;

  // -----------------------------
  // Sustain gate state
  // -----------------------------
  let stableMs = 0;
  let lastFreq = null;
  let locked = false;
  let lastFireAt = 0;

  // -----------------------------
  // Helpers
  // -----------------------------
  function rms(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const x = buffer[i];
      sum += x * x;
    }
    return Math.sqrt(sum / buffer.length);
  }

  function centsDiff(f1, f2) {
    return 1200 * Math.log2(f1 / f2);
  }

  function resetGate() {
    stableMs = 0;
    lastFreq = null;
    locked = false;
  }

  // -----------------------------
  // Public API
  // -----------------------------
  async function start(onPitchDetected) {
    if (audioCtx) return;
    onPitch = onPitchDetected;

    // Simple + compatible constraint
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sampleRate = audioCtx.sampleRate;

    // iOS often starts suspended
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    sourceNode = audioCtx.createMediaStreamSource(mediaStream);

    // Boost a bit on iOS
    gainNode = audioCtx.createGain();
    gainNode.gain.value = IS_IOS ? 3.0 : 1.0;

    // iOS: true mono, Desktop: keep stereo so Focusrite stays happy
    const inputChannels = IS_IOS ? 1 : 2;
    const outputChannels = IS_IOS ? 1 : 2;

    processorNode = audioCtx.createScriptProcessor(
      BUFFER_SIZE,
      inputChannels,
      outputChannels
    );

    sourceNode.connect(gainNode);
    gainNode.connect(processorNode);
    processorNode.connect(audioCtx.destination);

    resetGate();

    processorNode.onaudioprocess = (event) => {
      if (!onPitch) return;

      const inputBuffer = event.inputBuffer;
      const channels = inputBuffer.numberOfChannels;

      // Choose channel
      let input;
      if (IS_IOS) {
        input = inputBuffer.getChannelData(0);
      } else {
        // Prefer channel 1 (right / Input 2 on many interfaces)
        input = channels >= 2 ? inputBuffer.getChannelData(1) : inputBuffer.getChannelData(0);
      }

      // --- PURPOSEFUL NOTE GATE ---
      // Step 1: volume (RMS) gate with hysteresis
      const level = rms(input);
      const loudEnough = locked ? (level >= RMS_OFF) : (level >= RMS_ON);

      if (!loudEnough) {
        resetGate();
        return;
      }

      // Step 2: pitch detect
      const freq = detectPitchFromChunk(input);
      if (!freq) {
        // If we can't detect pitch but we are loud, keep it conservative:
        // reset so random noise doesn't accumulate "stability time"
        resetGate();
        return;
      }

      // Step 3: stability timer in cents
      const frameMs = (input.length / sampleRate) * 1000;
      const now = performance.now();

      if (lastFreq == null) {
        lastFreq = freq;
        stableMs = 0;
        return;
      }

      const cd = Math.abs(centsDiff(freq, lastFreq));

      if (cd <= STABLE_CENTS) {
        stableMs += frameMs;
        // small smoothing so lastFreq doesn't jump with tiny variance
        lastFreq = 0.85 * lastFreq + 0.15 * freq;
      } else {
        // Not stable yet; restart around new pitch
        stableMs = 0;
        lastFreq = freq;
        locked = false;
        return;
      }

      // Step 4: fire once when sustained long enough (with cooldown)
      if (!locked && stableMs >= SUSTAIN_MS) {
        if (now - lastFireAt >= REARM_MS) {
          locked = true;
          lastFireAt = now;

          // ✅ Trigger your app with the sustained pitch
          onPitch(lastFreq);
        }
      }

      // If you ever want continuous tracking AFTER lock, you could call:
      // if (locked) onPitch(lastFreq);
    };
  }

  function stop() {
    if (processorNode) {
      processorNode.disconnect();
      processorNode.onaudioprocess = null;
      processorNode = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    resetGate();
  }

  // -----------------------------
  // Pitch detection (autocorrelation)
  // -----------------------------
  function detectPitchFromChunk(buf) {
    const n = buf.length;
    if (n === 0) return null;

    // DC offset removal
    let mean = 0;
    for (let i = 0; i < n; i++) mean += buf[i];
    mean /= n;

    // Normalize by peak
    let peak = 0;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = buf[i] - mean;
      x[i] = v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }

    // Peak gate (your existing behavior)
    if (peak < EFFECTIVE_AMPLITUDE_THRESHOLD) return null;

    const invPeak = 1 / peak;
    for (let i = 0; i < n; i++) x[i] *= invPeak;

    // Autocorrelation
    const corr = new Float32Array(n);
    for (let lag = 0; lag < n; lag++) {
      let sum = 0;
      for (let i = 0; i < n - lag; i++) {
        sum += x[i] * x[i + lag];
      }
      corr[lag] = sum;
    }

    const minLag = Math.max(1, Math.floor(sampleRate / MAX_F0));
    let maxLag = Math.floor(sampleRate / MIN_F0);
    if (maxLag >= n) maxLag = n - 1;
    if (minLag >= maxLag) return null;

    // Ignore impossible lags
    for (let i = 0; i < minLag; i++) corr[i] = 0;

    // Find best lag
    let bestLag = minLag;
    let bestVal = corr[minLag];
    for (let lag = minLag + 1; lag <= maxLag; lag++) {
      if (corr[lag] > bestVal) {
        bestVal = corr[lag];
        bestLag = lag;
      }
    }

    if (bestLag <= 0) return null;

    const freq = sampleRate / bestLag;
    if (freq < MIN_F0 || freq > MAX_F0) return null;

    return freq;
  }

  window.AudioEngine = { start, stop };
})();
