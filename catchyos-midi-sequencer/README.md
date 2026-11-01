# CatchyOS MIDI-Sequencer

Web-App (Vanilla JS + Canvas + WebMIDI, kein Build-Step) zum schnellen Aufnehmen und Abspielen von MIDI-Sequenzen — optimiert für CatchyOS, läuft aber in jedem modernen Browser.

## Starten

**Direkt aus dem Quellcode:**

```bash
cd catchyos-midi-sequencer
npm start          # oder: node server.mjs
# dann öffnen: http://localhost:8080
```

**Download als Zip:** `catchyos-midi-sequencer.zip` im Repo-Root — entpacken und wie oben starten.

**Installation auf CatchyOS (Linux) — legt einen Eintrag ins Anwendungsmenü an:**

```bash
cd catchyos-midi-sequencer
./install.sh       # installiert nach ~/.local/share/catchyos-midi-sequencer
# Start danach über das Anwendungsmenü oder: ~/.local/share/catchyos-midi-sequencer/run.sh
# optional anderer Port: CATCHYOS_MIDI_PORT=9000 ./run.sh
```

WebMIDI braucht eine sichere Umgebung: `localhost` funktioniert, für Zugriff vom Netzwerk `https://…` nötig (z. B. via lokalem Reverse-Proxy). Browser: Chrome/Edge (Firefox unterstützt WebMIDI seit v108 experimentell).

## Funktionen

- **16 Slots**, jeder mit eigenem Namen (Instrument), Record-In-Channel **oder „Alle Channels aufnehmen"**, und Out-Channel
- **Channel-Monitor**: 16 Kacheln in der Kopfzeile zeigen live, welcher MIDI-Channel gerade Noten sendet (grün bei Note-On, erlischt nach ~1 s)
- **Playhead-Linie** in der Pianoroll erscheint erst, sobald der Slot mindestens eine Note enthält
- **Aufnahme**: Slot armieren (⏺), Noten werden roh mit Tick-Zeitstempel aufgezeichnet, beim Stop quantized (Raster wählbar) und als Noten gespeichert
- **Count-In** vor der Aufnahme, **Overdub**-Modus (neu drüber statt löschen)
- **Playback**: Slots einzeln starten (▶), Mute/Solo, Loop oder Once, Transpose, Swing
- **MIDI-Clock**: empfängt Clock (24 PPQN), Start/Continue/Stop und Song Position Pointer; BPM wird aus der Clock berechnet und angezeigt. Fallback: interne Clock mit einstellbarem BPM
- **Loop-Punkte** (Start/Ende in Ticks) frei wählbar, Sequenzlänge beliebig
- **Pianoroll-Editor**: Noten setzen/verschieben/löschen (Klick, Drag, Doppelklick), Transponieren (Selektion oder ganzer Slot), Undo, Velocity-Anzeige pro Note, Zoom/Scroll, Loop-Bereich hervorgehoben, Playhead
- **MIDI-Learn**: pro Slot eine Hardware-Note zum Play-Trigger lernen (L-Button)
- **Speichern/Laden**: Projekt als JSON (Download + Auto-Save in localStorage)

## Tests

```bash
npm test           # node --test: Kernlogik (Model, Recorder, Player, Clock)
```

## Aufbau

```
index.html         UI-Shell
style.css          Dark-UI
server.mjs         statischer Dev-Server (localhost only)
js/model.js        Datenmodell, Quantize, (De-)Serialisierung
js/clock.js        Clock-Engine (extern 24 PPQN + interner BPM-Timer)
js/recorder.js     Aufnahme-Pipeline (Channel-Filter, Count-In, Overdub, Quantize)
js/player.js       Playback-Scheduler (Loop/Once, Swing, Transpose, Mute/Solo)
js/pianoroll.js    Canvas-Pianoroll mit Maus-Editing und Undo
js/midi-io.js      WebMIDI-Wrapper
js/main.js         Wiring: Transport, Slot-Leiste, MIDI-Learn, Persistenz
test/core.test.mjs Node-Tests der Kernlogik
```

## Kurz-Workflow

1. MIDI-Keyboard und Synth anstöpseln, Seite in Chrome öffnen, Geräte oben auswählen
2. Slot anklicken → In/Out-Channel einstellen → ⏺ drücken → einspielen → ⏺ nochmal zum Stoppen
3. Namen vergeben, Loop-Punkte setzen, in der Pianoroll nachbearbeiten
4. Externes Clock-Gerät (oder interner BPM) starten → Slot mit ▶ auf dem Beat abspielen
