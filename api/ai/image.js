import { pollinationsKey, readJson, send, validateUser } from '../_lib.js';
export const config = { maxDuration: 60 };

function freeImageUrl(prompt, size) {
  const [width, height] = String(size || '1024x1024').split('x');
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${Number(width) || 1024}&height=${Number(height) || 1024}&nologo=true&safe=true&seed=${Date.now()}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Methode nicht erlaubt.' });

  try {
    const user = await validateUser(req);
    const body = await readJson(req);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return send(res, 400, { error: 'Bitte einen Bild-Prompt eingeben.' });

    // Admin-Unlimited-Modus: direkt kostenloser Bild-Endpunkt, ohne internes Limit.
    if (user.role === 'admin') {
      return send(res, 200, {
        url: freeImageUrl(prompt, body.size),
        mode: 'admin-unlimited-free',
        unlimited: true
      });
    }

    const key = pollinationsKey();
    if (key) {
      const response = await fetch('https://gen.pollinations.ai/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          model: body.model || 'flux',
          size: body.size || '1024x1024',
          n: 1,
          response_format: 'url'
        })
      });

      if (response.ok) {
        const data = await response.json();
        const url = data.data?.[0]?.url;
        if (url) return send(res, 200, { url, mode: 'key' });
      } else if (![402, 429].includes(response.status)) {
        throw new Error(`Bild-KI meldet ${response.status}: ${await response.text()}`);
      }
    }

    return send(res, 200, { url: freeImageUrl(prompt, body.size), mode: 'free' });
  } catch (error) {
    return send(res, 502, { error: `Bildgenerierung fehlgeschlagen: ${error.message}` });
  }
}
