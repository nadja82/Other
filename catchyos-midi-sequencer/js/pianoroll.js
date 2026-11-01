import { PPQN, RASTERS, clamp, clampPitch, makeNote } from './model.js';

const KEY_W = 92;
const ROW_H = 14;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function pitchName(p) {
  return NOTE_NAMES[p % 12] + (Math.floor(p / 12) - 1);
}

export class PianoRoll {
  constructor(canvas, slot, { onChange } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.slot = slot;
    this.onChange = onChange || (() => {});
    this.scrollX = 0;
    this.zoom = 24;
    this.selected = new Set();
    this.playheadTick = 0;
    this._undoStack = [];
    this._drag = null;
    this._bind();
  }

  setSlot(slot) {
    this.slot = slot;
    this.selected.clear();
    this._undoStack = [];
    this.render();
  }

  _pushUndo() {
    this._undoStack.push(JSON.stringify(this.slot.notes));
    if (this._undoStack.length > 100) this._undoStack.shift();
  }

  undo() {
    const prev = this._undoStack.pop();
    if (prev != null) {
      this.slot.notes = JSON.parse(prev);
      this.selected.clear();
      this.onChange();
      this.render();
    }
  }

  tickToX(tick) {
    return KEY_W + (tick - this.scrollX) * this.zoom / PPQN * 0.25;
  }

  xToTick(x) {
    return this.scrollX + ((x - KEY_W) / this.zoom) * PPQN * 4;
  }

  pitchToY(p) {
    return (127 - p) * ROW_H;
  }

  yToPitch(y) {
    return clampPitch(127 - Math.floor(y / ROW_H));
  }

  snapTick(t) {
    const r = RASTERS[this._rasterKey || '1/16'];
    if (!r) return Math.round(t);
    return Math.round(t / r) * r;
  }

  setRaster(key) {
    this._rasterKey = key;
    this.render();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  render() {
    this.resize();
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#14161c';
    ctx.fillRect(0, 0, w, h);
    this._drawGrid(ctx, w, h);
    this._drawLoopArea(ctx, w, h);
    this._drawNotes(ctx, w, h);
    this._drawKeys(ctx, h);
    this._drawPlayhead(ctx, h);
  }

  _drawGrid(ctx, w, h) {
    const raster = this._rasterKey && RASTERS[this._rasterKey] ? RASTERS[this._rasterKey] : PPQN / 4;
    const startTick = Math.max(0, Math.floor(this.xToTick(0) / raster) * raster);
    const endTick = this.xToTick(w);
    ctx.strokeStyle = '#232733';
    ctx.fillStyle = '#3a4152';
    ctx.font = '10px sans-serif';
    ctx.lineWidth = 1;
    for (let t = startTick; t <= endTick; t += raster) {
      const x = this.tickToX(t);
      const isBar = t % (4 * PPQN) === 0;
      ctx.strokeStyle = isBar ? '#39415a' : '#232733';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      if (isBar) ctx.fillText(`T${t / (4 * PPQN) + 1}`, x + 3, 12);
    }
    for (let p = 0; p < 128; p++) {
      const y = this.pitchToY(p);
      if (p % 12 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(KEY_W, y, w - KEY_W, ROW_H);
      }
    }
  }

  _drawLoopArea(ctx, w, h) {
    const x1 = this.tickToX(this.slot.loopStart);
    const x2 = this.tickToX(this.slot.loopEnd);
    if (x2 > KEY_W && x1 < w) {
      ctx.fillStyle = 'rgba(80,140,255,0.08)';
      ctx.fillRect(Math.max(x1, KEY_W), 0, Math.min(x2, w) - Math.max(x1, KEY_W), h);
      ctx.strokeStyle = '#4a7dff';
      ctx.setLineDash([4, 4]);
      for (const x of [x1, x2]) {
        if (x > KEY_W - 6 && x < w + 6) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }
  }

  _drawNotes(ctx, w, h) {
    for (let i = 0; i < this.slot.notes.length; i++) {
      const n = this.slot.notes[i];
      const x = this.tickToX(n.tick);
      const x2 = this.tickToX(n.tick + n.length);
      const y = this.pitchToY(n.pitch);
      if (x2 < KEY_W || x > w) continue;
      const sel = this.selected.has(i);
      ctx.fillStyle = sel ? '#ffb347' : '#4a9eff';
      ctx.fillRect(x, y + 1, Math.max(2, x2 - x), ROW_H - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      const vh = Math.round((n.velocity / 127) * (ROW_H - 4));
      ctx.fillRect(x, y + ROW_H - 2 - vh, Math.max(2, x2 - x), vh);
    }
  }

  _drawKeys(ctx, h) {
    ctx.fillStyle = '#1c1f28';
    ctx.fillRect(0, 0, KEY_W, h);
    ctx.font = '10px sans-serif';
    for (let p = 0; p < 128; p++) {
      const y = this.pitchToY(p);
      const black = [1, 3, 6, 8, 10].includes(p % 12);
      ctx.fillStyle = black ? '#0c0e13' : '#262a36';
      ctx.fillRect(0, y, KEY_W, ROW_H - 1);
      if (p % 12 === 0) {
        ctx.fillStyle = '#9aa3b8';
        ctx.fillText(pitchName(p), 6, y + 10);
      }
    }
  }

  _drawPlayhead(ctx, h) {
    if (this.slot.notes.length === 0) return;
    const x = this.tickToX(this.playheadTick);
    if (x > KEY_W && x < this.canvas.clientWidth) {
      ctx.strokeStyle = '#ff5555';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }

  setPlayhead(tick) {
    this.playheadTick = tick;
    this.render();
  }

  _bind() {
    this.canvas.addEventListener('mousedown', (e) => this._onDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMove(e));
    window.addEventListener('mouseup', (e) => this._onUp(e));
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.shiftKey) {
        this.zoom = clamp(this.zoom * (e.deltaY < 0 ? 1.2 : 0.83), 4, 200);
      } else {
        this.scrollX = Math.max(0, this.scrollX + (e.deltaY + e.deltaX) * 0.5);
      }
      this.render();
    }, { passive: false });
    this.canvas.addEventListener('dblclick', (e) => {
      const hit = this._hitTest(e);
      if (hit) {
        this._pushUndo();
        this.slot.notes.splice(hit.index, 1);
        this.selected.clear();
        this.onChange();
        this.render();
      }
    });
  }

  _hitTest(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pitch = this.yToPitch(y);
    const tick = this.xToTick(x);
    for (let i = this.slot.notes.length - 1; i >= 0; i--) {
      const n = this.slot.notes[i];
      if (n.pitch === pitch && tick >= n.tick && tick < n.tick + n.length) return { index: i, note: n, x, y };
    }
    return null;
  }

  _onDown(e) {
    const hit = this._hitTest(e);
    if (hit) {
      const idx = hit.index;
      if (!this.selected.has(idx)) {
        this.selected = new Set([idx]);
      }
      this._drag = {
        mode: 'move',
        startX: e.clientX,
        startY: e.clientY,
        orig: this.slot.notes.map((n) => ({ ...n })),
        indices: Array.from(this.selected),
      };
      this._pushUndo();
    } else {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < KEY_W) return;
      const tick = this.snapTick(Math.max(0, this.xToTick(x)));
      const pitch = this.yToPitch(e.clientY - rect.top);
      this._pushUndo();
      const note = makeNote(tick, pitch, 100, this.snapTick(PPQN / 4) || PPQN / 4);
      this.slot.notes.push(note);
      this.slot.notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
      this.selected = new Set([this.slot.notes.indexOf(note)]);
      this._drag = {
        mode: 'draw',
        note,
        origTick: note.tick,
        origPitch: note.pitch,
      };
      this.onChange();
    }
    this.render();
  }

  _onMove(e) {
    if (!this._drag) return;
    const rect = this.canvas.getBoundingClientRect();
    const d = this._drag;
    if (d.mode === 'move') {
      const dxTicks = this.xToTick(e.clientX - rect.left) - this.xToTick(d.startX - rect.left);
      const dyPitch = this.yToPitch(d.startY - rect.top) - this.yToPitch(e.clientY - rect.top);
      for (const idx of d.indices) {
        const orig = d.orig[idx];
        if (!orig) continue;
        const n = this.slot.notes[idx];
        n.tick = Math.max(0, this.snapTick(orig.tick + dxTicks));
        n.pitch = clampPitch(orig.pitch + dyPitch);
      }
      this.slot.notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
    } else if (d.mode === 'draw') {
      const tick = Math.max(0, this.xToTick(e.clientX - rect.left));
      d.note.length = Math.max(1, this.snapTick(tick - d.note.tick));
    }
    this.onChange();
    this.render();
  }

  _onUp() {
    if (this._drag) {
      this._drag = null;
      this.onChange();
      this.render();
    }
  }

  deleteSelected() {
    if (this.selected.size === 0) return;
    this._pushUndo();
    const del = new Set(this.selected);
    this.slot.notes = this.slot.notes.filter((_, i) => !del.has(i));
    this.selected.clear();
    this.onChange();
    this.render();
  }

  transposeSelected(semitones) {
    this._pushUndo();
    for (const i of this.selected) {
      const n = this.slot.notes[i];
      if (n) n.pitch = clampPitch(n.pitch + semitones);
    }
    if (this.selected.size === 0) {
      this.slot.notes = this.slot.notes.map((n) => ({ ...n, pitch: clampPitch(n.pitch + semitones) }));
    }
    this.onChange();
    this.render();
  }

  clearSlot() {
    this._pushUndo();
    this.slot.notes = [];
    this.selected.clear();
    this.onChange();
    this.render();
  }
}
