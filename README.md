# Yildiz AI – Gemini, Opera und Gastzugang

Diese Version verwendet Gemini ausschließlich über eine geschützte Vercel-Funktion. Deshalb wird keine lokale GPU und kein WebGPU benötigt.

## Neu
- Funktioniert in Opera, Chrome, Safari und Edge.
- Automatische Wiederholungen und Modell-Fallback bei hoher Gemini-Auslastung.
- Neuester stabiler Gemini-Stand zuerst, danach Flash-Lite-Ausweichmodelle.
- Chat und Editoren können ohne Anmeldung geöffnet werden.
- Anmeldung ist nur für dauerhaftes Speichern, Projekte und Adminfunktionen nötig.
- API-Key bleibt serverseitig in Vercel.

## Vercel-Variablen
- `GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Optional: `GEMINI_MODEL`. Ohne diese Variable wählt Yildiz AI automatisch aktuelle stabile Modelle.


## Mitarbeiter-Passwort

Alle angemeldeten Konten haben jetzt links den Bereich **Mein Konto**. Dort können Mitarbeiter und Admins ihr eigenes Passwort ändern. Für bestehende Supabase-Projekte einmal `MITARBEITER-PASSWORT-FIX.txt` im SQL Editor ausführen.
