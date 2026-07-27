import { handleApiError, readJson, requireUser, send, serviceClient } from '../_lib.js';

const allowedFolders = new Set(['bilder','videos','pdf','designs','uploads']);
function classify(mime, profile){
  if(['image/png','image/jpeg','image/webp','image/svg+xml'].includes(mime))return'image';
  if(['video/mp4','video/webm','video/quicktime'].includes(mime))return'video';
  if(mime==='application/pdf')return'pdf';
  if(mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document')return'docx';
  if(mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')return'xlsx';
  if(['text/plain','text/csv','application/json','text/html','text/markdown'].includes(mime))return'upload';
  if(['application/zip','application/x-zip-compressed'].includes(mime)&&profile.role==='admin')return'other';
  return'';
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST ist erlaubt.' });
  try {
    const { user, profile } = await requireUser(req);
    const body = await readJson(req);
    const path = String(body.path || '');
    const parts = path.split('/');
    if (parts.length < 3 || parts[0] !== user.id || !allowedFolders.has(parts[1])) throw Object.assign(new Error('Ungültiger privater Speicherpfad.'), { status: 403 });
    const filename = parts.slice(2).join('/');
    const db = serviceClient();
    const [{ data: objects, error: listError },{data:settings}] = await Promise.all([
      db.storage.from('user-media').list(`${user.id}/${parts[1]}`, { search: filename, limit: 10 }),
      db.from('app_settings').select('max_upload_mb').eq('id',1).single()
    ]);
    if (listError) throw listError;
    const object = (objects || []).find(item => item.name === filename);
    if (!object) return send(res, 404, { error: 'Upload wurde im privaten Speicher nicht gefunden.' });
    const sizeBytes = Number(object.metadata?.size || body.sizeBytes || 0);
    if (sizeBytes <= 0) return send(res, 400, { error: 'Die hochgeladene Datei ist leer.' });
    const mimeType = String(object.metadata?.mimetype || body.mimeType || '').toLowerCase();
    const assetType=classify(mimeType,profile);
    if(!assetType){await db.storage.from('user-media').remove([path]);return send(res,415,{error:'Dateityp ist nicht erlaubt.'})}
    const configuredMax=Math.max(1,Math.min(200,Number(settings?.max_upload_mb||25)));
    const effectiveMax=profile.role==='admin'&&assetType==='other'?200:assetType==='video'?Math.max(25,configuredMax):configuredMax;
    if(sizeBytes>effectiveMax*1024*1024){await db.storage.from('user-media').remove([path]);return send(res,413,{error:`Datei überschreitet das Limit von ${effectiveMax} MB.`})}
    const { data: asset, error } = await db.from('media_assets').insert({
      user_id: user.id, asset_type: assetType, bucket: 'user-media', storage_path: path,
      original_name: String(body.originalName || filename).slice(0, 180), mime_type: mimeType,
      size_bytes: sizeBytes, source_type: 'upload',
      metadata: { uploadedDirectly: true, etag: object.metadata?.eTag || object.metadata?.etag || '' }
    }).select('*').single();
    if (error) throw error;
    return send(res, 201, { asset, verified: true });
  } catch (error) { return handleApiError(res, error, 'Upload konnte nicht registriert werden.'); }
}
