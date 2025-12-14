// app.js
(function () {
  //
  // -------- Shared helper: audio start with fresh callback --------
  //
  async function startAudio(callback) {
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

      // Stop triad UI
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
      setStatus("Mic error. Check permissions and default input device.");
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

      setTimeout(() => { waitingForNextTarget = false; }, 500);
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
  const triadLightsEl = document.getElementById("triadLights");

  // NEW: quality toggles
  const qualMajorEl = document.getElementById("qualMajor");
  const qualMinorEl = document.getElementById("qualMinor");

  const TRIAD_EVENT_DEBOUNCE_SECONDS = 0.4;
  let triadLastEvent = null;

  let triadTrainer = null;
  let currentTriad = null;
  let triadSession = null;
  let triadCorrectCount = 0;
  let triadFailCount = 0; // wrong note resets
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

    // If toggles missing, default major only
    if (!qualMajorEl && !qualMinorEl) return [window.Triads.TriadQuality.MAJOR];

    if (qualMajorEl?.checked) q.push(window.Triads.TriadQuality.MAJOR);
    if (qualMinorEl?.checked) q.push(window.Triads.TriadQuality.MINOR);

    // Never allow empty
    if (q.length === 0) return [window.Triads.TriadQuality.MAJOR];
    return q;
  }

  function ensureTriadTrainer() {
    triadTrainer = new window.Triads.TriadTrainer({
      allowedQualities: getAllowedQualities(),
      // keep defaults for roots + inversions unless you want more controls later
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

      // Stop single-note UI
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;

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

    // UI debounce to avoid spam
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

    // update dots (optional)
    renderLights(res.matchedCount || 0, 3);

    // wrong note resets attempt, SAME triad
    if (res.reset) {
      triadFailCount++;
      updateTriadStats();
      setTriadStatus(`Wrong note. Restart — ${notePrompt(seq, 0)}`);
      renderLights(0, 3);
      return;
    }

    // success => new triad
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

    // pending => show next note number
    const matched = typeof res.matchedCount === "number" ? res.matchedCount : 0;
    const nextIndex = Math.min(matched, 2);
    setTriadStatus(`Listening… ${notePrompt(seq, nextIndex)}`);
  }

  // Apply toggle changes live (if triad trainer running, immediately refresh triad)
  [qualMajorEl, qualMinorEl].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", () => {
      // keep at least one checked (UI safety)
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
})();
