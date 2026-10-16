# Richemont Monaco - Designer Clothing Website

Eine elegante, moderne Website für Designerkleidung mit integrierter Admin-Konsole zur Verwaltung von Produkten und Website-Inhalten.

## 🎨 Features

- **Modernes Frontend**: Luxurious Design mit dunklem Theme
- **Admin-Dashboard**: Einfache Verwaltung von Produkten und Website-Inhalten
- **Node.js Express Backend**: Einfach, schnell, fehlerlos
- **JSON-basierte Datenbank**: Keine Datenbankabhängigkeiten
- **Ubuntu Server Ready**: Vollständig vorbereitet für Linux-Deployment
- **Docker Support**: Für einfaches Deployment überall

## 📁 Struktur

```
.
├── server.js              # Express Server (Backend)
├── package.json           # Node.js Dependencies
├── richemonte/
│   └── webseite/          # Frontend & Admin Interface
│       ├── index.html     # Startseite
│       ├── admin.html     # Admin-Dashboard
│       ├── products.html  # Produkte-Übersicht
│       ├── showroom.html  # Showroom
│       ├── collections.html # Kategorien
│       └── ...
├── data/                  # JSON Datenspeicher (wird automatisch erstellt)
│   ├── products.json      # Produkt-Katalog
│   └── settings.json      # Website-Einstellungen
```

## 🚀 Schnellstart (Local Entwicklung)

### Voraussetzungen
- Node.js 18+
- npm oder yarn

### Installation

```bash
# 1. Dependencies installieren
npm install

# 2. Sichere Umgebungsvariablen setzen und Server starten
export JWT_SECRET="$(openssl rand -base64 48)"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="replace-with-a-unique-password-at-least-12-characters"
npm start
```

Server läuft auf: **http://localhost:3000**

`JWT_SECRET` muss mindestens 32 Bytes lang sein. `ADMIN_USERNAME` und ein mindestens 12 Zeichen langes `ADMIN_PASSWORD` werden beim ersten Start zum Anlegen des Admin-Kontos verwendet. Bei vorhandenen Konten mit den früheren Standardpasswörtern müssen diese Variablen gesetzt sein, damit der Server das angegebene Konto sicher zurücksetzt und weitere betroffene Standardkonten deaktiviert. Speichere diese Werte in einer lokalen, nicht eingecheckten Umgebungsdatei oder in der Secret-Verwaltung des Hosters. Der Server startet ohne sicheren JWT-Schlüssel nicht.

- 🏠 Webseite: http://localhost:3000/
- 🔧 Admin-Dashboard: http://localhost:3000/admin.html

## 📱 Admin-Dashboard Funktionen

Das Admin-Dashboard (`/admin.html`) ermöglicht:

- ✅ **Produkte verwalten**: Hinzufügen, Bearbeiten, Löschen
- 📸 **Bilder auswählen**: Aus vordefinierten Bildern wählen
- 💰 **Preise & Rabatte**: Mit automatischer Rabatt-Berechnung
- 🏷️ **Kategorien & Größen**: Flexible Verwaltung
- 🌟 **Featured Products**: Hervorheben auf Startseite
- ⚙️ **Website-Einstellungen**: Titel, Untertitel ändern

**Login**: Mit dem bei der Ersteinrichtung gesetzten Admin-Benutzer und Passwort.

## 🐳 Docker Deployment

### Mit Docker Compose (empfohlen)

```bash
# JWT_SECRET sowie beim ersten Start ADMIN_USERNAME und ADMIN_PASSWORD setzen
export JWT_SECRET="$(openssl rand -base64 48)"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="replace-with-a-unique-password-at-least-12-characters"
docker-compose up -d

# Server läuft auf: http://localhost:3000
```

### Mit Docker allein

```bash
# Image bauen
docker build -t richemont-monaco .

# Container starten (lokale .env-Datei und Datenspeicher bereitstellen)
docker run --env-file .env -v ./data:/app/data -p 3000:3000 -d richemont-monaco
```

## 🖥️ Ubuntu Server Deployment

### Schritt 1: Vorbereitung

```bash
# SSH auf Server verbinden
ssh user@your-server.com

# Node.js installieren (falls nicht vorhanden)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### Schritt 2: Projekt hochladen

```bash
# Lokal: Projekt auf Server kopieren
scp -r /path/to/richemont-monaco user@your-server.com:/home/user/

# Oder: Mit Git
cd /home/user
git clone https://your-repo.com/richemont-monaco.git
cd richemont-monaco
```

### Schritt 3: Dependencies & Start

```bash
# Dependencies installieren
npm install

# Server starten (mit PM2 für Dauerbetrieb)
npm install -g pm2
pm2 start server.js --name "richemont"
pm2 startup
pm2 save
```

### Schritt 4: Nginx Reverse Proxy (optional)

```bash
# Nginx installieren
sudo apt install -y nginx

# Config erstellen: /etc/nginx/sites-available/richemont
sudo nano /etc/nginx/sites-available/richemont
```

Nginx Config:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Nginx aktivieren & starten
sudo ln -s /etc/nginx/sites-available/richemont /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

### Schritt 5: SSL/HTTPS (mit Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 🔧 API Endpoints

| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| GET | `/api/products` | Alle Produkte abrufen |
| GET | `/api/settings` | Website-Einstellungen abrufen |
| GET | `/api/all` | Alle Daten (Admin) |
| POST | `/api/products` | Produkte aktualisieren (Admin) |
| POST | `/api/settings` | Einstellungen aktualisieren (Admin) |
| POST | `/api/all` | Alle Daten aktualisieren (Admin) |

## 📊 Datenspeicherung

Alle Daten werden in JSON-Dateien im `data/` Verzeichnis gespeichert:

- `data/products.json`: Produkt-Katalog
- `data/settings.json`: Website-Konfiguration

Diese werden automatisch bei Änderungen über das Admin-Dashboard aktualisiert.

## 🛡️ Sicherheit (Hinweise)

⚠️ **Hinweis**: Das Admin-Dashboard hat aktuell keine Authentifizierung. Für Produktionsumgebungen wird empfohlen:

1. Admin-Seite hinter Basic Auth schützen
2. Umgebungsvariablen für Passwörter verwenden
3. HTTPS erzwingen
4. IP-Whitelist implementieren

## 🐛 Troubleshooting

### Server startet nicht
```bash
# Port 3000 ist möglicherweise belegt
lsof -i :3000
# Anderen Prozess beenden oder Port ändern: PORT=8000 npm start
```

### Admin-Dashboard zeigt keine Daten
```bash
# data/ Verzeichnis und JSON-Dateien prüfen
ls -la data/
```

### Änderungen werden nicht gespeichert
```bash
# Datei-Permissions prüfen
chmod 755 data/
chmod 644 data/*.json
```

## 🌐 GitHub-Deployment

1. Repository auf GitHub anlegen oder vorhandenes Repository verbinden.
2. In den Repository-Einstellungen unter Pages die Option „GitHub Actions“ aktivieren.
3. Die Datei [.github/workflows/deploy.yml](.github/workflows/deploy.yml) wird beim Push auf den Branch main automatisch ausgeführt.
4. Nach Abschluss ist die Seite unter der GitHub-Pages-URL erreichbar.

## 📝 Umgebungsvariablen

Folgende Variablen sind für den sicheren Betrieb relevant:

```bash
PORT=3000              # Server-Port (optional, Standard: 3000)
NODE_ENV=production    # Laufzeitumgebung
JWT_SECRET=            # Pflicht; mindestens 32 zufällige Bytes
ADMIN_USERNAME=        # Pflicht nur beim Anlegen des ersten Admin-Kontos
ADMIN_PASSWORD=        # Pflicht beim ersten Start; mindestens 12 Zeichen
```

Beispiel:
```bash
PORT=8080 npm start
```

## 🚢 Production Tipps

1. **Process Manager**: Verwende PM2, Forever oder Systemd
2. **Load Balancer**: Für Multi-Server Setup
3. **Backups**: Regelmäßige Backups der `data/` Dateien
4. **Monitoring**: Verwende PM2+ oder New Relic
5. **Updates**: Node.js und Packages regelmäßig aktualisieren

## 📄 Lizenz

© 2026 Richemont Monaco. All rights reserved.

## 📧 Support

Für Fragen oder Probleme: [support@richemont-monaco.com](mailto:support@richemont-monaco.com)
