import { createClient } from '@supabase/supabase-js';
function db(){
  const url=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
}
export async function logServerError({userId=null,area='app',error,publicMessage=''}){
  const client=db();if(!client)return;
  try{await client.from('app_error_logs').insert({user_id:userId||null,area:String(area||'app').slice(0,120),public_message:String(publicMessage||error?.message||'Fehler').slice(0,500),technical_message:String(error?.stack||error?.message||error||'').slice(0,5000)})}catch{}
}
export async function logServerEvent({userId=null,action='event',details={}}){
  const client=db();if(!client||!userId)return;
  try{await client.from('app_audit_log').insert({actor_id:userId,target_user_id:userId,action:String(action||'event').slice(0,120),details})}catch{}
}
