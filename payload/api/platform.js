import { readJson, readToken, send, validateUser } from './_lib.js';
function query(req){if(req.query)return req.query;try{return Object.fromEntries(new URL(req.url,'http://localhost').searchParams.entries())}catch{return{}}}
function baseUrl(){return String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/+$/,'')}
function key(){return String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY||'')}
async function rpc(name,args={}){
  const url=baseUrl(),k=key();if(!url||!k)throw new Error('Supabase-Variablen fehlen in Vercel.');
  const r=await fetch(`${url}/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',headers:{apikey:k,...(k.startsWith('sb_')?{}:{Authorization:`Bearer ${k}`}),'Content-Type':'application/json'},body:JSON.stringify(args)});
  const d=await r.json().catch(()=>({}));if(!r.ok||d?.error)throw new Error(d?.error||d?.message||`Datenbankfehler ${r.status}`);return d;
}
async function useLimit(token,scope,limit,seconds){
  const d=await rpc('app_take_rate_limit',{p_token:token,p_scope:scope,p_limit:limit,p_window_seconds:seconds});
  if(d?.allowed===false){const e=new Error(`Zu viele Anfragen. Bitte in ${d.retryAfterSeconds||seconds} Sekunden erneut versuchen.`);e.status=429;throw e}
}
function status(){
  const sup=Boolean(baseUrl()&&key());
  return {checkedAt:new Date().toISOString(),
    supabaseDatabase:{state:sup?'online':'missing',label:sup?'Online':'Variablen fehlen'},
    supabaseStorage:{state:sup?'configured':'missing',label:sup?'Konfiguriert':'Nicht konfiguriert'},
    gemini:{state:process.env.GEMINI_API_KEY?'configured':'missing',label:process.env.GEMINI_API_KEY?'Konfiguriert':'API-Key fehlt'},
    openaiImages:{state:process.env.OPENAI_API_KEY?'configured':'missing',label:process.env.OPENAI_API_KEY?'Konfiguriert':'API-Key fehlt'},
    soraVideos:{state:process.env.OPENAI_API_KEY?'configured':'missing',label:process.env.OPENAI_API_KEY?'Konfiguriert':'API-Key fehlt'}};
}
function sources(d){const chunks=d?.candidates?.[0]?.groundingMetadata?.groundingChunks||[],seen=new Set();return chunks.map(x=>{const w=x?.web||{},url=String(w.uri||'');if(!url||seen.has(url))return null;seen.add(url);return{title:String(w.title||url).slice(0,240),url}}).filter(Boolean).slice(0,12)}
async function search(body,token){
  const q=String(body?.query||'').trim().slice(0,1000);if(!q)throw new Error('Bitte einen Suchbegriff eingeben.');
  await useLimit(token,'web-search',12,60);
  const apiKey=String(process.env.GEMINI_API_KEY||'').trim();if(!apiKey)throw new Error('GEMINI_API_KEY fehlt in Vercel.');
  const model=String(process.env.GEMINI_SEARCH_MODEL||process.env.GEMINI_MODEL||'gemini-2.5-flash').trim();
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({
    contents:[{role:'user',parts:[{text:`Suche aktuell im Web und antworte auf Deutsch. Zeige nur belegte Fakten und kennzeichne Unsicherheit. Frage: ${q}`}]}],
    tools:[{google_search:{}}],generationConfig:{maxOutputTokens:2500}
  })});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`Websuche fehlgeschlagen (${r.status}).`);
  return{answer:(d?.candidates?.[0]?.content?.parts||[]).map(p=>p?.text||'').join('').trim()||'Keine Antwort erhalten.',sources:sources(d),model};
}
export default async function handler(req,res){
  const action=String(query(req).action||'overview');
  try{
    const user=await validateUser(req),token=readToken(req);
    if(req.method==='GET'&&action==='overview')return send(res,200,{...(await rpc('app_security_overview',{p_token:token})),system:status(),user});
    if(req.method==='POST'&&action==='search')return send(res,200,await search(await readJson(req),token));
    const body=req.method==='POST'?await readJson(req):{};
    if(req.method==='POST'&&action==='mark-notification')return send(res,200,await rpc('app_mark_notification_read',{p_token:token,p_notification_id:body.id}));
    if(req.method==='POST'&&action==='end-sessions')return send(res,200,await rpc('app_end_other_sessions',{p_token:token}));
    if(req.method==='POST'&&action==='save-brand')return send(res,200,await rpc('app_save_brand_profile',{p_token:token,p_company_name:body.companyName,p_logo_url:body.logoUrl,p_primary_color:body.primaryColor,p_secondary_color:body.secondaryColor,p_font_family:body.fontFamily}));
    if(req.method==='POST'&&action==='resolve-error')return send(res,200,await rpc('app_admin_resolve_error',{p_token:token,p_error_id:body.id}));
    if(req.method==='GET'&&action==='export')return send(res,200,await rpc('app_full_data_export',{p_token:token}));
    if(req.method==='POST'&&action==='delete-account')return send(res,200,await rpc('app_delete_account',{p_token:token,p_password:body.password,p_confirmation:body.confirmation}));
    return send(res,405,{error:'Funktion oder Methode nicht erlaubt.'});
  }catch(e){return send(res,e?.status||(/angemeldet|Sitzung/i.test(e?.message||'')?401:500),{error:e?.message||'Sicherheitsfunktion fehlgeschlagen.'})}
}
