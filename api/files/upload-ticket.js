import { randomUUID } from 'node:crypto';
import { handleApiError, rateLimit, readJson, requireUser, send, serviceClient } from '../_lib.js';

const documentTypes = new Map([
  ['application/pdf', { folder: 'pdf', assetType: 'pdf', maxMb: 25 }],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', { folder: 'uploads', assetType: 'docx', maxMb: 25 }],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { folder: 'uploads', assetType: 'xlsx', maxMb: 25 }],
  ['text/plain', { folder: 'uploads', assetType: 'upload', maxMb: 10 }],
  ['text/csv', { folder: 'uploads', assetType: 'upload', maxMb: 10 }],
  ['application/json', { folder: 'uploads', assetType: 'upload', maxMb: 10 }],
  ['text/html', { folder: 'uploads', assetType: 'upload', maxMb: 10 }],
  ['text/markdown', { folder: 'uploads', assetType: 'upload', maxMb: 10 }]
]);
const imageTypes = new Set(['image/png','image/jpeg','image/webp','image/svg+xml']);
const videoTypes = new Set(['video/mp4','video/webm','video/quicktime']);
const zipTypes = new Set(['application/zip','application/x-zip-compressed']);

function classify(mime, profile, configuredMax) {
  if (imageTypes.has(mime)) return { folder: 'bilder', assetType: 'image', maxMb: Math.min(configuredMax, 25) };
  if (videoTypes.has(mime)) return { folder: 'videos', assetType: 'video', maxMb: Math.min(Math.max(configuredMax, 25), 200) };
  if (documentTypes.has(mime)) {
    const value = documentTypes.get(mime);
    return { ...value, maxMb: Math.min(value.maxMb, configuredMax) };
  }
  if (zipTypes.has(mime) && profile.role === 'admin') return { folder: 'uploads', assetType: 'other', maxMb: Math.min(Math.max(configuredMax, 25), 200) };
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST ist erlaubt.' });
  try {
    const { user, profile } = await requireUser(req);
    await rateLimit({ userId: user.id, endpoint: 'files/upload-ticket', limit: 30, windowSeconds: 600 });
    const body = await readJson(req);
    const originalName = String(body.name || '').trim().slice(0, 180);
    const mimeType = String(body.mimeType || '').toLowerCase().trim();
    const sizeBytes = Number(body.sizeBytes || 0);
    if (!originalName || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return send(res, 400, { error: 'Dateiname oder Dateigröße fehlt.' });
    const db = serviceClient();
    const { data: settings } = await db.from('app_settings').select('max_upload_mb').eq('id', 1).single();
    const rule = classify(mimeType, profile, Number(settings?.max_upload_mb || 25));
    if (!rule) return send(res, 415, { error: 'Dieser Dateityp ist nicht erlaubt.' });
    if (sizeBytes > rule.maxMb * 1024 * 1024) return send(res, 413, { error: `Die Datei darf höchstens ${rule.maxMb} MB groß sein.` });
    const safeName = originalName.replace(/[^a-zA-Z0-9äöüÄÖÜß._-]/g, '_').slice(0, 140);
    const objectName = `${Date.now()}-${randomUUID()}-${safeName}`;
    const path = `${user.id}/${rule.folder}/${objectName}`;
    const { data, error } = await db.storage.from('user-media').createSignedUploadUrl(path, { upsert: false });
    if (error) throw error;
    return send(res, 200, {
      bucket: 'user-media', path, token: data.token,
      originalName, mimeType, sizeBytes, assetType: rule.assetType,
      expiresInSeconds: 7200
    });
  } catch (error) {
    return handleApiError(res, error, 'Upload konnte nicht vorbereitet werden.');
  }
}
