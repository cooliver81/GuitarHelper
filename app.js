// app.js

(function () {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const targetText = document.getElementById("targetText");
  const statusText = document.getElementById("statusText");
  const statsText = document.getElementById("statsText");
  const logDiv = document.getElementById("log");

  let target = null;          // {string, fret, midi, pitchClass, fullName}
  let lastEvent = null;
  const EVENT_DEBOUNCE_SECONDS = 0.4;

  let correctCount = 0;
  let mistakeCount = 0;
  let waitingForNextTarget = false;

  function updateStats() {
    statsText.textContent = `Correct: ${correctCount} • Mistakes: ${mistakeCount}`;
  }

  function log(message, level = "info") {
    logDiv.className = "log";
    if (level === "good") logDiv.classList.add("log-good");
    if (level === "warn") logDiv.classList.add("log-warn");
    if (level === "bad") logDiv.classList.add("log-bad");
    logDiv.textContent = message;
  }

  function setStatus(msg) {
    statusText.innerHTML = `<span class="label">Status:</span> ${msg}`;
  }

  function updateTargetDisplay() {
    const stringSpan = targetText.querySelector(".string");
    const noteSpan = targetText.querySelector(".note");

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

      await window.AudioEngine.start(onPitchDetected);

      setStatus("Listening…");
      log("Mic access granted. Listening…", "info");

      startBtn.disabled = true;
      stopBtn.disabled = false;

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
    window.AudioEngine.stop();
    setStatus("Mic stopped.");
    log("Stopped listening.", "info");

    startBtn.disabled = false;
    stopBtn.disabled = true;
  }

  function onPitchDetected(freq) {
    if (!target || waitingForNextTarget) return;

    // Convert frequency to fractional MIDI
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

    // ✅ NEW: only check pitch class (note name), ignore octave & string
    const correctNote = target && heardPitchClass === target.pitchClass;

    if (correctNote) {
      correctCount++;
      updateStats();

      log(msg + " → ✅ Correct note!", "good");
      setStatus("Nice! New note soon…");
      waitingForNextTarget = true;

      setTimeout(() => {
        if (startBtn.disabled) {
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

  startBtn.addEventListener("click", handleStart);
  stopBtn.addEventListener("click", handleStop);

  // Initial state
  updateTargetDisplay();
  updateStats();
  log("Ready. Click ‘Start’ to begin.", "info");
})();
