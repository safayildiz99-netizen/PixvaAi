import { send, readJson, withApiKey, proxyJson, requestId } from './_shared.js';

export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'Nur POST erlaubt.'});
  return withApiKey(req,res,'image',async auth=>{
    const body=await readJson(req);
    if(body.confirmCost!==true)return send(res,402,{error:'Für Bildgenerierung muss confirmCost=true ausdrücklich gesetzt werden.'});
    const data=await proxyJson(req,auth,'/api/ai/image',{...body,requestId:requestId(body.requestId)});
    return send(res,200,{...data,keyPrefix:auth.metadata.prefix});
  });
}
