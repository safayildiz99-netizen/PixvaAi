# Migration von V9 zu V10

V10 verwendet Supabase Auth und neue Tabellen. Das alte V9-Passwortsystem wird nicht weiterverwendet.

1. V9-Projekt und Supabase-Datenbank sichern.
2. V10 zuerst in einem Staging-Projekt deployen.
3. `V10-SUPABASE-EINFACH-OEFFNEN.html` ausführen.
4. Ersten Benutzer in Supabase Auth anlegen und dessen Profilrolle auf `admin` setzen.
5. Alte Benutzer als neue Supabase-Auth-Benutzer einladen oder mit temporärem Passwort anlegen.
6. Benutzerdaten nur mit eindeutig geklärter Zuordnung zur neuen Auth-UUID migrieren.
7. Vercel-Variablen eintragen und Webhooks konfigurieren.
8. Den vollständigen manuellen Abnahmetest durchführen.
9. Erst danach die Produktionsdomain auf V10 umstellen.

Alte Passwort-Hashes oder Klartextpasswörter dürfen nicht in die neue Auth-Struktur kopiert werden.
