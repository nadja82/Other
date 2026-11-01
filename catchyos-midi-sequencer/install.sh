#!/usr/bin/env bash
# CatchyOS MIDI-Sequencer — lokale Installation (keine Systemrechte nötig)
set -euo pipefail

APP_NAME="catchyos-midi-sequencer"
TARGET_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/$APP_NAME"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
PORT="${CATCHYOS_MIDI_PORT:-8080}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$TARGET_DIR" "$DESKTOP_DIR"
cp -r "$SCRIPT_DIR"/* "$TARGET_DIR/"

cat > "$DESKTOP_DIR/$APP_NAME.desktop" <<EOF
[Desktop Entry]
Name=CatchyOS MIDI-Sequencer
Comment=MIDI-Sequencer (16 Slots, Pianoroll, MIDI-Clock)
Exec=$TARGET_DIR/run.sh
Icon=$TARGET_DIR/icon.svg
Type=Application
Categories=Audio;Music;MIDI;
Terminal=false
EOF

cat > "$TARGET_DIR/run.sh" <<EOF
#!/usr/bin/env bash
cd "$TARGET_DIR"
PORT=$PORT node server.mjs &
SERVER_PID=\$!
sleep 1
xdg-open "http://localhost:$PORT" 2>/dev/null || true
wait \$SERVER_PID
EOF
chmod +x "$TARGET_DIR/run.sh" "$TARGET_DIR/install.sh"

echo "Installiert nach: $TARGET_DIR"
echo "Desktop-Eintrag:   $DESKTOP_DIR/$APP_NAME.desktop"
echo "Starten über das Anwendungsmenü oder: $TARGET_DIR/run.sh"
