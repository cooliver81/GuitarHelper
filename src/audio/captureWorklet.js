// AudioWorklet: collects input samples into hops and posts them to the main thread.
// Runs on the audio thread; keep it tiny. Pitch detection happens in pitch.js.

const HOP = 1024;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffers = [new Float32Array(HOP), new Float32Array(HOP)];
    this.fill = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const n = input[0].length;
    for (let i = 0; i < n; i++) {
      this.buffers[0][this.fill] = input[0][i];
      this.buffers[1][this.fill] = (input[1] || input[0])[i];
      this.fill++;
      if (this.fill === HOP) {
        // currentTime is the context time at the end of this render quantum.
        this.port.postMessage({ ch: [this.buffers[0].slice(), this.buffers[1].slice()], time: currentTime });
        this.fill = 0;
      }
    }
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
