import { getPixvaBrainContext } from '../../lib/pixva-brain.js';
import { send, withApiKey } from './_shared.js';

export default async function handler(req,res){
  if(req.method!=='GET')return send(res,405,{error:'Nur GET erlaubt.'});
  return withApiKey(req,res,'brain',async auth=>{
    const brain=await getPixvaBrainContext(auth.user);
    return send(res,200,{isCompany:brain.isCompany,company:brain.company,defaults:brain.defaults,missing:brain.missing,ready:brain.ready,sources:brain.sources,products:brain.products||[]});
  });
}
