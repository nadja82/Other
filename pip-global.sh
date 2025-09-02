#!/bin/bash
# Script: ensure_pip_break_system_packages.sh
# Zweck: sicherstellen, dass in /etc/pip.conf unter [global]
#        die Zeile "break-system-packages = true" vorhanden ist.

CONF_FILE="/etc/pip.conf"
SETTING="break-system-packages = true"

# Prüfen, ob die Datei existiert, ansonsten erstellen
if [ ! -f "$CONF_FILE" ]; then
    echo "Datei $CONF_FILE existiert nicht – wird neu erstellt."
    sudo mkdir -p "$(dirname "$CONF_FILE")"
    echo -e "[global]\n$SETTING" | sudo tee "$CONF_FILE" > /dev/null
    exit 0
fi

# Prüfen, ob [global] existiert
if ! grep -q "^\[global\]" "$CONF_FILE"; then
    echo "[global]-Sektion nicht gefunden – wird hinzugefügt."
    echo -e "\n[global]\n$SETTING" | sudo tee -a "$CONF_FILE" > /dev/null
    exit 0
fi

# Prüfen, ob Setting schon vorhanden ist
if grep -A5 "^\[global\]" "$CONF_FILE" | grep -q "^$SETTING"; then
    echo "Einstellung bereits vorhanden – keine Änderung nötig."
else
    echo "Einstellung fehlt – wird hinzugefügt."
    # Nach der Zeile [global] einfügen
    sudo sed -i "/^\[global\]/a $SETTING" "$CONF_FILE"
fi
