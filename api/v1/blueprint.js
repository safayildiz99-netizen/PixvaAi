import { send, readJson, withApiKey, proxyJson } from './_shared.js';

export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'Nur POST erlaubt.'});
  const body=await readJson(req),target=String(body.target||'website').toLowerCase();
  const scope=target==='flyer'?'flyer':target==='image'?'image':target==='video'?'video':'website';
  return withApiKey(req,res,scope,async auth=>{
    const data=await proxyJson(req,auth,'/api/pixva?action=brain-blueprint',{target,instruction:String(body.instruction||'').slice(0,3000)});
    return send(res,200,{blueprint:data.blueprint,brain:{isCompany:data.brain?.isCompany,company:data.brain?.company,ready:data.brain?.ready,missing:data.brain?.missing},fallback:Boolean(data.fallback)});
  });
}
