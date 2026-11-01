import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeProject, makeSlot, makeNote, quantizeTick, transposeNotes,
  serializeProject, deserializeProject, RASTERS, PPQN, MAX_SLOTS,
} from '../js/model.js';
import { Recorder } from '../js/recorder.js';
import { Player, slotEventsInRange } from '../js/player.js';
import { ClockEngine } from '../js/clock.js';

test('Projekt hat 16 Slots mit Defaults', () => {
  const p = makeProject();
  assert.equal(p.slots.length, MAX_SLOTS);
  assert.equal(p.slots[0].outChannel, 1);
  assert.equal(p.slots[15].outChannel, 16);
  assert.equal(p.slots[3].loopEnd, 4 * PPQN);
});

test('Quantize rundet auf Raster', () => {
  const r = RASTERS['1/16']; // 6 Ticks
  assert.equal(quantizeTick(7, r), 6);
  assert.equal(quantizeTick(9, r), 12);
  assert.equal(quantizeTick(10, null), 10);
});

test('Transpose klappt an 0..127', () => {
  const notes = [makeNote(0, 126, 100, 6), makeNote(0, 1, 100, 6)];
  const t = transposeNotes(notes, 5);
  assert.equal(t[0].pitch, 127);
  assert.equal(t[1].pitch, 6);
  const t2 = transposeNotes(notes, -10);
  assert.equal(t2[1].pitch, 0);
});

test('Serialize/Deserialize roundtrip', () => {
  const p = makeProject();
  p.slots[2].name = 'Bass';
  p.slots[2].notes = [makeNote(0, 40, 90, 12)];
  p.slots[2].loopStart = 24;
  p.slots[2].loopEnd = 96;
  const back = deserializeProject(serializeProject(p));
  assert.equal(back.slots[2].name, 'Bass');
  assert.deepEqual(back.slots[2].notes, p.slots[2].notes);
  assert.equal(back.slots[2].loopEnd, 96);
  assert.equal(back.slots.length, MAX_SLOTS);
});

test('Recorder nimmt Noten auf gewähltem Channel auf und quantized', () => {
  const p = makeProject();
  p.quantize = '1/16';
  p.countIn = 0;
  const rec = new Recorder(p);
  rec.arm(0);
  rec.overdub = false;
  rec.startRecording(0);
  rec.handleNoteOn(7, 1, 60, 100);   // falscher Tick -> quantized auf 6
  rec.handleNoteOff(20, 1, 60);
  rec.handleNoteOn(30, 2, 64, 90);   // falscher Channel -> ignoriert
  rec.handleNoteOff(40, 2, 64);
  const slot = rec.stopRecording();
  assert.equal(slot.notes.length, 1);
  assert.equal(slot.notes[0].tick, 6);
  assert.equal(slot.notes[0].pitch, 60);
  assert.equal(slot.notes[0].velocity, 100);
  assert.ok(slot.notes[0].length >= 6);
  assert.ok(slot.length >= slot.loopEnd);
});

test('Recorder: NoteOn ohne NoteOff bekommt Länge bei Stop', () => {
  const p = makeProject();
  p.countIn = 0;
  const rec = new Recorder(p);
  rec.arm(1);
  rec.startRecording(0);
  rec.handleNoteOn(0, 1, 60, 100);
  rec.handleNoteOff(999, 1, 60);
  const slot = rec.stopRecording();
  assert.equal(slot.notes.length, 1);
  assert.ok(slot.notes[0].length > 0);
});

test('Recorder: Overdub merged statt löscht', () => {
  const p = makeProject();
  p.countIn = 0;
  const rec = new Recorder(p);
  rec.arm(0);
  rec.overdub = false;
  rec.startRecording(0);
  rec.handleNoteOn(0, 1, 60, 100);
  rec.handleNoteOff(6, 1, 60);
  rec.stopRecording();
  rec.overdub = true;
  rec.startRecording(0);
  rec.handleNoteOn(12, 1, 64, 100);
  rec.handleNoteOff(18, 1, 64);
  const slot = rec.stopRecording();
  assert.equal(slot.notes.length, 2);
  assert.deepEqual(slot.notes.map((n) => n.pitch).sort(), [60, 64]);
});

test('Recorder: recordAllChannels nimmt alle Channels auf', () => {
  const p = makeProject();
  p.quantize = 'off';
  p.countIn = 0;
  const rec = new Recorder(p);
  rec.arm(0);
  p.slots[0].recordAllChannels = true;
  rec.startRecording(0);
  rec.handleNoteOn(0, 1, 60, 100);
  rec.handleNoteOff(6, 1, 60);
  rec.handleNoteOn(12, 9, 64, 90);
  rec.handleNoteOff(18, 9, 64);
  const slot = rec.stopRecording();
  assert.equal(slot.notes.length, 2);
  assert.deepEqual(slot.notes.map((n) => n.pitch).sort(), [60, 64]);
});

test('Recorder: Count-In wird abgewartet', () => {
  const p = makeProject();
  p.countIn = 8; // 8 16tel = 48 Ticks
  p.quantize = 'off';
  const rec = new Recorder(p);
  rec.arm(0);
  rec.startRecording(0);
  rec.onClockTick(10);
  rec.handleNoteOn(10, 1, 60, 100); // noch im Count-In -> ignoriert
  rec.onClockTick(48);
  rec.handleNoteOn(48, 1, 60, 100);
  rec.handleNoteOff(54, 1, 60);
  const slot = rec.stopRecording();
  assert.equal(slot.notes.length, 1);
  assert.equal(slot.notes[0].tick, 0);
});

function collectSent() {
  const sent = [];
  return { sent, send: (data) => sent.push(data) };
}

test('Player spielt Noten im Loop auf Out-Channel', () => {
  const p = makeProject();
  const slot = p.slots[0];
  slot.outChannel = 3;
  slot.loopStart = 0;
  slot.loopEnd = 24; // 1 Viertel
  slot.notes = [makeNote(0, 60, 100, 6)];
  const { sent, send } = collectSent();
  const player = new Player(p, send);
  player.start();
  for (let t = 0; t < 45; t++) player.onTick(t); // 48 würde per Lookahead schon vorgemerkt
  const ons = sent.filter((d) => (d[0] & 0xf0) === 0x90);
  const offs = sent.filter((d) => (d[0] & 0xf0) === 0x80);
  assert.equal(ons.length, 2); // bei Tick 0 und 24
  assert.equal(offs.length, 2);
  assert.equal(ons[0][0] & 0x0f, 2); // Channel 3
  assert.equal(ons[0][1], 60);
});

test('Player: Transpose wird beim Senden addiert', () => {
  const p = makeProject();
  const slot = p.slots[0];
  slot.outChannel = 1;
  slot.loopStart = 0;
  slot.loopEnd = 96;
  slot.transpose = 12;
  slot.notes = [makeNote(0, 60, 100, 6)];
  const { sent, send } = collectSent();
  const player = new Player(p, send);
  player.start();
  player.onTick(0);
  const on = sent.find((d) => (d[0] & 0xf0) === 0x90);
  assert.equal(on[1], 72);
  assert.equal(slot.notes[0].pitch, 60); // Original unverändert
});

test('Player: Mute und Solo', () => {
  const p = makeProject();
  p.slots[0].loopStart = 0; p.slots[0].loopEnd = 96; p.slots[0].notes = [makeNote(0, 60, 100, 6)];
  p.slots[1].loopStart = 0; p.slots[1].loopEnd = 96; p.slots[1].notes = [makeNote(0, 62, 100, 6)];
  p.slots[1].solo = true;
  const { sent, send } = collectSent();
  const player = new Player(p, send);
  player.start();
  player.onTick(0);
  const ons = sent.filter((d) => (d[0] & 0xf0) === 0x90);
  assert.equal(ons.length, 1);
  assert.equal(ons[0][1], 62);
});

test('Player: Once-Modus stoppt nach loopEnd', () => {
  const p = makeProject();
  const slot = p.slots[0];
  slot.outChannel = 1;
  slot.loopMode = 'once';
  slot.loopStart = 0;
  slot.loopEnd = 24;
  slot.notes = [makeNote(0, 60, 100, 6)];
  const { sent, send } = collectSent();
  const player = new Player(p, send);
  player.start();
  for (let t = 0; t < 72; t++) player.onTick(t);
  const ons = sent.filter((d) => (d[0] & 0xf0) === 0x90);
  assert.equal(ons.length, 1);
});

test('slotEventsInRange expandiert Loop korrekt', () => {
  const slot = makeSlot(0);
  slot.loopStart = 0;
  slot.loopEnd = 24;
  slot.notes = [makeNote(6, 60, 100, 6)];
  const ev = slotEventsInRange(slot, 0, 72);
  const onTicks = ev.filter((e) => e.type === 'on').map((e) => e.tick);
  assert.deepEqual(onTicks, [6, 30, 54]);
});

test('ClockEngine zählt 24 Pulse pro Viertel und meldet BPM', () => {
  let ticks = 0;
  let lastBpm = 0;
  const c = new ClockEngine({ onTick: () => ticks++, onBpm: (b) => { lastBpm = b; } });
  c.handleMidi([0xfa]);
  for (let i = 0; i < 24; i++) c.handleMidi([0xf8]);
  assert.equal(ticks, 24);
  assert.ok(lastBpm > 0);
  c.handleMidi([0xfc]);
  assert.equal(c.running, false);
  const before = ticks;
  c.handleMidi([0xf8]);
  assert.equal(ticks, before + 1); // Clock startet Run wieder
});

test('ClockEngine: SPP setzt Tick-Position', () => {
  const c = new ClockEngine({});
  c.handleMidi([0xf2, 0x02, 0x00]); // SPP = 2 Viertel = 12 Ticks? -> pos*6
  assert.equal(c.tick, 12);
});
