# Yildiz AI Medien-Studio Pro

Diese Version erweitert den bestehenden Yildiz-AI-Code für GitHub, Vercel und Supabase.

## Neu

- Fotorealistische KI-Bilder über Gemini Nano Banana, wenn dein Gemini-Key dafür freigeschaltet ist.
- Automatischer kostenloser Bild-Fallback, damit keine rohe „Payment Required“-Meldung angezeigt wird.
- Letzter lokaler SVG-Fallback, damit immer ein bearbeitbares Motiv zurückkommt.
- Bilder und Videos im Chat hochladen.
- Bei Videos werden vier Frames lokal herausgenommen und an Gemini zur Stichprobenanalyse gesendet.
- Video-Studio erzeugt aus KI-Bildern oder eigenen Bildern/Clips ein echtes Video.
- Automatische Bewegung, Übergänge, Titel und Hintergrundmusik.
- Eigene Musikdatei hochladen oder kostenlose automatisch erzeugte Musik verwenden.
- Videoexport als MP4, wenn der Browser MP4-Aufnahme unterstützt; sonst WebM.
- Fallback-Exporte als PDF-Storyboard und PNG-Szenen.
- Komplettes Medienprojekt als ZIP exportieren.
- Designs als PNG, PDF und ZIP exportieren.
- Websites als HTML oder ZIP mit CNAME-Datei exportieren.
- Gastzugang bleibt aktiv.
- Mitarbeiter und Admins können ihr eigenes Passwort unter „Mein Konto“ ändern.

## Benötigte Vercel-Variablen

- `GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Optional:

- `GEMINI_MODEL=gemini-3.6-flash`
- `GEMINI_IMAGE_MODEL=gemini-3.1-flash-image`

## Installation

1. ZIP entpacken.
2. Alle Inhalte in das GitHub-Repository `Yildiz-AI` hochladen.
3. Vorhandene Dateien ersetzen.
4. Commit-Nachricht: `Yildiz AI Medien Studio Pro`.
5. Vercel automatisch deployen lassen oder unter **Deployments → … → Redeploy** neu veröffentlichen.
6. Die Website mit `Cmd + Shift + R` neu laden.

## Supabase

Für die Medienfunktionen ist keine neue SQL-Datei nötig. Falls „Mein Konto“ / Passwort ändern noch nicht funktioniert, führe einmal `MITARBEITER-PASSWORT-FIX.txt` im Supabase SQL Editor aus.

## Ehrliche technische Grenze

Die lokale Videoerstellung erzeugt ein echtes, herunterladbares Video aus Bildern und Clips. Sie ist nicht dasselbe wie ein teures generatives Bewegungsmodell wie Veo. Wenn Gemini-Bildgenerierung nicht verfügbar ist, nutzt Yildiz AI automatisch einen kostenlosen öffentlichen oder lokalen Ersatz, statt eine Zahlungsaufforderung anzuzeigen.
