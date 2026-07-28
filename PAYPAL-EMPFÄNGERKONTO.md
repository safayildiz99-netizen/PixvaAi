# PayPal-Empfängerkonto

Das echte Empfängerkonto wird ausschließlich durch die LIVE-Zugangsdaten in Vercel bestimmt:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`

Diese Zugangsdaten stammen aus einer PayPal-App, die zu einem PayPal-Business-Konto gehört.
Das Geld einer erfolgreich erfassten Zahlung landet bei diesem Händlerkonto.

Ein im Adminbereich angezeigter Kontoname ist nur eine Beschriftung und kann das Geld nicht
umleiten. Zum Wechsel des echten Empfängers müssen die LIVE-Zugangsdaten der anderen
PayPal-Business-App in Vercel eingetragen und neu deployed werden.

Zuerst immer Sandbox testen. Yildiz AI aktiviert einen Zugang erst, wenn PayPal `COMPLETED`
meldet und Betrag sowie Währung mit dem serverseitig gespeicherten Preis übereinstimmen.
