import { Readable } from 'node:stream';
import { readJson, send } from '../_lib.js';

function query(req) {
  if (req.query) return req.query;
  try { return Object.fromEntries(new URL(req.url, 'http://localhost').searchParams.entries()); }
  catch { return {}; }
}

function errorMessage(status, data) {
  const raw = data?.error?.message || data?.message || '';
  if (status === 401) return 'Der OpenAI API-Key ist ungültig.';
  if (status === 403) return 'Sora ist für dieses OpenAI-Projekt noch nicht freigegeben.';
  if (status === 429) return 'Das OpenAI-Guthaben oder Sora-Limit ist erreicht.';
  if (/inpaint image must match|match the requested width and height/i.test(raw)) {
    return 'Das Referenzbild hatte nicht exakt die Videoauflösung. Der neue Fix entfernt oder korrigiert solche Referenzen automatisch.';
  }
  return raw || `OpenAI-Videoanfrage fehlgeschlagen (${status}).`;
}

function parseSize(size) {
  const match = String(size || '').match(/^(\d+)x(\d+)$/);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function dataUrlToImage(value) {
  const match = String(value || '').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  return { buffer, type: match[1] };
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  return null;
}

function imageDimensions(image) {
  if (!image) return null;
  if (image.type === 'image/png') return pngDimensions(image.buffer);
  if (image.type === 'image/jpeg') return jpegDimensions(image.buffer);
  if (image.type === 'image/webp') return webpDimensions(image.buffer);
  return null;
}

function allowedSize(model, requested, aspect) {
  const landscape = aspect === 'landscape';
  if (model === 'sora-2-pro') {
    const proSizes = ['720x1280', '1280x720', '1024x1792', '1792x1024', '1080x1920', '1920x1080'];
    return proSizes.includes(requested) ? requested : (landscape ? '1280x720' : '720x1280');
  }
  return landscape ? '1280x720' : '720x1280';
}

async function createVideo(req, res, apiKey) {
  const body = await readJson(req);
  const prompt = String(body?.prompt || '').trim().slice(0, 4000);
  if (!prompt) return send(res, 400, { error: 'Bitte gib einen Video-Prompt ein.' });

  const model = String(process.env.OPENAI_VIDEO_MODEL || body?.model || 'sora-2').trim();
  const size = allowedSize(model, String(body?.size || ''), body?.aspect);
  const seconds = ['4', '8', '12'].includes(String(body?.seconds)) ? String(body.seconds) : '8';
  const target = parseSize(size);

  const form = new FormData();
  form.append('model', model);
  form.append('prompt', `${prompt}\nCreate a polished commercial-quality video with coherent motion, realistic lighting, strong composition, and synchronized audio. Keep visual continuity. Do not add captions, random letters, watermarks, or logos unless explicitly requested.`);
  form.append('size', size);
  form.append('seconds', seconds);

  let referenceUsed = false;
  let referenceWarning = '';
  const reference = dataUrlToImage(body?.referenceImage);
  if (reference && target) {
    const dimensions = imageDimensions(reference);
    if (dimensions?.width === target.width && dimensions?.height === target.height) {
      const blob = new Blob([reference.buffer], { type: reference.type });
      const extension = reference.type === 'image/png' ? 'png' : reference.type === 'image/webp' ? 'webp' : 'jpg';
      form.append('input_reference', blob, `reference.${extension}`);
      referenceUsed = true;
    } else {
      // Statt die gesamte Videogenerierung mit dem Inpaint-Größenfehler zu stoppen,
      // wird bei einer falschen Referenzgröße zuverlässig Text-zu-Video verwendet.
      referenceWarning = dimensions
        ? `Referenzbild ${dimensions.width}x${dimensions.height} wurde ausgelassen; benötigt wird ${target.width}x${target.height}.`
        : 'Referenzbild konnte nicht sicher geprüft werden und wurde ausgelassen.';
    }
  }

  const response = await fetch('https://api.openai.com/v1/videos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return send(res, response.status, { error: errorMessage(response.status, data), technical: data?.error?.message });
  return send(res, 200, { ...data, referenceUsed, referenceWarning, size, seconds, model });
}

async function videoStatus(res, apiKey, id) {
  if (!id) return send(res, 400, { error: 'Video-ID fehlt.' });
  const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return send(res, response.status, { error: errorMessage(response.status, data) });
  return send(res, 200, data);
}

async function videoContent(res, apiKey, id) {
  if (!id) return send(res, 400, { error: 'Video-ID fehlt.' });
  const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(id)}/content`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return send(res, response.status, { error: errorMessage(response.status, data) });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
  res.setHeader('Content-Disposition', `inline; filename="yildiz-ai-${id}.mp4"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  const length = response.headers.get('content-length');
  if (length) res.setHeader('Content-Length', length);
  if (!response.body) return res.end();
  Readable.fromWeb(response.body).pipe(res);
}

export default async function handler(req, res) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return send(res, 500, { error: 'OPENAI_API_KEY fehlt in Vercel.' });

  try {
    const params = query(req);
    const action = String(params.action || (req.method === 'POST' ? 'create' : 'status'));
    if (req.method === 'POST' && action === 'create') return createVideo(req, res, apiKey);
    if (req.method === 'GET' && action === 'status') return videoStatus(res, apiKey, String(params.id || ''));
    if (req.method === 'GET' && action === 'content') return videoContent(res, apiKey, String(params.id || ''));
    return send(res, 405, { error: 'Nicht unterstützte Video-Aktion.' });
  } catch (error) {
    console.error('OpenAI video API failed', error);
    return send(res, 500, { error: error?.message || 'Die OpenAI-Videogenerierung ist fehlgeschlagen.' });
  }
}
