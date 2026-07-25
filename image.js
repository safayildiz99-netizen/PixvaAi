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
  const shared = 'photorealistic, realistic photography, believable natural materials, natural skin texture, realistic hands and faces, cinematic but believable lighting, high detail, sharp focus, premium advertising quality, not a painting, not an illustration, not cartoon, not anime, no fake plastic look';
  const styles = {
    realistic: `${shared}, natural editorial composition`,
    product: `${shared}, professional studio product photography, commercial catalog quality, clean controlled shadows`,
    poster: `${shared}, cinematic advertising composition, strong visual hierarchy, clean negative space for later typography`,
    studio: `${shared}, premium studio lighting, elegant backdrop, realistic reflections and shadows`
  };
  return `${styles[style] || styles.realistic}. ${clean}`.trim();
}

function extractImage(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    const bytes = inline?.data;
    if (typeof bytes === 'string' && bytes.length > 100) {
      return {
        data: bytes,
        mimeType: inline?.mimeType || inline?.mime_type || 'image/png'
      };
    }
  }
  return null;
}

async function tryGemini({ apiKey, prompt, aspect }) {
  if (!apiKey) return null;
  const models = [
    process.env.GEMINI_IMAGE_MODEL,
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image',
    'gemini-2.5-flash-image'
  ].filter(Boolean);

  for (const model of [...new Set(models)]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
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
      if (!response.ok) continue;
      const image = extractImage(data);
      if (image) {
        return {
          imageDataUrl: `data:${image.mimeType};base64,${image.data}`,
          provider: model
        };
      }
    } catch {
      // Try the next model, then the public/local fallback.
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function tryPublicImage(prompt, aspect) {
  const size = publicSizes[aspect] || publicSizes.post;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${size.width}&height=${size.height}&model=flux&nologo=true&enhance=true&safe=true&seed=${Math.floor(Math.random() * 1000000)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Yildiz-AI-Studio/4.0' }
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.toLowerCase().startsWith('image/')) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      imageDataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
      provider: 'public-image-fallback'
    };
  } finally {
    clearTimeout(timeout);
  }
}

function escapeXml(value) {
  return String(value || '').replace(/[<>&"']/g, (char) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  }[char]));
}

function localFallback(prompt, aspect) {
  const size = publicSizes[aspect] || publicSizes.post;
  const title = escapeXml(String(prompt || 'Yildiz AI').split(/\s+/).slice(0, 8).join(' '));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071018"/><stop offset=".55" stop-color="#123650"/><stop offset="1" stop-color="#ffd400"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="35"/></filter></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${size.width * .2}" cy="${size.height * .22}" r="${Math.min(size.width, size.height) * .22}" fill="#63c7ff" opacity=".28" filter="url(#b)"/>
    <circle cx="${size.width * .78}" cy="${size.height * .72}" r="${Math.min(size.width, size.height) * .25}" fill="#ffd400" opacity=".2" filter="url(#b)"/>
    <rect x="${size.width * .07}" y="${size.height * .08}" width="${size.width * .86}" height="${size.height * .84}" rx="48" fill="none" stroke="#ffffff" opacity=".35" stroke-width="4"/>
    <text x="${size.width * .09}" y="${size.height * .75}" font-family="Arial,sans-serif" font-size="${Math.max(42, size.width / 15)}" font-weight="800" fill="#fff">YILDIZ AI</text>
    <text x="${size.width * .09}" y="${size.height * .82}" font-family="Arial,sans-serif" font-size="${Math.max(22, size.width / 34)}" fill="#ffd400">${title}</text>
  </svg>`;
  return {
    imageDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    provider: 'local-svg-fallback',
    fallback: true
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });

  try {
    const body = await readJson(req);
    const prompt = String(body?.prompt || '').trim().slice(0, 1400);
    const aspect = String(body?.aspect || 'post');
    const style = String(body?.style || 'realistic');
    if (!prompt) return send(res, 400, { error: 'Bitte gib einen Bild-Prompt ein.' });

    const finalPrompt = buildPrompt(prompt, style);
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

    const gemini = await tryGemini({ apiKey, prompt: finalPrompt, aspect });
    if (gemini) return send(res, 200, gemini);

    try {
      const publicImage = await tryPublicImage(finalPrompt, aspect);
      if (publicImage) return send(res, 200, publicImage);
    } catch {
      // Always return a usable local fallback below.
    }

    return send(res, 200, localFallback(prompt, aspect));
  } catch (error) {
    console.error('image generation failed', error);
    return send(res, 200, localFallback('Bildgenerierung vorübergehend nicht erreichbar', 'post'));
  }
}
