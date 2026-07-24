import { pollinationsKey, readJson, send, validateUser } from '../_lib.js';
export const config = { maxDuration: 60 };

const system = 'Du bist Yildiz AI, ein freundlicher, präziser allgemeiner KI-Assistent ähnlich einem modernen Chat-Assistenten. Du hilfst bei Alltag, Lernen, Schreiben, Übersetzen, Programmieren, Unternehmen, Kreativität und Planung. Zusätzlich bist du Spezialist für Werbetechnik, Angebote, Flyer, Druckdaten, Social Media und Webseiten. Antworte in der Sprache des Nutzers, klar, ehrlich und praktisch.';

async function freeChat(prompt) {
  const response = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      stream: false
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Kostenloser KI-Zugang derzeit nicht verfügbar (${response.status})${details ? `: ${details.slice(0, 180)}` : ''}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Keine Antwort erhalten.';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Methode nicht erlaubt.' });

  try {
    const user = await validateUser(req);
    const body = await readJson(req);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return send(res, 400, { error: 'Bitte eine Nachricht eingeben.' });

    // Admin-Unlimited-Modus: kein internes Kontingent und kein Verbrauch des
    // hinterlegten Pollinations-Guthabens. Der kostenlose öffentliche Zugang
    // wird direkt verwendet.
    if (user.role === 'admin') {
      return send(res, 200, {
        answer: await freeChat(prompt),
        mode: 'admin-unlimited-free',
        unlimited: true
      });
    }

    const key = pollinationsKey();
    if (key) {
      const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: body.model || 'openai',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (response.ok) {
        const data = await response.json();
        return send(res, 200, {
          answer: data.choices?.[0]?.message?.content || 'Keine Antwort erhalten.',
          mode: 'key'
        });
      }

      if (![402, 429].includes(response.status)) {
        throw new Error(`KI-Dienst meldet ${response.status}: ${await response.text()}`);
      }
    }

    return send(res, 200, { answer: await freeChat(prompt), mode: 'free' });
  } catch (error) {
    return send(res, 502, { error: `KI-Anfrage fehlgeschlagen: ${error.message}` });
  }
}
