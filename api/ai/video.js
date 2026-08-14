import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { readJson, send } from '../_lib.js';
import { authorizeUsage, bindUsageProvider, finishUsage, verifyUsageAccess } from '../_usage.js';

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
    return 'Das Referenzbild hatte nicht exakt die Videoauflösung. PIXVA hat es nicht korrekt vorbereiten können.';
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
  if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
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
    const proSizes = ['720x1280', '1280x720', '1024x1792', '1792x1024'];
    return proSizes.includes(requested) ? requested : (landscape ? '1280x720' : '720x1280');
  }
  return landscape ? '1280x720' : '720x1280';
}

function estimatedVideoCost(model, size, seconds) {
  const duration = Number(seconds || 4);
  if (model !== 'sora-2-pro') return duration * 0.10;
  if (['1024x1792', '1792x1024'].includes(size)) return duration * 0.50;
  return duration * 0.30;
}

async function moderatePrompt(apiKey, prompt, referenceImage) {
  const input = [{ type: 'text', text: prompt }];
  if (referenceImage) input.push({ type: 'image_url', image_url: { url: referenceImage } });
  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input })
  });
  if (!response.ok) return;
  const data = await response.json().catch(() => ({}));
  if (data?.results?.some((item) => item?.flagged)) {
    const error = new Error('Diese Videoanfrage wurde aus Sicherheitsgründen blockiert.');
    error.status = 400;
    throw error;
  }
}

async function createVideo(req, res, apiKey) {
  const body = await readJson(req);
  const prompt = String(body?.prompt || '').trim().slice(0, 4000);
  if (!prompt) return send(res, 400, { error: 'Bitte gib einen Video-Prompt ein.' });

  const requestedModel = String(body?.model || process.env.OPENAI_VIDEO_MODEL || 'sora-2-pro').trim();
  const model = ['sora-2', 'sora-2-pro'].includes(requestedModel) ? requestedModel : 'sora-2';
  const size = allowedSize(model, String(body?.size || ''), body?.aspect);
  const seconds = ['4', '8', '12'].includes(String(body?.seconds)) ? String(body.seconds) : '4';
  const target = parseSize(size);
  const requestId = String(body?.requestId || randomUUID());
  const cost = estimatedVideoCost(model, size, seconds);

  try {
    await authorizeUsage(req, { requestId, kind: 'video', model, units: Number(seconds), estimatedCostUsd: cost });
    await moderatePrompt(apiKey, prompt, String(body?.referenceImage || ''));

    const form = new FormData();
    form.append('model', model);
    form.append('prompt', `${prompt}\nCreate a premium commercial-quality video with stable subject identity, coherent motion, realistic physics, natural hands and faces, cinematic lighting, controlled camera movement, consistent colors, high detail, and synchronized audio. Avoid flicker, morphing, duplicated objects, random text, subtitles, watermarks, and unwanted logos. Keep visual continuity from the first frame to the last.`);
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
    if (!response.ok) {
      const message = errorMessage(response.status, data);
      await finishUsage(req, { requestId, status: 'failed', actualCostUsd: 0, error: message });
      return send(res, response.status, { error: message, technical: data?.error?.message });
    }
    if (!data?.id) {
      await finishUsage(req, { requestId, status: 'failed', actualCostUsd: 0, error: 'OpenAI hat keine Video-ID geliefert.' });
      return send(res, 502, { error: 'OpenAI hat keine Video-ID geliefert.' });
    }
    try {
      await bindUsageProvider(req, { requestId, providerId: data.id });
    } catch (bindError) {
      fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(data.id)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` }
      }).catch(() => {});
      await finishUsage(req, { requestId, status: 'failed', actualCostUsd: 0, error: bindError?.message });
      return send(res, 500, { error: bindError?.message || 'Videoauftrag konnte nicht sicher dem Konto zugeordnet werden.' });
    }
    if (data.status === 'completed') await finishUsage(req, { requestId, status: 'completed' });
    return send(res, 200, { ...data, requestId, estimatedCostUsd: cost, referenceUsed, referenceWarning, size, seconds, model });
  } catch (error) {
    await finishUsage(req, { requestId, status: 'failed', actualCostUsd: 0, error: error?.message });
    return send(res, error?.status || (/anmelden/i.test(error?.message || '') ? 401 : 500), { error: error?.message || 'Sora-Video konnte nicht gestartet werden.' });
  }
}

async function videoStatus(req, res, apiKey, id, requestId) {
  if (!id || !requestId) return send(res, 400, { error: 'Video-ID oder Request-ID fehlt.' });
  await verifyUsageAccess(req, { requestId, providerId: id, kind: 'video' });
  const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return send(res, response.status, { error: errorMessage(response.status, data) });
  if (requestId && data?.status === 'completed') await finishUsage(req, { requestId, status: 'completed' });
  if (requestId && data?.status === 'failed') await finishUsage(req, { requestId, status: 'failed', actualCostUsd: 0, error: data?.error?.message || 'Sora fehlgeschlagen.' });
  return send(res, 200, data);
}

async function videoDelete(req, res, apiKey, id, requestId) {
  if (!id || !requestId) return send(res, 400, { error: 'Video-ID oder Request-ID fehlt.' });
  await verifyUsageAccess(req, { requestId, providerId: id, kind: 'video' });
  const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return send(res, response.status, { error: errorMessage(response.status, data) });
  if (requestId) await finishUsage(req, { requestId, status: 'cancelled', actualCostUsd: 0 });
  return send(res, 200, { ...data, cancelled: true });
}

async function videoContent(req, res, apiKey, id, requestId) {
  if (!id || !requestId) return send(res, 400, { error: 'Video-ID oder Request-ID fehlt.' });
  await verifyUsageAccess(req, { requestId, providerId: id, kind: 'video' });
  const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(id)}/content`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return send(res, response.status, { error: errorMessage(response.status, data) });
  }

  await finishUsage(req, { requestId, status: 'completed' });
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
    const id = String(params.id || '');
    const requestId = String(params.requestId || '');
    if (req.method === 'POST' && action === 'create') return createVideo(req, res, apiKey);
    if (req.method === 'GET' && action === 'status') return videoStatus(req, res, apiKey, id, requestId);
    if (req.method === 'GET' && action === 'content') return videoContent(req, res, apiKey, id, requestId);
    if (req.method === 'DELETE' && action === 'delete') return videoDelete(req, res, apiKey, id, requestId);
    return send(res, 405, { error: 'Nicht unterstützte Video-Aktion.' });
  } catch (error) {
    console.error('OpenAI video API failed', error);
    const message = error?.message || 'Die OpenAI-Videogenerierung ist fehlgeschlagen.';
    const status = error?.status || (/anmelden/i.test(message) ? 401 : /kein zugriff|gehört nicht/i.test(message) ? 403 : 500);
    return send(res, status, { error: message });
  }
}
