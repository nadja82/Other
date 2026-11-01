export const PPQN = 24;
export const TICKS_PER_BEAT = PPQN;
export const TICKS_PER_BAR_4_4 = 4 * PPQN;

export const RASTERS = {
  off: null,
  '1/1': 4 * PPQN,
  '1/2': 2 * PPQN,
  '1/4': PPQN,
  '1/8': PPQN / 2,
  '1/16': PPQN / 4,
  '1/32': PPQN / 8,
};

export const MAX_SLOTS = 16;

export function makeNote(tick, pitch, velocity, length) {
  return {
    tick: Math.max(0, Math.round(tick)),
    pitch: clampPitch(pitch),
    velocity: clamp(Math.round(velocity), 1, 127),
    length: Math.max(1, Math.round(length)),
  };
}

export function makeSlot(id) {
  return {
    id,
    name: `Slot ${id + 1}`,
    recordChannel: 1,
    outChannel: id + 1,
    muted: false,
    solo: false,
    loopMode: 'loop',
    loopStart: 0,
    loopEnd: TICKS_PER_BAR_4_4,
    swing: 0,
    transpose: 0,
    notes: [],
    length: TICKS_PER_BAR_4_4,
  };
}

export function makeProject() {
  return {
    bpm: 120,
    clockSource: 'external',
    quantize: '1/16',
    countIn: 4,
    slots: Array.from({ length: MAX_SLOTS }, (_, i) => makeSlot(i)),
  };
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function clampPitch(p) {
  return clamp(Math.round(p), 0, 127);
}

export function quantizeTick(tick, raster) {
  if (!raster) return Math.round(tick);
  return Math.round(tick / raster) * raster;
}

export function ticksToMs(tick, bpm) {
  return (tick / PPQN) * (60000 / bpm);
}

export function msToTicks(ms, bpm) {
  return (ms / 60000) * bpm * PPQN;
}

export function transposeNotes(notes, semitones) {
  return notes.map((n) => ({ ...n, pitch: clampPitch(n.pitch + semitones) }));
}

export function serializeProject(project) {
  return JSON.stringify(project, null, 2);
}

export function deserializeProject(json) {
  const p = JSON.parse(json);
  if (!p || !Array.isArray(p.slots)) throw new Error('Ungültiges Projekt: keine Slots');
  const project = makeProject();
  project.bpm = typeof p.bpm === 'number' ? p.bpm : 120;
  project.clockSource = p.clockSource === 'internal' ? 'internal' : 'external';
  project.quantize = typeof p.quantize === 'string' ? p.quantize : '1/16';
  project.countIn = typeof p.countIn === 'number' ? p.countIn : 4;
  p.slots.slice(0, MAX_SLOTS).forEach((s, i) => {
    project.slots[i] = { ...makeSlot(i), ...s, id: i, notes: Array.isArray(s.notes) ? s.notes : [] };
  });
  return project;
}
