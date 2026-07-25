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
  const shared = 'photorealistic, realistic photography, natural materials, believable lighting, high detail, sharp focus, premium advertising quality, not a painting, not an illustration, not cartoon, no fake plastic look';
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

  if (typeof value.data === 'string' && value.data.length > 100) {
    const mime = value.mime_type || value.mimeType || value.media_type || '';
    const type = value.type || value.kind || '';
    if (/image/i.test(mime) || /image/i.test(type)) {
      return { data: value.data, mimeType: mime || 'image/png' };
    }
  }

  if (value.output_image) {
    const found = findImageBlock(value.output_image, seen);
    if (found) return found;
  }

  for (const child of Object.values(value)) {
    const found = findImageBlock(child, seen);
    if (found) return found;
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
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
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
      clearTimeout(timeout);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) continue;
      const image = findImageBlock(data);
      if (image) {
        return {
          imageDataUrl: `data:${image.mimeType};base64,${image.data}`,
          provider: model
        };
      }
    } catch {
      // The public fallback below keeps image generation usable.
    }
  }
  return null;
}

async function tryPublicImage(prompt, aspect) {
  const size = publicSizes[aspect] || publicSizes.post;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${size.width}&height=${size.height}&model=flux&nologo=true&enhance=true&safe=true&seed=${Math.floor(Math.random() * 1000000)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Yildiz-AI-Studio/3.0' } });
  clearTimeout(timeout);
  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.toLowerCase().startsWith('image/')) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    imageDataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
    provider: 'public-image-fallback'
  };
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
    const prompt = String(body?.prompt || '').trim().slice(0, 1200);
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
