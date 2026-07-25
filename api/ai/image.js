import { readJson, send } from '../_lib.js';

const sizeMap = {
  square: '1024x1024',
  post: '1024x1536',
  story: '1024x1536',
  landscape: '1536x1024'
};

function isAdvertisingPrompt(value) {
  return /(werbebild|werbung|anzeige|kampagne|flyer|poster|social.?media|instagram.?post|banner|angebot|promotion|advertis)/i.test(value);
}

function isYildizPrompt(value) {
  return /yildiz\s*ai/i.test(value);
}

function buildPrompt(prompt, style) {
  const clean = String(prompt || '').trim();
  const common = [
    'photorealistic',
    'realistic photography',
    'natural believable lighting',
    'high detail',
    'premium commercial quality',
    'professional art direction',
    'clean visual hierarchy',
    'sharp coherent details',
    'not a painting',
    'not an illustration',
    'not cartoon'
  ].join(', ');

  const stylePrompts = {
    realistic: `${common}, natural editorial composition, one clear focal point`,
    product: `${common}, professional product photography, clean studio setup, controlled realistic shadows, accurate packaging and materials`,
    poster: `${common}, finished premium advertising poster rather than a plain source photo, cinematic commercial composition, intentional layout, useful negative space, strong headline area, balanced typography, clear call-to-action area`,
    studio: `${common}, premium studio lighting, elegant backdrop, realistic reflections and shadows`
  };

  const instructions = [stylePrompts[style] || stylePrompts.realistic];

  if (isAdvertisingPrompt(clean)) {
    instructions.push(
      'Create a complete ready-to-use advertising visual, not merely a generic photograph',
      'Use a polished agency-quality layout with clear hierarchy, generous margins, readable large text, and no tiny gibberish text',
      'Do not show error messages, broken interfaces, random code, watermarks, or placeholder text',
      'Keep the design modern, minimal, premium, and immediately understandable as an advertisement'
    );
  } else {
    instructions.push('Do not add text unless the user explicitly requests it');
  }

  if (isYildizPrompt(clean) && isAdvertisingPrompt(clean)) {
    instructions.push(
      'Brand: Yildiz AI, spelled exactly "Yildiz AI"',
      'Use a deep navy/black premium background with electric blue and warm yellow accents',
      'Include the exact main headline "Yildiz AI"',
      'Include the exact subheadline "Die moderne KI für Bilder, Videos und kreative Projekte"',
      'Include the exact call to action "Jetzt entdecken"',
      'Show an elegant modern workspace and a believable futuristic AI interface, without copying an existing company interface',
      'All German text must be correctly spelled and clearly readable'
    );
  }

  instructions.push(`User request: ${clean}`);
  return instructions.join('. ');
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
    const style = String(body?.style || (isAdvertisingPrompt(prompt) ? 'poster' : 'realistic'));
    const requestedQuality = String(body?.quality || process.env.OPENAI_IMAGE_QUALITY || 'medium');
    const quality = ['low', 'medium', 'high', 'auto'].includes(requestedQuality) ? requestedQuality : 'medium';
    const apiKey = String(process.env.OPENAI_API_KEY || '').trim();

    if (!prompt) return send(res, 400, { error: 'Bitte gib einen Bild-Prompt ein.' });
    if (!apiKey) return send(res, 500, { error: 'OPENAI_API_KEY fehlt in Vercel.' });

    const configured = String(process.env.OPENAI_IMAGE_MODEL || '').trim();
    const models = [...new Set([configured, 'gpt-image-2', 'gpt-image-1.5', 'gpt-image-1'].filter(Boolean))];
    const finalPrompt = buildPrompt(prompt, style);
    let lastStatus = 500;
    let lastData = {};

    for (const model of models) {
      const attempt = await generateWithModel({ apiKey, model, prompt: finalPrompt, size: sizeMap[aspect], quality });
      if (attempt.ok) return send(res, 200, { ...attempt.result, quality, style });
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
