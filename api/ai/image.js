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
  const candidates = data?.candidates || [];
  for (const candidate of candidates) {
    for (const part of candidate?.content?.parts || []) {
      const inline = part?.inlineData || part?.inline_data;
      if (inline?.data) {
        return {
          data: inline.data,
          mimeType: inline.mimeType || inline.mime_type || 'image/png'
        };
      }
    }
  }
  return null;
}

function imageRequestBody(prompt, aspect, withFormat = true) {
  const generationConfig = { responseModalities: ['IMAGE'] };
  if (withFormat) {
    generationConfig.responseFormat = {
      image: {
        aspectRatio: aspectMap[aspect] || '4:5',
        imageSize: '1K'
      }
    };
  }
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig
  };
}

async function requestGeminiImage({ apiKey, model, prompt, aspect, version, withFormat }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(imageRequestBody(prompt, aspect, withFormat))
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

  const attempts = [
    { version: 'v1', withFormat: true },
    { version: 'v1', withFormat: false },
    { version: 'v1beta', withFormat: true },
    { version: 'v1beta', withFormat: false }
  ];

  for (const model of models) {
    for (const attempt of attempts) {
      try {
        const { response, data } = await requestGeminiImage({
          apiKey,
          model,
          prompt,
          aspect,
          version: attempt.version,
          withFormat: attempt.withFormat
        });
        if (!response.ok) {
          console.warn('Gemini image failed', model, attempt.version, response.status, data?.error?.message || '');
          if ([401, 403].includes(response.status)) return null;
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
        console.warn('Gemini image request failed', model, attempt.version, error?.message || error);
      }
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
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Yildiz-AI-Studio/7.0' }
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1000) return null;
    return {
      imageDataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
      provider: 'kostenloser Bilddienst',
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

    // The browser can often reach the public image host even when a Vercel region cannot.
    return send(res, 200, {
      imageUrl: publicUrl,
      provider: 'kostenloser Browser-Bilddienst',
      fallback: false,
      remote: true
    });
  } catch (error) {
    console.error('Image generation failed', error);
    return send(res, 200, {
      imageUrl: makePublicImageUrl('photorealistic premium advertising image', 'post'),
      provider: 'kostenloser Browser-Bilddienst',
      fallback: false,
      remote: true,
      warning: 'Der Server-Bilddienst war nicht erreichbar; Browser-Fallback wird verwendet.'
    });
  }
}
