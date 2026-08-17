import { send, readJson, withApiKey, requestBase, requestId } from './_shared.js';
import { createEphemeralSession } from '../../lib/pixva-api-keys.js';

export const config={maxDuration:300};

export default async function handler(req,res){
  const action=String(req.query?.action||'create').toLowerCase();
  if(!['POST','GET','DELETE'].includes(req.method))return send(res,405,{error:'Methode nicht erlaubt.'});
  return withApiKey(req,res,'video',async auth=>{
    const base=requestBase(req);if(!base)throw Object.assign(new Error('APP_URL/Host konnte nicht bestimmt werden.'),{status:500});
    const token=await createEphemeralSession(auth.client,auth.user.id,5);
    const body=req.method==='POST'?await readJson(req):{};
    if(action==='create'&&body.confirmCost!==true)return send(res,402,{error:'Für Videogenerierung muss confirmCost=true ausdrücklich gesetzt werden.'});
    const query=new URLSearchParams({action});
    if(req.query?.id)query.set('id',String(req.query.id));
    if(req.query?.requestId)query.set('requestId',String(req.query.requestId));
    const payload=action==='create'?{...body,requestId:requestId(body.requestId)}:body;
    const response=await fetch(`${base}/api/ai/video?${query.toString()}`,{method:req.method,headers:{Authorization:`Bearer ${token}`,...(req.method==='POST'?{'Content-Type':'application/json'}:{})},...(req.method==='POST'?{body:JSON.stringify(payload)}:{})});
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
