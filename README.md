# Yildiz AI – ohne Payment-/Usage-System

Diese Version entfernt Pollinations und alle externen KI-Guthaben aus dem Projekt.

## Was jetzt kostenlos lokal läuft

- Allgemeiner KI-Chat direkt im Browser mit WebLLM
- Kein API-Key
- Keine Nachrichten-Credits
- Keine Payment-Required-Antwort
- Lokale grafische Motive für Flyer und Posts
- Canva-ähnlicher Editor für Text, Preise, Bilder und Logos
- Website-Texte mit lokaler Browser-KI
- Video-Timeline für eigene hochgeladene Clips
- Supabase-Anmeldung ohne sichtbare E-Mail
- Admin- und Mitarbeiterkonten
- Projekte speichern

## Wichtige technische Grenze

Der lokale Chat benötigt WebGPU. Auf einem aktuellen Desktop-Browser funktioniert er am besten. Beim ersten Start wird das Modell einmal heruntergeladen und anschließend im Browser-Cache gespeichert.

Fotorealistische Text-zu-Bild- und Text-zu-Video-Modelle wurden entfernt, weil sie auf einem kostenlosen Vercel-Projekt keine eigene GPU haben. Statt einer Zahlungsaufforderung bietet die App lokale Motive, Bild-Upload und einen lokalen Video-Timeline-Editor.

## Vercel-Variablen

Nur diese beiden Variablen werden benötigt:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

`POLLINATIONS_KEY` kann in Vercel gelöscht werden.

## Sicherheit

Die Sitzungskennung für die Anmeldung bleibt bestehen. Sie schützt Admin- und Mitarbeiterkonten und ist kein Bezahl-, Guthaben- oder Usage-System.

## Gemini-Version

Diese Version verwendet keine lokale WebGPU-KI mehr. Der Chat und der Website-Textgenerator senden Anfragen über die geschützte Vercel-Funktion `api/ai/chat.js` an Gemini. In Vercel muss `GEMINI_API_KEY` gesetzt sein. Der Schlüssel darf nicht mit `VITE_` beginnen.
