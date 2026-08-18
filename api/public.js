import { randomUUID } from 'node:crypto';
import { authenticatePixvaApiKey, createEphemeralSession, apiAudit, apiError } from '../lib/pixva-api-keys.js';
import { getPixvaBrainContext } from '../lib/pixva-brain.js';

export const config={maxDuration:300};

function send(res,status,payload){
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
async function readJson(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'){try{return JSON.parse(req.body)}catch{return{}}}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  if(!chunks.length)return{};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return{}}
}
function requestBase(req){
  const explicit=String(process.env.APP_URL||'').replace(/\/$/,'');
  if(explicit)return explicit;
  const proto=String(req.headers?.['x-forwarded-proto']||'https').split(',')[0].trim();
  const host=String(req.headers?.host||'').trim();
  return host?`${proto}://${host}`:'';
}
async function withApiKey(req,res,scope,fn){
  let auth;
  try{
    auth=await authenticatePixvaApiKey(req,scope);
    const result=await fn(auth);
    await apiAudit(auth.client,auth.user,auth.metadata,scope||'status',{ok:true});
    return result;
  }catch(error){
    if(auth)await apiError(auth.client,auth.user,scope||'status',error);
    return send(res,Number(error?.status)||500,{error:error?.message||'PIXVA Public API fehlgeschlagen.'});
  }
}
async function proxyJson(req,auth,path,body){
  const base=requestBase(req);
  if(!base)throw Object.assign(new Error('APP_URL/Host konnte nicht bestimmt werden.'),{status:500});
  const token=await createEphemeralSession(auth.client,auth.user.id,5);
  const response=await fetch(`${base}${path}`,{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(body||{})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data?.error||`PIXVA interner Aufruf fehlgeschlagen (${response.status}).`),{status:response.status});
  return data;
}
function requestId(value){
  const raw=String(value||'');
  return /^[0-9a-f-]{36}$/i.test(raw)?raw:randomUUID();
}
function endpointOf(req){
  const explicit=String(req.query?.endpoint||'').trim().toLowerCase();
  if(explicit)return explicit;
  const path=String(req.url||'').split('?')[0];
  const match=path.match(/\/api\/v1\/(status|brain|chat|blueprint|image|video)\/?$/i);
  return String(match?.[1]||'').toLowerCase();
}

export default async function handler(req,res){
  const endpoint=endpointOf(req);
  if(!['status','brain','chat','blueprint','image','video'].includes(endpoint))return send(res,404,{error:'PIXVA API-Endpunkt nicht gefunden.'});

  if(endpoint==='status'){
    if(req.method!=='GET')return send(res,405,{error:'Nur GET erlaubt.'});
    return withApiKey(req,res,'',async auth=>send(res,200,{
      ok:true,version:'PIXVA V14.2',
      account:{id:auth.user.id,username:auth.user.username},
      key:{prefix:auth.metadata.prefix,name:auth.metadata.name,scopes:auth.metadata.scopes,rateLimitPerMinute:auth.metadata.rateLimitPerMinute},
      providers:{gemini:Boolean(process.env.GEMINI_API_KEY),openai:Boolean(process.env.OPENAI_API_KEY),sora:Boolean(process.env.OPENAI_API_KEY)}
    }));
  }

  if(endpoint==='brain'){
    if(req.method!=='GET')return send(res,405,{error:'Nur GET erlaubt.'});
    return withApiKey(req,res,'brain',async auth=>{
      const brain=await getPixvaBrainContext(auth.user);
      return send(res,200,{isCompany:brain.isCompany,company:brain.company,defaults:brain.defaults,missing:brain.missing,ready:brain.ready,sources:brain.sources,products:brain.products||[]});
    });
  }

  if(endpoint==='chat'){
    if(req.method!=='POST')return send(res,405,{error:'Nur POST erlaubt.'});
    return withApiKey(req,res,'chat',async auth=>{
      const body=await readJson(req),message=String(body.message||'').trim();
      if(!message&&!Array.isArray(body.attachments))return send(res,400,{error:'message oder attachments fehlt.'});
      const data=await proxyJson(req,auth,'/api/ai/chat',{message,history:Array.isArray(body.history)?body.history:[],attachments:Array.isArray(body.attachments)?body.attachments:[]});
      return send(res,200,{answer:data.answer,model:data.model,provider:data.provider||'gemini',usage:data.usage||null,keyPrefix:auth.metadata.prefix});
    });
  }

  if(endpoint==='blueprint'){
    if(req.method!=='POST')return send(res,405,{error:'Nur POST erlaubt.'});
    const body=await readJson(req),target=String(body.target||'website').toLowerCase();
    const scope=target==='flyer'?'flyer':target==='image'?'image':target==='video'?'video':'website';
    return withApiKey(req,res,scope,async auth=>{
      const data=await proxyJson(req,auth,'/api/pixva?action=brain-blueprint',{target,instruction:String(body.instruction||'').slice(0,3000)});
      return send(res,200,{blueprint:data.blueprint,brain:{isCompany:data.brain?.isCompany,company:data.brain?.company,ready:data.brain?.ready,missing:data.brain?.missing},fallback:Boolean(data.fallback)});
    });
  }

  if(endpoint==='image'){
    if(req.method!=='POST')return send(res,405,{error:'Nur POST erlaubt.'});
    return withApiKey(req,res,'image',async auth=>{
      const body=await readJson(req);
      if(body.confirmCost!==true)return send(res,402,{error:'Für Bildgenerierung muss confirmCost=true ausdrücklich gesetzt werden.'});
      const data=await proxyJson(req,auth,'/api/ai/image',{...body,requestId:requestId(body.requestId)});
      return send(res,200,{...data,keyPrefix:auth.metadata.prefix});
    });
  }

  if(endpoint==='video'){
    const action=String(req.query?.action||'create').toLowerCase();
    if(!['POST','GET','DELETE'].includes(req.method))return send(res,405,{error:'Methode nicht erlaubt.'});
    return withApiKey(req,res,'video',async auth=>{
      const base=requestBase(req);
      if(!base)throw Object.assign(new Error('APP_URL/Host konnte nicht bestimmt werden.'),{status:500});
      const token=await createEphemeralSession(auth.client,auth.user.id,5);
      const body=req.method==='POST'?await readJson(req):{};
      if(action==='create'&&body.confirmCost!==true)return send(res,402,{error:'Für Videogenerierung muss confirmCost=true ausdrücklich gesetzt werden.'});
      const query=new URLSearchParams({action});
      if(req.query?.id)query.set('id',String(req.query.id));
      if(req.query?.requestId)query.set('requestId',String(req.query.requestId));
      const payload=action==='create'?{...body,requestId:requestId(body.requestId)}:body;
      const response=await fetch(`${base}/api/ai/video?${query.toString()}`,{
        method:req.method,
        headers:{Authorization:`Bearer ${token}`,...(req.method==='POST'?{'Content-Type':'application/json'}:{})},
        ...(req.method==='POST'?{body:JSON.stringify(payload)}:{})
      });
      const type=response.headers.get('content-type')||'';
      if(type.includes('application/json')){
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw Object.assign(new Error(data?.error||`Video-Aufruf fehlgeschlagen (${response.status}).`),{status:response.status});
        return send(res,response.status,{...data,keyPrefix:auth.metadata.prefix});
      }
      const buffer=Buffer.from(await response.arrayBuffer());
      if(!response.ok)throw Object.assign(new Error(`Video-Aufruf fehlgeschlagen (${response.status}).`),{status:response.status});
      res.status(response.status);res.setHeader('Content-Type',type||'application/octet-stream');
      const disposition=response.headers.get('content-disposition');if(disposition)res.setHeader('Content-Disposition',disposition);
      res.end(buffer);
    });
  }
}
