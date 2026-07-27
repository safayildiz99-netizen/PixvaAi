import Stripe from 'stripe';
import { env, handleApiError, requireUser, send, serviceClient } from '../_lib.js';
import { paypalAccessToken } from '../_paypal.js';
async function check(name,fn){const start=Date.now();try{const detail=await fn();return{name,status:'online',latencyMs:Date.now()-start,detail}}catch(e){return{name,status:'offline',latencyMs:Date.now()-start,error:e.message}}}
export default async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{error:'Nur GET ist erlaubt.'});
 try{
  await requireUser(req,{admin:true});const db=serviceClient();
  const checks=await Promise.all([
   check('Supabase Auth',async()=>{const {data,error}=await db.auth.admin.listUsers({page:1,perPage:1});if(error)throw error;return `${data.users.length} Testnutzer geladen`}),
   check('Supabase Datenbank',async()=>{const {error}=await db.from('profiles').select('id').limit(1);if(error)throw error;return'Abfrage erfolgreich'}),
   check('Supabase Storage',async()=>{const {data,error}=await db.storage.listBuckets();if(error)throw error;if(!data.some(b=>b.id==='user-media'))throw new Error('Bucket user-media fehlt.');return'Privater Bucket vorhanden'}),
   check('Gemini Chat',async()=>{const key=env('GEMINI_API_KEY');if(!key)throw new Error('GEMINI_API_KEY fehlt.');const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':key}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return'API erreichbar'}),
   check('OpenAI Bilder',async()=>{const key=env('OPENAI_API_KEY');if(!key)throw new Error('OPENAI_API_KEY fehlt.');const r=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${key}`}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return env('OPENAI_IMAGE_MODEL','gpt-image-2')}),
   check('Sora Videos',async()=>{const key=env('OPENAI_API_KEY');if(!key)throw new Error('OPENAI_API_KEY fehlt.');const r=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${key}`}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return env('OPENAI_VIDEO_MODEL','sora-2')}),
   check('Stripe Zahlungen',async()=>{const key=env('STRIPE_SECRET_KEY');if(!key)throw new Error('STRIPE_SECRET_KEY fehlt.');const stripe=new Stripe(key);const connected=env('STRIPE_CONNECTED_ACCOUNT_ID');const account=connected?await stripe.accounts.retrieve(connected):await stripe.accounts.retrieve();return `${account.business_profile?.name||account.settings?.dashboard?.display_name||account.id}`}),
   check('PayPal Zahlungen',async()=>{await paypalAccessToken();return `${env('PAYPAL_ENV','sandbox')} Händlerzugang erreichbar`})
  ]);
  const {data:lastError}=await db.from('system_errors').select('*').order('created_at',{ascending:false}).limit(1).maybeSingle();
  return send(res,200,{checkedAt:new Date().toISOString(),services:checks,lastError:lastError||null});
 }catch(e){return handleApiError(res,e,'Systemstatus konnte nicht geprüft werden.')}
}
