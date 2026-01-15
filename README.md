# Server Dashboard

Ein leichtgewichtiges, lokales Dashboard fuer CPU, RAM, Disk, Traffic, Prozesse und Temperatur.
Das Dashboard laeuft im LAN und zeigt Live-Stats. Traffic-Historie speichert die letzten 7 Tage.

## Voraussetzungen

- Node.js 18+
- Windows oder Linux

## Start (Windows)

```powershell
cd C:\Users\nikit\Desktop\server-dashboard
node server.js
```

Im Browser:
- http://localhost:8080
- oder eine der angezeigten LAN-IPs

## Start (Linux)

```bash
cd /pfad/zum/server-dashboard
node server.js
```

Im Browser:
- http://localhost:8080
- oder http://<server-ip>:8080

## Temperatur (Linux)

- Standard: `/sys/class/thermal/thermal_zone0/temp`
- Optional: `lm-sensors`

Installation (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install lm-sensors
sudo sensors-detect
```

## Persistenz

Die Traffic-Historie wird in `data/traffic-db.json` gespeichert.
Wenn die Datei nicht existiert, wird sie automatisch erstellt.

## Hinweise

- Aktualisierung standardmaessig alle 10 Sekunden (Server und Frontend).
- Wenn andere Geraete nicht zugreifen koennen: Firewall-Port 8080 freigeben.
