# Yildiz AI V10 Production

Eine neue Produktionsgrundlage für Yildiz AI mit sicherem Kontosystem, privaten Nutzerdaten, dauerhaften Medienaufträgen, echtem Editor, Dateierstellung und Zahlungen.

## Kernfunktionen

- Supabase Auth statt eigener Passworttabelle
- RLS für alle nutzerbezogenen Daten
- privater Supabase Storage unter der jeweiligen Nutzer-ID
- dauerhafte OpenAI-Sora-Aufträge mit Webhook
- serverseitige Abo-, Limit-, Budget-, Kostenwarnungs- und Idempotenzprüfung
- Stripe-Kartencheckout und PayPal
- einmalige kostenpflichtige Update-ZIPs
- echtes PDF, Word/DOCX und Excel/XLSX
- Bildeditor mit Text-Ebenen, Schriften, Ebenen, KI-Maske und Versionen
- Produktbildsuche mit Quelle und Rechtehinweis
- Systemstatus, Fehlerprotokoll, Meldungen, Audit und Nutzer-Sperren

## Start

1. `V10-START-HIER.txt` lesen.
2. `V10-SUPABASE-EINFACH-OEFFNEN.html` öffnen und den SQL-Code in Supabase ausführen.
3. Werte aus `.env.example` in Vercel eintragen.
4. Stripe-, PayPal- und OpenAI-Webhooks konfigurieren.
5. `npm run check` und `npm test` ausführen.
6. `tests/MANUELLER-ABNAHMETEST.md` vollständig abarbeiten.

## Kreditkarten

V10 nimmt absichtlich keine vollständige Kreditkartennummer auf der eigenen Webseite entgegen. Bei Stripe wird ausschließlich ein gehosteter Kartencheckout geöffnet. PayPal wird ebenfalls beim Zahlungsanbieter bestätigt. Yildiz AI speichert deshalb keine vollständigen Karteninformationen.

## Zahlungsziel

Der Admin wählt in Yildiz AI Stripe oder PayPal als aktiven Anbieter. Das Geld geht an das Händlerkonto, das serverseitig über die zugehörigen Vercel-Zugangsdaten konfiguriert wurde. Eine Kontobezeichnung kann im Adminbereich angezeigt werden; geheime Händlerzugänge bleiben ausschließlich in Vercel.

## Kostenpflichtige Updates

Ein Admin lädt die Update-ZIP unter **Admin → Zahlungen → Produkte** hoch, setzt den Preis und aktiviert `Kaufbar`. Wird `Kaufbar` oder der globale Zahlungsschalter deaktiviert, bleibt der Preis auf Wunsch sichtbar, aber ein Kauf ist nicht möglich. Nur ein bezahltes Konto erhält einen kurz gültigen privaten Download-Link.

## Schrift in vorhandenen Bildern

Bereits in JPG/PNG eingebrannte Schrift ist nur noch Pixelinhalt. V10 kann den Bereich per KI entfernen oder ersetzen und danach eine neue echte Text-Ebene hinzufügen. Diese Text-Ebene lässt sich doppelklicken, ändern und mit einer anderen Schriftart formatieren.
