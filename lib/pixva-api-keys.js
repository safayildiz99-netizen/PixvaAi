import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const CATEGORY='pixva-api-key';
const PREFIX='PIXVA API ';
export const PIXVA_API_SCOPES=['chat','brain','flyer','website','image','video'];

function clean(v,max=180){return String(v??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,max)}
function db(){
  const url=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!url||!key)throw Object.assign(new Error('Supabase Service Role fehlt in Vercel.'),{status:500});
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function hashKey(value){return createHash('sha256').update(String(value||''),'utf8').digest('hex')}
function parseMeta(row){
  try{
    const m=JSON.parse(String(row?.content||'{}'));
    return {...m,id:row?.id||m.id||'',userId:row?.user_id||m.userId||'',prefix:m.prefix||String(row?.title||'').replace(PREFIX,'')};
  }catch{return null}
}
function normalizedScopes(input){
  const list=Array.isArray(input)?input:[];
  const out=[...new Set(list.map(x=>String(x||'').toLowerCase().trim()).filter(x=>PIXVA_API_SCOPES.includes(x)))];
  return out.length?out:['chat','brain'];
}
function publicMeta(meta){
  return{
    id:meta.id,prefix:meta.prefix,name:meta.name,scopes:meta.scopes,active:meta.active!==false,
    rateLimitPerMinute:Number(meta.rateLimitPerMinute||30),createdAt:meta.createdAt||null,
    lastUsedAt:meta.lastUsedAt||null,expiresAt:meta.expiresAt||null,revokedAt:meta.revokedAt||null
  };
}

export async function listPixvaApiKeys(userId){
  const client=db();
  const {data,error}=await client.from('app_memory_items').select('id,user_id,title,content,created_at,updated_at').eq('user_id',userId).eq('category',CATEGORY).order('created_at',{ascending:false});
  if(error)throw error;
  return (data||[]).map(parseMeta).filter(Boolean).map(publicMeta);
}

export async function createPixvaApiKey(userId,input={}){
  const client=db();
  const existing=await listPixvaApiKeys(userId);
  if(existing.filter(x=>x.active).length>=10)throw Object.assign(new Error('Maximal 10 aktive API-Keys pro Konto.'),{status:400});
  const prefix=randomBytes(6).toString('hex');
  const secret=randomBytes(24).toString('base64url');
  const apiKey=`pixva_live_${prefix}_${secret}`;
  const now=new Date();
  const expiresDays=Math.max(0,Math.min(3650,Number(input.expiresDays||0)));
  const meta={
    version:1,prefix,name:clean(input.name||'PIXVA API-Key',80),scopes:normalizedScopes(input.scopes),
    hash:hashKey(apiKey),active:true,rateLimitPerMinute:Math.max(1,Math.min(120,Number(input.rateLimitPerMinute||30))),
    createdAt:now.toISOString(),lastUsedAt:null,expiresAt:expiresDays?new Date(now.getTime()+expiresDays*86400000).toISOString():null,revokedAt:null
  };
  const {data,error}=await client.from('app_memory_items').insert({user_id:userId,category:CATEGORY,title:`${PREFIX}${prefix}`,content:JSON.stringify(meta),created_at:now.toISOString(),updated_at:now.toISOString()}).select('id,user_id,title,content,created_at,updated_at').single();
  if(error)throw error;
  const parsed=parseMeta(data);
  await client.from('app_audit_log').insert({actor_id:userId,target_user_id:userId,action:'api_key_created',details:{prefix,name:meta.name,scopes:meta.scopes,rateLimitPerMinute:meta.rateLimitPerMinute,expiresAt:meta.expiresAt}}).catch(()=>{});
  return{key:apiKey,metadata:publicMeta(parsed)};
}

export async function updatePixvaApiKey(userId,input={}){
  const client=db(),id=clean(input.id,80);
  const {data:row,error}=await client.from('app_memory_items').select('id,user_id,title,content').eq('id',id).eq('user_id',userId).eq('category',CATEGORY).maybeSingle();
  if(error)throw error;if(!row)throw Object.assign(new Error('API-Key nicht gefunden.'),{status:404});
  const meta=parseMeta(row);if(!meta)throw new Error('API-Key-Metadaten sind ungültig.');
  meta.name=clean(input.name??meta.name,80)||meta.name;
  if(input.scopes)meta.scopes=normalizedScopes(input.scopes);
  if(input.rateLimitPerMinute!==undefined)meta.rateLimitPerMinute=Math.max(1,Math.min(120,Number(input.rateLimitPerMinute||30)));
  meta.updatedAt=new Date().toISOString();
  const {error:updateError}=await client.from('app_memory_items').update({content:JSON.stringify(meta),updated_at:meta.updatedAt}).eq('id',row.id);if(updateError)throw updateError;
  await client.from('app_audit_log').insert({actor_id:userId,target_user_id:userId,action:'api_key_updated',details:{prefix:meta.prefix,scopes:meta.scopes,rateLimitPerMinute:meta.rateLimitPerMinute}}).catch(()=>{});
  return publicMeta(meta);
}

export async function revokePixvaApiKey(userId,id){
  const client=db();
  const {data:row,error}=await client.from('app_memory_items').select('id,user_id,title,content').eq('id',clean(id,80)).eq('user_id',userId).eq('category',CATEGORY).maybeSingle();
  if(error)throw error;if(!row)throw Object.assign(new Error('API-Key nicht gefunden.'),{status:404});
  const meta=parseMeta(row);if(!meta)throw new Error('API-Key-Metadaten sind ungültig.');
  meta.active=false;meta.revokedAt=new Date().toISOString();meta.updatedAt=meta.revokedAt;
  const {error:updateError}=await client.from('app_memory_items').update({content:JSON.stringify(meta),updated_at:meta.updatedAt}).eq('id',row.id);if(updateError)throw updateError;
  await client.from('app_audit_log').insert({actor_id:userId,target_user_id:userId,action:'api_key_revoked',details:{prefix:meta.prefix}}).catch(()=>{});
  return publicMeta(meta);
}

function apiKeyFromRequest(req){
  const auth=String(req.headers?.authorization||'');
  if(auth.startsWith('Bearer '))return auth.slice(7).trim();
  return String(req.headers?.['x-api-key']||'').trim();
}
function equalHex(a,b){
  if(!/^[0-9a-f]{64}$/i.test(a)||!/^[0-9a-f]{64}$/i.test(b))return false;
  const x=Buffer.from(a,'hex'),y=Buffer.from(b,'hex');
  return x.length===y.length&&timingSafeEqual(x,y);
}

export async function authenticatePixvaApiKey(req,requiredScope=''){
  const raw=apiKeyFromRequest(req);
  const match=raw.match(/^pixva_live_([0-9a-f]{12})_([A-Za-z0-9_-]{20,})$/);
  if(!match)throw Object.assign(new Error('PIXVA API-Key fehlt oder ist ungültig.'),{status:401});
  const prefix=match[1],client=db();
  const {data:row,error}=await client.from('app_memory_items').select('id,user_id,title,content,created_at,updated_at').eq('category',CATEGORY).eq('title',`${PREFIX}${prefix}`).maybeSingle();
  if(error)throw error;if(!row)throw Object.assign(new Error('PIXVA API-Key ist ungültig.'),{status:401});
  const meta=parseMeta(row),actual=hashKey(raw);
  if(!meta||!equalHex(String(meta.hash||''),actual))throw Object.assign(new Error('PIXVA API-Key ist ungültig.'),{status:401});
  if(meta.active===false)throw Object.assign(new Error('Dieser PIXVA API-Key wurde widerrufen.'),{status:401});
  if(meta.expiresAt&&new Date(meta.expiresAt).getTime()<=Date.now())throw Object.assign(new Error('Dieser PIXVA API-Key ist abgelaufen.'),{status:401});
  const scopes=normalizedScopes(meta.scopes);
  if(requiredScope&&!scopes.includes(requiredScope))throw Object.assign(new Error(`Dieser API-Key hat keine Berechtigung für ${requiredScope}.`),{status:403});
  const {data:user,error:userError}=await client.from('app_users').select('id,username,role,active').eq('id',row.user_id).maybeSingle();
  if(userError)throw userError;if(!user?.active)throw Object.assign(new Error('Das zugehörige PIXVA-Konto ist nicht aktiv.'),{status:403});

  const scope=requiredScope||'status';
  const rate=Number(meta.rateLimitPerMinute||30);
  const {data:rateData,error:rateError}=await client.rpc('app_take_public_rate_limit',{p_subject_hash:actual,p_scope:`api-key:${scope}`,p_limit:rate,p_window_seconds:60});
  if(rateError)throw rateError;
  if(rateData?.allowed===false)throw Object.assign(new Error('API-Limit erreicht. Bitte kurz warten.'),{status:429});

  const last=meta.lastUsedAt?new Date(meta.lastUsedAt).getTime():0;
  if(Date.now()-last>60000){
    meta.lastUsedAt=new Date().toISOString();
    client.from('app_memory_items').update({content:JSON.stringify(meta),updated_at:meta.lastUsedAt}).eq('id',row.id).then(()=>{}).catch(()=>{});
  }
  return{client,user,metadata:publicMeta(meta),rawHash:actual};
}

export async function createEphemeralSession(client,userId,minutes=5){
  const token=randomBytes(32).toString('hex'),tokenHash=hashKey(token),expiresAt=new Date(Date.now()+Math.max(1,Math.min(15,minutes))*60000).toISOString();
  const {error}=await client.from('app_sessions').insert({token_hash:tokenHash,user_id:userId,expires_at:expiresAt});
  if(error)throw error;
  return token;
}

export async function apiAudit(client,user,metadata,action,details={}){
  try{await client.from('app_audit_log').insert({actor_id:user.id,target_user_id:user.id,action:`public_api_${action}`,details:{keyPrefix:metadata?.prefix||'',...details}})}catch{}
}
export async function apiError(client,user,area,error){
  try{await client.from('app_error_logs').insert({user_id:user?.id||null,area:`public-api:${area}`,public_message:String(error?.message||'API-Fehler').slice(0,500),technical_message:String(error?.stack||error?.message||'').slice(0,5000)})}catch{}
}
