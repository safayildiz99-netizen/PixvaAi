import { createSignedUrl, handleApiError, requireUser, send, serviceClient } from '../_lib.js';
export default async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{error:'Nur GET ist erlaubt.'});
 try{
  const {user,profile}=await requireUser(req);const id=String(req.query?.assetId||'');const db=serviceClient();
  const {data:asset}=await db.from('media_assets').select('*').eq('id',id).single();
  if(!asset)throw Object.assign(new Error('Datei nicht gefunden.'),{status:404});
  if(asset.user_id!==user.id&&profile.role!=='admin')throw Object.assign(new Error('Kein Zugriff auf diese Datei.'),{status:403});
  if(!String(asset.storage_path||'').startsWith(`${asset.user_id}/`))throw Object.assign(new Error('Unsicherer oder beschädigter Speicherpfad.'),{status:409});
  if(Number(asset.size_bytes||0)<=0)throw Object.assign(new Error('Datei ist leer oder noch nicht vollständig gespeichert.'),{status:409});
  return send(res,200,{asset,signedUrl:await createSignedUrl(asset)});
 }catch(e){return handleApiError(res,e,'Datei konnte nicht geöffnet werden.')}
}
