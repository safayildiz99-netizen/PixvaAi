import { readJson, send, validateUser } from '../_lib.js';

function baseUrl(){
  const value=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');
  if(!value)throw new Error('Supabase Server-URL fehlt.');
  return value;
}
function serviceKey(){
  const value=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
  if(!value)throw new Error('SUPABASE_SERVICE_ROLE_KEY fehlt.');
  return value;
}
function headers(extra={}){
  const key=serviceKey();
  return {apikey:key,...(key.startsWith('sb_')?{}:{Authorization:`Bearer ${key}`}),...extra};
}
async function request(path,options={}){
  const response=await fetch(`${baseUrl()}${path}`,{...options,headers:headers(options.headers||{})});
  const text=await response.text();
  let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!response.ok)throw new Error(String(data?.message||data?.error||data||`Supabase ${response.status}`));
  return data;
}
async function safeRows(table,limit=5000){
  try{return await request(`/rest/v1/${encodeURIComponent(table)}?select=*&limit=${limit}`)||[]}catch{return[]}
}
function grouped(rows,key='user_id'){
  const map=new Map();
  for(const row of rows||[]){const id=row?.[key];if(!id)continue;if(!map.has(id))map.set(id,[]);map.get(id).push(row)}
  return map;
}
function latest(rows,key='created_at'){return (rows||[]).map(x=>x?.[key]).filter(Boolean).sort().at(-1)||null}
async function signedLogo(profile,brand){
  const direct=String(profile?.logo_data_url||brand?.logo_data_url||'');if(direct)return direct;
  const path=String(profile?.logo_path||brand?.logo_path||'');if(!path)return'';
  try{
    const encoded=path.split('/').map(encodeURIComponent).join('/');
    const result=await request(`/storage/v1/object/sign/pixva-private/${encoded}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:3600})});
    const value=String(result?.signedURL||result?.signedUrl||'');
    return value.startsWith('http')?value:(value?`${baseUrl()}${value.startsWith('/')?'':'/'}${value}`:'');
  }catch{return''}
}
async function rpc(name,args){
  return request(`/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args||{})});
}

export default async function handler(req,res){
  try{
    const me=await validateUser(req);
    if(me.role!=='admin')return send(res,403,{error:'Nur für Admins.'});
    const action=String(req.query?.action||new URL(req.url,'http://localhost').searchParams.get('action')||'overview');

    if(req.method==='POST'&&action==='reset-password'){
      const body=await readJson(req),userId=String(body.userId||''),newPassword=String(body.newPassword||'');
      if(!/^[0-9a-f-]{36}$/i.test(userId))return send(res,400,{error:'Ungültiges Konto.'});
      if(newPassword.length<10)return send(res,400,{error:'Das neue Passwort braucht mindestens 10 Zeichen.'});
      const data=await rpc('app_reset_password_by_user',{p_user_id:userId,p_new_password:newPassword});
      if(data?.error)return send(res,400,{error:data.error});
      return send(res,200,{ok:true});
    }

    if(req.method==='POST'&&action==='update-meta'){
      const body=await readJson(req),userId=String(body.userId||''),accountType=String(body.accountType||'private'),createdSource=String(body.createdSource||'legacy');
      if(!/^[0-9a-f-]{36}$/i.test(userId))return send(res,400,{error:'Ungültiges Konto.'});
      if(!['private','company'].includes(accountType))return send(res,400,{error:'Ungültiger Kontotyp.'});
      if(!['self','admin','system','legacy'].includes(createdSource))return send(res,400,{error:'Ungültige Herkunft.'});
      await request(`/rest/v1/app_users?id=eq.${encodeURIComponent(userId)}`,{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({account_type:accountType,created_source:createdSource})});
      return send(res,200,{ok:true});
    }

    if(req.method!=='GET'||action!=='overview')return send(res,405,{error:'Nicht unterstützte Aktion.'});

    const [users,brands,profiles,projects,products,knowledge,agents,usage,approvals,factors,sessions,chats]=await Promise.all([
      safeRows('app_users'),safeRows('app_brand_kits'),safeRows('app_company_profiles'),safeRows('app_projects'),safeRows('app_products'),safeRows('app_knowledge_files'),safeRows('app_agent_runs'),safeRows('app_usage_events'),safeRows('app_approvals'),safeRows('app_user_2fa'),safeRows('app_sessions'),safeRows('app_chat_state')
    ]);
    const brandMap=new Map(brands.map(x=>[x.user_id,x])),profileMap=new Map(profiles.map(x=>[x.user_id,x]));
    const projectMap=grouped(projects,'owner_id'),productMap=grouped(products),knowledgeMap=grouped(knowledge),agentMap=grouped(agents),usageMap=grouped(usage),approvalMap=grouped(approvals),sessionMap=grouped(sessions),chatMap=grouped(chats);
    const factorMap=new Map(factors.map(x=>[x.user_id,Boolean(x.enabled)]));

    const accounts=await Promise.all(users.map(async u=>{
      const b=brandMap.get(u.id)||{},p=profileMap.get(u.id)||{},companyName=String(p.company_name||b.company_name||''),ownSessions=sessionMap.get(u.id)||[];
      const effectiveType=(u.account_type==='company'||companyName)?'company':'private';
      const chat=(chatMap.get(u.id)||[])[0]||null;
      return {
        id:u.id,username:String(u.username||''),first_name:u.first_name||'',last_name:u.last_name||'',email:u.email||'',phone:u.phone||'',birth_date:u.birth_date||'',role:u.role||'user',team_role:u.team_role||'member',account_type:effectiveType,stored_account_type:u.account_type||'private',created_source:u.created_source||'legacy',created_by:u.created_by||null,active:u.active!==false,must_change_password:Boolean(u.must_change_password),created_at:u.created_at||null,twoFactor:factorMap.get(u.id)||false,sessionCount:ownSessions.filter(x=>!x.expires_at||new Date(x.expires_at)>new Date()).length,lastSessionAt:latest(ownSessions),
        company:{company_name:companyName,company_type:p.company_type||b.company_type||'',company_type_other:p.company_type_other||b.company_type_other||'',owner_name:p.owner_name||b.owner_name||'',company_email:p.company_email||b.company_email||'',company_phone:p.company_phone||b.company_phone||'',private_phone:p.private_phone||b.private_phone||'',website:p.website||b.website||'',instagram:p.instagram||b.instagram||'',address:p.address||b.address||'',opening_hours:p.opening_hours||b.opening_hours||'',design_style:p.design_style||b.design_style||'',logo:await signedLogo(p,b)},
        contents:{
          projects:(projectMap.get(u.id)||[]).map(x=>({id:x.id,name:x.name,type:x.type,created_at:x.created_at,updated_at:x.updated_at})).slice(0,200),
          products:(productMap.get(u.id)||[]).map(x=>({id:x.id,name:x.name,ean:x.ean,brand:x.brand,category:x.category,normal_price:x.normal_price,offer_price:x.offer_price,updated_at:x.updated_at})).slice(0,200),
          knowledge:(knowledgeMap.get(u.id)||[]).map(x=>({id:x.id,name:x.original_name,status:x.status,mime_type:x.mime_type,created_at:x.created_at,updated_at:x.updated_at})).slice(0,200),
          agents:(agentMap.get(u.id)||[]).map(x=>({id:x.id,status:x.status,task:x.task||x.prompt||x.title||'',created_at:x.created_at,updated_at:x.updated_at})).slice(0,100),
          usage:(usageMap.get(u.id)||[]).map(x=>({id:x.id,kind:x.kind,status:x.status,model:x.model,created_at:x.created_at,estimated_cost_usd:x.estimated_cost_usd,actual_cost_usd:x.actual_cost_usd})).slice(0,100),
          approvals:(approvalMap.get(u.id)||[]).length,chatUpdatedAt:chat?.updated_at||null,chatData:chat?.data||null
        }
      };
    }));
    return send(res,200,{accounts});
  }catch(error){
    return send(res,/angemeldet|Sitzung/i.test(error?.message||'')?401:500,{error:error?.message||'Admin-Daten konnten nicht geladen werden.'});
  }
}
