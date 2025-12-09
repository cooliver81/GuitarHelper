// audioEngine.js

(function () {
  const MIN_F0 = 70;
  const MAX_F0 = 1000;
  const AMPLITUDE_THRESHOLD = 0.05;
  const BUFFER_SIZE = 2048;

  // Basic iOS detection (Safari/Chrome on iOS will match this)
  const IS_IOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // Use a slightly lower threshold on iOS where input is quieter
  const EFFECTIVE_AMPLITUDE_THRESHOLD = IS_IOS ? 0.03 : AMPLITUDE_THRESHOLD;

  let audioCtx = null;
  let mediaStream = null;
  let sourceNode = null;
  let gainNode = null;
  let processorNode = null;
  let sampleRate = 44100;
  let onPitch = null;

  async function start(onPitchDetected) {
    if (audioCtx) return;

    onPitch = onPitchDetected;

    // Ask for clean, raw audio. These constraints are safely ignored
    // on browsers that don't support them, so PC behaviour is preserved.
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
        // no channelCount here so multi-channel interfaces still work on PC
      }
    };

    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sampleRate = audioCtx.sampleRate;

    sourceNode = audioCtx.createMediaStreamSource(mediaStream);

    // Gain node to boost quieter iOS input without affecting PC too much
    gainNode = audioCtx.createGain();
    gainNode.gain.value = IS_IOS ? 3.0 : 1.0;

    // ScriptProcessor: keep 2 in / 2 out so stereo interfaces stay stereo on PC
    processorNode = audioCtx.createScriptProcessor(BUFFER_SIZE, 2, 2);

    // Connect graph: source -> gain -> processor -> destination
    sourceNode.connect(gainNode);
    gainNode.connect(processorNode);
    processorNode.connect(audioCtx.destination);

    processorNode.onaudioprocess = (event) => {
      const channels = event.inputBuffer.numberOfChannels;

      // Prefer channel 1 (right = Input 2 on your Focusrite) if available
      let input;
      if (channels >= 2) {
        input = event.inputBuffer.getChannelData(1);
      } else {
        input = event.inputBuffer.getChannelData(0);
      }

      const freq = detectPitchFromChunk(input);
      if (freq && onPitch) onPitch(freq);
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
  }

  function detectPitchFromChunk(buf) {
    const n = buf.length;
    if (n === 0) return null;

    // Remove DC offset
    let mean = 0;
    for (let i = 0; i < n; i++) mean += buf[i];
    mean /= n;

    let peak = 0;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = buf[i] - mean;
      x[i] = v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }

    // Use platform-adjusted amplitude threshold
    if (peak < EFFECTIVE_AMPLITUDE_THRESHOLD) return null;

    // Normalise
    for (let i = 0; i < n; i++) x[i] /= peak;

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

    for (let i = 0; i < minLag; i++) corr[i] = 0;

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
