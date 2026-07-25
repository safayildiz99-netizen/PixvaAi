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
  return raw || `OpenAI-Videoanfrage fehlgeschlagen (${status}).`;
}

function dataUrlToBlob(value) {
  const match = String(value || '').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  return new Blob([bytes], { type: match[1] });
}

async function createVideo(req, res, apiKey) {
  const body = await readJson(req);
  const prompt = String(body?.prompt || '').trim().slice(0, 4000);
  if (!prompt) return send(res, 400, { error: 'Bitte gib einen Video-Prompt ein.' });

  const model = String(process.env.OPENAI_VIDEO_MODEL || body?.model || 'sora-2').trim();
  const size = ['720x1280', '1280x720', '1080x1920', '1920x1080'].includes(body?.size)
    ? body.size
    : body?.aspect === 'landscape' ? '1280x720' : '720x1280';
  const seconds = ['4', '8', '12', '16', '20'].includes(String(body?.seconds)) ? String(body.seconds) : '8';

  const form = new FormData();
  form.append('model', model);
  form.append('prompt', `${prompt}\nCreate a polished commercial-quality video with coherent motion, realistic lighting, strong composition, and synchronized audio. Do not add captions or logos unless requested.`);
  form.append('size', size);
  form.append('seconds', seconds);

  const reference = dataUrlToBlob(body?.referenceImage);
  if (reference) form.append('input_reference', reference, reference.type === 'image/png' ? 'reference.png' : 'reference.jpg');

  const response = await fetch('https://api.openai.com/v1/videos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return send(res, response.status, { error: errorMessage(response.status, data), technical: data?.error?.message });
  return send(res, 200, data);
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
