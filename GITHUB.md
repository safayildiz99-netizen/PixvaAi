# Auf GitHub hochladen

## Einfach über die GitHub-Webseite

1. Bei GitHub ein neues, leeres Repository anlegen, zum Beispiel `safa-ai-studio`.
2. Repository öffnen und **uploading an existing file** wählen.
3. Den Inhalt des entpackten Projektordners hineinziehen.
4. Commit erstellen.

## Über Terminal

```bash
git init
git add .
git commit -m "Safa AI Studio MVP"
git branch -M main
git remote add origin DEINE-GITHUB-REPOSITORY-ADRESSE
git push -u origin main
```

Die Datei `.env` niemals hochladen. Sie wird bereits durch `.gitignore` ausgeschlossen.
