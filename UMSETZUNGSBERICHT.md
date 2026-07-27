# Yildiz AI V10.0.3 – Umsetzungsbericht

## Behobener Vercel-Hobby-Fehler

Die V10.0.2 enthielt 31 JavaScript-Dateien im Top-Level-Ordner `api`. Vercel behandelte diese als getrennte Serverless Functions und brach das Hobby-Deployment ab.

V10.0.3 verwendet diese Struktur:

```text
api/index.js          eine öffentliche Vercel Function
server/api/**         interne Handler und Hilfsdateien
```

`vercel.json` leitet alle bisherigen `/api/...`-Adressen an `api/index.js` weiter. Der Router ruft danach den passenden internen Handler auf. Die Oberfläche und Webhook-Adressen müssen deshalb nicht geändert werden.

## Öffentliche API-Routen

Der zentrale Router enthält 28 Routen für:

- Admin, Nutzer und Systemstatus
- Gemini-Chat, OpenAI-Bilder und Sora-Videos
- Supabase-Dateien und echte Dokumenterstellung
- Bild- und Websuche
- Stripe und PayPal
- OpenAI-, Stripe- und PayPal-Webhooks
- Kosten- und Nutzungsübersichten

## Sicherheit

Die Webhook-Signaturprüfung bleibt erhalten. Der zentrale Router deaktiviert die automatische Body-Verarbeitung, damit Stripe- und OpenAI-Signaturen auf dem unveränderten Request-Body geprüft werden können. Normale JSON-Endpunkte lesen und begrenzen ihren Body weiterhin selbst.

## Wichtig beim Update eines bestehenden GitHub-Repositories

Ein Datei-Upload ersetzt vorhandene Dateien, löscht aber keine alten Dateien. Vor dem Upload muss der bisherige Ordner `api` vollständig gelöscht werden. Danach wird der neue Ordner `api` aus V10.0.3 hochgeladen; er enthält nur `index.js`.

## Prüfungen

- genau eine JavaScript-Datei unter dem öffentlichen Ordner `api`
- 28 Router-Einträge für 28 interne Handler
- lokale Importpfade geprüft
- JavaScript-Syntax geprüft
- React/JSX transpiliert und geprüft
- 8 automatische Sicherheits- und Strukturtests bestanden
- SQL-RLS-, Storage-, Kosten- und Idempotenzbausteine geprüft
- Geheimnis-Scan ohne eingebettete produktive Schlüssel

Ein echter Live-End-to-End-Test mit den privaten Supabase-, OpenAI-, Gemini-, Stripe- und PayPal-Zugängen des Zielprojekts ist außerhalb des Zielprojekts nicht möglich.
