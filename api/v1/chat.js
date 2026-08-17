import { send, readJson, withApiKey, proxyJson } from './_shared.js';

export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'Nur POST erlaubt.'});
  return withApiKey(req,res,'chat',async auth=>{
    const body=await readJson(req);
    const message=String(body.message||'').trim();
    if(!message&&!Array.isArray(body.attachments))return send(res,400,{error:'message oder attachments fehlt.'});
    const data=await proxyJson(req,auth,'/api/ai/chat',{message,history:Array.isArray(body.history)?body.history:[],attachments:Array.isArray(body.attachments)?body.attachments:[]});
    return send(res,200,{answer:data.answer,model:data.model,provider:data.provider||'gemini',usage:data.usage||null,keyPrefix:auth.metadata.prefix});
  });
}
