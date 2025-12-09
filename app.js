// app.js
(function () {
  //
  // -------- Shared helper: audio start with fresh callback --------
  //
  async function startAudio(callback) {
    // Always stop first so we can safely change callbacks / modes
    window.AudioEngine.stop();
    await window.AudioEngine.start(callback);
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

  let target = null; // {string, fret, midi, pitchClass, fullName}
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

      // Make sure triad trainer is stopped UI-wise
      if (triadStartBtn) triadStartBtn.disabled = false;
      if (triadStopBtn) triadStopBtn.disabled = true;

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
      setStatus("Mic error.\nCheck permissions and default input device.");
    }
  }

  function handleStop() {
    window.AudioEngine.stop();
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

    // Debounce by pitch class so the same note doesn't spam
    const label = heardPitchClass;
    const now = performance.now() / 1000;

    if (
      lastEvent &&
      lastEvent.label === label &&
      now - lastEvent.time < EVENT_DEBOUNCE_SECONDS
    ) {
      return;
    }

    lastEvent = { label, time: now };

    const msg = `Heard: ${heardName} (${freq.toFixed(1)} Hz)`;
    const correctNote = target && heardPitchClass === target.pitchClass;

    if (correctNote) {
      correctCount++;
      updateStats();
      log(msg + " → ✅ Correct note!", "good");
      setStatus("Nice! New note soon…");
      waitingForNextTarget = true;

      setTimeout(() => {
        if (startBtn && startBtn.disabled) {
          setNewRandomTarget(false);
        }
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
  // ---------- TRIAD TRAINER ----------
  //

  const triadStartBtn = document.getElementById("triadStartBtn");
  const triadStopBtn = document.getElementById("triadStopBtn");
  const triadTargetText = document.getElementById("triadTargetText");
  const triadStatusText = document.getElementById("triadStatusText");
  const triadStatsText = document.getElementById("triadStatsText");
  const triadLogDiv = document.getElementById("triadLog");

  const TRIAD_EVENT_DEBOUNCE_SECONDS = 0.4;
  let triadLastEvent = null;

  let triadTrainer = null;
  let currentTriad = null;
  let triadSession = null;
  let triadCorrectCount = 0; // triads answered correctly
  let triadFailCount = 0;    // triads failed (too many wrong notes)
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
    triadStatsText.textContent =
      `Correct triads: ${triadCorrectCount} • Failed triads: ${triadFailCount}`;
  }

  function updateTriadTargetDisplay() {
    if (!triadTargetText) return;

    const labelSpan = triadTargetText.querySelector(".triad-label");
    if (!labelSpan) return;

    if (!currentTriad || currentString == null) {
      labelSpan.textContent = "–";
    } else {
      labelSpan.textContent = `${currentTriad.label()} on string ${currentString}`;
    }
  }

  function ensureTriadTrainer() {
    if (!triadTrainer) {
      triadTrainer = new window.Triads.TriadTrainer({
        // for now: all 12 roots, major only, all inversions
      });
    }
  }

  // Create a new triad + session
  function newTriad(manual) {
    ensureTriadTrainer();

    const question = triadTrainer.nextQuestion();
    currentTriad = question.triad;
    currentString = question.string;

    triadSession = new window.Triads.TriadSequenceSession(currentTriad, {
      maxErrors: 1
    });

    triadLastEvent = null;
    updateTriadTargetDisplay();

    const prefix = manual ? "Manual new triad" : "New triad";
    triadLog(`${prefix}: ${currentTriad.label()} on string ${currentString}`, "info");
    setTriadStatus("Listening… Play the three notes in order.");
  }

  async function handleTriadStart() {
    try {
      triadLog("Requesting microphone access…", "info");
      setTriadStatus("Requesting mic permission…");

      // Make sure single-note trainer is “stopped” UI-wise
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;

      await startAudio(onTriadPitchDetected);

      setTriadStatus("Listening…");
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
      setTriadStatus("Mic error.\nCheck permissions and default input device.");
    }
  }

  function handleTriadStop() {
    window.AudioEngine.stop();
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

    if (
      triadLastEvent &&
      triadLastEvent.label === label &&
      now - triadLastEvent.time < TRIAD_EVENT_DEBOUNCE_SECONDS
    ) {
      return;
    }

    triadLastEvent = { label, time: now };

    // We pass the pitch class; TriadSequenceSession ignores octave.
    const res = triadSession.acceptNote(heardPitchClass);
    const msg = `Heard: ${heardName} (${freq.toFixed(1)} Hz)`;

    if (res.correct) {
      triadLog(msg + " → ✅ Correct note in sequence.", "good");
    } else {
      triadLog(msg + " → ❌ Not the expected note.", "bad");
    }

    if (res.status === "pending") {
      if (res.expectedNote) {
        setTriadStatus(`Next target note: ${res.expectedNote}`);
      } else {
        setTriadStatus("Listening…");
      }
    } else if (res.status === "success") {
      triadCorrectCount++;
      updateTriadStats();
      setTriadStatus("Triad complete! New triad coming…");

      setTimeout(() => {
        if (triadStartBtn && triadStartBtn.disabled) {
          newTriad(false);
        }
      }, 600);
    } else if (res.status === "fail") {
      triadFailCount++;
      updateTriadStats();
      setTriadStatus("Too many wrong notes. New triad coming…");

      setTimeout(() => {
        if (triadStartBtn && triadStartBtn.disabled) {
          newTriad(false);
        }
      }, 600);
    }
  }

  if (triadStartBtn) triadStartBtn.addEventListener("click", handleTriadStart);
  if (triadStopBtn) triadStopBtn.addEventListener("click", handleTriadStop);

  updateTriadTargetDisplay();
  updateTriadStats();
  triadLog("Triad trainer ready. Click ‘Start’ to begin.", "info");
})();
