import { send, withApiKey } from './_shared.js';

export default async function handler(req,res){
  if(req.method!=='GET')return send(res,405,{error:'Nur GET erlaubt.'});
  return withApiKey(req,res,'',async auth=>send(res,200,{
    ok:true,version:'PIXVA V13',account:{id:auth.user.id,username:auth.user.username},key:{prefix:auth.metadata.prefix,name:auth.metadata.name,scopes:auth.metadata.scopes,rateLimitPerMinute:auth.metadata.rateLimitPerMinute},
    providers:{gemini:Boolean(process.env.GEMINI_API_KEY),openai:Boolean(process.env.OPENAI_API_KEY),sora:Boolean(process.env.OPENAI_API_KEY)}
  }));
}
