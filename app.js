// app.js
(function () {
  //
  // -------- Shared helper: audio start with fresh callback --------
  //
  async function startAudio(callback) {
    window.AudioEngine.stop();
    await window.AudioEngine.start(callback);
  }

  function stopMicAudio() {
    window.AudioEngine.stop();
  }

  //
  // -------- Shared note helpers for tuner / drone --------
  //
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function noteOctaveToMidi(noteName, octave) {
    const pitchClass = NOTE_NAMES.indexOf(noteName);
    if (pitchClass < 0) return null;
    return (octave + 1) * 12 + pitchClass;
  }

  function freqToNearestMidi(freq) {
    if (!freq || freq <= 0) return null;
    return Math.round(69 + 12 * Math.log2(freq / 440));
  }

  function centsOffFromMidi(freq, midi) {
    const exactFreq = midiToFreq(midi);
    return Math.round(1200 * Math.log2(freq / exactFreq));
  }

  //
  // -------- Playback engine: metronome + drone --------
  //
  let playbackCtx = null;
  let metronomeIntervalId = null;
  let metronomeStep = 0;
  let droneOsc = null;
  let droneGain = null;

  function getPlaybackContext() {
    if (!playbackCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      playbackCtx = new AudioCtx();
    }
    return playbackCtx;
  }

  async function ensurePlaybackContextRunning() {
    const ctx = getPlaybackContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx;
  }

  function stopDrone() {
    if (droneOsc) {
      try { droneOsc.stop(); } catch (_) {}
      try { droneOsc.disconnect(); } catch (_) {}
      droneOsc = null;
    }
    if (droneGain) {
      try { droneGain.disconnect(); } catch (_) {}
      droneGain = null;
    }
  }

  function startDrone(freq) {
    const ctx = getPlaybackContext();
    stopDrone();

    droneOsc = ctx.createOscillator();
    droneGain = ctx.createGain();

    droneOsc.type = "sine";
    droneOsc.frequency.setValueAtTime(freq, ctx.currentTime);

    droneGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    droneGain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.15);

    droneOsc.connect(droneGain);
    droneGain.connect(ctx.destination);
    droneOsc.start();
  }

  function updateDroneFrequency(freq) {
    if (!droneOsc || !playbackCtx) return;
    droneOsc.frequency.setTargetAtTime(freq, playbackCtx.currentTime, 0.03);
  }

  function playClick(accented) {
    const ctx = getPlaybackContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = accented ? "square" : "sine";
    osc.frequency.setValueAtTime(accented ? 1400 : 1000, ctx.currentTime);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(accented ? 0.18 : 0.10, ctx.currentTime + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  }

  function stopMetronomePlayback() {
    if (metronomeIntervalId) {
      clearInterval(metronomeIntervalId);
      metronomeIntervalId = null;
    }
    metronomeStep = 0;
    stopDrone();
  }

  //
  // ---------- SINGLE-NOTE TRAINER ----------
  //
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const targetText = document.getElementById("targetText");
  const statusText = document.getElementById("statusText");
  const statsText = document.getElementById("statsText");
  const logDiv = document.getElementById("log");

  let target = null;
  let lastEvent = null;
  const EVENT_DEBOUNCE_SECONDS = 0.4;
  let correctCount = 0;
  let mistakeCount = 0;
  let waitingForNextTarget = false;

  function updateStats() {
    if (!statsText) return;
    statsText.textContent = `Correct: ${correctCount} • Mistakes: ${mistakeCount}`;
  }

  function log(message, level = "info") {
    if (!logDiv) return;
    logDiv.className = "log";
    if (level === "good") logDiv.classList.add("log-good");
    if (level === "warn") logDiv.classList.add("log-warn");
    if (level === "bad") logDiv.classList.add("log-bad");
    logDiv.textContent = message;
  }

  function setStatus(msg) {
    if (!statusText) return;
    statusText.innerHTML = `Status: ${msg}`;
  }

  function updateTargetDisplay() {
    if (!targetText) return;
    const stringSpan = targetText.querySelector(".string");
    const noteSpan = targetText.querySelector(".note");
    if (!stringSpan || !noteSpan) return;

    if (!target) {
      stringSpan.textContent = "-";
      noteSpan.textContent = "-";
      return;
    }

    stringSpan.textContent = "STRING " + target.string;
    noteSpan.textContent = target.pitchClass;
  }

  function setNewRandomTarget(manual) {
    target = window.Fretboard.randomTarget();
    waitingForNextTarget = false;
    updateTargetDisplay();

    const prefix = manual ? "Manual new target" : "New target";
    log(`${prefix}: STRING ${target.string} – ${target.pitchClass}`, "info");
    setStatus("Listening…");
  }

  async function handleStart() {
    try {
      log("Requesting microphone access…", "info");
      setStatus("Requesting mic permission…");

      if (triadStartBtn) triadStartBtn.disabled = false;
      if (triadStopBtn) triadStopBtn.disabled = true;
      if (tunerStartBtn) tunerStartBtn.disabled = false;
      if (tunerStopBtn) tunerStopBtn.disabled = true;

      await startAudio(onPitchDetected);

      setStatus("Listening…");
      log("Mic access granted.\nListening…", "info");
      if (startBtn) startBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;

      correctCount = 0;
      mistakeCount = 0;
      updateStats();
      if (!target) setNewRandomTarget(false);
    } catch (err) {
      console.error(err);
      log("Error accessing microphone: " + err.message, "bad");
      setStatus("Mic error. Check permissions and default input device.");
    }
  }

  function handleStop() {
    stopMicAudio();
    setStatus("Mic stopped.");
    log("Stopped listening.", "info");
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  function onPitchDetected(freq) {
    if (!target || waitingForNextTarget) return;

    const midi = window.Fretboard.freqToMidi(freq);
    if (midi == null) return;

    const roundedMidi = Math.round(midi);
    const heardName = window.Fretboard.midiToNoteName(roundedMidi);
    const heardPitchClass = window.Fretboard.pitchClassName(roundedMidi);

    const label = heardPitchClass;
    const now = performance.now() / 1000;

    if (lastEvent && lastEvent.label === label && now - lastEvent.time < EVENT_DEBOUNCE_SECONDS) return;
    lastEvent = { label, time: now };

    const msg = `Heard: ${heardName} (${freq.toFixed(1)} Hz)`;
    const correctNote = heardPitchClass === target.pitchClass;

    if (correctNote) {
      correctCount++;
      updateStats();
      log(msg + " → ✅ Correct note!", "good");
      setStatus("Nice! New note soon…");
      waitingForNextTarget = true;

      setTimeout(() => {
        if (startBtn && startBtn.disabled) setNewRandomTarget(false);
      }, 500);
    } else {
      mistakeCount++;
      updateStats();
      log(msg + " → ❌ Different note.", "bad");
      setStatus("Try again…");
      waitingForNextTarget = true;

      setTimeout(() => {
        waitingForNextTarget = false;
      }, 500);
    }
  }

  if (startBtn) startBtn.addEventListener("click", handleStart);
  if (stopBtn) stopBtn.addEventListener("click", handleStop);

  updateTargetDisplay();
  updateStats();
  log("Ready.\nClick ‘Start’ to begin.", "info");

  //
  // ---------- TUNER ----------
  //
  const tunerStartBtn = document.getElementById("tunerStartBtn");
  const tunerStopBtn = document.getElementById("tunerStopBtn");
  const tunerNoteEl = document.getElementById("tunerNote");
  const tunerFreqEl = document.getElementById("tunerFreq");
  const tunerStatusText = document.getElementById("tunerStatusText");
  const tunerStatsText = document.getElementById("tunerStatsText");
  const tunerLogDiv = document.getElementById("tunerLog");

  let tunerLastEvent = null;
  const TUNER_EVENT_DEBOUNCE_SECONDS = 0.12;

  function tunerLog(message, level = "info") {
    if (!tunerLogDiv) return;
    tunerLogDiv.className = "log";
    if (level === "good") tunerLogDiv.classList.add("log-good");
    if (level === "warn") tunerLogDiv.classList.add("log-warn");
    if (level === "bad") tunerLogDiv.classList.add("log-bad");
    tunerLogDiv.textContent = message;
  }

  function setTunerStatus(msg) {
    if (!tunerStatusText) return;
    tunerStatusText.innerHTML = `Status: ${msg}`;
  }

  function updateTunerDisplay(freq) {
    const midi = freqToNearestMidi(freq);
    if (midi == null) return;

    const noteName = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    const cents = centsOffFromMidi(freq, midi);

    if (tunerNoteEl) tunerNoteEl.textContent = `${noteName}${octave}`;
    if (tunerFreqEl) tunerFreqEl.textContent = `${freq.toFixed(1)} Hz`;

    let centsText = `${cents > 0 ? "+" : ""}${cents} cents`;
    let level = "warn";
    let status = "Adjust pitch…";

    if (Math.abs(cents) <= 5) {
      centsText = `${cents > 0 ? "+" : ""}${cents} cents · In tune`;
      level = "good";
      status = "In tune.";
    } else if (cents < 0) {
      status = "Flat. Tune up.";
    } else {
      status = "Sharp. Tune down.";
    }

    if (tunerStatsText) tunerStatsText.textContent = `Deviation: ${centsText}`;
    setTunerStatus(status);
    tunerLog(`Heard ${noteName}${octave} at ${freq.toFixed(1)} Hz`, level);
  }

  async function handleTunerStart() {
    try {
      tunerLog("Requesting microphone access…", "info");
      setTunerStatus("Requesting mic permission…");

      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      if (triadStartBtn) triadStartBtn.disabled = false;
      if (triadStopBtn) triadStopBtn.disabled = true;

      await startAudio(onTunerPitchDetected);

      if (tunerStartBtn) tunerStartBtn.disabled = true;
      if (tunerStopBtn) tunerStopBtn.disabled = false;

      setTunerStatus("Listening…");
      tunerLog("Mic access granted. Play one note at a time.", "info");
    } catch (err) {
      console.error(err);
      tunerLog("Error accessing microphone: " + err.message, "bad");
      setTunerStatus("Mic error. Check permissions and default input device.");
    }
  }

  function handleTunerStop() {
    stopMicAudio();
    if (tunerStartBtn) tunerStartBtn.disabled = false;
    if (tunerStopBtn) tunerStopBtn.disabled = true;
    setTunerStatus("Mic stopped.");
    tunerLog("Stopped listening.", "info");
    if (tunerNoteEl) tunerNoteEl.textContent = "--";
    if (tunerFreqEl) tunerFreqEl.textContent = "0.0 Hz";
    if (tunerStatsText) tunerStatsText.textContent = "Deviation: -- cents";
  }

  function onTunerPitchDetected(freq) {
    const midi = freqToNearestMidi(freq);
    if (midi == null) return;

    const label = midi;
    const now = performance.now() / 1000;
    if (tunerLastEvent && tunerLastEvent.label === label && now - tunerLastEvent.time < TUNER_EVENT_DEBOUNCE_SECONDS) {
      updateTunerDisplay(freq);
      return;
    }

    tunerLastEvent = { label, time: now };
    updateTunerDisplay(freq);
  }

  if (tunerStartBtn) tunerStartBtn.addEventListener("click", handleTunerStart);
  if (tunerStopBtn) tunerStopBtn.addEventListener("click", handleTunerStop);

  tunerLog("Tuner ready. Click ‘Start tuner’ to begin.", "info");

  //
  // ---------- METRONOME + DRONE ----------
  //
  const metroBpmEl = document.getElementById("metroBpm");
  const metroBpmValueEl = document.getElementById("metroBpmValue");
  const metroSubdivisionEl = document.getElementById("metroSubdivision");
  const metroAccentEl = document.getElementById("metroAccent");
  const droneEnabledEl = document.getElementById("droneEnabled");
  const droneNoteEl = document.getElementById("droneNote");
  const droneOctaveEl = document.getElementById("droneOctave");
  const metroStartBtn = document.getElementById("metroStartBtn");
  const metroStopBtn = document.getElementById("metroStopBtn");
  const metroBeatText = document.getElementById("metroBeatText");
  const droneNowText = document.getElementById("droneNowText");
  const metroStatusText = document.getElementById("metroStatusText");
  const metroLogDiv = document.getElementById("metroLog");

  function metroLog(message, level = "info") {
    if (!metroLogDiv) return;
    metroLogDiv.className = "log";
    if (level === "good") metroLogDiv.classList.add("log-good");
    if (level === "warn") metroLogDiv.classList.add("log-warn");
    if (level === "bad") metroLogDiv.classList.add("log-bad");
    metroLogDiv.textContent = message;
  }

  function setMetroStatus(msg) {
    if (!metroStatusText) return;
    metroStatusText.innerHTML = `Status: ${msg}`;
  }

  function getDroneLabel() {
    const note = droneNoteEl ? droneNoteEl.value : "C";
    const octave = droneOctaveEl ? droneOctaveEl.value : "3";
    return `${note}${octave}`;
  }

  function getDroneFrequency() {
    const note = droneNoteEl ? droneNoteEl.value : "C";
    const octave = droneOctaveEl ? parseInt(droneOctaveEl.value, 10) : 3;
    const midi = noteOctaveToMidi(note, octave);
    return midiToFreq(midi);
  }

  function updateMetronomeReadout() {
    if (metroBpmValueEl && metroBpmEl) {
      metroBpmValueEl.textContent = metroBpmEl.value;
    }

    if (droneNowText) {
      if (droneEnabledEl && droneEnabledEl.checked) {
        droneNowText.textContent = `Drone: ${getDroneLabel()}`;
      } else {
        droneNowText.textContent = "Drone: Off";
      }
    }
  }

  function restartMetronomeIfRunning() {
    if (metroStartBtn && metroStartBtn.disabled) {
      startMetronomeAndDrone();
    }
  }

  async function startMetronomeAndDrone() {
    try {
      await ensurePlaybackContextRunning();
      stopMetronomePlayback();

      const bpm = metroBpmEl ? parseInt(metroBpmEl.value, 10) : 90;
      const subdivision = metroSubdivisionEl ? parseInt(metroSubdivisionEl.value, 10) : 1;
      const accentBeat1 = !!(metroAccentEl && metroAccentEl.checked);

      const intervalMs = 60000 / (bpm * subdivision);
      metronomeStep = 0;

      if (droneEnabledEl && droneEnabledEl.checked) {
        startDrone(getDroneFrequency());
      } else {
        stopDrone();
      }

      metronomeIntervalId = setInterval(() => {
        const stepInBar = metronomeStep % (4 * subdivision);
        const isDownbeat = stepInBar === 0;
        const isQuarterBoundary = stepInBar % subdivision === 0;
        const beatNumber = Math.floor(stepInBar / subdivision) + 1;

        playClick(accentBeat1 ? isDownbeat : isQuarterBoundary);

        if (metroBeatText) {
          metroBeatText.textContent = String(beatNumber);
        }

        metronomeStep++;
      }, intervalMs);

      if (metroStartBtn) metroStartBtn.disabled = true;
      if (metroStopBtn) metroStopBtn.disabled = false;

      updateMetronomeReadout();
      setMetroStatus("Running.");
      metroLog(
        `Metronome running at ${bpm} BPM${droneEnabledEl && droneEnabledEl.checked ? ` with drone ${getDroneLabel()}` : ""}.`,
        "good"
      );
    } catch (err) {
      console.error(err);
      metroLog("Could not start playback: " + err.message, "bad");
      setMetroStatus("Playback error.");
    }
  }

  function stopMetronomeAndDrone() {
    stopMetronomePlayback();
    if (metroStartBtn) metroStartBtn.disabled = false;
    if (metroStopBtn) metroStopBtn.disabled = true;
    if (metroBeatText) metroBeatText.textContent = "1";
    updateMetronomeReadout();
    setMetroStatus("Stopped.");
    metroLog("Metronome stopped.", "info");
  }

  if (metroBpmEl) {
    metroBpmEl.addEventListener("input", () => {
      updateMetronomeReadout();
      restartMetronomeIfRunning();
    });
  }

  if (metroSubdivisionEl) {
    metroSubdivisionEl.addEventListener("change", restartMetronomeIfRunning);
  }

  if (metroAccentEl) {
    metroAccentEl.addEventListener("change", restartMetronomeIfRunning);
  }

  if (droneEnabledEl) {
    droneEnabledEl.addEventListener("change", () => {
      updateMetronomeReadout();
      restartMetronomeIfRunning();
    });
  }

  if (droneNoteEl) {
    droneNoteEl.addEventListener("change", () => {
      updateMetronomeReadout();
      if (droneOsc && droneEnabledEl && droneEnabledEl.checked) {
        updateDroneFrequency(getDroneFrequency());
      }
    });
  }

  if (droneOctaveEl) {
    droneOctaveEl.addEventListener("change", () => {
      updateMetronomeReadout();
      if (droneOsc && droneEnabledEl && droneEnabledEl.checked) {
        updateDroneFrequency(getDroneFrequency());
      }
    });
  }

  if (metroStartBtn) metroStartBtn.addEventListener("click", startMetronomeAndDrone);
  if (metroStopBtn) metroStopBtn.addEventListener("click", stopMetronomeAndDrone);

  updateMetronomeReadout();
  metroLog("Metronome ready. Click ‘Start metronome’ to begin.", "info");

  //
  // ---------- TRIAD TRAINER ----------
  //
  const triadStartBtn = document.getElementById("triadStartBtn");
  const triadStopBtn = document.getElementById("triadStopBtn");
  const triadTargetText = document.getElementById("triadTargetText");
  const triadStatusText = document.getElementById("triadStatusText");
  const triadStatsText = document.getElementById("triadStatsText");
  const triadLogDiv = document.getElementById("triadLog");
  const triadLightsEl = document.getElementById("triadLights");

  const qualMajorEl = document.getElementById("qualMajor");
  const qualMinorEl = document.getElementById("qualMinor");

  const TRIAD_EVENT_DEBOUNCE_SECONDS = 0.4;
  let triadLastEvent = null;

  let triadTrainer = null;
  let currentTriad = null;
  let triadSession = null;
  let triadCorrectCount = 0;
  let triadFailCount = 0;
  let currentString = null;

  function triadLog(message, level = "info") {
    if (!triadLogDiv) return;
    triadLogDiv.className = "log";
    if (level === "good") triadLogDiv.classList.add("log-good");
    if (level === "warn") triadLogDiv.classList.add("log-warn");
    if (level === "bad") triadLogDiv.classList.add("log-bad");
    triadLogDiv.textContent = message;
  }

  function setTriadStatus(msg) {
    if (!triadStatusText) return;
    triadStatusText.innerHTML = `Status: ${msg}`;
  }

  function updateTriadStats() {
    if (!triadStatsText) return;
    triadStatsText.textContent = `Correct triads: ${triadCorrectCount} • Failed triads: ${triadFailCount}`;
  }

  function updateTriadTargetDisplay() {
    if (!triadTargetText) return;
    const labelSpan = triadTargetText.querySelector(".triad-label");
    if (!labelSpan) return;

    if (!currentTriad || currentString == null) labelSpan.textContent = "–";
    else labelSpan.textContent = `${currentTriad.label()} on string ${currentString}`;
  }

  function getAllowedQualities() {
    const q = [];

    if (!qualMajorEl && !qualMinorEl) return [window.Triads.TriadQuality.MAJOR];

    if (qualMajorEl?.checked) q.push(window.Triads.TriadQuality.MAJOR);
    if (qualMinorEl?.checked) q.push(window.Triads.TriadQuality.MINOR);

    if (q.length === 0) return [window.Triads.TriadQuality.MAJOR];
    return q;
  }

  function ensureTriadTrainer() {
    triadTrainer = new window.Triads.TriadTrainer({
      allowedQualities: getAllowedQualities(),
    });
  }

  function getSeq(session, res) {
    return (res && res.expectedSequence) || session.expectedSequence || session.expected || [];
  }

  function notePrompt(seq, index0) {
    const n = seq[index0] || "?";
    return `Note ${index0 + 1}: ${n}`;
  }

  function renderLights(matchedCount, total = 3) {
    if (!triadLightsEl) return;
    if (window.Triads?.TriadsProgress?.render) {
      window.Triads.TriadsProgress.render(triadLightsEl, matchedCount, total);
    }
  }

  function newTriad(manual) {
    ensureTriadTrainer();

    const question = triadTrainer.nextQuestion();
    currentTriad = question.triad;
    currentString = question.string;

    triadSession = new window.Triads.TriadSequenceSession(currentTriad, {
      resetOnWrong: true,
      dedupeMs: 180,
      countNonChordTonesAsError: true
    });

    triadLastEvent = null;
    updateTriadTargetDisplay();

    const prefix = manual ? "Manual new triad" : "New triad";
    triadLog(`${prefix}: ${currentTriad.label()} on string ${currentString}`, "info");

    const seq = getSeq(triadSession, null);
    setTriadStatus(`Listening… ${notePrompt(seq, 0)}`);
    renderLights(0, 3);
  }

  async function handleTriadStart() {
    try {
      triadLog("Requesting microphone access…", "info");
      setTriadStatus("Requesting mic permission…");

      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      if (tunerStartBtn) tunerStartBtn.disabled = false;
      if (tunerStopBtn) tunerStopBtn.disabled = true;

      await startAudio(onTriadPitchDetected);

      triadLog("Mic access granted.\nListening…", "info");
      if (triadStartBtn) triadStartBtn.disabled = true;
      if (triadStopBtn) triadStopBtn.disabled = false;

      triadCorrectCount = 0;
      triadFailCount = 0;
      updateTriadStats();

      newTriad(false);
    } catch (err) {
      console.error(err);
      triadLog("Error accessing microphone: " + err.message, "bad");
      setTriadStatus("Mic error. Check permissions and default input device.");
    }
  }

  function handleTriadStop() {
    stopMicAudio();
    setTriadStatus("Mic stopped.");
    triadLog("Stopped listening.", "info");
    if (triadStartBtn) triadStartBtn.disabled = false;
    if (triadStopBtn) triadStopBtn.disabled = true;
  }

  function onTriadPitchDetected(freq) {
    if (!currentTriad || !triadSession) return;

    const midi = window.Fretboard.freqToMidi(freq);
    if (midi == null) return;

    const roundedMidi = Math.round(midi);
    const heardName = window.Fretboard.midiToNoteName(roundedMidi);
    const heardPitchClass = window.Fretboard.pitchClassName(roundedMidi);

    const label = heardPitchClass;
    const now = performance.now() / 1000;

    if (triadLastEvent && triadLastEvent.label === label && now - triadLastEvent.time < TRIAD_EVENT_DEBOUNCE_SECONDS) {
      return;
    }
    triadLastEvent = { label, time: now };

    const res = triadSession.acceptNote(heardPitchClass);
    if (res && res.ignored) return;

    const msg = `Heard: ${heardName} (${freq.toFixed(1)} Hz)`;

    if (res.correct) triadLog(msg + " → ✅ Correct.", "good");
    else triadLog(msg + " → ❌ Wrong.", "bad");

    const seq = getSeq(triadSession, res);
    renderLights(res.matchedCount || 0, 3);

    if (res.reset) {
      triadFailCount++;
      updateTriadStats();
      setTriadStatus(`Wrong note. Restart — ${notePrompt(seq, 0)}`);
      renderLights(0, 3);
      return;
    }

    if (res.status === "success") {
      triadCorrectCount++;
      updateTriadStats();
      setTriadStatus("🎉 Triad complete! New triad coming…");
      renderLights(3, 3);

      setTimeout(() => {
        if (triadStartBtn && triadStartBtn.disabled) newTriad(false);
      }, 600);
      return;
    }

    const matched = typeof res.matchedCount === "number" ? res.matchedCount : 0;
    const nextIndex = Math.min(matched, 2);
    setTriadStatus(`Listening… ${notePrompt(seq, nextIndex)}`);
  }

  [qualMajorEl, qualMinorEl].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", () => {
      if (qualMajorEl && qualMinorEl && !qualMajorEl.checked && !qualMinorEl.checked) {
        qualMajorEl.checked = true;
      }
      if (triadStartBtn && triadStartBtn.disabled) {
        newTriad(true);
      }
    });
  });

  if (triadStartBtn) triadStartBtn.addEventListener("click", handleTriadStart);
  if (triadStopBtn) triadStopBtn.addEventListener("click", handleTriadStop);

  updateTriadTargetDisplay();
  updateTriadStats();
  triadLog("Triad trainer ready. Click ‘Start’ to begin.", "info");

  //
  // -------- Cleanup on page hide --------
  //
  window.addEventListener("beforeunload", () => {
    try { stopMicAudio(); } catch (_) {}
    try { stopMetronomePlayback(); } catch (_) {}
  });
})();