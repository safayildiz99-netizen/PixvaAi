# PayPal-Empfängerkonto und Zahlungsfluss

Das Geld geht an das PayPal-Business-Händlerkonto, zu dem `PAYPAL_CLIENT_ID`
und `PAYPAL_CLIENT_SECRET` gehören.

Der Text „Angezeigtes Empfängerkonto“ im Adminbereich ist nur eine sichtbare
Beschriftung. Zum Wechseln des echten Empfängers müssen in Vercel die
API-Zugangsdaten des anderen PayPal-Business-Kontos eingetragen werden.

Yildiz AI aktiviert den Zugang erst, nachdem PayPal den Auftrag als `COMPLETED`
bestätigt und Betrag sowie Währung mit dem serverseitig gespeicherten Preis
übereinstimmen. Bei einer vollständigen Erstattung wird der Zugang auf Free
zurückgesetzt.
