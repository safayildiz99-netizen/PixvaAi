# Yildiz AI V10 – manueller Abnahmetest

## Auth und Datenschutz
- [ ] Konto A anmelden, abmelden und auf einem zweiten Gerät wieder anmelden.
- [ ] Konto B anlegen und prüfen, dass Konto A und B keine gemeinsamen Chats, Projekte oder Dateien sehen.
- [ ] Temporäres Admin-Passwort zwingt zur Passwortänderung.
- [ ] Gesperrtes Konto kann keine API, Tabelle oder Storage-Datei mehr öffnen.
- [ ] Normale Nutzer sehen den Adminbereich nicht.

## Storage und Dateien
- [ ] Bild, Video, PDF, DOCX und XLSX hochladen.
- [ ] Zu große und unerlaubte Dateien werden abgelehnt.
- [ ] PDF, DOCX und XLSX erstellen; jede Datei ist größer als 0 Byte und öffnet auf Handy und Computer.
- [ ] Manipulierte Asset-ID eines anderen Kontos liefert 403.

## Bilder und Editor
- [ ] KI-Bild erstellen und als Vollbild im Editor öffnen.
- [ ] Text-Ebene hinzufügen, doppelklicken, Inhalt und Schriftart ändern.
- [ ] Zuschneide-Rahmen, Ebenenliste, Original wiederherstellen, Version speichern und Vorher/Nachher prüfen.
- [ ] Bereich markieren, per KI bearbeiten und als neue Version speichern.
- [ ] PNG, JPG und PDF exportieren.

## Videos
- [ ] Sora-Video starten, Seite schließen, erneut anmelden und Auftrag wiederfinden.
- [ ] Webhook setzt Status auf abgeschlossen und speichert die MP4 privat.
- [ ] Fehlgeschlagener Auftrag wird als nicht berechnet protokolliert.

## Zahlungen
- [ ] Stripe Testkarte über gehosteten Checkout bezahlen; Kartennummer erscheint nie in Yildiz-AI-Logs.
- [ ] PayPal-Sandbox-Kauf und Abo testen.
- [ ] Admin schaltet Anbieter zwischen Stripe und PayPal um.
- [ ] Zahlungen deaktivieren: Preis bleibt sichtbar, Kaufknopf ist gesperrt.
- [ ] Kostenpflichtiges Update kaufen und nur mit bezahltem Konto herunterladen.
- [ ] Stripe- und PayPal-Abo kündigen.

## Kosten und Betrieb
- [ ] Kostenwarnung global und je Konto prüfen.
- [ ] Tages-/Monatslimit und globales Budget erreichen; weitere Anfrage wird serverseitig blockiert.
- [ ] Adminübersicht zeigt Chat-, Bild-, Video- und Gesamtkosten heute/Monat.
- [ ] Systemseite prüft Auth, Datenbank, Storage, Gemini, OpenAI, Sora, Stripe und PayPal.
- [ ] Fehler als erledigt markieren und erneut öffnen.
- [ ] Desktop- und Handyansicht prüfen.
