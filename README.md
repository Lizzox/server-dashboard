# 🖥️ Server Dashboard

Ein **leichtgewichtiges, lokales Web-Dashboard** zur Überwachung deines Servers.  
Es zeigt **Live-Statistiken** zu CPU, RAM, Festplatten, Netzwerk-Traffic, Prozessen und Temperatur – direkt im Browser, innerhalb deines Netzwerks.

## ✨ Features

- 📊 Live-Statistiken in Echtzeit  
- 🌡️ Temperaturanzeige (Linux)  
- 📈 Netzwerk-Traffic mit **7 Tage Historie**  
- 🌐 Zugriff über LAN / lokale IP  
- ⚡ Minimalistisch & ressourcenschonend  

**Support & Feedback**  
- Discord: https://discord.com/users/784521248944291860  
- lizzox

---

## ✅ Voraussetzungen

- Node.js **18 oder höher**
- Windows oder Linux

---

## 🚀 Start (Windows)

```powershell
cd server-dashboard
node server.js
```

Im Browser:
- http://localhost:8080  
- oder eine der im Terminal angezeigten **LAN-IP-Adressen**

---

## 🚀 Start (Linux)

```bash
cd /pfad/zum/server-dashboard
node server.js
```

Im Browser:
- http://localhost:8080  
- oder http://<server-ip>:8080

---

## 🌡️ Temperatur (Linux)

Standard:
- `/sys/class/thermal/thermal_zone0/temp`

Optional: **lm-sensors**

### Installation (Ubuntu / Debian)

```bash
sudo apt update
sudo apt install lm-sensors
sudo sensors-detect
```

---

## 💾 Persistenz

Die Traffic-Historie wird lokal gespeichert unter:

```text
data/traffic-db.json
```

- Wird automatisch erstellt, falls nicht vorhanden  
- Speichert die letzten **7 Tage**

---

## ⚙️ Hinweise

- 🔄 Aktualisierung standardmäßig **alle 10 Sekunden** (Server & Frontend)
- 🔓 Wenn andere Geräte keinen Zugriff haben:  
  **Firewall-Port 8080 freigeben**

---

## 🖼️ Screenshots

### Desktop (Web)
![Server Dashboard Desktop](https://us-east-1.tixte.net/uploads/lizzox.tixte.co/image.png)

### Mobile (iPad)
![Server Dashboard Mobile](https://us-east-1.tixte.net/uploads/lizzox.tixte.co/IMG_0032.jpg)
