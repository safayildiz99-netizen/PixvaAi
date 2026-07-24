import { pollinationsKey, readJson, send, validateUser } from '../_lib.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Methode nicht erlaubt.' });
  try {
    await validateUser(req);
    const body = await readJson(req);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return send(res, 400, { error: 'Bitte einen Bild-Prompt eingeben.' });
    const key = pollinationsKey();
    if (!key) return send(res, 400, { error: 'In Vercel zuerst POLLINATIONS_KEY eintragen.' });

    const response = await fetch('https://gen.pollinations.ai/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: body.model || 'flux',
        size: body.size || '1024x1024',
        n: 1,
        quality: body.quality || 'medium',
        response_format: 'url',
        safe: 'privacy,secrets,sexual,violence,shield'
      })
    });
    if (!response.ok) throw new Error(`Bild-KI meldet ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const url = data.data?.[0]?.url;
    if (!url) throw new Error('Der KI-Dienst hat keine Bild-URL geliefert.');
    return send(res, 200, { url });
  } catch (error) {
    return send(res, 502, { error: `Bildgenerierung fehlgeschlagen: ${error.message}` });
  }
}
