# Update-Anleitung: Medien-Studio Pro

1. ZIP entpacken.
2. GitHub-Repository **Yildiz-AI** öffnen.
3. **Add file → Upload files**.
4. Alle Dateien und Ordner aus dem entpackten Ordner hochladen.
5. Vorhandene Dateien ersetzen.
6. Commit-Nachricht: `Yildiz AI Medien Studio Pro`.
7. **Commit changes** anklicken.
8. Vercel neu deployen.
9. Website mit `Cmd + Shift + R` neu laden.

## Vercel

Erforderlich:

- `GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Nicht erforderlich:

- `POLLINATIONS_KEY`

Die öffentliche Bildquelle wird nur als automatischer Fallback verwendet und benötigt keinen in Vercel gespeicherten Schlüssel.

## Supabase

Keine neue SQL-Datei für Medien nötig. Nur falls die Passwortänderung fehlt, einmal `MITARBEITER-PASSWORT-FIX.txt` ausführen.
