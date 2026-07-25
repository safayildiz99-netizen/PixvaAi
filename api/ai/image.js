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
  const base = [
    'photorealistic',
    'realistic photography',
    'natural believable lighting',
    'real materials and textures',
    'sharp subject',
    'high detail',
    'premium commercial quality',
    'not a painting',
    'not an illustration',
    'not cartoon',
    'no fake plastic look',
    'no text overlay unless explicitly requested'
  ].join(', ');
  const styles = {
    realistic: `${base}, natural editorial composition`,
    product: `${base}, professional product photography, clean studio setup, controlled shadows, advertising catalog quality`,
    poster: `${base}, cinematic advertising composition, strong visual hierarchy, useful negative space for later typography`,
    studio: `${base}, premium studio lighting, elegant backdrop, realistic reflections and shadows`
  };
  return `${styles[style] || styles.realistic}. ${clean}`.trim();
}

function extractImage(data) {
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

  const visited = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object' || visited.has(value)) return null;
    visited.add(value);
    const inline = value.inlineData || value.inline_data;
    if (inline?.data) {
      return {
        data: inline.data,
        mimeType: inline.mimeType || inline.mime_type || 'image/png'
      };
    }
    for (const child of Object.values(value)) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  }
  return walk(data);
}

async function requestGeminiImage({ apiKey, model, prompt, aspect }) {
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
  if (!apiKey) return null;

  const models = [...new Set([
    String(process.env.GEMINI_IMAGE_MODEL || '').trim(),
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image',
    'gemini-2.5-flash-image'
  ].filter(Boolean))];

  for (const model of models) {
    try {
      const { response, data } = await requestGeminiImage({ apiKey, model, prompt, aspect });
      if (!response.ok) {
        console.warn('Gemini image model failed', model, response.status, data?.error?.message || '');
        continue;
      }
      const image = extractImage(data);
      if (!image) continue;
      return {
        imageDataUrl: `data:${image.mimeType};base64,${image.data}`,
        provider: model,
        fallback: false
      };
    } catch (error) {
      console.warn('Gemini image request failed', model, error?.message || error);
    }
  }
  return null;
}

function makePublicImageUrl(prompt, aspect) {
  const size = publicSizes[aspect] || publicSizes.post;
  const seed = Math.floor(Math.random() * 1_000_000_000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${size.width}&height=${size.height}&model=flux&nologo=true&enhance=true&safe=true&seed=${seed}`;
}

async function tryPublicProxy(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Yildiz-AI-Studio/6.0' }
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1000) return null;
    return {
      imageDataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
      provider: 'public-image-proxy',
      fallback: false
    };
  } catch (error) {
    console.warn('Public image proxy failed', error?.message || error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });
  }

  try {
    const body = await readJson(req);
    const prompt = String(body?.prompt || '').trim().slice(0, 1800);
    const aspect = Object.hasOwn(aspectMap, body?.aspect) ? String(body.aspect) : 'post';
    const style = String(body?.style || 'realistic');

    if (!prompt) return send(res, 400, { error: 'Bitte gib einen Bild-Prompt ein.' });

    const finalPrompt = buildPrompt(prompt, style);
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

    const geminiImage = await tryGemini({ apiKey, prompt: finalPrompt, aspect });
    if (geminiImage) return send(res, 200, geminiImage);

    const publicUrl = makePublicImageUrl(finalPrompt, aspect);
    const proxiedImage = await tryPublicProxy(publicUrl);
    if (proxiedImage) return send(res, 200, proxiedImage);

    // Let the browser load the public image directly. This avoids a hard error when
    // the Vercel function cannot reach the public image host although the browser can.
    return send(res, 200, {
      imageUrl: publicUrl,
      provider: 'public-image-direct',
      fallback: false,
      remote: true
    });
  } catch (error) {
    console.error('Image generation failed', error);
    return send(res, 500, {
      error: 'Die Bildgenerierung konnte nicht gestartet werden. Bitte prüfe den Gemini-Key oder versuche es erneut.'
    });
  }
}
