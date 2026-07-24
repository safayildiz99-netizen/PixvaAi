# Safa AI Studio

Ein selbst gehostetes KI- und Design-Studio für Werbetechnik. Die Oberfläche orientiert sich an ChatGPT: linke Navigation, Chat/Work-Umschaltung und getrennte Werkzeuge.

## Enthalten

- Anmeldung **ohne E-Mail** per Benutzername und Passwort
- Admin-Bereich: Mitarbeiterkonten erstellen, aktivieren und deaktivieren
- KI-Chat für Werbetechnik, Angebote und Werbetexte
- KI-Bildgenerator mit anschließendem Canva-ähnlichem Editor
- Angebots- und Flyer-Editor mit Drag & Drop, Text, Preisbutton, Formen, Logo/Bild-Upload und PNG-Export
- Formate 1:1, 4:5 und 9:16
- Video-Studio mit sichtbaren Abschnitten, Reihenfolge, Einzelgenerierung und MP4-Zusammenführung
- Website-Builder mit Live-Vorschau und HTML-Export
- Lokale Projektspeicherung auf dem eigenen Server
- GitHub-fertige Projektstruktur

## Wichtig zu „kostenlos“

Der Quellcode ist kostenlos und läuft lokal ohne monatliche Softwaregebühr. Der Editor, Konten, Projekte und Website-Export funktionieren ohne KI-Schlüssel. Für echte KI-Bilder, KI-Texte und KI-Videos wird ein externer oder lokaler KI-Dienst benötigt. Diese Version unterstützt Pollinations. Dessen kostenlose Nutzung und Limits können sich ändern; eine unbegrenzte Gratisnutzung kann niemand seriös garantieren.

## Schnellstart auf Mac

1. Node.js 20.19 oder neuer installieren.
2. ZIP entpacken.
3. Die Datei `START-MAC.command` doppelt anklicken. Falls macOS blockiert: Rechtsklick → Öffnen.
4. Browser öffnen: `http://localhost:5173`

Alternativ im Terminal:

```bash
npm install
npm run setup
npm run dev
```

## Schnellstart auf Windows

1. Node.js 20.19 oder neuer installieren.
2. ZIP entpacken.
3. `START-WINDOWS.bat` doppelt anklicken.
4. Browser öffnen: `http://localhost:5173`

## Erster Admin-Zugang

- Benutzername: `admin`
- Passwort: `SafaStart2026!`

Nach dem ersten Login sofort unter **Admin → Eigenes Passwort ändern** ein neues Passwort setzen.

## KI aktivieren

1. Einen API-Key bei Pollinations erstellen.
2. Als Admin anmelden.
3. **Admin & Einstellungen** öffnen.
4. Key in „Pollinations API-Key“ eintragen und speichern.

Alternativ `.env.example` in `.env` umbenennen und dort `POLLINATIONS_KEY` eintragen. Bei einer echten Online-Veröffentlichung außerdem `JWT_SECRET` durch eine lange zufällige Zeichenfolge ersetzen.

## Produktion

```bash
npm run build
npm run start
```

Danach läuft die komplette App standardmäßig unter `http://localhost:8787`.

## Daten und Backups

- Benutzer/Projekte/Einstellungen: `server/data/`
- Hochgeladene und generierte Dateien: `server/uploads/`

Diese beiden Ordner regelmäßig sichern. Für mehrere gleichzeitige Nutzer und eine öffentliche Firmenplattform sollte später PostgreSQL oder Supabase statt JSON-Dateien eingesetzt werden.

## GitHub hochladen

Siehe `GITHUB.md`. Das Projekt enthält keine API-Keys und keine gespeicherten Benutzerdateien im Repository.
