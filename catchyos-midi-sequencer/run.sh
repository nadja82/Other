#!/usr/bin/env bash
# Lokaler Start ohne Installation: startet den Server und öffnet den Browser
cd "$(dirname "$0")"
PORT="${CATCHYOS_MIDI_PORT:-8080}" node server.mjs &
SERVER_PID=$!
sleep 1
xdg-open "http://localhost:$PORT" 2>/dev/null || echo "Öffne http://localhost:$PORT"
wait $SERVER_PID
