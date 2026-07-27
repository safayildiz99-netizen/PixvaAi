# Yildiz AI V10

Produktionsgrundlage mit:

- Supabase Auth statt eigener Passworttabelle
- RLS für Profile, Chats, Projekte, Medien, Designs, Websites, KI-Aufträge, Abos, Käufe, Kosten, Meldungen und Fehler
- privatem Supabase Storage unter `nutzer-id/bilder`, `videos`, `pdf`, `designs` und `uploads`
- dauerhaften OpenAI-Sora-Aufträgen plus Webhook
- serverseitiger Abo-, Limit-, Budget-, Kostenwarnungs- und Idempotenzprüfung
- Stripe Checkout und PayPal; Preise können sichtbar, aber nicht kaufbar sein
- echtem PDF-, DOCX- und XLSX-Export
- Bildeditor mit Textobjekten, Schriftarten, Ebenen, Zuschneiden, KI-Bereichsbearbeitung, Versionen, Vergleich und Export
- Systemstatus, Fehlerprotokoll, Audit-Protokoll, Sperren, Rate Limits und Meldesystem

## Wichtige Sicherheitsentscheidung

Yildiz AI nimmt keine rohe Kreditkartennummer im eigenen Formular oder Server entgegen. Karten werden über Stripe Checkout bzw. PayPal eingegeben. Dadurch bleiben Kartendaten beim Zahlungsanbieter.

## Einschränkung bei Schrift in Bildern

Schrift, die bereits als Pixel in einem JPG/PNG eingebrannt ist, ist kein editierbares Textobjekt. V10 bietet daher zwei Wege:

1. neue Text-Ebene hinzufügen und Schriftart frei ändern;
2. alten Textbereich markieren, per KI entfernen/ersetzen und anschließend als echte Text-Ebene neu setzen.
