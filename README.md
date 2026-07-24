# Yildiz AI Studio – Vercel + Supabase

Diese Version ist für GitHub, Vercel und Supabase vorbereitet.

## 1. Supabase-Datenbank einrichten

1. Supabase öffnen.
2. Links **SQL Editor** anklicken.
3. **New query** wählen.
4. Den gesamten Inhalt aus `supabase-setup.sql` einfügen.
5. Auf **Run** klicken.

Start-Login danach:

- Benutzername: `admin`
- Passwort: `SafaStart2026!`

Das Passwort direkt nach dem ersten Login im Admin-Bereich ändern.

## 2. Dateien zu GitHub hochladen

Den Inhalt dieses Ordners in das GitHub-Repository hochladen. Vorhandene Dateien mit gleichem Namen ersetzen.

Wichtig sind besonders:

- `api/`
- `client/`
- `package.json`
- `vercel.json`
- `supabase-setup.sql`

Die alten Dateien `render.yaml` und der alte Ordner `server/` werden von Vercel nicht verwendet und können später gelöscht werden.

## 3. Vercel Environment Variables

In Vercel eintragen:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Optional für KI:

- `POLLINATIONS_KEY`

Für Video am besten einen Pollinations Publishable Key verwenden, der mit `pk_` beginnt.

## 4. Deploy

In Vercel:

- Framework Preset: `Other`
- Root Directory: `./`
- Build Command wird aus `vercel.json` übernommen
- Danach **Deploy**

## Funktionen

- Anmeldung ohne E-Mail
- Admin- und Mitarbeiterkonten
- Projekte dauerhaft in Supabase speichern
- Flyer- und Bildeditor mit verschiebbaren Elementen
- PNG-Export
- KI-Chat
- KI-Bilder
- KI-Videoclips
- Video-Timeline mit einzelnen Abschnitten
- Website-Builder und HTML-Export

Das automatische Zusammenfügen mehrerer MP4-Clips ist auf der kostenlosen Vercel-Version noch nicht aktiviert.
