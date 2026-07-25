# Update installieren

1. ZIP entpacken.
2. GitHub-Repository `Yildiz-AI` öffnen.
3. `Add file` → `Upload files` anklicken.
4. Alle Dateien und Ordner aus dem entpackten Ordner hochladen.
5. Vorhandene Dateien ersetzen.
6. Commit-Nachricht: `Payment-System entfernt – lokale KI`.
7. `Commit changes` anklicken.
8. Vercel veröffentlicht den neuen Commit normalerweise automatisch.
9. Falls nicht: Vercel → Deployments → neuestes Deployment → `Redeploy`.
10. Website mit `Cmd + Shift + R` neu laden.

## Danach in Vercel

Unter Settings → Environment Variables kann `POLLINATIONS_KEY` vollständig gelöscht werden. Benötigt werden nur die beiden Supabase-Variablen.

## Erster KI-Start

Beim ersten Senden einer Chat-Nachricht lädt der Browser ein lokales Modell. Das kann je nach Internet und Computer mehrere Minuten dauern. Danach wird das Modell im Browser-Cache verwendet.
