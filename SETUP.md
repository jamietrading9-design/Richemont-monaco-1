# 🚀 Richemont Monaco - Ubuntu Server Setup

Vollständige Anleitung zum Deployment auf einem Ubuntu Server.

## 📋 Voraussetzungen

- Ubuntu 18.04, 20.04, oder 22.04
- SSH Zugriff auf den Server
- Sudo Berechtigung
- Domain Name (optional, aber empfohlen)

## 🔧 Installation Schritt-für-Schritt

### Schritt 1: System aktualisieren

```bash
sudo apt update
sudo apt upgrade -y
```

### Schritt 2: Node.js installieren

```bash
# Node.js Repository hinzufügen (v18 LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Node.js installieren
sudo apt install -y nodejs

# Version prüfen
node --version
npm --version
```

### Schritt 3: Projekt vorbereiten

```bash
# Projektverzeichnis erstellen
mkdir -p /home/richemont
cd /home/richemont

# Projekt hochladen (von lokal)
# Option A: Mit SCP
scp -r /path/to/richemont-monaco user@your-server.com:/home/richemont/

# Option B: Mit Git
git clone https://your-repo.com/richemont-monaco.git
cd richemont-monaco
```

### Schritt 4: Dependencies installieren

```bash
cd /home/richemont/richemont-monaco

# Dependencies installieren
npm install

# Production-Modus setzen
export NODE_ENV=production
```

### Schritt 5: PM2 installieren (für Dauerbetrieb)

```bash
# PM2 global installieren
sudo npm install -g pm2

# Server starten
pm2 start server.js --name "richemont"

# Beim Systemstart automatisch starten
pm2 startup
pm2 save

# Status prüfen
pm2 status
```

Der Server läuft jetzt auf `http://localhost:3000`

---

## 🌐 Nginx Reverse Proxy Setup (Optional, aber empfohlen)

### Installation

```bash
sudo apt install -y nginx
```

### Configuration

```bash
# Config-Datei erstellen
sudo nano /etc/nginx/sites-available/richemont
```

Folgende Konfiguration einfügen:

```nginx
upstream richemont_app {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;

    # Logs
    access_log /var/log/nginx/richemont-access.log;
    error_log /var/log/nginx/richemont-error.log;

    # Proxy Settings
    location / {
        proxy_pass http://richemont_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1000;
}
```

### Aktivieren

```bash
# Symbolischen Link erstellen
sudo ln -s /etc/nginx/sites-available/richemont /etc/nginx/sites-enabled/

# Standard-Config deaktivieren (optional)
sudo rm /etc/nginx/sites-enabled/default

# Syntax prüfen
sudo nginx -t

# Nginx neu starten
sudo systemctl restart nginx
```

---

## 🔒 SSL/HTTPS mit Let's Encrypt

### Installation

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Zertifikat erstellen

```bash
sudo certbot --nginx -d your-domain.com

# Bei Aufforderung:
# - Email eingeben
# - Nutzungsbedingungen akzeptieren (A)
# - Newsletter-Abmeldung eingeben
```

### Auto-Renewal

```bash
# Bereits automatisch mit systemd aktiviert
sudo systemctl status certbot.timer

# Test des Auto-Renewals
sudo certbot renew --dry-run
```

---

## 📊 Monitoring & Logging

### PM2 Monitoring

```bash
# Echtzeit-Monitoring
pm2 monit

# Logs anzeigen
pm2 logs richemont

# Letzten 100 Zeilen
pm2 logs richemont --lines 100
```

### Nginx Logs

```bash
# Access Logs
sudo tail -f /var/log/nginx/richemont-access.log

# Error Logs
sudo tail -f /var/log/nginx/richemont-error.log
```

### System Logs

```bash
# PM2 Startup Logs
sudo journalctl -u pm2-richemont -f
```

---

## 🐳 Alternative: Docker Deployment

### Docker & Docker Compose installieren

```bash
# Docker installieren
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Docker Compose installieren
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Berechtigungen setzen
sudo usermod -aG docker $USER
newgrp docker
```

### Mit Docker Compose starten

```bash
cd /home/richemont/richemont-monaco

# Container starten
docker-compose up -d

# Status prüfen
docker-compose ps

# Logs anzeigen
docker-compose logs -f richemont
```

---

## 🔐 Sicherheitsmaßnahmen

### 1. Firewall konfigurieren (UFW)

```bash
# UFW aktivieren
sudo ufw enable

# SSH erlauben
sudo ufw allow 22/tcp

# HTTP erlauben
sudo ufw allow 80/tcp

# HTTPS erlauben
sudo ufw allow 443/tcp

# Status prüfen
sudo ufw status
```

### 2. Admin-Dashboard schützen

```bash
# Basic Auth für /admin.html (Nginx)
# .htpasswd Datei erstellen
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd admin

# Nginx Config aktualisieren
sudo nano /etc/nginx/sites-available/richemont
```

Folgende Zeilen in den `server` Block einfügen:

```nginx
location /admin.html {
    auth_basic "Richemont Admin";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://richemont_app;
    # ... weitere proxy settings ...
}
```

```bash
# Nginx neu starten
sudo systemctl restart nginx
```

### 3. Rate Limiting

```nginx
# In Nginx Config hinzufügen (vor dem server block)
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;

# Im server block
location / {
    limit_req zone=general burst=20 nodelay;
    # ...
}

location /api/ {
    limit_req zone=api burst=5 nodelay;
    # ...
}
```

---

## 💾 Backups

### Automatische tägliche Backups

```bash
# Backup-Verzeichnis erstellen
mkdir -p /home/richemont/backups

# Backup-Script erstellen
sudo nano /home/richemont/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/home/richemont/backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="$BACKUP_DIR/richemont-backup-$DATE.tar.gz"

# Data Verzeichnis backupen
tar -czf "$BACKUP_FILE" /home/richemont/richemont-monaco/data/

# Alte Backups löschen (älter als 30 Tage)
find "$BACKUP_DIR" -name "richemont-backup-*.tar.gz" -mtime +30 -delete

echo "Backup erstellt: $BACKUP_FILE"
```

```bash
# Ausführbar machen
chmod +x /home/richemont/backup.sh

# Zu Crontab hinzufügen (tägliche Backups um 2 Uhr nachts)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/richemont/backup.sh") | crontab -
```

---

## 🔄 Updates & Wartung

### Node.js aktualisieren

```bash
# Neue Version verfügbar?
sudo apt update
sudo apt upgrade nodejs

# Oder mit NVM (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

### Packages aktualisieren

```bash
cd /home/richemont/richemont-monaco

# Package-Updates prüfen
npm outdated

# Updates durchführen
npm update

# Sicherheits-Audits
npm audit

# Sicherheitslücken automatisch beheben
npm audit fix
```

### Server neu starten

```bash
# Graceful Restart (ohne Downtime)
pm2 restart richemont

# Mit Reload (ohne Downtime)
pm2 reload richemont --graceful-shutdown

# Oder alles neu starten
sudo systemctl restart nginx
pm2 restart richemont
```

---

## 🐛 Troubleshooting

### Server startet nicht

```bash
# Prozess auf Port 3000 prüfen
sudo lsof -i :3000

# PM2 Status
pm2 status

# Logs prüfen
pm2 logs richemont
```

### Nginx zeigt Fehler

```bash
# Syntax prüfen
sudo nginx -t

# Nginx Service Status
sudo systemctl status nginx

# Nginx Logs
sudo tail -f /var/log/nginx/richemont-error.log
```

### Admin-Dashboard zeigt leere Daten

```bash
# Data-Verzeichnis prüfen
ls -la /home/richemont/richemont-monaco/data/

# Dateien existieren?
cat /home/richemont/richemont-monaco/data/products.json
```

### SSL-Zertifikat erneuern

```bash
# Manuelle Erneuerung
sudo certbot renew --force-renewal

# Oder nur für eine Domain
sudo certbot renew -d your-domain.com --force-renewal
```

---

## 📞 Hilfreiche Befehle

```bash
# Server Status
pm2 status

# Server neu starten
pm2 restart richemont

# Server stoppen
pm2 stop richemont

# Server starten
pm2 start richemont

# Logs anzeigen (letzte 100 Zeilen)
pm2 logs richemont --lines 100

# System-Information
uname -a

# Festplatzenbelegung
df -h

# RAM-Nutzung
free -h

# Prozesse anzeigen
top

# Network-Verbindungen
sudo netstat -tulpn | grep :3000
```

---

## ✅ Post-Deployment Checkliste

- [ ] Node.js installiert und laufen
- [ ] Projekt hochgeladen und Dependencies installiert
- [ ] PM2 läuft und startet automatisch beim Boot
- [ ] Nginx als Reverse Proxy konfiguriert
- [ ] SSL-Zertifikat aktiv (grüner Schloss)
- [ ] Admin-Dashboard unter /admin.html erreichbar
- [ ] Daten werden gespeichert (data/ Verzeichnis)
- [ ] Backups konfiguriert
- [ ] Firewall konfiguriert
- [ ] Monitoring eingerichtet

---

## 🚨 Fehlerbehandlung

Bei Problemen, folgende Schritte durchführen:

1. **Logs prüfen**: `pm2 logs richemont`
2. **Prozess prüfen**: `pm2 status`
3. **Port prüfen**: `sudo lsof -i :3000`
4. **Nginx prüfen**: `sudo nginx -t`
5. **Disk-Space**: `df -h`
6. **RAM**: `free -h`
7. **Server neu starten**: `sudo reboot`

---

## 📚 Weitere Ressourcen

- [Node.js Dokumentation](https://nodejs.org/docs/)
- [PM2 Dokumentation](https://pm2.keymetrics.io/)
- [Nginx Dokumentation](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)
- [Ubuntu Server Guide](https://ubuntu.com/server/docs)

---

**Viel Erfolg bei der Bereitstellung!** 🎉

## Installation

### 1. Python Virtual Environment einrichten

```bash
cd /Users/jamie/Webseiten\ \webseite\ freddy/
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# oder: venv\Scripts\activate  # Windows
```

### 2. PostgreSQL installieren (falls noch nicht vorhanden)

**macOS (mit Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Datenbank erstellen:**
```bash
createdb richemont_db
createuser -P richemont_user
# Passwort eingeben: richemont_pass
```

Berechtigungen setzen:
```sql
ALTER USER richemont_user CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE richemont_db TO richemont_user;
```

### 3. Django Dependencies installieren

```bash
pip install -r requirements.txt
```

### 4. Datenbank Migrations durchführen

```bash
python manage.py makemigrations
python manage.py migrate
```

### 5. Admin-Benutzer und Produkte importieren

```bash
python manage.py init_admin
```

Dies erstellt:
- Admin-Benutzer: `jamie` / `jamielee.10`
- Importiert alle Produkte aus `products.json`

### 6. Server starten

```bash
python manage.py runserver 0.0.0.0:8000
```

Admin-Interface: http://localhost:8000/admin

## Benutzer-Logins

**Admin Panel:**
- URL: http://localhost:8000/admin
- Username: `jamie`
- Password: `jamielee.10`

## API Endpoints

### Authentifizierung (Mobile)

**Login:**
```bash
POST /api/auth/login/
Content-Type: application/json

{
  "username": "jamie",
  "password": "jamielee.10"
}
```

**Logout:**
```bash
POST /api/auth/logout/
```

**Aktuelle User Info:**
```bash
GET /api/auth/user/
```

### Produkte API

**Alle Produkte:**
```bash
GET /api/products/
```

**Featured Produkte:**
```bash
GET /api/products/featured/
```

**Nach Kategorie:**
```bash
GET /api/products/by_category/?slug=seide
```

**Produkt Details:**
```bash
GET /api/products/{slug}/
```

**Produkt erstellen (POST):**
```bash
POST /api/products/
Content-Type: application/json

{
  "slug": "neues-produkt",
  "number": "06",
  "title": "Neues Produkt",
  "description": "Beschreibung",
  "price": 499,
  "currency": "EUR",
  "material": "Seide",
  "sizes": "S,M,L",
  "category": 1,
  "featured": false,
  "active": true
}
```

**Produkt aktualisieren (PUT/PATCH):**
```bash
PUT /api/products/{slug}/
Content-Type: application/json

{
  "title": "Neuer Titel",
  "price": 599
}
```

### Admin Logs

**Alle Änderungen anzeigen:**
```bash
GET /api/logs/
```

## Mobile App Integration

### 1. Login beim Start

```javascript
const response = await fetch('http://localhost:8000/api/auth/login/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'jamie',
    password: 'jamielee.10'
  })
});
```

### 2. Produkte abrufen

```javascript
const products = await fetch('http://localhost:8000/api/products/', {
  method: 'GET',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});
```

### 3. Änderungen speichern

```javascript
const response = await fetch('http://localhost:8000/api/products/richemont-hemd/', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    price: 550,
    title: "Geänderter Titel"
  })
});
```

## Datenbank Schema

### Product (Produkt)
- `id` - Eindeutige ID
- `slug` - URL-freundlicher Name
- `number` - Produktnummer
- `title` - Produktname
- `description` - Beschreibung
- `price` - Preis
- `currency` - Währung (EUR, etc.)
- `material` - Material
- `category` - Kategoriezuordnung
- `featured` - Ist es Featured?
- `active` - Ist aktiv?
- `sizes` - Größen (kommagetrennt)
- `created_at` - Erstellt am
- `updated_at` - Zuletzt aktualisiert
- `updated_by` - Benutzer der aktualisiert hat

### Category (Kategorie)
- `id` - Eindeutige ID
- `name` - Kategoriename
- `slug` - URL-freundlicher Name
- `description` - Beschreibung

### AdminLog (Änderungsprotokoll)
- `id` - Eindeutige ID
- `user` - Admin-Benutzer
- `action` - Aktion (create/update/delete)
- `model_name` - Model Name
- `object_id` - Betroffene Object ID
- `changes` - JSON der Änderungen
- `timestamp` - Zeitstempel
- `ip_address` - IP Adresse

## PRODUCTION SETUP (für Online-Deployment)

### 1. Environment Variablen (.env)

```bash
DEBUG=False
SECRET_KEY=your-secret-key-change-this
DB_NAME=richemont_db
DB_USER=richemont_user
DB_PASSWORD=richemont_pass
DB_HOST=your-database-host
DB_PORT=5432
ALLOWED_HOSTS=your-domain.com,www.your-domain.com
```

### 2. Gunicorn für Production

```bash
pip install gunicorn
gunicorn config.wsgi:application --bind 0.0.0.0:8000
```

### 3. Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /static/ {
        alias /path/to/staticfiles/;
    }

    location /media/ {
        alias /path/to/media/;
    }
}
```

### 4. SSL mit Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Datensynchronisierung

Alle Änderungen werden:
1. ✅ Sofort in PostgreSQL gespeichert
2. ✅ Mit Benutzer und Zeitstempel protokolliert
3. ✅ Über API für alle Geräte verfügbar
4. ✅ In AdminLog gespeichert (Audit Trail)

## Weitere Konfiguration

Bearbeite `config/settings.py` für:
- Datenbankverbindung
- CORS-Einstellungen
- Email-Versand
- Caching
- CDN für Bilder

## Support

Bei Problemen:
1. Migrations: `python manage.py showmigrations`
2. Logs: `python manage.py shell`
3. Datenbank Test: `python manage.py dbshell`
