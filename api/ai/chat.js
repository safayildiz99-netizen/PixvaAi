import { pollinationsKey, readJson, send, validateUser } from '../_lib.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Methode nicht erlaubt.' });
  try {
    await validateUser(req);
    const body = await readJson(req);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return send(res, 400, { error: 'Bitte eine Nachricht eingeben.' });
    const key = pollinationsKey();
    if (!key) {
      return send(res, 200, {
        offline: true,
        answer: `Die KI ist noch nicht verbunden. Trage in Vercel eine Environment Variable mit dem Namen POLLINATIONS_KEY ein.\n\nDeine Aufgabe war: „${prompt}“\n\nFlyer, Bildeditor, Projekte und Website-Builder funktionieren bereits ohne KI.`
      });
    }

    const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: body.model || 'openai',
        messages: [
          {
            role: 'system',
            content: 'Du bist Yildiz AI, ein präziser Assistent für Werbetechnik, Beschriftung, Leuchtwerbung, Fahrzeugfolierung, Social-Media-Angebote, Flyer, Druckdaten und Webseiten. Antworte auf Deutsch, klar und praktisch.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!response.ok) throw new Error(`KI-Dienst meldet ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return send(res, 200, { answer: data.choices?.[0]?.message?.content || 'Keine Antwort erhalten.' });
  } catch (error) {
    return send(res, 502, { error: `KI-Anfrage fehlgeschlagen: ${error.message}` });
  }
}
