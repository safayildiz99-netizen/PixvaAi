import { readJson, send } from '../_lib.js';

const sizeMap = {
  square: '1024x1024',
  post: '1024x1536',
  story: '1024x1536',
  landscape: '1536x1024'
};

function buildPrompt(prompt, style) {
  const clean = String(prompt || '').trim();
  const common = [
    'photorealistic',
    'realistic photography',
    'natural believable lighting',
    'high detail',
    'premium commercial quality',
    'not a painting',
    'not an illustration',
    'not cartoon',
    'no text unless explicitly requested'
  ].join(', ');
  const stylePrompts = {
    realistic: `${common}, natural editorial composition`,
    product: `${common}, professional product photography, clean studio setup, controlled shadows`,
    poster: `${common}, cinematic advertising composition, clear focal point and useful negative space`,
    studio: `${common}, premium studio lighting, elegant backdrop, realistic reflections and shadows`
  };
  return `${stylePrompts[style] || stylePrompts.realistic}. ${clean}`;
}

function openAIErrorMessage(status, data) {
  const raw = data?.error?.message || data?.message || '';
  if (status === 401) return 'Der OpenAI API-Key ist ungültig.';
  if (status === 403) return 'OpenAI hat die Bildanfrage nicht freigegeben. Prüfe Projekt, Verifizierung und Modellzugriff.';
  if (status === 429) return 'Das OpenAI-Limit oder Guthaben ist erreicht. Prüfe Billing und Limits.';
  return raw || `OpenAI-Bildgenerierung fehlgeschlagen (${status}).`;
}

async function generateWithModel({ apiKey, model, prompt, size, quality }) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      quality,
      output_format: 'png',
      n: 1
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, response, data };

  const item = data?.data?.[0] || {};
  if (item.b64_json) {
    return {
      ok: true,
      result: {
        imageDataUrl: `data:image/png;base64,${item.b64_json}`,
        provider: model,
        revisedPrompt: item.revised_prompt || ''
      }
    };
  }
  if (item.url) {
    return { ok: true, result: { imageUrl: item.url, provider: model, revisedPrompt: item.revised_prompt || '' } };
  }
  return { ok: false, response: { status: 502 }, data: { error: { message: 'OpenAI hat keine Bilddatei geliefert.' } } };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });

  try {
    const body = await readJson(req);
    const prompt = String(body?.prompt || '').trim().slice(0, 3000);
    const aspect = Object.hasOwn(sizeMap, body?.aspect) ? String(body.aspect) : 'post';
    const style = String(body?.style || 'realistic');
    const quality = ['low', 'medium', 'high', 'auto'].includes(body?.quality) ? body.quality : 'low';
    const apiKey = String(process.env.OPENAI_API_KEY || '').trim();

    if (!prompt) return send(res, 400, { error: 'Bitte gib einen Bild-Prompt ein.' });
    if (!apiKey) return send(res, 500, { error: 'OPENAI_API_KEY fehlt in Vercel.' });

    const configured = String(process.env.OPENAI_IMAGE_MODEL || '').trim();
    const models = [...new Set([configured, 'gpt-image-2', 'gpt-image-1', 'gpt-image-1-mini'].filter(Boolean))];
    const finalPrompt = buildPrompt(prompt, style);
    let lastStatus = 500;
    let lastData = {};

    for (const model of models) {
      const attempt = await generateWithModel({ apiKey, model, prompt: finalPrompt, size: sizeMap[aspect], quality });
      if (attempt.ok) return send(res, 200, attempt.result);
      lastStatus = attempt.response?.status || 500;
      lastData = attempt.data || {};
      if ([401, 403, 429].includes(lastStatus)) break;
      if (![400, 404].includes(lastStatus)) break;
    }

    return send(res, lastStatus, { error: openAIErrorMessage(lastStatus, lastData) });
  } catch (error) {
    console.error('OpenAI image generation failed', error);
    return send(res, 500, { error: error?.message || 'Die OpenAI-Bildgenerierung ist fehlgeschlagen.' });
  }
}
