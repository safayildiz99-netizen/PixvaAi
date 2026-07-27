# Yildiz AI V10.0.3

Vercel-Hobby-kompatible Produktionsgrundlage mit **einer einzigen öffentlichen Serverless Function**.

## Wichtigster V10.0.3-Fix

V10.0.2 legte alle Endpunkte als einzelne Dateien unter `/api` ab. V10.0.3 verschiebt die Handler nach `/server/api` und bündelt alle bisherigen API-Adressen über `/api/index.js`.

Im GitHub-Ordner `/api` darf nach der Installation nur noch diese Datei liegen:

```text
api/index.js
```

Alte Dateien und Unterordner unter `/api` müssen vor dem Upload gelöscht werden. Nur Dateien zu überschreiben löscht alte GitHub-Dateien nicht.

## Enthalten

- Supabase Auth statt eigener Passworttabelle
- RLS für Profile, Chats, Projekte, Medien, Designs, Websites, KI-Aufträge, Abos, Käufe, Kosten, Meldungen und Fehler
- privater Supabase Storage unter `nutzer-id/bilder`, `videos`, `pdf`, `designs` und `uploads`
- dauerhafte OpenAI-Sora-Aufträge plus Webhook
- serverseitige Abo-, Limit-, Budget-, Kostenwarnungs- und Idempotenzprüfung
- Stripe Checkout und PayPal; Preise können sichtbar, aber nicht kaufbar sein
- echter PDF-, DOCX- und XLSX-Export
- Bildeditor mit Textobjekten, Schriftarten, Ebenen, Zuschneiden, KI-Bereichsbearbeitung, Versionen, Vergleich und Export
- Systemstatus, Fehlerprotokoll, Audit-Protokoll, Sperren, Rate Limits und Meldesystem

## Kreditkartensicherheit

Yildiz AI nimmt keine rohe Kreditkartennummer im eigenen Formular oder Server entgegen. Karten werden über Stripe Checkout beziehungsweise PayPal eingegeben. Dadurch bleiben vollständige Kartendaten beim Zahlungsanbieter.

## Schrift in Bildern

Schrift, die bereits als Pixel in einem JPG oder PNG eingebrannt ist, ist kein editierbares Textobjekt. Der Editor kann neue echte Text-Ebenen anlegen; vorhandene Pixelschrift muss markiert, entfernt und anschließend als neue Text-Ebene gesetzt werden.
