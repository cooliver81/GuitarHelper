// Microphone input shared by every listening tool. One tool "owns" the mic at a time;
// starting another tool hands it over and tells the previous one (so its UI resets).
//
// Browser voice processing (noise suppression, auto gain) is switched off: it is built
// for speech and treats a sustained guitar note as noise to remove.

import { audioContext, resumeAudio } from "./context.js";
import { detectPitch, pickChannel, rms } from "./pitch.js";
import { NoteGate } from "./noteGate.js";
import { freqToMidi } from "../theory/notes.js";
import { settings } from "../store.js";

const WINDOW = 2048;
const HOP = 1024;

let graph = null;   // { stream, source, node, sink, echo }
let owner = null;   // { id, onNote, onReading, onStop }
let cfg = settings();
let workletLoaded = false;
const ring = [new Float32Array(WINDOW), new Float32Array(WINDOW)];
let gate = new NoteGate({ sustainMs: cfg.sustainMs });

export function applySettings() {
  cfg = settings();
  gate = new NoteGate({ sustainMs: cfg.sustainMs });
}

export function micOwnerId() {
  return owner ? owner.id : null;
}

// newOwner: { id, onNote?(note), onReading?(reading), onStop?(reason) }
export async function startMic(newOwner) {
  const ctx = await resumeAudio();
  if (owner && owner.id !== newOwner.id) {
    const prev = owner;
    owner = null;
    prev.onStop && prev.onStop("Another tool is using the mic.");
  }
  owner = newOwner;
  gate.reset();
  if (graph && graph.echo !== cfg.echoCancellation) teardown();
  if (!graph) await setup(ctx);
}

export function stopMic(id) {
  if (!owner || (id != null && owner.id !== id)) return;
  owner = null;
  teardown();
}

async function setup(ctx) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: cfg.echoCancellation,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
    },
  });
  const source = ctx.createMediaStreamSource(stream);
  // Nodes need a path to the speakers to be processed; this one is silent.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sink.connect(ctx.destination);

  let node;
  if (ctx.audioWorklet && window.AudioWorkletNode) {
    if (!workletLoaded) {
      await ctx.audioWorklet.addModule(new URL("./captureWorklet.js", import.meta.url));
      workletLoaded = true;
    }
    node = new AudioWorkletNode(ctx, "capture-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
    });
    node.port.onmessage = (e) => onHop(e.data.ch[0], e.data.ch[1], e.data.time);
  } else {
    // Older Safari: deprecated ScriptProcessorNode, same hop size.
    node = ctx.createScriptProcessor(HOP, 2, 1);
    node.onaudioprocess = (e) => {
      const b = e.inputBuffer;
      onHop(b.getChannelData(0).slice(), (b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0)).slice(), ctx.currentTime);
    };
  }
  source.connect(node);
  node.connect(sink);
  graph = { stream, source, node, sink, echo: cfg.echoCancellation };
}

function teardown() {
  if (!graph) return;
  try { graph.source.disconnect(); } catch { /* already gone */ }
  try { graph.node.disconnect(); } catch { /* already gone */ }
  if (graph.node.port) graph.node.port.onmessage = null;
  else graph.node.onaudioprocess = null;
  graph.stream.getTracks().forEach((t) => t.stop());
  graph = null;
  gate.reset();
}

function onHop(ch0, ch1, time) {
  if (!owner) return;
  for (const [i, hop] of [ch0, ch1].entries()) {
    ring[i].copyWithin(0, hop.length);
    ring[i].set(hop, WINDOW - hop.length);
  }
  const ctx = audioContext();
  const win = pickChannel([ring[0], ring[1]], cfg.channel);
  const level = rms(win);
  const r = detectPitch(win, ctx.sampleRate, { minRms: cfg.sensitivity });
  const hopMs = (ch0.length / ctx.sampleRate) * 1000;

  let reading = null;
  if (r) {
    const exact = freqToMidi(r.freq, cfg.a4);
    const midi = Math.round(exact);
    reading = { freq: r.freq, clarity: r.clarity, midi, cents: (exact - midi) * 100 };
  }
  owner.onReading && owner.onReading({ ...(reading || {}), level, hasPitch: !!reading, time });

  const ev = gate.push(reading, hopMs, time * 1000);
  if (ev && owner && owner.onNote) {
    const exact = freqToMidi(ev.freq, cfg.a4);
    const midi = Math.round(exact);
    // Onset: start of the stable stretch, minus half the analysis window.
    const onset = ev.onsetMs / 1000 - WINDOW / ctx.sampleRate / 2;
    owner.onNote({ freq: ev.freq, midi, cents: (exact - midi) * 100, onset });
  }
}

window.addEventListener("pagehide", () => stopMic());
