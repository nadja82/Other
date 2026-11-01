import { RASTERS, quantizeTick, makeNote, clampPitch, clamp } from './model.js';

export class Recorder {
  constructor(project) {
    this.project = project;
    this.armedSlot = null;
    this.recording = false;
    this.overdub = false;
    this._open = new Map();
    this._recordStartTick = 0;
    this._countInTicks = 0;
    this._countingIn = false;
  }

  arm(slotId) {
    this.armedSlot = this.project.slots[slotId] || null;
    this._open.clear();
  }

  disarm() {
    this.armedSlot = null;
    this.recording = false;
    this._countingIn = false;
    this._open.clear();
  }

  startRecording(currentTick) {
    if (!this.armedSlot) return false;
    this._recordStartTick = currentTick;
    this._countInTicks = this.project.countIn * 6;
    this._countingIn = this._countInTicks > 0;
    this.recording = true;
    this._open.clear();
    return true;
  }

  stopRecording() {
    if (!this.recording) return null;
    this.recording = false;
    this._countingIn = false;
    const slot = this.armedSlot;
    const raster = RASTERS[this.project.quantize] || null;
    const base = this._recordStartTick + this._countInTicks;
    const notes = [];
    for (const [key, on] of this._open) {
      const off = on.offTick != null ? on.offTick : base + (on.defaultLen || 6);
      const tick = quantizeTick(on.tick - base, raster);
      const end = quantizeTick(off - base, raster);
      notes.push(makeNote(tick, on.pitch, on.velocity, Math.max(1, end - tick)));
    }
    this._open.clear();
    if (!this.overdub) slot.notes = [];
    slot.notes.push(...notes);
    slot.notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
    slot.length = Math.max(slot.loopEnd, ...notes.map((n) => n.tick + n.length), slot.length);
    if (slot.loopEnd <= slot.loopStart) slot.loopEnd = slot.length;
    return slot;
  }

  handleNoteOn(tick, channel, pitch, velocity) {
    if (!this.recording || !this.armedSlot) return;
    if (this._countingIn) return;
    if (channel !== this.armedSlot.recordChannel) return;
    if (velocity === 0) return this.handleNoteOff(tick, channel, pitch);
    const key = `${channel}:${pitch}`;
    if (this._open.has(key)) this._closeNote(tick, key);
    this._open.set(key, { tick, pitch, velocity, offTick: null });
  }

  handleNoteOff(tick, channel, pitch) {
    if (!this.recording || !this.armedSlot) return;
    if (this._countingIn) return;
    if (channel !== this.armedSlot.recordChannel) return;
    this._closeNote(tick, `${channel}:${pitch}`);
  }

  _closeNote(tick, key) {
    const on = this._open.get(key);
    if (on) {
      on.offTick = tick;
      on.defaultLen = Math.max(1, tick - on.tick);
    }
  }

  onClockTick(tick) {
    if (!this.recording) return;
    if (this._countingIn && tick - this._recordStartTick >= this._countInTicks) {
      this._countingIn = false;
    }
  }
}

export function clampChannel(c) {
  return clamp(Math.round(c), 1, 16);
}

export { clampPitch };
