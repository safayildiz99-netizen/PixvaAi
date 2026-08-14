import { createHash, randomBytes, randomUUID, createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { waitUntil } from '@vercel/functions';
import QRCode from 'qrcode';
import nodemailer from 'nodemailer';
import { readJson, readToken, send, validateUser } from './_lib.js';

export const config={maxDuration:300};
const BUCKET='pixva-private';
const MAX_FILE_BYTES=15*1024*1024;
const ALLOWED_MIMES=new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv','text/plain','text/markdown','application/json','text/html','application/xml','text/xml',
  'image/png','image/jpeg','image/webp'
]);
const ALLOWED_EXTENSIONS=new Set(['pdf','docx','xlsx','xls','csv','txt','md','json','html','htm','xml','png','jpg','jpeg','webp']);
function extensionOf(name){return String(name||'').toLowerCase().split('.').pop()||''}
function effectiveMime(name,mime){
  const raw=String(mime||'').toLowerCase();
  if(raw&&raw!=='application/octet-stream')return raw;
  const ext=extensionOf(name);
  return ({pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel',
    csv:'text/csv',txt:'text/plain',md:'text/markdown',json:'application/json',html:'text/html',htm:'text/html',
    xml:'application/xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'})[ext]||raw||'application/octet-stream';
}

function securityKey(){return createHash('sha256').update(`PIXVA-V11:${process.env.PIXVA_SECURITY_KEY||serviceKey()}`).digest()}
function encryptText(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',securityKey(),iv);const data=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]),tag=cipher.getAuthTag();return `${iv.toString('base64url')}.${tag.toString('base64url')}.${data.toString('base64url')}`}
function decryptText(value){const [ivRaw,tagRaw,dataRaw]=String(value||'').split('.'),d=createDecipheriv('aes-256-gcm',securityKey(),Buffer.from(ivRaw,'base64url'));d.setAuthTag(Buffer.from(tagRaw,'base64url'));return Buffer.concat([d.update(Buffer.from(dataRaw,'base64url')),d.final()]).toString('utf8')}
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buffer){let bits=0,value=0,out='';for(const byte of buffer){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=B32[(value>>>(bits-5))&31];bits-=5}}if(bits>0)out+=B32[(value<<(5-bits))&31];return out}
function base32Decode(input){let bits=0,value=0,out=[];for(const ch of String(input||'').toUpperCase().replace(/[^A-Z2-7]/g,'')){const i=B32.indexOf(ch);if(i<0)continue;value=(value<<5)|i;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8}}return Buffer.from(out)}
function totpAt(secret,step){const key=base32Decode(secret),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(step));const digest=createHmac('sha1',key).update(buf).digest(),offset=digest[digest.length-1]&15,value=(digest.readUInt32BE(offset)&0x7fffffff)%1000000;return String(value).padStart(6,'0')}
function verifyTotp(secret,code){const clean=String(code||'').replace(/\s/g,'');if(!/^\d{6}$/.test(clean))return false;const step=Math.floor(Date.now()/30000);for(const drift of [-1,0,1]){const a=Buffer.from(clean),b=Buffer.from(totpAt(secret,step+drift));if(a.length===b.length&&timingSafeEqual(a,b))return true}return false}
function emailConfigured(){return Boolean(process.env.PIXVA_SMTP_HOST&&process.env.PIXVA_SMTP_USER&&process.env.PIXVA_SMTP_PASS&&process.env.PIXVA_EMAIL_FROM)}
function mailer(){return emailConfigured()?nodemailer.createTransport({host:process.env.PIXVA_SMTP_HOST,port:Number(process.env.PIXVA_SMTP_PORT||587),secure:String(process.env.PIXVA_SMTP_SECURE||'false')==='true',auth:{user:process.env.PIXVA_SMTP_USER,pass:process.env.PIXVA_SMTP_PASS}}):null}
async function sendMail(to,subject,html){const transport=mailer();if(!transport)throw new Error('E-Mail ist noch nicht konfiguriert.');await transport.sendMail({from:process.env.PIXVA_EMAIL_FROM,to,subject,html})}
async function openAIEmbeddings(texts){const key=String(process.env.OPENAI_API_KEY||'').trim();if(!key)return[];const input=(Array.isArray(texts)?texts:[texts]).map(x=>String(x||'').slice(0,8000));const r=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'text-embedding-3-small',input})});if(!r.ok)throw new Error(`Embeddings fehlgeschlagen (${r.status}).`);const d=await r.json().catch(()=>({}));return(d.data||[]).sort((a,b)=>a.index-b.index).map(x=>x.embedding)}
function sniffAllowed(buffer,name){const ext=extensionOf(name);if(ext==='pdf'&&buffer.subarray(0,5).toString()!=='%PDF-')return false;if(ext==='png'&&!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return false;if((ext==='jpg'||ext==='jpeg')&&!(buffer[0]===255&&buffer[1]===216&&buffer[2]===255))return false;if(['docx','xlsx','xls'].includes(ext)&&!(buffer[0]===80&&buffer[1]===75))return false;return true}
async function audit(client,actor,action,target=null,details={}){try{await client.from('app_audit_log').insert({actor_id:actor?.id||null,target_user_id:target||null,action,details})}catch{}}
function requestBase(req){const explicit=String(process.env.APP_URL||'').replace(/\/$/,'');if(explicit)return explicit;const proto=String(req.headers['x-forwarded-proto']||'https'),host=String(req.headers.host||'');return host?`${proto}://${host}`:''}
async function consumeRecoveryCode(client,userId,code){const hash=createHash('sha256').update(String(code||'').trim().toUpperCase()).digest('hex');const {data}=await client.from('app_recovery_codes').select('*').eq('user_id',userId).eq('code_hash',hash).is('used_at',null).order('created_at',{ascending:false}).limit(1);const row=data?.[0];if(!row)return false;await client.from('app_recovery_codes').update({used_at:new Date().toISOString()}).eq('id',row.id);return true}
async function persistGeneratedImage(client,user,imageDataUrl,title='pixva-agent'){const m=String(imageDataUrl||'').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);if(!m)return null;const ext=m[1].includes('png')?'png':m[1].includes('jpeg')?'jpg':'webp',path=`${user.id}/agent/${randomUUID()}-${cleanName(title)}.${ext}`;const {error}=await client.storage.from(BUCKET).upload(path,Buffer.from(m[2],'base64'),{contentType:m[1],upsert:false});if(error)throw error;return path}
async function internalCall(base,token,path,options={}){const r=await fetch(`${base}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})}}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||`Interner PIXVA-Aufruf fehlgeschlagen (${r.status}).`);return d}
async function hydrateRuns(client,runs){const copy=JSON.parse(JSON.stringify(runs||[]));for(const run of copy){for(const item of(run.results||[])){if(item.storagePath&&!item.image){try{const {data}=await client.storage.from(BUCKET).createSignedUrl(item.storagePath,3600);if(data?.signedUrl)item.image=data.signedUrl}catch{}}}}return copy}
async function runAgentBackground(client,user,run,token,base){const tasks=Array.isArray(run?.plan?.tasks)?run.plan.tasks:[],results=[];await client.from('app_agent_runs').update({status:'running',auto_run:true,background_started_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',run.id);try{for(const task of tasks){let result={taskId:task.id||randomUUID(),title:task.title||'PIXVA Aufgabe',type:task.type||'text',at:new Date().toISOString()};try{if(task.type==='image'){const r=await internalCall(base,token,'/api/ai/image',{method:'POST',body:JSON.stringify({prompt:task.prompt,aspect:task.aspect||'post',style:'poster'})}),storagePath=r.imageDataUrl?await persistGeneratedImage(client,user,r.imageDataUrl,task.title):null;result={...result,status:'completed',storagePath,image:r.imageUrl||'',provider:r.provider||''}}else if(task.type==='video'){const r=await internalCall(base,token,'/api/ai/video?action=create',{method:'POST',body:JSON.stringify({prompt:task.prompt,aspect:task.aspect||'portrait',seconds:String(task.seconds||4),requestId:randomUUID()})});result={...result,status:r.status||'queued',videoId:r.id||'',requestId:r.requestId||''}}else if(task.type==='translation'){const r=await gemini({prompt:`Übersetze professionell in ${task.target||'Deutsch'}:\n${task.prompt}`,temperature:.1});result={...result,status:'completed',text:r.text}}else{const r=await gemini({prompt:String(task.prompt||''),temperature:.25});result={...result,status:'completed',text:r.text}}}catch(error){result={...result,status:'failed',error:String(error.message||error).slice(0,600)}}results.push(result);await client.from('app_agent_runs').update({results,updated_at:new Date().toISOString()}).eq('id',run.id)}const failed=results.some(x=>x.status==='failed');await client.from('app_agent_runs').update({results,status:failed?'failed':'completed',background_finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',run.id);await client.from('app_notifications').insert({user_id:user.id,kind:failed?'warning':'success',title:failed?'PIXVA Agent teilweise fehlgeschlagen':'PIXVA Agent fertig',message:run.prompt,related_id:run.id});if(emailConfigured()){const {data:u}=await client.from('app_users').select('email').eq('id',user.id).maybeSingle();if(u?.email)await sendMail(u.email,'PIXVA Agent fertig',`<p>Dein PIXVA-Auftrag ist fertig:</p><p>${String(run.prompt||'').replace(/[<>]/g,'')}</p>`).catch(()=>{})}}catch(error){await client.from('app_agent_runs').update({status:'failed',error:String(error.message||error).slice(0,800),background_finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',run.id)}}

function actionOf(req){
  if(req.query?.action)return String(req.query.action);
  try{return new URL(req.url,'http://localhost').searchParams.get('action')||''}catch{return''}
}
function supabaseUrl(){return String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/$/,'')}
function serviceKey(){return String(process.env.SUPABASE_SERVICE_ROLE_KEY||'')}
function db(){
  if(!supabaseUrl()||!serviceKey())throw new Error('SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in Vercel.');
  return createClient(supabaseUrl(),serviceKey(),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
function cleanName(value='file'){
  const raw=String(value||'file').normalize('NFKD').replace(/[^\w.\-äöüÄÖÜß]+/g,'-');
  return raw.replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,120)||'file';
}
function ownPath(user,path){
  const value=String(path||'').replace(/^\/+/,'');
  if(!value.startsWith(`${user.id}/`))throw Object.assign(new Error('Kein Zugriff auf diese Datei.'),{status:403});
  return value;
}
function asNumber(value){
  if(value===null||value===undefined||value==='')return null;
  const raw=String(value).trim().replace(/[€$£]/g,'').replace(/\s/g,'');
  const normalized=raw.includes(',')&&raw.includes('.')
    ?(raw.lastIndexOf(',')>raw.lastIndexOf('.')?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,''))
    :raw.replace(',','.');
  const n=Number(normalized);return Number.isFinite(n)?Math.round(n*100)/100:null;
}
function headerKey(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'')}
function first(row,aliases){
  const entries=Object.entries(row||{});
  for(const alias of aliases){const f=entries.find(([k])=>headerKey(k)===headerKey(alias));if(f&&String(f[1]??'').trim()!=='')return f[1]}
  return'';
}
function productFromRow(row){
  const name=String(first(row,['name','produkt','produktname','artikel','artikelname','bezeichnung','product','productname'])||'').trim();
  if(!name)return null;
  return{
    ean:String(first(row,['ean','barcode','gtin','ean13','strichcode'])||'').trim().slice(0,64),
    name:name.slice(0,180),
    brand:String(first(row,['marke','brand','hersteller'])||'').trim().slice(0,120),
    weight:String(first(row,['gewicht','weight','inhalt','groesse','größe','size','menge'])||'').trim().slice(0,100),
    category:String(first(row,['kategorie','category','warengruppe','gruppe'])||'').trim().slice(0,100),
    normal_price:asNumber(first(row,['normalpreis','normal price','regularprice','alterpreis','stattpreis','preis','price'])),
    offer_price:asNumber(first(row,['angebotspreis','offerprice','aktion','aktionspreis','saleprice','sonderpreis'])),
    image_url:String(first(row,['bild','bildurl','image','imageurl','foto','photourl'])||'').trim().slice(0,1000),
    notes:String(first(row,['notiz','notizen','notes','bemerkung','info'])||'').trim().slice(0,1000)
  };
}
async function downloadOwnFile(client,user,storagePath){
  const path=ownPath(user,storagePath);
  const {data,error}=await client.storage.from(BUCKET).download(path);
  if(error||!data)throw new Error(error?.message||'Private Datei konnte nicht geladen werden.');
  const buffer=Buffer.from(await data.arrayBuffer());
  if(!buffer.length)throw new Error('Die Datei ist leer.');
  if(buffer.length>MAX_FILE_BYTES)throw new Error('Datei ist größer als 15 MB.');
  const localName=path.split('/').pop()||'datei';
  if(!sniffAllowed(buffer,localName))throw new Error('Dateiinhalt passt nicht zum Dateityp. Upload wurde aus Sicherheitsgründen blockiert.');
  return{buffer,path};
}
function textChunks(text,size=3600,overlap=400){
  const clean=String(text||'').replace(/\u0000/g,'').replace(/\r/g,'').trim();if(!clean)return[];
  const chunks=[];let start=0;
  while(start<clean.length&&chunks.length<300){
    let end=Math.min(clean.length,start+size);
    if(end<clean.length){const cut=clean.lastIndexOf('\n',end);if(cut>start+Math.floor(size*.55))end=cut}
    chunks.push(clean.slice(start,end).trim());
    if(end>=clean.length)break;start=Math.max(start+1,end-overlap);
  }
  return chunks.filter(Boolean);
}
function textFromGemini(data){
  const parts=data?.candidates?.[0]?.content?.parts||[];
  return parts.filter(p=>p?.text&&!p?.thought).map(p=>p.text).join('\n').trim();
}
function groundingSources(data){
  const chunks=data?.candidates?.[0]?.groundingMetadata?.groundingChunks||[];const seen=new Set();
  return chunks.map(c=>c?.web).filter(Boolean).map(web=>({title:String(web.title||web.uri||'Quelle').slice(0,220),url:String(web.uri||'')}))
    .filter(x=>x.url&&!seen.has(x.url)&&seen.add(x.url)).slice(0,12);
}
function modelCandidates(){
  return [...new Set([
    String(process.env.GEMINI_MODEL||'').replace(/^models\//,'').trim(),
    'gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash'
  ].filter(Boolean))];
}
function shouldTryAnotherModel(status,message=''){
  return [400,404,408,429,500,502,503,504].includes(status)||/high demand|overload|temporar|resource exhausted|unavailable/i.test(message);
}
async function gemini({prompt,inline,json=false,web=false,temperature=.25}){
  const apiKey=String(process.env.GEMINI_API_KEY||'').trim();
  if(!apiKey)throw new Error('GEMINI_API_KEY fehlt in Vercel.');
  const parts=[{text:String(prompt||'').slice(0,50000)}];
  if(inline?.buffer&&inline?.mimeType)parts.push({inline_data:{mime_type:inline.mimeType,data:inline.buffer.toString('base64')}});
  const body={
    contents:[{role:'user',parts}],
    generationConfig:{temperature,...(json?{responseMimeType:'application/json'}:{})},
    ...(web?{tools:[{google_search:{}}]}:{})
  };
  let lastStatus=503,lastMessage='';
  for(const model of modelCandidates()){
    for(let attempt=0;attempt<2;attempt+=1){
      if(attempt)await new Promise(r=>setTimeout(r,650+Math.floor(Math.random()*450)));
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),40000);
      try{
        const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
          method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body)
        });
        const data=await response.json().catch(()=>({}));
        lastStatus=response.status;lastMessage=String(data?.error?.message||'');
        if(response.ok){
          const text=textFromGemini(data);
          if(text)return{text,sources:groundingSources(data),raw:data,model};
          lastMessage='Gemini hat keine Textantwort geliefert.';
        }
        if([401,403].includes(response.status))throw Object.assign(new Error('Der Gemini API-Key ist ungültig oder nicht freigegeben.'),{status:response.status});
        if(!shouldTryAnotherModel(response.status,lastMessage))break;
      }catch(error){
        if(error?.status)throw error;
        lastStatus=error?.name==='AbortError'?504:503;
        lastMessage=error?.name==='AbortError'?'Zeitüberschreitung beim KI-Dienst.':String(error?.message||'Verbindungsfehler');
      }finally{clearTimeout(timer)}
    }
  }
  const e=new Error(lastStatus===429?'Das Gemini-Limit ist gerade erreicht. Bitte warte kurz und versuche es erneut.':`Gemini ist gerade nicht verfügbar. ${lastMessage}`.slice(0,500));
  e.status=lastStatus;throw e;
}
function parseJsonText(text,fallback={}){
  const raw=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(raw)}catch{}
  const match=raw.match(/\{[\s\S]*\}/);if(match)try{return JSON.parse(match[0])}catch{}
  return fallback;
}
async function enforceRate(client,req,scope,limit=25,seconds=60){
  const {data,error}=await client.rpc('app_take_rate_limit',{p_token:readToken(req),p_scope:scope,p_limit:limit,p_window_seconds:seconds});
  if(error)throw new Error(error.message||'Rate-Limit konnte nicht geprüft werden.');
  if(data?.error)throw Object.assign(new Error(data.error),{status:401});
  if(data?.allowed===false){const e=new Error('Zu viele Anfragen. Bitte kurz warten und erneut versuchen.');e.status=429;throw e}
}
async function enforcePublicRate(client,req,scope,subject,limit=8,seconds=900){
  const forwarded=String(req.headers?.['x-forwarded-for']||'').split(',')[0].trim();
  const remote=String(req.socket?.remoteAddress||'');
  const subjectHash=createHash('sha256').update(`${forwarded||remote}|${String(subject||'').toLowerCase().trim()}`).digest('hex');
  const {data,error}=await client.rpc('app_take_public_rate_limit',{p_subject_hash:subjectHash,p_scope:scope,p_limit:limit,p_window_seconds:seconds});
  if(error)throw new Error(error.message||'Sicherheitslimit konnte nicht geprüft werden.');
  if(data?.allowed===false){const e=new Error('Zu viele Wiederherstellungsversuche. Bitte später erneut versuchen.');e.status=429;throw e}
}
async function safeQuery(promise,fallback=[]){try{const {data,error}=await promise;if(error)throw error;return data??fallback}catch{return fallback}}
async function overview(client,user){
  const [brand,memories,products,files,runs,notes,versions,snapshots,jobs]=await Promise.all([
    safeQuery(client.from('app_brand_kits').select('*').eq('user_id',user.id).maybeSingle(),null),
    safeQuery(client.from('app_memory_items').select('*').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(100)),
    safeQuery(client.from('app_products').select('*').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(500)),
    safeQuery(client.from('app_knowledge_files').select('id,storage_path,original_name,mime_type,size_bytes,status,error,created_at,updated_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100)),
    safeQuery(client.from('app_agent_runs').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(30)),
    safeQuery(client.from('app_notifications').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50)),
    safeQuery(client.from('app_project_versions').select('id,project_id,version_no,name,type,reason,created_at').eq('owner_id',user.id).order('created_at',{ascending:false}).limit(80)),
    safeQuery(client.from('app_user_snapshots').select('id,label,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20)),
    safeQuery(client.from('app_usage_events').select('id,kind,model,status,units,estimated_cost_usd,actual_cost_usd,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(30))
  ]);
  let admin=null;
  if(user.role==='admin'){
    const [errors,users]=await Promise.all([
      safeQuery(client.from('app_error_logs').select('*').order('created_at',{ascending:false}).limit(50)),
      safeQuery(client.from('app_users').select('id,username,role,active,created_at').order('created_at',{ascending:false}).limit(250))
    ]);
    admin={errors,users};
  }
  const hydratedRuns=await hydrateRuns(client,runs);
  return{
    brand,memories,products,files,runs:hydratedRuns,notifications:notes,versions,snapshots,jobs,admin,
    system:{database:true,privateStorage:true,geminiConfigured:Boolean(process.env.GEMINI_API_KEY),
      openaiConfigured:Boolean(process.env.OPENAI_API_KEY),soraConfigured:Boolean(process.env.OPENAI_API_KEY),
      supabaseServiceConfigured:Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),paypalUntouched:true,semanticSearch:Boolean(process.env.OPENAI_API_KEY),backgroundJobs:true,emailConfigured:emailConfigured(),twoFactor:true,instagramPublishing:true}
  };
}
async function extractFileText(buffer,mime,name){
  const lower=String(name||'').toLowerCase();
  if(mime.includes('spreadsheet')||mime==='application/vnd.ms-excel'||lower.endsWith('.xlsx')||lower.endsWith('.xls')||lower.endsWith('.csv')){
    const book=XLSX.read(buffer,{type:'buffer',cellDates:true});
    return book.SheetNames.map(sheet=>`### Tabelle: ${sheet}\n${XLSX.utils.sheet_to_csv(book.Sheets[sheet],{blankrows:false})}`).join('\n\n').slice(0,800000);
  }
  if(mime.includes('wordprocessingml')||lower.endsWith('.docx')){
    const result=await mammoth.extractRawText({buffer});return String(result.value||'').slice(0,800000);
  }
  if(mime==='application/pdf'||mime.startsWith('image/')){
    const result=await gemini({prompt:'Extrahiere den gesamten lesbaren Inhalt dieser Datei. Bewahre Überschriften, Produktnamen, Mengen, Preise und Tabellen möglichst strukturiert. Erfinde nichts. Antworte nur mit dem extrahierten Inhalt.',inline:{buffer,mimeType:mime},temperature:0});
    return result.text.slice(0,800000);
  }
  return buffer.toString('utf8').slice(0,800000);
}
function relevantChunks(chunks,question,max=8){
  const terms=Array.from(new Set(String(question||'').toLowerCase().match(/[a-zäöüß0-9]{3,}/g)||[]));
  return chunks.map(chunk=>{const text=String(chunk.content||'').toLowerCase();let score=0;for(const term of terms){score+=Math.min(text.split(term).length-1,6)*(term.length>6?3:1)}return{...chunk,score}})
    .sort((a,b)=>b.score-a.score||a.chunk_index-b.chunk_index).slice(0,max);
}
async function snapshotPayload(client,user){
  const rows=async(table,filter='user_id')=>{const {data,error}=await client.from(table).select('*').eq(filter,user.id);return error?[]:(data||[])};
  const [brand,memories,products,projects,chats]=await Promise.all([
    rows('app_brand_kits'),rows('app_memory_items'),rows('app_products'),rows('app_projects','owner_id'),rows('app_chat_state')
  ]);
  return{format:'PIXVA-SNAPSHOT-1',createdAt:new Date().toISOString(),brand,memories,products,projects,chats};
}
async function restoreRows(client,table,rows,user,ownerField='user_id'){
  if(!Array.isArray(rows))return;
  const {error:delError}=await client.from(table).delete().eq(ownerField,user.id);if(delError)throw delError;
  if(!rows.length)return;
  const cleaned=rows.map(row=>({...row,[ownerField]:user.id}));
  const {error}=await client.from(table).insert(cleaned);if(error)throw error;
}
async function logError(client,user,area,error){
  try{await client.from('app_error_logs').insert({user_id:user?.id||null,area,public_message:String(error?.message||'Fehler').slice(0,500),technical_message:String(error?.stack||error?.message||'').slice(0,5000)})}catch{}
}
async function listStorageTree(client,prefix,depth=0){
  if(depth>4)return[];
  const paths=[];let offset=0;
  while(offset<5000){
    const {data,error}=await client.storage.from(BUCKET).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});
    if(error)throw error;
    const items=data||[];
    for(const item of items){
      const path=prefix?`${prefix}/${item.name}`:item.name;
      if(item.id)paths.push(path);else paths.push(...await listStorageTree(client,path,depth+1));
    }
    if(items.length<100)break;offset+=100;
  }
  return paths;
}
async function removeUserStorage(client,userId){
  const paths=await listStorageTree(client,String(userId));
  for(let i=0;i<paths.length;i+=100){
    const {error}=await client.storage.from(BUCKET).remove(paths.slice(i,i+100));
    if(error)throw error;
  }
  return paths.length;
}

export default async function handler(req,res){
  const action=actionOf(req);const client=db();

  if(action==='login'){
    if(req.method!=='POST')return send(res,405,{error:'Nur POST erlaubt.'});
    try{
      const body=await readJson(req),username=String(body.username||'').trim(),password=String(body.password||''),code=String(body.totp||body.code||'').trim();
      await enforcePublicRate(client,req,'login',username,12,900);
      const {data:start,error:startError}=await client.rpc('app_login_v11_start',{p_username:username,p_password:password});
      if(startError)throw startError;if(start?.error)return send(res,401,{error:start.error});
      if(start?.requires2fa){
        if(!code)return send(res,200,{requires2fa:true,message:'2FA-Code oder Wiederherstellungscode eingeben.'});
        const {data:twofa}=await client.from('app_user_2fa').select('*').eq('user_id',start.userId).eq('enabled',true).maybeSingle();
        let valid=false;if(twofa?.secret_cipher){try{valid=verifyTotp(decryptText(twofa.secret_cipher),code)}catch{}}
        if(!valid)valid=await consumeRecoveryCode(client,start.userId,code);
        if(!valid)return send(res,401,{requires2fa:true,error:'2FA-Code ist ungültig.'});
        const {data:finish,error:finishError}=await client.rpc('app_login_v11_finish',{p_user_id:start.userId});if(finishError)throw finishError;
        await audit(client,{id:start.userId},'login_2fa',start.userId,{});if(emailConfigured()){const {data:u}=await client.from('app_users').select('email').eq('id',start.userId).maybeSingle();if(u?.email)waitUntil(sendMail(u.email,'PIXVA · Neue Anmeldung','<p>Bei deinem PIXVA-Konto wurde gerade eine Anmeldung mit 2FA durchgeführt.</p>').catch(()=>{}))}return send(res,200,finish);
      }
      await audit(client,start?.user,'login',start?.user?.id||null,{});if(emailConfigured()&&start?.user?.email)waitUntil(sendMail(start.user.email,'PIXVA · Neue Anmeldung','<p>Bei deinem PIXVA-Konto wurde gerade eine neue Anmeldung durchgeführt.</p>').catch(()=>{}));return send(res,200,start);
    }catch(error){return send(res,500,{error:error.message||'Anmeldung fehlgeschlagen.'})}
  }

  if(action==='register-public'){
    if(req.method!=='POST')return send(res,405,{error:'Nur POST erlaubt.'});
    try{
      const body=await readJson(req);
      const username=String(body.username||'').trim();
      const subject=`${username}:${String(body.email||'').trim().toLowerCase()}`;
      await enforcePublicRate(client,req,'register-public',subject,4,3600);

      const {data,error}=await client.rpc('app_register_public_profile',{
        p_username:username,
        p_password:String(body.password||''),
        p_first_name:String(body.firstName||'').trim()||null,
        p_last_name:String(body.lastName||'').trim()||null,
        p_email:String(body.email||'').trim()||null,
        p_phone:String(body.phone||'').trim()||null,
        p_birth_date:String(body.birthDate||'').trim()||null,
        p_is_company:body.isCompany===true,
        p_company_name:String(body.companyName||'').trim()||null,
        p_company_type:String(body.companyType||'').trim()||null,
        p_company_type_other:String(body.companyTypeOther||'').trim()||null,
        p_owner_name:String(body.ownerName||'').trim()||null,
        p_company_email:String(body.companyEmail||'').trim()||null,
        p_company_phone:String(body.companyPhone||'').trim()||null,
        p_private_phone:String(body.privatePhone||'').trim()||null,
        p_website:String(body.website||'').trim()||null,
        p_instagram:String(body.instagram||'').trim()||null,
        p_address:String(body.address||'').trim()||null,
        p_logo_data_url:String(body.logoDataUrl||'').trim()||null
      });
      if(error)throw error;
      if(data?.error)return send(res,400,{error:data.error});
      return send(res,200,data);
    }catch(error){
      return send(res,500,{error:error?.message||'Konto konnte nicht erstellt werden.'});
    }
  }

  if(action==='recovery-email-request'){
    if(req.method!=='POST')return send(res,405,{error:'Nur POST erlaubt.'});
    const generic={ok:true,message:'Wenn für dieses Konto eine E-Mail hinterlegt und der Mailversand eingerichtet ist, wurde ein Wiederherstellungslink versendet.'};
    try{
      const body=await readJson(req),identity=String(body.identity||body.username||body.email||'').trim().toLowerCase();
      await enforcePublicRate(client,req,'recovery-email',identity,6,900);if(!identity||!emailConfigured())return send(res,200,generic);
      const {data:users}=await client.from('app_users').select('id,username,email').or(`username.eq.${identity},email.eq.${identity}`).limit(1);const target=users?.[0];if(!target?.email)return send(res,200,generic);
      const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
      await client.from('app_email_reset_tokens').insert({user_id:target.id,token_hash:hash,expires_at:new Date(Date.now()+30*60*1000).toISOString()});
      const base=requestBase(req),link=`${base}/pixva-recovery.html?token=${encodeURIComponent(token)}&username=${encodeURIComponent(target.username)}`;
      await sendMail(target.email,'PIXVA · Passwort wiederherstellen',`<p>Für dein PIXVA-Konto wurde eine Passwort-Wiederherstellung angefordert.</p><p><a href="${link}">Passwort jetzt ändern</a></p><p>Der Link ist 30 Minuten gültig.</p>`);
      return send(res,200,generic);
    }catch{return send(res,200,generic)}
  }


  if(action==='recover-password'){
    if(req.method!=='POST')return send(res,405,{error:'Nur POST erlaubt.'});
    try{
      const body=await readJson(req),username=String(body.username||'').trim(),code=String(body.code||'').trim().toUpperCase(),resetToken=String(body.token||'').trim(),password=String(body.newPassword||'');
      if(!username||password.length<10)return send(res,400,{error:'Benutzername und neues Passwort (mindestens 10 Zeichen) sind erforderlich.'});
      await enforcePublicRate(client,req,'recover-password',username,8,900);
      if(resetToken){const tokenHash=createHash('sha256').update(resetToken).digest('hex'),{data:rows}=await client.from('app_email_reset_tokens').select('*').eq('token_hash',tokenHash).is('used_at',null).gt('expires_at',new Date().toISOString()).limit(1),row=rows?.[0];if(!row)return send(res,400,{error:'Wiederherstellungslink ist ungültig oder abgelaufen.'});const {data,error}=await client.rpc('app_reset_password_by_user',{p_user_id:row.user_id,p_new_password:password});if(error)throw error;if(data?.error)return send(res,400,{error:data.error});await client.from('app_email_reset_tokens').update({used_at:new Date().toISOString()}).eq('id',row.id);return send(res,200,{ok:true,message:'Passwort geändert. Du kannst dich jetzt wieder bei PIXVA anmelden.'})}
      if(!code)return send(res,400,{error:'Wiederherstellungscode fehlt.'});const hash=createHash('sha256').update(code).digest('hex'),{data,error}=await client.rpc('app_reset_password_with_recovery',{p_username:username,p_code_hash:hash,p_new_password:password});if(error)throw error;if(data?.error)return send(res,400,{error:data.error});return send(res,200,{ok:true,message:'Passwort geändert. Du kannst dich jetzt wieder bei PIXVA anmelden.'});
    }catch(error){return send(res,500,{error:error.message||'Passwort konnte nicht wiederhergestellt werden.'})}
  }

  let user;try{user=await validateUser(req)}catch(error){return send(res,401,{error:error.message||'Nicht angemeldet.'})}

  try{
    const body=['POST','PUT','PATCH'].includes(req.method)?await readJson(req):{},token=readToken(req);

    if(action==='2fa-setup'&&req.method==='POST'){
      const secret=base32Encode(randomBytes(20)),label=encodeURIComponent(`PIXVA:${user.username}`),issuer=encodeURIComponent('PIXVA'),uri=`otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,qrDataUrl=await QRCode.toDataURL(uri,{margin:1,width:240});
      await client.from('app_user_2fa').upsert({user_id:user.id,secret_cipher:encryptText(secret),enabled:false,confirmed_at:null,updated_at:new Date().toISOString()},{onConflict:'user_id'});await audit(client,user,'2fa_setup_started',user.id,{});return send(res,200,{secret,uri,qrDataUrl});
    }
    if(action==='2fa-confirm'&&req.method==='POST'){
      const code=String(body.code||'').trim(),{data:row}=await client.from('app_user_2fa').select('*').eq('user_id',user.id).maybeSingle();if(!row?.secret_cipher)return send(res,400,{error:'2FA wurde noch nicht vorbereitet.'});let valid=false;try{valid=verifyTotp(decryptText(row.secret_cipher),code)}catch{}if(!valid)return send(res,400,{error:'Authenticator-Code ist ungültig.'});await client.from('app_user_2fa').update({enabled:true,confirmed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('user_id',user.id);await audit(client,user,'2fa_enabled',user.id,{});return send(res,200,{ok:true});
    }
    if(action==='2fa-disable'&&req.method==='POST'){
      const code=String(body.code||'').trim(),{data:row}=await client.from('app_user_2fa').select('*').eq('user_id',user.id).eq('enabled',true).maybeSingle();if(!row?.secret_cipher)return send(res,400,{error:'2FA ist nicht aktiviert.'});let valid=false;try{valid=verifyTotp(decryptText(row.secret_cipher),code)}catch{}if(!valid)valid=await consumeRecoveryCode(client,user.id,code);if(!valid)return send(res,400,{error:'2FA-Code ist ungültig.'});await client.from('app_user_2fa').delete().eq('user_id',user.id);await audit(client,user,'2fa_disabled',user.id,{});return send(res,200,{ok:true});
    }
    if(action==='security-state'&&req.method==='GET'){
      const [{data:twofa},{data:profile}]=await Promise.all([client.from('app_user_2fa').select('enabled,confirmed_at').eq('user_id',user.id).maybeSingle(),client.from('app_users').select('email,team_role').eq('id',user.id).maybeSingle()]);return send(res,200,{twoFactorEnabled:Boolean(twofa?.enabled),twoFactorConfirmedAt:twofa?.confirmed_at||null,email:profile?.email||'',teamRole:profile?.team_role||'member',emailConfigured:emailConfigured()});
    }
    if(action==='profile-email-save'&&req.method==='POST'){
      const email=String(body.email||'').trim().toLowerCase();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return send(res,400,{error:'E-Mail-Adresse ist ungültig.'});const {error}=await client.from('app_users').update({email:email||null}).eq('id',user.id);if(error)throw error;await audit(client,user,'email_changed',user.id,{hasEmail:Boolean(email)});return send(res,200,{ok:true,email});
    }
    if(action==='team-list'&&req.method==='GET'){
      if(user.role!=='admin')return send(res,403,{error:'Nur für Admins.'});const [{data:users,error},{data:logs},{data:approvals}]=await Promise.all([client.from('app_users').select('id,username,first_name,last_name,email,phone,birth_date,role,team_role,active,created_at').order('created_at',{ascending:true}),client.from('app_audit_log').select('*').order('created_at',{ascending:false}).limit(100),client.from('app_approvals').select('*').order('created_at',{ascending:false}).limit(100)]);if(error)throw error;return send(res,200,{users:users||[],audit:logs||[],approvals:approvals||[]});
    }
    if(action==='team-create'&&req.method==='POST'){
      if(user.role!=='admin')return send(res,403,{error:'Nur für Admins.'});
      const payload={
        p_token:token,
        p_username:String(body.username||'').trim(),
        p_password:String(body.password||''),
        p_role:String(body.role||'user'),
        p_team_role:String(body.teamRole||'member'),
        p_first_name:String(body.firstName||'').trim()||null,
        p_last_name:String(body.lastName||'').trim()||null,
        p_email:String(body.email||'').trim()||null,
        p_phone:String(body.phone||'').trim()||null,
        p_birth_date:String(body.birthDate||'').trim()||null,
        p_is_company:body.isCompany!==false,
        p_company_name:String(body.companyName||'').trim()||null,
        p_company_type:String(body.companyType||'supermarkt').trim()||'supermarkt',
        p_company_type_other:String(body.companyTypeOther||'').trim()||null,
        p_owner_name:String(body.companyOwner||'').trim()||null,
        p_company_email:String(body.companyEmail||'').trim()||null,
        p_company_phone:String(body.companyPhone||'').trim()||null,
        p_private_phone:String(body.privatePhone||'').trim()||null,
        p_website:String(body.companyWebsite||'').trim()||null,
        p_instagram:String(body.companyInstagram||'').trim()||null,
        p_address:String(body.companyAddress||'').trim()||null,
        p_logo_data_url:String(body.companyLogoDataUrl||'').trim()||null
      };
      const {data,error}=await client.rpc('app_create_company_profile',payload);
      if(error)throw error;
      if(data?.error)return send(res,400,{error:data.error});
      await audit(client,user,'account_created',data?.user?.id||null,{
        username:payload.p_username,
        role:payload.p_role,
        teamRole:payload.p_team_role,
        isCompany:payload.p_is_company,
        companyName:payload.p_company_name,
        companyType:payload.p_company_type,
        hasLogo:Boolean(payload.p_logo_data_url)
      });
      return send(res,200,data);
    }

    if(action==='team-update'&&req.method==='POST'){
      if(user.role!=='admin')return send(res,403,{error:'Nur für Admins.'});const target=String(body.userId||''),teamRole=String(body.teamRole||'member');if(!['owner','manager','designer','member','viewer'].includes(teamRole))return send(res,400,{error:'Unbekannte Team-Rolle.'});const patch={team_role:teamRole};if(typeof body.email==='string')patch.email=body.email.trim().toLowerCase()||null;const {error}=await client.from('app_users').update(patch).eq('id',target);if(error)throw error;await audit(client,user,'team_role_changed',target,{teamRole});return send(res,200,{ok:true});
    }
    if(action==='approval-create'&&req.method==='POST'){
      const projectId=String(body.projectId||'');if(!projectId)return send(res,400,{error:'Projekt fehlt.'});const {data:project}=await client.from('app_projects').select('id,name,owner_id').eq('id',projectId).eq('owner_id',user.id).maybeSingle();if(!project)return send(res,404,{error:'Projekt nicht gefunden.'});const {data,error}=await client.from('app_approvals').insert({user_id:user.id,project_id:project.id,requested_by:user.id,title:String(body.title||project.name||'Freigabe').slice(0,160),note:String(body.note||'').slice(0,2000)}).select().single();if(error)throw error;await audit(client,user,'approval_requested',user.id,{approvalId:data.id,projectId});return send(res,200,{approval:data});
    }
    if(action==='approval-update'&&req.method==='POST'){
      if(user.role!=='admin')return send(res,403,{error:'Nur für Admins.'});const status=String(body.status||'');if(!['approved','rejected'].includes(status))return send(res,400,{error:'Ungültiger Freigabestatus.'});const {data,error}=await client.from('app_approvals').update({status,reviewed_by:user.id,reviewed_at:new Date().toISOString(),note:String(body.note||'').slice(0,2000)}).eq('id',String(body.id||'')).select().single();if(error)throw error;await audit(client,user,`approval_${status}`,data.user_id,{approvalId:data.id});await client.from('app_notifications').insert({user_id:data.user_id,kind:status==='approved'?'success':'warning',title:status==='approved'?'Projekt freigegeben':'Projekt abgelehnt',message:data.title,related_id:data.id});return send(res,200,{approval:data});
    }
    if(action==='agent-start'&&req.method==='POST'){
      const runId=String(body.runId||''),{data:run,error}=await client.from('app_agent_runs').select('*').eq('id',runId).eq('user_id',user.id).maybeSingle();if(error)throw error;if(!run)return send(res,404,{error:'Agent-Auftrag nicht gefunden.'});if(['running','completed'].includes(run.status))return send(res,200,{ok:true,status:run.status});const hasPaidMedia=(run.plan?.tasks||[]).some(t=>t.type==='image'||t.type==='video');if(hasPaidMedia&&body.allowPaidMedia!==true)return send(res,400,{error:'Dieser Agent-Auftrag enthält kostenpflichtige Medien. Ausdrückliche Bestätigung fehlt.'});const base=requestBase(req);if(!base)return send(res,500,{error:'APP_URL fehlt.'});waitUntil(runAgentBackground(client,user,run,token,base));return send(res,202,{ok:true,status:'running',message:'PIXVA arbeitet im Hintergrund weiter.'});
    }
    if(action==='product-ean-lookup'&&req.method==='POST'){
      const ean=String(body.ean||'').replace(/\D/g,'').slice(0,18);if(!ean)return send(res,400,{error:'EAN fehlt.'});await enforceRate(client,req,'ean',30,60);const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=code,product_name,brands,quantity,categories,selected_images`);const d=await r.json().catch(()=>({}));if(!r.ok||d.status!==1||!d.product)return send(res,404,{error:'Zu dieser EAN wurde kein Produkt gefunden.'});const p=d.product,image=p.selected_images?.front?.display?.de||p.selected_images?.front?.display?.en||'';return send(res,200,{product:{ean,name:p.product_name||'',brand:p.brands||'',weight:p.quantity||'',category:p.categories||'',image_url:image,normal_price:null,offer_price:null,notes:'EAN-Daten online gefunden – vor Verwendung prüfen.'}});
    }
    if(action==='product-photo-recognize'&&req.method==='POST'){
      await enforceRate(client,req,'product-photo',12,60);const {buffer}=await downloadOwnFile(client,user,body.storagePath),mime=String(body.mimeType||'image/jpeg');const r=await gemini({json:true,temperature:0,inline:{buffer,mimeType:mime},prompt:'Erkenne das Produkt auf dem Bild. Lies EAN nur wenn eindeutig sichtbar. Erfinde nichts. Antworte JSON: {"ean":"","name":"","brand":"","weight":"","category":"","notes":""}'});try{await client.storage.from(BUCKET).remove([ownPath(user,body.storagePath)])}catch{}return send(res,200,{product:parseJsonText(r.text,{ean:'',name:'',brand:'',weight:'',category:'',notes:r.text})});
    }
    if(action==='instagram-save'&&req.method==='POST'){
      const accountId=String(body.accountId||'').trim(),accessToken=String(body.accessToken||'').trim(),displayName=String(body.displayName||'').trim();if(!accountId||!accessToken)return send(res,400,{error:'Instagram User ID und Access Token fehlen.'});const {error}=await client.from('app_social_accounts').upsert({user_id:user.id,provider:'instagram',account_id:accountId,display_name:displayName,access_token_cipher:encryptText(accessToken),updated_at:new Date().toISOString()},{onConflict:'user_id,provider'});if(error)throw error;await audit(client,user,'instagram_connected',user.id,{accountId,displayName});return send(res,200,{ok:true});
    }
    if(action==='instagram-status'&&req.method==='GET'){
      const {data:row}=await client.from('app_social_accounts').select('account_id,display_name,updated_at').eq('user_id',user.id).eq('provider','instagram').maybeSingle();return send(res,200,{connected:Boolean(row),account:row||null,graphVersion:String(process.env.META_GRAPH_VERSION||'v26.0')});
    }
    if(action==='instagram-disconnect'&&req.method==='POST'){await client.from('app_social_accounts').delete().eq('user_id',user.id).eq('provider','instagram');await audit(client,user,'instagram_disconnected',user.id,{});return send(res,200,{ok:true});}
    if(action==='instagram-publish'&&req.method==='POST'){
      await enforceRate(client,req,'instagram-publish',10,3600);const caption=String(body.caption||'').slice(0,2200),storagePath=ownPath(user,body.storagePath),{data:account}=await client.from('app_social_accounts').select('*').eq('user_id',user.id).eq('provider','instagram').maybeSingle();if(!account)return send(res,400,{error:'Instagram ist noch nicht verbunden.'});let accessToken;try{accessToken=decryptText(account.access_token_cipher)}catch{return send(res,500,{error:'Instagram-Verbindung konnte nicht entschlüsselt werden.'})}const {data:signed,error:signedError}=await client.storage.from(BUCKET).createSignedUrl(storagePath,1800);if(signedError||!signed?.signedUrl)throw signedError||new Error('Bildlink konnte nicht erstellt werden.');const version=String(process.env.META_GRAPH_VERSION||'v26.0'),createBody=new URLSearchParams({image_url:signed.signedUrl,caption,access_token:accessToken}),createResp=await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(account.account_id)}/media`,{method:'POST',body:createBody}),created=await createResp.json().catch(()=>({}));if(!createResp.ok||!created.id)throw new Error(created?.error?.message||'Instagram konnte keinen Media-Container erstellen.');const pubResp=await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(account.account_id)}/media_publish`,{method:'POST',body:new URLSearchParams({creation_id:created.id,access_token:accessToken})}),published=await pubResp.json().catch(()=>({}));if(!pubResp.ok||!published.id)throw new Error(published?.error?.message||'Instagram-Veröffentlichung fehlgeschlagen.');await audit(client,user,'instagram_published',user.id,{mediaId:published.id});return send(res,200,{ok:true,mediaId:published.id});
    }

    if(action==='overview'&&req.method==='GET')return send(res,200,await overview(client,user));

    if(action==='brand-save'&&req.method==='POST'){
      const brand={user_id:user.id,company_name:String(body.company_name||'').slice(0,160),logo_path:String(body.logo_path||'').slice(0,600),
        logo_data_url:String(body.logo_data_url||'').slice(0,6000000),
        primary_color:String(body.primary_color||'#7258ff').slice(0,30),secondary_color:String(body.secondary_color||'#39d6d0').slice(0,30),
        font_family:String(body.font_family||'Inter').slice(0,100),address:String(body.address||'').slice(0,500),
        opening_hours:String(body.opening_hours||'').slice(0,1000),instagram:String(body.instagram||'').slice(0,200),
        language:String(body.language||'de').slice(0,20),design_style:String(body.design_style||'modern-premium').slice(0,100),
        notes:String(body.notes||'').slice(0,3000),
        company_type:String(body.company_type||'').slice(0,100),
        company_type_other:String(body.company_type_other||'').slice(0,160),
        owner_name:String(body.owner_name||'').slice(0,160),
        website:String(body.website||'').slice(0,300),
        company_email:String(body.company_email||'').slice(0,200),
        company_phone:String(body.company_phone||'').slice(0,80),
        private_phone:String(body.private_phone||'').slice(0,80),
        updated_at:new Date().toISOString()};
      if(brand.logo_path)ownPath(user,brand.logo_path);
      const {data,error}=await client.from('app_brand_kits').upsert(brand,{onConflict:'user_id'}).select().single();if(error)throw error;
      return send(res,200,{brand:data});
    }

    if(action==='memory-save'&&req.method==='POST'){
      const row={user_id:user.id,category:String(body.category||'general').slice(0,60),title:String(body.title||'').trim().slice(0,180),
        content:String(body.content||'').trim().slice(0,10000),updated_at:new Date().toISOString()};
      if(!row.title||!row.content)return send(res,400,{error:'Titel und Inhalt fehlen.'});
      const q=body.id?client.from('app_memory_items').update(row).eq('id',body.id).eq('user_id',user.id).select().single():client.from('app_memory_items').insert(row).select().single();
      const {data,error}=await q;if(error)throw error;return send(res,200,{memory:data});
    }
    if(action==='memory-delete'&&req.method==='POST'){
      const {error}=await client.from('app_memory_items').delete().eq('id',String(body.id||'')).eq('user_id',user.id);if(error)throw error;return send(res,200,{ok:true});
    }

    if(action==='product-save'&&req.method==='POST'){
      const row={user_id:user.id,ean:String(body.ean||'').slice(0,64),name:String(body.name||'').trim().slice(0,180),brand:String(body.brand||'').slice(0,120),
        weight:String(body.weight||'').slice(0,100),category:String(body.category||'').slice(0,100),normal_price:asNumber(body.normal_price),
        offer_price:asNumber(body.offer_price),image_url:String(body.image_url||'').slice(0,1000),notes:String(body.notes||'').slice(0,1000),updated_at:new Date().toISOString()};
      if(!row.name)return send(res,400,{error:'Produktname fehlt.'});
      const q=body.id?client.from('app_products').update(row).eq('id',body.id).eq('user_id',user.id).select().single():client.from('app_products').insert(row).select().single();
      const {data,error}=await q;if(error)throw error;return send(res,200,{product:data});
    }
    if(action==='product-delete'&&req.method==='POST'){
      const {error}=await client.from('app_products').delete().eq('id',String(body.id||'')).eq('user_id',user.id);if(error)throw error;return send(res,200,{ok:true});
    }

    if(action==='upload-ticket'&&req.method==='POST'){
      await enforceRate(client,req,'upload-ticket',30,60);
      const fileName=cleanName(body.name||'datei'),mime=effectiveMime(fileName,body.type),size=Number(body.size||0);
      if(!ALLOWED_MIMES.has(mime)&&!ALLOWED_EXTENSIONS.has(extensionOf(fileName)))return send(res,400,{error:'Dieser Dateityp ist nicht erlaubt.'});
      if(!size||size>MAX_FILE_BYTES)return send(res,400,{error:'Datei muss zwischen 1 Byte und 15 MB groß sein.'});
      const path=`${user.id}/${new Date().toISOString().slice(0,10)}/${randomUUID()}-${fileName}`;
      const {data,error}=await client.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:false});if(error)throw error;
      return send(res,200,{bucket:BUCKET,path,token:data.token,maxBytes:MAX_FILE_BYTES});
    }

    if(action==='knowledge-finalize'&&req.method==='POST'){
      await enforceRate(client,req,'knowledge',12,60);
      const path=ownPath(user,body.storagePath),name=cleanName(body.originalName||path.split('/').pop()),mime=effectiveMime(name,body.mimeType);
      const {buffer}=await downloadOwnFile(client,user,path);
      const baseRow={user_id:user.id,storage_path:path,original_name:name,mime_type:mime,size_bytes:buffer.length,status:'processing',updated_at:new Date().toISOString()};
      const {data:file,error:upsertError}=await client.from('app_knowledge_files').upsert(baseRow,{onConflict:'user_id,storage_path'}).select().single();if(upsertError)throw upsertError;
      try{
        const text=await extractFileText(buffer,mime,name),chunks=textChunks(text);
        await client.from('app_knowledge_chunks').delete().eq('file_id',file.id).eq('user_id',user.id);
        let embeddings=[];try{for(let i=0;i<chunks.length;i+=32)embeddings.push(...await openAIEmbeddings(chunks.slice(i,i+32)))}catch{}
        if(chunks.length){const {error}=await client.from('app_knowledge_chunks').insert(chunks.map((content,index)=>({file_id:file.id,user_id:user.id,chunk_index:index,content,embedding:embeddings[index]||null})));if(error)throw error}
        const {data:done,error}=await client.from('app_knowledge_files').update({extracted_text:text.slice(0,200000),status:'ready',error:'',updated_at:new Date().toISOString()}).eq('id',file.id).eq('user_id',user.id).select().single();if(error)throw error;
        return send(res,200,{file:done,chunks:chunks.length,characters:text.length});
      }catch(error){await client.from('app_knowledge_files').update({status:'failed',error:String(error.message||error).slice(0,800),updated_at:new Date().toISOString()}).eq('id',file.id);throw error}
    }
    if(action==='knowledge-delete'&&req.method==='POST'){
      const {data:file}=await client.from('app_knowledge_files').select('*').eq('id',body.id).eq('user_id',user.id).maybeSingle();
      if(file?.storage_path){try{await client.storage.from(BUCKET).remove([file.storage_path])}catch{}}
      const {error}=await client.from('app_knowledge_files').delete().eq('id',body.id).eq('user_id',user.id);if(error)throw error;return send(res,200,{ok:true});
    }

    if(action==='products-import'&&req.method==='POST'){
      await enforceRate(client,req,'product-import',8,60);
      const {buffer}=await downloadOwnFile(client,user,body.storagePath),book=XLSX.read(buffer,{type:'buffer',cellDates:true});
      const rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:'',raw:false});
      const products=rows.map(productFromRow).filter(Boolean).slice(0,2000).map(p=>({...p,user_id:user.id}));
      if(!products.length)return send(res,400,{error:'Keine Produktzeilen erkannt. Eine Spalte wie Produkt/Name ist erforderlich.'});
      if(body.replace===true)await client.from('app_products').delete().eq('user_id',user.id);
      for(let i=0;i<products.length;i+=250){const {error}=await client.from('app_products').insert(products.slice(i,i+250));if(error)throw error}
      try{await client.storage.from(BUCKET).remove([ownPath(user,body.storagePath)])}catch{} // Produktimport-Temp
      return send(res,200,{ok:true,imported:products.length,sheets:book.SheetNames});
    }

    if(action==='knowledge-ask'&&req.method==='POST'){
      await enforceRate(client,req,'knowledge-ask',20,60);
      const question=String(body.question||'').trim().slice(0,5000);if(!question)return send(res,400,{error:'Frage fehlt.'});
      let relevant=[];
      try{const [queryEmbedding]=await openAIEmbeddings([question]);if(queryEmbedding){const {data:semantic}=await client.rpc('app_match_knowledge',{p_user_id:user.id,p_embedding:queryEmbedding,p_match_count:10});if(Array.isArray(semantic)&&semantic.length){const fileIds=[...new Set(semantic.map(x=>x.file_id))],{data:fileRows}=await client.from('app_knowledge_files').select('id,original_name').in('id',fileIds),names=Object.fromEntries((fileRows||[]).map(x=>[x.id,x.original_name]));relevant=semantic.map(x=>({...x,app_knowledge_files:{original_name:names[x.file_id]||'Datei'}}))}}}catch{}
      if(!relevant.length){const {data:chunks,error}=await client.from('app_knowledge_chunks').select('content,chunk_index,file_id,app_knowledge_files(original_name)').eq('user_id',user.id).limit(1000);if(error)throw error;if(!chunks?.length)return send(res,400,{error:'Noch keine Wissensdateien verarbeitet.'});relevant=relevantChunks(chunks,question,10)}
      const context=relevant.map((c,i)=>`[${i+1}] ${c.app_knowledge_files?.original_name||'Datei'}\n${c.content}`).join('\n\n');
      const result=await gemini({prompt:`Du bist PIXVA. Beantworte die Frage ausschließlich aus dem privaten Wissenskontext. Wenn die Information dort nicht steht, sage das klar. Nenne am Ende die verwendeten [Nummern].\n\nFRAGE:\n${question}\n\nKONTEXT:\n${context}`});
      return send(res,200,{answer:result.text,sources:relevant.map((c,i)=>({index:i+1,file:c.app_knowledge_files?.original_name||'Datei',similarity:c.similarity??null})),semantic:relevant.some(x=>x.similarity!==undefined)});
    }

    if(action==='web-search'&&req.method==='POST'){
      await enforceRate(client,req,'web-search',20,60);
      const query=String(body.query||'').trim().slice(0,5000);if(!query)return send(res,400,{error:'Suchfrage fehlt.'});
      const result=await gemini({prompt:`Beantworte diese Frage aktuell, präzise und in der Sprache der Frage. Nutze Google Search Grounding und stütze aktuelle Aussagen auf Quellen:\n${query}`,web:true});
      return send(res,200,{answer:result.text,sources:result.sources});
    }

    if(action==='translate'&&req.method==='POST'){
      await enforceRate(client,req,'translate',30,60);
      const text=String(body.text||'').trim().slice(0,20000),target=String(body.target||'Deutsch').slice(0,80);if(!text)return send(res,400,{error:'Text fehlt.'});
      const result=await gemini({prompt:`Übersetze den folgenden Text professionell in ${target}. Behalte Zahlen, Preise, Marken, Produktnamen und Formatierung korrekt. Gib nur die Übersetzung aus.\n\n${text}`,temperature:.1});
      return send(res,200,{translation:result.text});
    }

    if(action==='text-generate'&&req.method==='POST'){
      await enforceRate(client,req,'text-generate',30,60);
      const prompt=String(body.prompt||'').trim().slice(0,20000);
      if(!prompt)return send(res,400,{error:'Textauftrag fehlt.'});
      const [{data:brand},{data:memories}]=await Promise.all([
        client.from('app_brand_kits').select('*').eq('user_id',user.id).maybeSingle(),
        client.from('app_memory_items').select('category,title,content').eq('user_id',user.id).limit(100)
      ]);
      const result=await gemini({
        prompt:`Du bist PIXVA. Erledige den folgenden Textauftrag professionell. Nutze Brand Kit und Memory nur wenn sie passen. Erfinde keine Firmenangaben, Preise oder Produktdaten.\nBRAND KIT: ${JSON.stringify(brand||{})}\nMEMORY: ${JSON.stringify(memories||[])}\nAUFTRAG: ${prompt}`,
        temperature:.25
      });
      return send(res,200,{text:result.text});
    }

    if(action==='flyer-check'&&req.method==='POST'){
      await enforceRate(client,req,'flyer-check',12,60);
      const {buffer}=await downloadOwnFile(client,user,body.storagePath),mime=String(body.mimeType||'image/png');
      const [{data:brand},{data:products}]=await Promise.all([
        client.from('app_brand_kits').select('*').eq('user_id',user.id).maybeSingle(),
        client.from('app_products').select('ean,name,brand,weight,normal_price,offer_price').eq('user_id',user.id).limit(300)
      ]);
      const result=await gemini({json:true,temperature:0,inline:{buffer,mimeType:mime},prompt:`Prüfe diesen Flyer/dieses Werbemotiv streng. Vergleiche sichtbare Produkte, Namen, Gewichte und Preise mit den PIXVA-Daten. Prüfe außerdem Tippfehler, abgeschnittene Texte, unlesbare Schrift, widersprüchliche Preise und offensichtlich verformte Logos. Erfinde keine Fehler.
BRAND KIT: ${JSON.stringify(brand||{})}
PRODUKTE: ${JSON.stringify(products||[])}
Antworte JSON:
{"passed":boolean,"score":0-100,"summary":"...","issues":[{"severity":"high|medium|low","field":"...","found":"...","expected":"...","message":"..."}],"checks":{"prices":boolean,"productNames":boolean,"weights":boolean,"logo":boolean,"textCutoff":boolean,"spelling":boolean}}`});
      try{await client.storage.from(BUCKET).remove([ownPath(user,body.storagePath)])}catch{} // Flyercheck-Temp
      return send(res,200,{check:parseJsonText(result.text,{passed:false,score:0,summary:result.text,issues:[],checks:{}})});
    }

    if(action==='agent-plan'&&req.method==='POST'){
      await enforceRate(client,req,'agent',10,60);
      const prompt=String(body.prompt||'').trim().slice(0,10000);if(!prompt)return send(res,400,{error:'Auftrag fehlt.'});
      const [{data:brand},{data:memories},{data:products},{data:chunks}]=await Promise.all([
        client.from('app_brand_kits').select('*').eq('user_id',user.id).maybeSingle(),
        client.from('app_memory_items').select('category,title,content').eq('user_id',user.id).limit(100),
        client.from('app_products').select('ean,name,brand,weight,category,normal_price,offer_price,image_url').eq('user_id',user.id).limit(300),
        client.from('app_knowledge_chunks').select('content').eq('user_id',user.id).limit(80)
      ]);
      let webContext='',webSources=[];
      if(body.webSearch===true){const w=await gemini({prompt:`Recherchiere nur aktuelle Informationen, die für diesen PIXVA-Auftrag nötig sind: ${prompt}`,web:true});webContext=w.text.slice(0,12000);webSources=w.sources}
      const context={brand:brand||{},memory:memories||[],products:products||[],knowledge:(chunks||[]).map(x=>x.content).join('\n').slice(0,30000),web:webContext};
      const result=await gemini({json:true,temperature:.2,prompt:`Du bist der PIXVA Agent für professionelle Händler-, Supermarkt- und Marketingaufgaben. Plane den Auftrag so, dass PIXVA ihn mit vorhandenen Werkzeugen ausführen kann.
Mögliche task.type-Werte: "text", "image", "video", "translation".
image: prompt + aspect (square|post|story|landscape) + title.
video: prompt + aspect (portrait|landscape) + seconds (4|8|12) + title.
text/translation: prompt + title.
Nutze Brand Kit, Memory, Produktdaten und Wissen. Wenn Firmenlogo, Firmenname, Telefonnummern, E-Mail, Website, Instagram oder Adresse vorliegen, integriere diese Daten bei Flyern, Angebotsbildern und passenden Designs standardmäßig sinnvoll. Bei Website-Aufträgen verwende dieselbe Branche und dasselbe Theme wie im Firmenprofil. Ändere Logos/Marken nicht eigenmächtig. Bei mehreren Formaten getrennte Tasks.
AUFTRAG: ${prompt}
KONTEXT: ${JSON.stringify(context)}
Antworte ausschließlich JSON:
{"summary":"kurze Zusammenfassung","tasks":[{"id":"t1","type":"image","title":"...","prompt":"...","aspect":"post"}],"notes":["..."]}`});
      const plan=parseJsonText(result.text,{summary:'PIXVA Plan',tasks:[],notes:[result.text]});
      const {data:run,error}=await client.from('app_agent_runs').insert({user_id:user.id,prompt,status:'planned',plan,results:[]}).select().single();if(error)throw error;
      return send(res,200,{run,plan,webSources});
    }

    if(action==='agent-result'&&req.method==='POST'){
      const runId=String(body.runId||''),{data:run,error}=await client.from('app_agent_runs').select('*').eq('id',runId).eq('user_id',user.id).maybeSingle();
      if(error)throw error;if(!run)return send(res,404,{error:'Agent-Auftrag nicht gefunden.'});
      const results=Array.isArray(run.results)?run.results:[];results.push({...body.result,at:new Date().toISOString()});
      const taskCount=Array.isArray(run.plan?.tasks)?run.plan.tasks.length:0,status=results.length>=taskCount&&taskCount>0?'completed':'running';
      const {data:updated,error:updateError}=await client.from('app_agent_runs').update({results,status,updated_at:new Date().toISOString()}).eq('id',runId).select().single();if(updateError)throw updateError;
      return send(res,200,{run:updated});
    }

    if(action==='notification-read'&&req.method==='POST'){
      const {error}=body.id?await client.from('app_notifications').update({read_at:new Date().toISOString()}).eq('user_id',user.id).eq('id',body.id)
        :await client.from('app_notifications').update({read_at:new Date().toISOString()}).eq('user_id',user.id).is('read_at',null);
      if(error)throw error;return send(res,200,{ok:true});
    }

    if(action==='recovery-generate'&&req.method==='POST'){
      await client.from('app_recovery_codes').delete().eq('user_id',user.id);
      const codes=Array.from({length:8},()=>`${randomBytes(3).toString('hex').toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`);
      const rows=codes.map(code=>({user_id:user.id,code_hash:createHash('sha256').update(code).digest('hex')}));const {error}=await client.from('app_recovery_codes').insert(rows);if(error)throw error;
      return send(res,200,{codes,message:'Diese Codes werden nur jetzt vollständig angezeigt. Sicher offline speichern.'});
    }

    if(action==='sessions-end'&&req.method==='POST'){
      const {data,error}=await client.rpc('app_end_other_sessions',{p_token:token});if(error)throw error;if(data?.error)return send(res,400,{error:data.error});return send(res,200,data);
    }

    if(action==='snapshot-create'&&req.method==='POST'){
      const payload=await snapshotPayload(client,user),label=String(body.label||`PIXVA Sicherung ${new Date().toLocaleDateString('de-DE')}`).slice(0,160);
      const {data,error}=await client.from('app_user_snapshots').insert({user_id:user.id,label,payload}).select('id,label,created_at').single();if(error)throw error;return send(res,200,{snapshot:data});
    }

    if(action==='snapshot-restore'&&req.method==='POST'){
      if(body.confirm!=='WIEDERHERSTELLEN')return send(res,400,{error:'Bestätigung WIEDERHERSTELLEN fehlt.'});
      const {data:snap,error}=await client.from('app_user_snapshots').select('*').eq('id',body.id).eq('user_id',user.id).maybeSingle();if(error)throw error;if(!snap)return send(res,404,{error:'Sicherung nicht gefunden.'});
      const p=snap.payload||{};
      await restoreRows(client,'app_brand_kits',p.brand,user);await restoreRows(client,'app_memory_items',p.memories,user);await restoreRows(client,'app_products',p.products,user);
      await restoreRows(client,'app_projects',p.projects,user,'owner_id');await restoreRows(client,'app_chat_state',p.chats,user);
      return send(res,200,{ok:true,message:'PIXVA Sicherung wiederhergestellt.'});
    }

    if(action==='export-data'&&req.method==='GET'){
      const payload=await snapshotPayload(client,user);
      const [{data:files},{data:runs}]=await Promise.all([
        client.from('app_knowledge_files').select('id,original_name,mime_type,size_bytes,status,created_at').eq('user_id',user.id),
        client.from('app_agent_runs').select('*').eq('user_id',user.id).order('created_at',{ascending:false})
      ]);
      return send(res,200,{...payload,knowledgeFiles:files||[],agentRuns:runs||[]});
    }

    if(action==='delete-account'&&req.method==='POST'){
      await removeUserStorage(client,user.id);
      const {data,error}=await client.rpc('app_delete_account_secure',{p_token:token,p_password:String(body.password||''),p_confirmation:String(body.confirmation||'')});
      if(error)throw error;if(data?.error)return send(res,400,{error:data.error});return send(res,200,{ok:true});
    }

    if(action==='project-version-restore'&&req.method==='POST'){
      const {data:version,error}=await client.from('app_project_versions').select('*').eq('id',body.id).eq('owner_id',user.id).maybeSingle();if(error)throw error;if(!version)return send(res,404,{error:'Version nicht gefunden.'});
      const {data:project,error:updateError}=await client.from('app_projects').update({name:version.name,data:version.data,updated_at:new Date().toISOString()}).eq('id',version.project_id).eq('owner_id',user.id).select().single();if(updateError)throw updateError;
      return send(res,200,{project});
    }

    if(action==='status'&&req.method==='GET'){
      const {data:bucket,error:bucketError}=await client.storage.getBucket(BUCKET);
      let deep=null,adminUserCount=null,adminOpenErrors=null;
      if(req.query?.deep==='1'&&user.role==='admin'){
        try{deep=(await gemini({prompt:'Antworte nur mit PIXVA_OK',temperature:0})).text}
        catch(e){deep=`Fehler: ${e.message}`}
      }
      if(user.role==='admin'){
        const [usersResult,errorsResult]=await Promise.all([
          client.from('app_users').select('id',{count:'exact',head:true}),
          client.from('app_error_logs').select('id',{count:'exact',head:true}).is('resolved_at',null)
        ]);
        adminUserCount=usersResult.error?null:(usersResult.count??0);
        adminOpenErrors=errorsResult.error?null:(errorsResult.count??0);
      }
      return send(res,200,{
        database:true,
        privateStorage:Boolean(bucket&&!bucketError&&bucket.public===false),
        storagePrivacy:bucket&&!bucketError&&bucket.public===false?'PRIVAT':'PRÜFEN',
        geminiConfigured:Boolean(process.env.GEMINI_API_KEY),
        openaiConfigured:Boolean(process.env.OPENAI_API_KEY),
        soraConfigured:Boolean(process.env.OPENAI_API_KEY),
        serviceRoleConfigured:Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        geminiDeepTest:deep,
        paypalUntouched:true,
        semanticSearch:Boolean(process.env.OPENAI_API_KEY),
        backgroundJobs:true,
        emailConfigured:emailConfigured()?'BEREIT':'OPTIONAL',
        twoFactor:true,
        instagramPublishing:true,
        adminUserCount,
        adminOpenErrors
      });
    }

    return send(res,404,{error:'Unbekannte PIXVA-Aktion.'});
  }catch(error){
    await logError(client,user,`pixva:${action}`,error);
    return send(res,Number(error?.status)||500,{error:error?.message||'PIXVA-Aktion fehlgeschlagen.'});
  }
}
