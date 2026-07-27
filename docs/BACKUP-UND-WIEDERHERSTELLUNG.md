# Sicherung und Wiederherstellung

1. Vor jedem Release im Supabase Dashboard ein Datenbank-Backup beziehungsweise Point-in-Time-Recovery prüfen.
2. Den privaten Bucket `user-media` regelmäßig in einen zweiten privaten Speicher exportieren.
3. Vercel Environment Variables getrennt und verschlüsselt dokumentieren; niemals in Git speichern.
4. Stripe- und PayPal-Webhook-Konfiguration samt IDs dokumentieren.
5. Vor einem SQL-Update zuerst Staging sichern, Migration dort ausführen und den manuellen Abnahmetest abschließen.
6. Rückkehrplan: vorheriges Git-Tag deployen, Datenbank nur mit geprüftem Backup zurücksetzen und Webhooks vorübergehend pausieren.
