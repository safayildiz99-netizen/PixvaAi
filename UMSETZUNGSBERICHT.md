# Yildiz AI V10 – Umsetzungsbericht

## Umgesetzt

1. **Supabase Auth**: E-Mail/Passwort, sichere Sitzungen, Abmeldung, Gerätewechsel, Passwortänderung, temporäres Admin-Passwort nur einmal sichtbar.
2. **Datentrennung und RLS**: Profile, Chats, Nachrichten, Projekte, Medien, Designs, Versionen, Websites, KI-Aufträge, Nutzung, Abos, Käufe, Meldungen und Fehler besitzen Nutzerzuordnung und RLS.
3. **Privater Storage**: `nutzer-id/bilder`, `videos`, `pdf`, `designs`, `uploads`; Signed URLs, Typ- und Größenkontrolle.
4. **Dauerhafte Sora-Aufträge**: Datenbankjob, Provider-ID, Status, Fortschritt, Dauer, Format, Kosten, Fehler, Webhook und private Ergebnisdatei.
5. **Bildeditor**: Vollbild, Zuschneide-Rahmen, KI-Maske, Bild erweitern, Hintergrund ersetzen, echte Text-Ebenen mit Schriftwechsel, Ebenenliste, Original, Versionen, Vergleich, PNG/JPG/PDF.
6. **Serverseitige Kostenkontrolle**: Abo, Funktionen, Tageslimits, Monatsbudget, globales Budget, Kostenwarnung, Rate Limit und Idempotenz vor der Provider-Anfrage.
7. **Kostenübersicht**: heute/Monat nach Chat/Bild/Video/Dokument, Modell, Einheiten, Qualität, Status, berechnet/nicht berechnet/erstattet.
8. **Echte Dateierstellung**: PDF, DOCX, XLSX mit privater Speicherung und Prüfung vor Signed Download.
9. **Web- und Produktsuche**: getrennte kostenlose Bildsuche und KI-Generierung; Quelle, Anbieter und Rechtehinweis; Google-Suche mit Zitaten für Faktenfragen.
10. **Sicherheit**: Uploadlimits, erlaubte Typen, Moderation, Doppelklickschutz, Nutzer sperren, Meldesystem, Audit-Protokoll, Redaction von Secrets, Registrierungs-Rate-Limit.
11. **Systemseite**: Supabase Auth/DB/Storage, Gemini, OpenAI, Sora, Stripe, PayPal, letzter Fehler und Fehlerstatus.
12. **Tests und Sicherung**: automatische Struktur-/Sicherheitstests, manueller Abnahmetest und Backupplan.
13. **Zahlungen**: Stripe-Kartencheckout oder PayPal, Webhooks, Abos, Kündigung, einmalige kostenpflichtige Updates, private Update-ZIP-Auslieferung.
14. **Admin-Zahlungsschalter**: Anbieter wählen, Zahlungen global abschalten, Preis sichtbar lassen, Produkt einzeln kaufbar/nicht kaufbar schalten.

## Sicherheitsentscheidung zu Kreditkarten

Yildiz AI enthält absichtlich kein eigenes Eingabefeld für rohe Kartennummern. Bei Stripe öffnet sich ein gehosteter Kartencheckout. Das verhindert, dass vollständige Kreditkartennummern in Browsercode, Datenbank oder Fehlerlogs von Yildiz AI landen.

## Noch live zu prüfen

Die statischen Prüfungen und sechs automatischen Tests sind bestanden. Ein echter End-to-End-Test kann erst mit einem Supabase-Projekt sowie OpenAI-, Gemini-, Stripe- und PayPal-Testzugängen stattfinden. Der Paketdownload im Arbeitscontainer ist wegen eines Netzwerk-Timeouts nicht abgeschlossen worden; Vercel installiert die in `package.json` definierten Pakete beim Deployment.
