// Look-ahead scheduler ("A Tale of Two Clocks", Chris Wilson): a timer wakes up every
// 25 ms and schedules every step due in the next 120 ms on the AudioContext clock.
// Sounds land sample-accurately even when the timer itself is late. The timer runs in
// a Worker so a background tab doesn't throttle it to once a second.

const TICK_MS = 25;
const LOOKAHEAD = 0.12;

function makeTicker(fn) {
  try {
    const src = `let id=null;onmessage=e=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    w.onmessage = fn;
    return { start: () => w.postMessage(TICK_MS), stop: () => w.postMessage(0) };
  } catch {
    let id = null;
    return { start: () => { id = setInterval(fn, TICK_MS); }, stop: () => clearInterval(id) };
  }
}

export class Clock {
  // onStep({ step, beat, sub, time, dur }) is called once per step, ahead of time.
  constructor(ctx, onStep) {
    this.ctx = ctx;
    this.onStep = onStep;
    this.running = false;
    this.ticker = makeTicker(() => this._tick());
    this.params = { bpm: 90, stepsPerBeat: 1, swing: 0.5 };
  }

  // swing: share of the beat taken by the first 8th note (0.5 straight, 0.67 triplet feel).
  start(params = {}) {
    this.set(params);
    this.step = 0;
    this.beat = 0;
    this.sub = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.running = true;
    this.ticker.start();
    this._tick();
  }

  // Tempo, subdivision and swing changes apply from the next step, without a restart.
  set(params) {
    this.params = { ...this.params, ...params };
  }

  stop() {
    this.running = false;
    this.ticker.stop();
  }

  _stepDur() {
    const { bpm, stepsPerBeat, swing } = this.params;
    const beatDur = 60 / bpm;
    if (stepsPerBeat === 2 && swing !== 0.5) return this.sub === 0 ? beatDur * swing : beatDur * (1 - swing);
    return beatDur / stepsPerBeat;
  }

  _tick() {
    if (!this.running) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (this.nextTime < horizon) {
      const dur = this._stepDur();
      this.onStep({ step: this.step, beat: this.beat, sub: this.sub, time: this.nextTime, dur });
      this.nextTime += dur;
      this.step++;
      this.sub++;
      if (this.sub >= this.params.stepsPerBeat) {
        this.sub = 0;
        this.beat++;
      }
    }
  }
}
