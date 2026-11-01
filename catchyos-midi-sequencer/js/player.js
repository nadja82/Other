import { clamp, clampPitch } from './model.js';

const LOOKAHEAD_TICKS = 3;

export class Player {
  constructor(project, sendFn) {
    this.project = project;
    this.send = sendFn;
    this.playing = false;
    this._scheduled = new Map();
    this._lastTick = -1;
  }

  start() {
    this.playing = true;
    this._lastTick = -1;
  }

  stop() {
    this.playing = false;
    for (const key of this._scheduled.keys()) this._allOff(key);
    this._scheduled.clear();
    for (const slot of this.project.slots) slot._schedUntil = null;
  }

  onTick(tick) {
    if (!this.playing) return;
    if (tick <= this._lastTick) {
      this._lastTick = tick;
      for (const slot of this.project.slots) slot._schedUntil = null;
      return;
    }
    const first = this._lastTick === -1;
    this._lastTick = tick;
    const from = first ? tick : tick + 1;
    for (let t = from; t <= tick + LOOKAHEAD_TICKS; t++) {
      this._scheduleTick(t);
    }
  }

  _slotDueTick(slot, tick) {
    const due = slot._schedUntil == null ? -1 : slot._schedUntil;
    if (tick <= due) return false;
    slot._schedUntil = tick;
    return true;
  }

  _scheduleTick(tick) {
    const slots = this.project.slots;
    const anySolo = slots.some((s) => s.solo);
    for (const slot of slots) {
      if (slot.muted) continue;
      if (anySolo && !slot.solo) continue;
      if (slot.notes.length === 0) continue;
      const loopLen = slot.loopEnd - slot.loopStart;
      if (loopLen <= 0) continue;
      let pos;
      if (tick < slot.loopStart) continue;
      if (slot.loopMode === 'once' && tick >= slot.loopEnd) continue;
      if (!this._slotDueTick(slot, tick)) continue;
      pos = slot.loopStart + ((tick - slot.loopStart) % loopLen + loopLen) % loopLen;
      const applied = this._applySwing(pos, slot);
      for (const n of slot.notes) {
        if (n.tick === pos) this._noteOn(slot, n, tick);
        const offPos = n.tick + n.length;
        if (offPos === pos) this._noteOff(slot, n, tick);
      }
      if (slot.loopMode === 'once' && tick >= slot.loopEnd) this._allOffSlot(slot);
    }
  }

  _applySwing(pos, slot) {
    const s = slot.swing;
    if (!s) return pos;
    const eighth = 12;
    const idx = Math.floor((pos - slot.loopStart) / eighth);
    if (idx % 2 === 1) return pos + Math.round((s / 100) * (eighth / 2));
    return pos;
  }

  _noteOn(slot, n, scheduleTick) {
    const key = `${slot.id}:${n.pitch}`;
    this._scheduled.set(key, (this._scheduled.get(key) || 0) + 1);
    this.send([0x90 | (slot.outChannel - 1), clampPitch(n.pitch + slot.transpose), n.velocity], scheduleTick);
  }

  _noteOff(slot, n, scheduleTick) {
    const key = `${slot.id}:${n.pitch}`;
    const count = this._scheduled.get(key) || 0;
    if (count <= 1) this._scheduled.delete(key);
    else this._scheduled.set(key, count - 1);
    this.send([0x80 | (slot.outChannel - 1), clampPitch(n.pitch + slot.transpose), 0], scheduleTick);
  }

  _allOff(key) {
    const [slotId] = key.split(':');
    const slot = this.project.slots[Number(slotId)];
    if (slot) this.send([0xb0 | (slot.outChannel - 1), 123, 0], 0);
  }

  _allOffSlot(slot) {
    this.send([0xb0 | (slot.outChannel - 1), 123, 0], 0);
  }
}

export function slotEventsInRange(slot, fromTick, toTick) {
  const events = [];
  const loopLen = slot.loopEnd - slot.loopStart;
  if (loopLen <= 0) return events;
  for (const n of slot.notes) {
    let t = n.tick;
    while (t < toTick) {
      if (t >= fromTick && t < toTick) {
        events.push({ tick: t, type: 'on', note: n });
        events.push({ tick: t + n.length, type: 'off', note: n });
      }
      if (slot.loopMode === 'once') break;
      t += loopLen;
    }
  }
  return events.sort((a, b) => a.tick - b.tick);
}

export { clamp };
