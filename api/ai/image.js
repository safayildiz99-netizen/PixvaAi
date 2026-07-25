import { readJson, send } from '../_lib.js';

const aspectMap = {
  square: '1:1',
  post: '4:5',
  story: '9:16',
  landscape: '16:9'
};

function buildPrompt(prompt, style) {
  const clean = String(prompt || '').trim();
  const shared = 'photorealistic, realistic photography, natural materials, believable lighting, high detail, sharp focus, premium advertising quality, not a painting, not an illustration, not cartoon, no abstract background, no text overlay unless requested';
  const styles = {
    realistic: `${shared}, natural editorial composition`,
    product: `${shared}, professional studio product photography, commercial catalog quality, clean controlled shadows`,
    poster: `${shared}, cinematic advertising composition, strong visual hierarchy, clear negative space for later typography`,
    studio: `${shared}, premium studio lighting, elegant backdrop, realistic reflections and shadows`
  };
  return `${styles[style] || styles.realistic}. ${clean}`.trim();
}

function findGeneratedImage(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    if (inline?.data) {
      return {
        data: inline.data,
        mimeType: inline.mimeType || inline.mime_type || 'image/png'
      };
    }
  }

  const seen = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    const inline = value.inlineData || value.inline_data;
    if (inline?.data) return {
      data: inline.data,
      mimeType: inline.mimeType || inline.mime_type || 'image/png'
    };
    if (typeof value.data === 'string' && value.data.length > 500) {
      const mime = value.mimeType || value.mime_type || value.media_type || '';
      if (/image/i.test(mime)) return { data: value.data, mimeType: mime };
    }
    for (const child of Object.values(value)) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  }
  return walk(data);
}

async function callGeminiImage({ apiKey, model, prompt, aspect }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
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
                imageSize: model.includes('flash-lite-image') ? '1K' : '1K'
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
    try {
      const { response, data } = await callGeminiImage({ apiKey, model, prompt, aspect });
      if (!response.ok) {
        errors.push(`${model}: ${response.status} ${data?.error?.message || 'keine Bildausgabe'}`);
        continue;
      }
      const found = findGeneratedImage(data);
      if (!found) {
        errors.push(`${model}: Antwort enthielt kein Bild.`);
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
      errors.push(`${model}: ${error?.name === 'AbortError' ? 'Zeitüberschreitung' : error?.message || 'Fehler'}`);
    }
  }
  return { image: null, errors };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });

  try {
    const body = await readJson(req);
    const prompt = String(body?.prompt || '').trim().slice(0, 1600);
    const aspect = String(body?.aspect || 'post');
    const style = String(body?.style || 'realistic');
    if (!prompt) return send(res, 400, { error: 'Bitte gib einen Bild-Prompt ein.' });

    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) return send(res, 500, { error: 'Der Gemini API-Key fehlt in Vercel.' });

    const finalPrompt = buildPrompt(prompt, style);
    const result = await tryGemini({ apiKey, prompt: finalPrompt, aspect });
    if (result.image) return send(res, 200, result.image);

    console.error('Gemini image generation failed:', result.errors);
    return send(res, 503, {
      error: 'Es konnte kein echtes Bild erzeugt werden. Deshalb erstellt Yildiz AI bewusst kein Farb-/Text-Ersatzbild. Prüfe den Gemini-Bildmodellzugang und versuche es erneut.',
      technical: result.errors.slice(-3)
    });
  } catch (error) {
    console.error('image generation failed', error);
    return send(res, 500, { error: error?.message || 'Die Bildgenerierung ist fehlgeschlagen.' });
  }
}
