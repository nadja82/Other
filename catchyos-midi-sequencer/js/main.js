import { makeProject, serializeProject, deserializeProject, RASTERS, clamp, PPQN } from './model.js';
import { ClockEngine } from './clock.js';
import { Recorder } from './recorder.js';
import { Player } from './player.js';
import { MidiIO } from './midi-io.js';
import { PianoRoll, pitchName } from './pianoroll.js';

const $ = (id) => document.getElementById(id);

let project = loadProject() || makeProject();
let currentSlot = 0;

const midi = new MidiIO();
const recorder = new Recorder(project);

const outQueue = [];
const player = new Player(project, (data, tick) => {
  outQueue.push({ data, at: performance.now() + Math.max(0, (tick || 0)) });
  midi.send(data);
});

const clock = new ClockEngine({
  onTick: (tick) => {
    recorder.onClockTick(tick);
    player.onTick(tick);
    pianoRoll.setPlayhead(tick);
    updateTransportUi(tick);
  },
  onStart: () => {
    if (recorder.recording) return;
  },
  onStop: () => {},
  onBpm: (bpm) => {
    $('bpmDisplay').textContent = bpm.toFixed(1);
  },
});

let pianoRoll;

function sendOut(data) {
  midi.send(data);
}

async function boot() {
  const ok = await midi.init();
  $('midiStatus').textContent = ok
    ? `MIDI OK — ${midi.inputs.length} Eingänge, ${midi.outputs.length} Ausgänge`
    : 'WebMIDI nicht verfügbar — bitte Chrome/Edge über HTTPS oder localhost öffnen';
  buildDeviceSelects();
  buildChannelMonitor();
  buildSlotList();
  pianoRoll = new PianoRoll($('pianoroll'), project.slots[currentSlot], {
    onChange: () => { autoSave(); refreshSlotList(); },
  });
  pianoRoll.setRaster(project.quantize);
  wireControls();
  wireMidiInput();
  selectSlot(0);
  refreshSlotList();
  updateTransportUi(0);
  requestAnimationFrame(renderLoop);
}

function renderLoop() {
  while (outQueue.length && outQueue[0].at <= performance.now()) outQueue.shift();
  requestAnimationFrame(renderLoop);
}

const channelActivity = new Array(17).fill(false);

function buildChannelMonitor() {
  const el = $('channelMonitor');
  el.innerHTML = '';
  for (let c = 1; c <= 16; c++) {
    const dot = document.createElement('span');
    dot.className = 'ch';
    dot.id = `chmon-${c}`;
    dot.textContent = c;
    dot.title = `Channel ${c}`;
    el.appendChild(dot);
  }
}

function markChannel(channel, on) {
  channelActivity[channel] = on;
  const dot = $(`chmon-${channel}`);
  if (dot) dot.classList.toggle('active', on);
}

function clearChannelMonitorSoon() {
  clearTimeout(clearChannelMonitorSoon._t);
  clearChannelMonitorSoon._t = setTimeout(() => {
    for (let c = 1; c <= 16; c++) {
      if (!channelActivity[c]) continue;
      markChannel(c, false);
    }
  }, 1200);
}

function wireMidiInput() {
  midi.onMessage = (data, input) => {
    if (input !== midi.selectedInput && midi.selectedInput) return;
    const status = data[0] & 0xf0;
    const channel = (data[0] & 0x0f) + 1;
    if (status === 0x90 || status === 0x80) {
      const pitch = data[1];
      const vel = data[2];
      const isOn = status === 0x90 && vel > 0;
      markChannel(channel, isOn);
      clearChannelMonitorSoon();
      if (isOn) {
        recorder.handleNoteOn(clock.tick, channel, pitch, vel);
        handleLearn(pitch, channel);
        triggerFromLearn(pitch, channel);
      } else {
        recorder.handleNoteOff(clock.tick, channel, pitch);
      }
    } else if (data[0] >= 0xf8) {
      clock.handleMidi(data);
    }
  };
}

const learnMap = new Map();
let learnTarget = null;

function handleLearn(pitch, channel) {
  if (!learnTarget) return;
  learnMap.set(`${learnTarget.type}:${learnTarget.slotId}`, { pitch, channel });
  learnTarget = null;
  $('learnStatus').textContent = `Gelernt: Note ${pitchName(pitch)} Ch${channel}`;
  setTimeout(() => { $('learnStatus').textContent = ''; }, 2000);
}

function triggerFromLearn(pitch, channel) {
  for (const [key, val] of learnMap) {
    if (val.pitch === pitch && val.channel === channel) {
      const [type, slotId] = key.split(':');
      if (type === 'play') togglePlaySlot(Number(slotId));
      if (type === 'rec') toggleRecordSlot(Number(slotId));
    }
  }
}

function buildDeviceSelects() {
  const inSel = $('midiInput');
  inSel.innerHTML = '';
  midi.inputs.forEach((inp) => {
    const o = document.createElement('option');
    o.value = inp.id;
    o.textContent = inp.name;
    inSel.appendChild(o);
  });
  if (midi.inputs[0]) {
    midi.selectInput(midi.inputs[0].id);
    inSel.value = midi.inputs[0].id;
  }
  inSel.onchange = () => midi.selectInput(inSel.value);
  const outSel = $('midiOutput');
  outSel.innerHTML = '';
  midi.outputs.forEach((out) => {
    const o = document.createElement('option');
    o.value = out.id;
    o.textContent = out.name;
    outSel.appendChild(o);
  });
}

function buildSlotList() {
  const list = $('slotList');
  list.innerHTML = '';
  project.slots.forEach((slot, i) => {
    const el = document.createElement('div');
    el.className = 'slot';
    el.id = `slot-${i}`;
    el.innerHTML = `
      <button class="slot-play" title="Play/Stop">▶</button>
      <button class="slot-rec" title="Record">⏺</button>
      <div class="slot-body">
        <input class="slot-name" value="${escapeHtml(slot.name)}" maxlength="24" />
        <div class="slot-ch">
          <label>In <input type="number" class="rec-ch" min="1" max="16" value="${slot.recordChannel}" ${slot.recordAllChannels ? 'disabled' : ''} /></label>
          <label title="Alle MIDI-Channels aufnehmen">Alle <input type="checkbox" class="rec-all" ${slot.recordAllChannels ? 'checked' : ''}/></label>
          <label>Out <input type="number" class="out-ch" min="1" max="16" value="${slot.outChannel}" /></label>
          <label class="mute"><input type="checkbox" class="mute-ch" ${slot.muted ? 'checked' : ''}/>M</label>
          <label class="solo"><input type="checkbox" class="solo-ch" ${slot.solo ? 'checked' : ''}/>S</label>
        </div>
        <div class="slot-meta">${slot.notes.length} Noten</div>
      </div>
      <button class="slot-learn" title="MIDI-Learn Play">L</button>`;
    el.querySelector('.slot-body').addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') selectSlot(i);
    });
    el.querySelector('.slot-name').addEventListener('change', (e) => {
      slot.name = e.target.value || `Slot ${i + 1}`;
      autoSave();
    });
    el.querySelector('.rec-ch').addEventListener('change', (e) => {
      slot.recordChannel = clamp(Number(e.target.value) || 1, 1, 16);
      autoSave();
    });
    el.querySelector('.rec-all').addEventListener('change', (e) => {
      slot.recordAllChannels = e.target.checked;
      el.querySelector('.rec-ch').disabled = slot.recordAllChannels;
      autoSave();
    });
    el.querySelector('.out-ch').addEventListener('change', (e) => {
      slot.outChannel = clamp(Number(e.target.value) || 1, 1, 16);
      autoSave();
    });
    el.querySelector('.mute-ch').addEventListener('change', (e) => { slot.muted = e.target.checked; autoSave(); });
    el.querySelector('.solo-ch').addEventListener('change', (e) => { slot.solo = e.target.checked; autoSave(); });
    el.querySelector('.slot-play').addEventListener('click', () => togglePlaySlot(i));
    el.querySelector('.slot-rec').addEventListener('click', () => toggleRecordSlot(i));
    el.querySelector('.slot-learn').addEventListener('click', () => {
      learnTarget = { type: 'play', slotId: i };
      $('learnStatus').textContent = `Learn an Slot ${i + 1}: eine Note spielen…`;
    });
    list.appendChild(el);
  });
}

function refreshSlotList() {
  project.slots.forEach((slot, i) => {
    const el = $(`slot-${i}`);
    if (!el) return;
    el.classList.toggle('active', i === currentSlot);
    el.querySelector('.slot-meta').textContent = `${slot.notes.length} Noten · Loop ${slot.loopStart}–${slot.loopEnd}`;
    el.querySelector('.slot-play').classList.toggle('playing', playingSlots.has(i));
    el.querySelector('.slot-rec').classList.toggle('recording', recorder.armedSlot === slot && recorder.recording);
  });
}

function selectSlot(i) {
  currentSlot = i;
  pianoRoll.setSlot(project.slots[i]);
  $('slotNameEdit').value = project.slots[i].name;
  $('loopStart').value = project.slots[i].loopStart;
  $('loopEnd').value = project.slots[i].loopEnd;
  $('transpose').value = project.slots[i].transpose;
  $('swing').value = project.slots[i].swing;
  $('loopMode').value = project.slots[i].loopMode;
  refreshSlotList();
}

const playingSlots = new Set();

function togglePlaySlot(i) {
  if (playingSlots.has(i)) playingSlots.delete(i);
  else {
    playingSlots.add(i);
    if (!player.playing) player.start();
  }
  if (playingSlots.size === 0) player.stop();
  refreshSlotList();
}

function toggleRecordSlot(i) {
  if (recorder.armedSlot === project.slots[i] && recorder.recording) {
    recorder.stopRecording();
    autoSave();
    refreshSlotList();
    return;
  }
  recorder.arm(project.slots[i].id);
  recorder.overdub = $('overdub').checked;
  recorder.startRecording(clock.tick);
  selectSlot(i);
  refreshSlotList();
}

function wireControls() {
  $('transportPlay').addEventListener('click', () => {
    if (player.playing) {
      player.stop();
      playingSlots.clear();
    } else {
      player.start();
    }
    refreshSlotList();
    updateTransportUi(clock.tick);
  });
  $('transportStop').addEventListener('click', () => {
    clock.reset();
    player.stop();
    playingSlots.clear();
    if (recorder.recording) recorder.stopRecording();
    refreshSlotList();
    updateTransportUi(0);
  });
  $('clockSource').addEventListener('change', (e) => {
    project.clockSource = e.target.value;
    clock.setSource(project.clockSource, project.bpm);
    autoSave();
  });
  $('bpmInput').addEventListener('change', (e) => {
    project.bpm = clamp(Number(e.target.value) || 120, 20, 400);
    clock.setSource(project.clockSource, project.bpm);
    autoSave();
  });
  $('quantize').addEventListener('change', (e) => {
    project.quantize = e.target.value;
    pianoRoll.setRaster(project.quantize);
    autoSave();
  });
  $('countIn').addEventListener('change', (e) => {
    project.countIn = Number(e.target.value) || 0;
    autoSave();
  });
  $('overdub').addEventListener('change', (e) => {
    recorder.overdub = e.target.checked;
  });
  $('slotNameEdit').addEventListener('change', (e) => {
    project.slots[currentSlot].name = e.target.value || `Slot ${currentSlot + 1}`;
    autoSave();
    refreshSlotList();
  });
  $('loopStart').addEventListener('change', (e) => {
    const slot = project.slots[currentSlot];
    slot.loopStart = clamp(Math.round(Number(e.target.value) || 0), 0, slot.loopEnd - 1);
    e.target.value = slot.loopStart;
    autoSave();
    pianoRoll.render();
    refreshSlotList();
  });
  $('loopEnd').addEventListener('change', (e) => {
    const slot = project.slots[currentSlot];
    slot.loopEnd = Math.max(slot.loopStart + 1, Math.round(Number(e.target.value) || slot.loopStart + 1));
    e.target.value = slot.loopEnd;
    autoSave();
    pianoRoll.render();
    refreshSlotList();
  });
  $('transpose').addEventListener('change', (e) => {
    project.slots[currentSlot].transpose = clamp(Math.round(Number(e.target.value) || 0), -48, 48);
    e.target.value = project.slots[currentSlot].transpose;
    autoSave();
  });
  $('swing').addEventListener('change', (e) => {
    project.slots[currentSlot].swing = clamp(Math.round(Number(e.target.value) || 0), 0, 50);
    e.target.value = project.slots[currentSlot].swing;
    autoSave();
  });
  $('loopMode').addEventListener('change', (e) => {
    project.slots[currentSlot].loopMode = e.target.value === 'once' ? 'once' : 'loop';
    autoSave();
  });
  $('btnTransDown').addEventListener('click', () => pianoRoll.transposeSelected(-1));
  $('btnTransUp').addEventListener('click', () => pianoRoll.transposeSelected(1));
  $('btnDelete').addEventListener('click', () => pianoRoll.deleteSelected());
  $('btnUndo').addEventListener('click', () => pianoRoll.undo());
  $('btnClear').addEventListener('click', () => {
    if (confirm('Slot wirklich leeren?')) pianoRoll.clearSlot();
  });
  $('btnSave').addEventListener('click', saveProject);
  $('btnLoad').addEventListener('click', () => $('fileLoad').click());
  $('fileLoad').addEventListener('change', loadProjectFile);
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') pianoRoll.deleteSelected();
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) pianoRoll.undo();
    if (e.key === ' ') { e.preventDefault(); $('transportPlay').click(); }
  });
}

let transportTick = 0;
function updateTransportUi(tick) {
  transportTick = tick;
  const bar = Math.floor(tick / (4 * PPQN)) + 1;
  const beat = Math.floor((tick % (4 * PPQN)) / PPQN) + 1;
  const sixteenth = Math.floor((tick % PPQN) / (PPQN / 4)) + 1;
  $('position').textContent = `${bar}:${beat}:${sixteenth}`;
  $('transportPlay').textContent = player.playing ? '⏸' : '▶';
}

function saveProject() {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'catchyos-project.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function autoSave() {
  try { localStorage.setItem('catchyos-autosave', serializeProject(project)); } catch (_) {}
}

function loadProject() {
  try {
    const raw = localStorage.getItem('catchyos-autosave');
    return raw ? deserializeProject(raw) : null;
  } catch (_) { return null; }
}

function loadProjectFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      project = deserializeProject(reader.result);
      recorder.project = project;
      player.project = project;
      clock.setSource(project.clockSource, project.bpm);
      pianoRoll.setSlot(project.slots[currentSlot]);
      selectSlot(currentSlot);
      buildSlotList();
    } catch (err) {
      alert('Konnte Projekt nicht laden: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot();
