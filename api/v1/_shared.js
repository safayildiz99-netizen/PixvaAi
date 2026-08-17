import { randomUUID } from 'node:crypto';
import { authenticatePixvaApiKey, createEphemeralSession, apiAudit, apiError } from '../../lib/pixva-api-keys.js';

export function send(res,status,payload){
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
export async function readJson(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'){try{return JSON.parse(req.body)}catch{return{}}}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return{}}
}
export function requestBase(req){
  const explicit=String(process.env.APP_URL||'').replace(/\/$/,'');if(explicit)return explicit;
  const proto=String(req.headers?.['x-forwarded-proto']||'https').split(',')[0].trim();
  const host=String(req.headers?.host||'').trim();
  return host?`${proto}://${host}`:'';
}
export async function withApiKey(req,res,scope,fn){
  let auth;
  try{
    auth=await authenticatePixvaApiKey(req,scope);
    const result=await fn(auth);
    await apiAudit(auth.client,auth.user,auth.metadata,scope,{ok:true});
    return result;
  }catch(error){
    if(auth)await apiError(auth.client,auth.user,scope,error);
    return send(res,Number(error?.status)||500,{error:error?.message||'PIXVA Public API fehlgeschlagen.'});
  }
}
export async function proxyJson(req,auth,path,body){
  const base=requestBase(req);if(!base)throw Object.assign(new Error('APP_URL/Host konnte nicht bestimmt werden.'),{status:500});
  const token=await createEphemeralSession(auth.client,auth.user.id,5);
  const response=await fetch(`${base}${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body||{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data?.error||`PIXVA interner Aufruf fehlgeschlagen (${response.status}).`),{status:response.status});
  return data;
}
export function requestId(value){
  const raw=String(value||'');return /^[0-9a-f-]{36}$/i.test(raw)?raw:randomUUID();
}
