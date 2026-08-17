import { createClient } from '@supabase/supabase-js';

export const DEFAULT_PROVIDER_ROUTING={
  chatPrimary:'gemini',
  chatFallback:'openai',
  chatFallbackEnabled:false,
  maxRetries:2
};

function db(){
  const url=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
}
function cleanProvider(v,fallback){const x=String(v||'').toLowerCase();return['gemini','openai'].includes(x)?x:fallback}
export function normalizeProviderRouting(input={}){
  const primary=cleanProvider(input.chatPrimary,'gemini');
  let fallback=cleanProvider(input.chatFallback,primary==='gemini'?'openai':'gemini');
  if(fallback===primary)fallback=primary==='gemini'?'openai':'gemini';
  return{
    chatPrimary:primary,
    chatFallback:fallback,
    chatFallbackEnabled:input.chatFallbackEnabled===true,
    maxRetries:Math.max(1,Math.min(3,Number(input.maxRetries||2)))
  };
}
export async function getProviderRouting(){
  const client=db();if(!client)return DEFAULT_PROVIDER_ROUTING;
  try{
    const {data,error}=await client.from('app_global_settings').select('settings').eq('id',1).maybeSingle();
    if(error)throw error;
    return normalizeProviderRouting(data?.settings?.pixvaProviderRouting||DEFAULT_PROVIDER_ROUTING);
  }catch{return DEFAULT_PROVIDER_ROUTING}
}
