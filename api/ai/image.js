import { readJson, send } from '../_lib.js';

const aspectMap = {
  square: '1:1',
  post: '4:5',
  story: '9:16',
  landscape: '16:9'
};

const publicSizes = {
  square: { width: 1024, height: 1024 },
  post: { width: 1024, height: 1280 },
  story: { width: 1024, height: 1792 },
  landscape: { width: 1280, height: 720 }
};

function buildPrompt(prompt, style) {
  const clean = String(prompt || '').trim();
  const shared = 'photorealistic, realistic photography, natural materials, believable lighting, high detail, sharp focus, premium advertising quality, not a painting, not an illustration, not cartoon, no fake plastic look, no text overlay unless explicitly requested';
  const styles = {
    realistic: `${shared}, natural editorial composition`,
    product: `${shared}, professional studio product photography, commercial catalog quality, clean controlled shadows`,
    poster: `${shared}, cinematic advertising composition, strong visual hierarchy, clear negative space for later typography`,
    studio: `${shared}, premium studio lighting, elegant backdrop, realistic reflections and shadows`
  };
  return `${styles[style] || styles.realistic}. ${clean}`.trim();
}

function findImageBlock(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);

  const inline = value.inlineData || value.inline_data;
  if (inline?.data) {
    return {
      data: inline.data,
      mimeType: inline.mimeType || inline.mime_type || 'image/png'
    };
  }

  if (typeof value.data === 'string' && value.data.length > 500) {
    const mime = value.mimeType || value.mime_type || value.media_type || value.mime || '';
    const type = value.type || value.kind || '';
    if (/image/i.test(mime) || /image/i.test(type)) {
      return { data: value.data, mimeType: mime || 'image/png' };
    }
  }

  for (const child of Object.values(value)) {
    const found = findImageBlock(child, seen);
    if (found) return found;
  }
  return null;
}

async function callInteractions({ apiKey, model, prompt, aspect }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1/interactions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        model,
        input: [{ type: 'text', text: prompt }],
        response_format: {
          type: 'image',
          mime_type: 'image/png',
          aspect_ratio: aspectMap[aspect] || '4:5',
          image_size: '1K'
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function callGenerateContent({ apiKey, model, prompt, aspect }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            responseFormat: {
              image: {
                aspectRatio: aspectMap[aspect] || '4:5',
                imageSize: '1K'
              }
            }
          }
        })
      }
    );
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function tryGemini({ apiKey, prompt, aspect }) {
  if (!apiKey) return { image: null, errors: ['GEMINI_API_KEY fehlt.'] };

  const models = [...new Set([
    String(process.env.GEMINI_IMAGE_MODEL || '').trim(),
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image',
    'gemini-2.5-flash-image'
  ].filter(Boolean))];
  const errors = [];

  for (const model of models) {
    for (const caller of [callInteractions, callGenerateContent]) {
      try {
        const { response, data } = await caller({ apiKey, model, prompt, aspect });
        if (!response.ok) {
          errors.push(`${model}/${caller.name}: ${response.status} ${data?.error?.message || 'keine Bildausgabe'}`);
          continue;
        }
        const found = findImageBlock(data);
        if (!found) {
          errors.push(`${model}/${caller.name}: Antwort enthielt kein Bild.`);
          continue;
        }
        return {
          image: {
            imageDataUrl: `data:${found.mimeType};base64,${found.data}`,
            provider: model,
            fallback: false
          },
          errors
        };
      } catch (error) {
        errors.push(`${model}/${caller.name}: ${error?.name === 'AbortError' ? 'Zeitüberschreitung' : error?.message || 'Fehler'}`);
      }
    }
  }
  return { image: null, errors };
}

async function tryPublicImage(prompt, aspect) {
  const size = publicSizes[aspect] || publicSizes.post;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${size.width}&height=${size.height}&model=flux&nologo=true&enhance=true&safe=true&seed=${Math.floor(Math.random() * 1000000)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Yildiz-AI-Studio/5.0' }
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      imageDataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
      provider: 'public-image-fallback',
      fallback: false
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });

  try {
    const body = await readJson(req);
    const prompt = String(body?.prompt || '').trim().slice(0, 1800);
    const aspect = String(body?.aspect || 'post');
    const style = String(body?.style || 'realistic');
    if (!prompt) return send(res, 400, { error: 'Bitte gib einen Bild-Prompt ein.' });

    const finalPrompt = buildPrompt(prompt, style);
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    const result = await tryGemini({ apiKey, prompt: finalPrompt, aspect });
    if (result.image) return send(res, 200, result.image);

    try {
      const publicImage = await tryPublicImage(finalPrompt, aspect);
      if (publicImage) return send(res, 200, publicImage);
    } catch (error) {
      result.errors.push(`Öffentliche Ersatz-API: ${error?.message || 'nicht erreichbar'}`);
    }

    console.error('Image generation failed:', result.errors);
    return send(res, 503, {
      error: 'Es konnte momentan kein echtes Bild erzeugt werden. Yildiz AI erstellt absichtlich kein Farb-/Text-Ersatzbild. Bitte versuche es später erneut oder lade ein eigenes Bild hoch.',
      technical: result.errors.slice(-5)
    });
  } catch (error) {
    console.error('image generation failed', error);
    return send(res, 500, { error: error?.message || 'Die Bildgenerierung ist fehlgeschlagen.' });
  }
}
