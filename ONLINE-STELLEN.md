# Safa AI Studio online stellen

## 1. GitHub

1. Auf github.com anmelden.
2. Oben rechts **+** > **New repository**.
3. Name: `safa-ai-studio`.
4. **Private** auswählen.
5. **Create repository**.
6. Im leeren Repository **uploading an existing file** anklicken.
7. Alle Dateien und Ordner aus diesem Projektordner hochladen – nicht den übergeordneten ZIP-Ordner.
8. **Commit changes**.

## 2. Render

1. Auf render.com mit GitHub anmelden.
2. **New +** > **Blueprint**.
3. Das Repository `safa-ai-studio` auswählen.
4. Render erkennt `render.yaml`.
5. Bei `ADMIN_PASSWORD` ein neues starkes Passwort eintragen.
6. Optional `POLLINATIONS_KEY` eintragen.
7. **Apply** / **Deploy Blueprint**.
8. Nach dem Build die angezeigte `onrender.com`-Adresse öffnen.

## Wichtig

- `.env` niemals auf GitHub hochladen.
- Kostenloses Render ist für Tests gedacht und kann nach Inaktivität langsamer starten.
- Die aktuelle App speichert Benutzer, Projekte und Uploads als lokale Dateien. Auf einem kostenlosen, nicht dauerhaften Server können diese Daten bei Neustarts oder Neu-Deployments verloren gehen. Für den dauerhaften Betrieb sollte anschließend eine Datenbank und ein permanenter Dateispeicher ergänzt werden.
