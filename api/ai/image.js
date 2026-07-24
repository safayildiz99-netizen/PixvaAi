import { readJson, send } from '../_lib.js';

const aspectSizes = {
  square: { width: 1024, height: 1024 },
  post: { width: 1024, height: 1280 },
  story: { width: 1024, height: 1792 }
};

function buildPrompt(prompt, style) {
  const clean = String(prompt || '').trim();
  const photoreal = 'photorealistic, realistic photo, natural lighting, high detail, sharp focus, premium quality, not a painting, not an illustration';
  const ad = 'clean composition, advertising quality, visually appealing';
  const map = {
    realistic: `${photoreal}, ${ad}`,
    product: `${photoreal}, isolated product photography, white or clean studio background, commercial product shot`,
    poster: `${photoreal}, strong marketing composition, cinematic ad look, clean typography space`,
    studio: `${photoreal}, studio lighting, premium shadows, elegant background`
  };
  return `${map[style] || map.realistic}. ${clean}`.trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });

  try {
    const body = await readJson(req);
    const prompt = String(body?.prompt || '').trim().slice(0, 800);
    const aspect = String(body?.aspect || 'post');
    const style = String(body?.style || 'realistic');

    if (!prompt) return send(res, 400, { error: 'Bitte gib einen Bild-Prompt ein.' });

    const size = aspectSizes[aspect] || aspectSizes.post;
    const finalPrompt = buildPrompt(prompt, style);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${size.width}&height=${size.height}&model=flux&nologo=true&enhance=true&safe=true&seed=${Math.floor(Math.random()*1000000)}`;

    const response = await fetch(url, { headers: { 'User-Agent': 'Yildiz-AI-Studio/1.0' } });
    if (!response.ok) {
      return send(res, 502, { error: 'Die kostenlose Bild-API antwortet gerade nicht. Bitte versuche es gleich noch einmal.' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
    return send(res, 200, { imageDataUrl: dataUrl, provider: 'pollinations-public' });
  } catch (error) {
    console.error('image generation failed', error);
    return send(res, 500, { error: error?.message || 'Die Bildgenerierung ist fehlgeschlagen.' });
  }
}
