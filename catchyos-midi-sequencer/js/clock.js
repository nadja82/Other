import { PPQN, msToTicks, clamp } from './model.js';

const CLOCK = 0xf8;
const START = 0xfa;
const CONTINUE = 0xfb;
const STOP = 0xfc;
const SPP = 0xf2;

export class ClockEngine {
  constructor({ onTick, onStart, onStop, onBpm } = {}) {
    this.tick = 0;
    this.running = false;
    this.source = 'external';
    this.bpm = 120;
    this.onTick = onTick || (() => {});
    this.onStart = onStart || (() => {});
    this.onStop = onStop || (() => {});
    this.onBpm = onBpm || (() => {});
    this._pulseTimes = [];
    this._timer = null;
    this._lastTimerTime = 0;
  }

  setSource(source, bpm) {
    this.source = source;
    if (bpm) this.bpm = clamp(bpm, 20, 400);
    if (source === 'internal') this._startInternalTimer();
    else this._stopInternalTimer();
  }

  handleMidi(data) {
    const status = data[0];
    if (status === CLOCK) {
      this._pulse();
    } else if (status === START) {
      this.tick = 0;
      this._beginRun();
    } else if (status === CONTINUE) {
      this._beginRun();
    } else if (status === STOP) {
      this._endRun();
    } else if (status === SPP) {
      const pos = ((data[2] & 0x7f) << 7) | (data[1] & 0x7f);
      this.tick = pos * 6;
    }
  }

  _pulse() {
    if (!this.running) this._beginRun();
    this.tick += 1;
    this._trackBpm();
    this.onTick(this.tick);
  }

  _beginRun() {
    if (this.running) return;
    this.running = true;
    this._pulseTimes = [];
    if (this.source === 'internal') this._startInternalTimer();
    this.onStart();
  }

  _endRun() {
    if (!this.running) return;
    this.running = false;
    if (this.source === 'internal') this._stopInternalTimer();
    this.onStop();
  }

  _trackBpm() {
    const now = performance.now();
    this._pulseTimes.push(now);
    if (this._pulseTimes.length > PPQN) this._pulseTimes.shift();
    if (this._pulseTimes.length === PPQN) {
      const span = now - this._pulseTimes[0];
      if (span > 0) {
        const bpm = (PPQN / span) * 60000;
        this.bpm = clamp(bpm, 20, 400);
        this.onBpm(this.bpm);
      }
    }
  }

  _startInternalTimer() {
    this._stopInternalTimer();
    this._lastTimerTime = performance.now();
    const intervalMs = (60000 / this.bpm) / PPQN;
    this._timer = setInterval(() => {
      const now = performance.now();
      const elapsed = now - this._lastTimerTime;
      this._lastTimerTime = now;
      const bpm = this.bpm;
      let due = msToTicks(elapsed, bpm);
      let guard = 0;
      while (due >= 1 && guard++ < 64) {
        this.tick += 1;
        due -= 1;
        this.onTick(this.tick);
      }
    }, Math.max(1, (60000 / this.bpm) / PPQN / 2));
  }

  _stopInternalTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  reset() {
    this.tick = 0;
    this._endRun();
    this._pulseTimes = [];
  }
}
