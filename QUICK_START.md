# 🚀 QUICK START ANLEITUNG

## Schritt 1️⃣: PostgreSQL installieren

### macOS (mit Homebrew):
```bash
brew install postgresql
brew services start postgresql
```

### Linux (Ubuntu/Debian):
```bash
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Windows:
Download von: https://www.postgresql.org/download/windows/

---

## Schritt 2️⃣: Datenbank & Benutzer erstellen

```bash
# Verbinde mit PostgreSQL
psql -U postgres

# Im psql prompt:
CREATE DATABASE richemont_db;
CREATE USER richemont_user WITH PASSWORD 'richemont_pass';
ALTER USER richemont_user CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE richemont_db TO richemont_user;
\q
```

---

## Schritt 3️⃣: Django Setup ausführen

### macOS / Linux:
```bash
cd /Users/jamie/Webseiten\ \webseite\ freddy/
bash setup.sh
```

### Windows:
```bash
cd C:\Users\jamie\Webseiten\webseite freddy
setup.bat
```

---

## Schritt 4️⃣: Django Server starten

```bash
# Terminal im Projektverzeichnis (venv aktiviert)
python manage.py runserver
```

**Output:**
```
Starting development server at http://127.0.0.1:8000/
Quit the server with CONTROL-C.
```

---

## Schritt 5️⃣: Zugriff

Öffne im Browser:

### 🏠 **Dashboard (Home)**
👉 http://localhost:8000

### 🔐 **Admin Panel**
👉 http://localhost:8000/admin
- Username: `jamie`
- Password: `jamielee.10`

### 📱 **API Docs**
👉 http://localhost:8000/api/products/

---

## 📲 Handy/Tablet Zugriff

### MacBook IP finden:
```bash
ifconfig | grep "inet "
```

Dann in Handy Browser:
```
http://[deine-ip]:8000/admin
```

Z.B.: `http://192.168.1.100:8000/admin`

---

## 🎯 Erstes Mal im Admin

1. Gehe zu http://localhost:8000/admin
2. Melde dich an (jamie / jamielee.10)
3. Klicke auf "Products" → alle Produkte sind bereits importiert
4. Bearbeite, lösche, oder erstelle neue Produkte
5. Alle Änderungen werden **SOFORT** in PostgreSQL gespeichert

---

## 📝 Änderungen speichern

### Im Admin Panel:
- Produkt bearbeiten → "Save" klicken → **Gespeichert!** ✅

### In der Mobile App / API:
```javascript
// Produkt aktualisieren
const response = await fetch('http://192.168.1.100:8000/api/products/richemont-hemd/', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    price: 550,
    title: "Neuer Titel"
  })
});

// Sofort in Datenbank gespeichert! 💾
```

---

## 🐛 Häufige Fehler

### ❌ "could not translate host name 'db' to address"
→ PostgreSQL läuft nicht
```bash
brew services start postgresql
```

### ❌ "ModuleNotFoundError: No module named 'django'"
→ Requirements nicht installiert
```bash
pip install -r requirements.txt
```

### ❌ "FATAL: role 'richemont_user' does not exist"
→ Datenbank nicht korrekt erstellt
→ Wiederhole Schritt 2

### ❌ "Port 8000 in use"
→ Anderer Port verwenden
```bash
python manage.py runserver 8001
```

---

## ✨ Was ist bereits eingebaut?

✅ Produkte-Verwaltung (CRUD)
✅ Kategorien (Seide, Wolle, Baumwolle, etc.)
✅ Featured Products
✅ Admin Änderungsprotokoll (wer ändert was wann)
✅ REST API für Mobile Apps
✅ Automatische Speicherung
✅ Benutzer-Verwaltung
✅ CORS für Cross-Domain Access

---

## 📱 Nur über Handy editieren?

Wenn du nur vom Handy aus editieren möchtest:

1. Finde deine MacBook IP:
```bash
ifconfig | grep "inet "
```

2. Öffne im Handy-Browser:
```
http://[ip-adresse]:8000/admin
```

3. Melde dich an (jamie / jamielee.10)

4. Bearbeite Produkte direkt vom Handy

5. Alles wird **SOFORT** gespeichert! 💾

---

## 🌐 Online ins Internet?

Wenn du das online stellen möchtest:

1. Kaufe einen Domain Namen (z.B. richemont.de)
2. Mietе einen Server mit PostgreSQL
3. Lade den Code auf den Server hoch
4. Setze `DEBUG=False` in settings.py
5. Starte mit Gunicorn + Nginx

→ Siehe `SETUP.md` für Production Details

---

## 🆘 Weitere Hilfe

- **Vollständige Docs**: [SETUP.md](SETUP.md)
- **API Doku**: [README.md](README.md)
- **Django Docs**: https://docs.djangoproject.com
- **PostgreSQL Docs**: https://www.postgresql.org/docs/

---

## 💡 Pro-Tipps

1. **Backups machen**:
```bash
pg_dump richemont_db > backup.sql
```

2. **Datenbank ansehen**:
```bash
python manage.py shell
>>> from apps.products.models import Product
>>> Product.objects.all()
```

3. **Logs ansehen**:
```bash
python manage.py shell
>>> from apps.products.models import AdminLog
>>> AdminLog.objects.all()[:5]  # Letzte 5 Änderungen
```

---

**Happy Admin-ing! 🎉**

Wenn alles funktioniert → ✅ Du bist fertig!

Alle Änderungen werden automatisch gespeichert und sind über `/admin` oder die API erreichbar.
