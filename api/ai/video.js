import { pollinationsKey, readJson, send, validateUser } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Methode nicht erlaubt.' });
  try {
    await validateUser(req);
    const body = await readJson(req);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return send(res, 400, { error: 'Bitte einen Video-Prompt eingeben.' });
    const key = pollinationsKey();
    if (!key) return send(res, 400, { error: 'In Vercel zuerst POLLINATIONS_KEY eintragen.' });
    if (!key.startsWith('pk_')) {
      return send(res, 400, { error: 'Für Video auf Vercel bitte einen Pollinations Publishable Key verwenden, der mit pk_ beginnt.' });
    }

    const params = new URLSearchParams({
      model: String(body.model || 'wan'),
      width: String(body.width || 720),
      height: String(body.height || 1280),
      duration: String(Math.max(2, Math.min(15, Number(body.duration || 4)))),
      safe: 'privacy,secrets,sexual,violence,shield',
      key
    });
    const url = `https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?${params.toString()}`;
    return send(res, 200, { url });
  } catch (error) {
    return send(res, 502, { error: `Videogenerierung fehlgeschlagen: ${error.message}` });
  }
}
