import { supabase } from './supabase';
export async function api(path,options={}){const {data:{session}}=await supabase.auth.getSession();const headers={...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(options.headers||{})};if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;const response=await fetch(path,{...options,headers});const data=await response.json().catch(()=>({}));if(!response.ok){const e=new Error(data.error||`HTTP ${response.status}`);e.status=response.status;e.code=data.code;e.estimatedCostUsd=data.estimatedCostUsd;throw e}return data}
export async function costAware(path,body){try{return await api(path,{method:'POST',body:JSON.stringify(body)})}catch(e){if(e.status===402&&e.code==='COST_CONFIRMATION_REQUIRED'){const amount=new Intl.NumberFormat('de-DE',{style:'currency',currency:'USD'}).format(Number(e.estimatedCostUsd||0));if(window.confirm(`Diese Erstellung kostet voraussichtlich ${amount}. Jetzt starten?`))return api(path,{method:'POST',body:JSON.stringify({...body,costConfirmed:true})})}throw e}}
export function id(){return crypto.randomUUID()}
export function euro(cents){return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(cents||0)/100)}
export function usd(value){return new Intl.NumberFormat('de-DE',{style:'currency',currency:'USD'}).format(Number(value||0))}

export async function uploadPrivateFile(file){
  if(!(file instanceof File)) throw new Error('Bitte zuerst eine Datei auswählen.');
  const ticket=await api('/api/files/upload-ticket',{method:'POST',body:JSON.stringify({name:file.name,mimeType:file.type||'application/octet-stream',sizeBytes:file.size})});
  const {error}=await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path,ticket.token,file,{contentType:ticket.mimeType,upsert:false});
  if(error) throw new Error(error.message||'Direkter Storage-Upload fehlgeschlagen.');
  return api('/api/files/register-upload',{method:'POST',body:JSON.stringify({path:ticket.path,originalName:ticket.originalName,mimeType:ticket.mimeType,sizeBytes:ticket.sizeBytes,assetType:ticket.assetType})});
}
