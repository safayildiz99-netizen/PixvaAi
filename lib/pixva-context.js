import { getPixvaBrainContext, brainInstructions } from './pixva-brain.js';
import { createClient } from '@supabase/supabase-js';

function db(){
  const url=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
}
async function safe(p,fallback=[]){try{const {data,error}=await p;if(error)throw error;return data??fallback}catch{return fallback}}
async function embedding(text){
  const key=String(process.env.OPENAI_API_KEY||'').trim();if(!key)return null;
  const r=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'text-embedding-3-small',input:String(text||'').slice(0,8000)})});
  if(!r.ok)return null;const d=await r.json().catch(()=>({}));return d?.data?.[0]?.embedding||null;
}
export async function buildPixvaContext(user,prompt){
  /* PIXVA BRAIN SHARED CONTEXT */
  const sharedBrain=await getPixvaBrainContext(user).catch(()=>null);
  if(!user?.id)return '';
  const client=db();if(!client)return '';
  const [brand,memory,products]=await Promise.all([
    safe(client.from('app_brand_kits').select('*').eq('user_id',user.id).maybeSingle(),null),
    safe(client.from('app_memory_items').select('category,title,content').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(30)),
    safe(client.from('app_products').select('ean,name,brand,weight,category,normal_price,offer_price').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(80))
  ]);
  let knowledge=[];
  const emb=await embedding(prompt).catch(()=>null);
  if(emb)knowledge=await safe(client.rpc('app_match_knowledge',{p_user_id:user.id,p_embedding:emb,p_match_count:6}));
  if(!knowledge.length)knowledge=await safe(client.from('app_knowledge_chunks').select('content,chunk_index').eq('user_id',user.id).limit(12));
  return [
    'PIXVA PRIVATER KONTEXT DES ANGEMELDETEN KONTOS. Nutze ihn nur, wenn er zur Anfrage passt. Erfinde keine fehlenden Daten.',
    sharedBrain?brainInstructions(sharedBrain,'chat',''):'',
    brand?`BRAND KIT:\n${JSON.stringify(brand)}`:'',
    memory?.length?`MEMORY:\n${JSON.stringify(memory)}`:'',
    products?.length?`PRODUKTE:\n${JSON.stringify(products)}`:'',
    knowledge?.length?`EIGENE WISSENSDATEIEN:\n${knowledge.map((x,i)=>`[K${i+1}] ${x.content}`).join('\n')}`:''
  ].filter(Boolean).join('\n\n').slice(0,42000);
}
