/* PIXVA V12.1 ADMIN ACCOUNTS · DB-COMPATIBLE ACCOUNT PROFILE BRIDGE */
import { readJson, send, validateUser } from '../_lib.js';

const PROFILE_CATEGORY='pixva-account-profile';
const PROFILE_TITLE='PIXVA Firmenprofil';
const BUCKET='pixva-private';

function baseUrl(){const v=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');if(!v)throw new Error('Supabase Server-URL fehlt.');return v}
function serviceKey(){const v=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');if(!v)throw new Error('SUPABASE_SERVICE_ROLE_KEY fehlt.');return v}
function serviceHeaders(extra={}){const key=serviceKey();return{apikey:key,...(!key.startsWith('sb_')?{Authorization:`Bearer ${key}`}:{}) ,...extra}}
async function request(path,options={}){const response=await fetch(`${baseUrl()}${path}`,{...options,headers:serviceHeaders(options.headers||{})});const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!response.ok)throw new Error(String(data?.message||data?.error||data||`Supabase ${response.status}`));return data}
async function safeRows(table,limit=5000){try{return await request(`/rest/v1/${encodeURIComponent(table)}?select=*&limit=${limit}`)||[]}catch{return[]}}
function grouped(rows,key='user_id'){const m=new Map();for(const r of rows||[]){const id=r?.[key];if(!id)continue;if(!m.has(id))m.set(id,[]);m.get(id).push(r)}return m}
function latest(rows,key='created_at'){return(rows||[]).map(x=>x?.[key]).filter(Boolean).sort().at(-1)||null}
async function rpc(name,args){return request(`/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args||{})})}
function validLogo(v){const s=String(v||'');return !s||(/^data:image\/(png|jpeg|webp);base64,/i.test(s)&&s.length<1800000)}
function cleanLine(v=''){return String(v??'').replace(/[\r\n]+/g,' ').trim()}
function normalizeType(v){const s=String(v||'').toLowerCase().trim();return s==='company'||s==='private'?s:''}
function normalizeSource(v){const s=String(v||'').toLowerCase().trim();return['self','admin','system','legacy'].includes(s)?s:'legacy'}
function first(...values){for(const v of values){if(v!==undefined&&v!==null&&String(v).trim()!=='')return v}return''}

function profileContent(p={}){
  const lines=[
    ['Kontotyp',normalizeType(p.accountType)||'private'],
    ['Erstellt durch',normalizeSource(p.createdSource||'legacy')],
    ['Vorname',p.firstName],['Nachname',p.lastName],['Normale E-Mail',p.email],['Private Telefonnummer',p.phone],['Geburtsdatum',p.birthDate],
    ['Firma',p.companyName],['Branche',p.companyType==='sonstiges'?(p.companyTypeOther||'sonstiges'):p.companyType],['Andere Branche',p.companyTypeOther],
    ['Inhaber',p.ownerName],['Firmen-E-Mail',p.companyEmail],['Firmen-Telefon',p.companyPhone],['Privates Telefon',p.privatePhone],
    ['Website',p.website],['Instagram',p.instagram],['Adresse',p.address],['Öffnungszeiten',p.openingHours],
    ['Primärfarbe',p.primaryColor||'#7258ff'],['Sekundärfarbe',p.secondaryColor||'#39d6d0'],['Designstil',p.designStyle||'modern-premium'],['Logo-Pfad',p.logoPath||'']
  ];
  return lines.map(([k,v])=>`${k}: ${cleanLine(v)}`).join('\n');
}
function parseProfileContent(content=''){
  const out={};
  for(const raw of String(content||'').split(/\r?\n/)){
    const m=raw.match(/^([^:]+):\s*(.*)$/);if(!m)continue;
    out[m[1].trim().toLowerCase()]=m[2].trim();
  }
  return out;
}
function memoryProfiles(rows=[]){
  const map=new Map();
  const sorted=[...rows].sort((a,b)=>String(a.updated_at||a.created_at||'').localeCompare(String(b.updated_at||b.created_at||'')));
  for(const row of sorted){
    const category=String(row.category||'').toLowerCase(),title=String(row.title||'');
    if(category!==PROFILE_CATEGORY&&!/firmenprofil|kontoprofil/i.test(title))continue;
    if(!row.user_id)continue;
    map.set(row.user_id,{...parseProfileContent(row.content),_row:row});
  }
  return map;
}

async function softPatchUser(userId,row){
  const entries=Object.entries(row).filter(([,v])=>v!==undefined);
  let changed=false;
  for(const [key,value] of entries){
    try{
      await request(`/rest/v1/app_users?id=eq.${encodeURIComponent(userId)}`,{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({[key]:value})});
      changed=true;
    }catch{}
  }
  return changed;
}
async function upsert(table,row){return request(`/rest/v1/${table}?on_conflict=user_id`,{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)})}
async function getOne(table,userId){try{const rows=await request(`/rest/v1/${table}?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`);return rows?.[0]||null}catch{return null}}

async function uploadLogo(userId,dataUrl){
  const s=String(dataUrl||'');if(!s)return'';
  const m=s.match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/i);if(!m)throw new Error('Logo ist kein gültiges PNG/JPG/WebP.');
  const mime=m[1].toLowerCase(),ext=mime.includes('png')?'png':mime.includes('webp')?'webp':'jpg';
  const bytes=Buffer.from(m[2],'base64');if(bytes.length>1300000)throw new Error('Logo ist zu groß. Maximal ca. 1,3 MB.');
  const path=`${userId}/brand/admin-logo.${ext}`;
  const encoded=path.split('/').map(encodeURIComponent).join('/');
  const response=await fetch(`${baseUrl()}/storage/v1/object/${BUCKET}/${encoded}`,{method:'POST',headers:serviceHeaders({'Content-Type':mime,'x-upsert':'true'}),body:bytes});
  if(!response.ok){const text=await response.text();throw new Error(`Logo konnte nicht gespeichert werden: ${text||response.status}`)}
  return path;
}
async function saveAccountMemory(userId,p){
  const rows=await request(`/rest/v1/app_memory_items?select=id&user_id=eq.${encodeURIComponent(userId)}&category=eq.${encodeURIComponent(PROFILE_CATEGORY)}&limit=1`).catch(()=>[]);
  const row={user_id:userId,category:PROFILE_CATEGORY,title:PROFILE_TITLE,content:profileContent(p),updated_at:new Date().toISOString()};
  if(rows?.[0]?.id){
    await request(`/rest/v1/app_memory_items?id=eq.${encodeURIComponent(rows[0].id)}`,{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(row)});
  }else{
    await request('/rest/v1/app_memory_items',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(row)});
  }
}
async function saveLegacyBrand(userId,p){
  const existing=await getOne('app_brand_kits',userId);
  let logoPath=String(p.logoPath||existing?.logo_path||'');
  if(p.logoDataUrl)logoPath=await uploadLogo(userId,p.logoDataUrl);
  const company=normalizeType(p.accountType)==='company';
  const row={
    user_id:userId,
    company_name:company?cleanLine(p.companyName):'',
    logo_path:logoPath,
    primary_color:cleanLine(p.primaryColor||existing?.primary_color||'#7258ff'),
    secondary_color:cleanLine(p.secondaryColor||existing?.secondary_color||'#39d6d0'),
    font_family:cleanLine(p.fontFamily||existing?.font_family||'Inter'),
    address:company?cleanLine(p.address):'',
    opening_hours:company?cleanLine(p.openingHours):'',
    instagram:company?cleanLine(p.instagram):'',
    language:'de',
    design_style:cleanLine(p.designStyle||existing?.design_style||'modern-premium'),
    notes:existing?.notes||'',
    updated_at:new Date().toISOString()
  };
  await upsert('app_brand_kits',row);
  return logoPath;
}
async function persistProfile(userId,b,createdSource){
  const accountType=normalizeType(b.accountType)||'private';
  const payload={...b,accountType,createdSource:normalizeSource(createdSource||b.createdSource||'legacy')};
  await softPatchUser(userId,{account_type:accountType,created_source:payload.createdSource,first_name:cleanLine(b.firstName)||null,last_name:cleanLine(b.lastName)||null,email:cleanLine(b.email)||null,phone:cleanLine(b.phone)||null,birth_date:cleanLine(b.birthDate)||null});
  const logoPath=await saveLegacyBrand(userId,payload);
  await saveAccountMemory(userId,{...payload,logoPath});
  return{accountType,createdSource:payload.createdSource,logoPath};
}

async function signedLogo(profile,brand){
  const direct=String(profile?.logo_data_url||brand?.logo_data_url||'');if(direct)return direct;
  const path=String(profile?.logo_path||brand?.logo_path||'');if(!path)return'';
  try{const encoded=path.split('/').map(encodeURIComponent).join('/');const result=await request(`/storage/v1/object/sign/${BUCKET}/${encoded}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:3600})});const value=String(result?.signedURL||result?.signedUrl||'');return value.startsWith('http')?value:(value?`${baseUrl()}${value.startsWith('/')?'':'/'}${value}`:'')}catch{return''}
}

export default async function handler(req,res){
  try{
    const me=await validateUser(req);if(me.role!=='admin')return send(res,403,{error:'Nur für Admins.'});
    const action=String(req.query?.action||new URL(req.url,'http://localhost').searchParams.get('action')||'overview');

    if(req.method==='POST'&&action==='setup-account'){
      const b=await readJson(req),userId=String(b.userId||''),accountType=normalizeType(b.accountType);
      if(!/^[0-9a-f-]{36}$/i.test(userId))return send(res,400,{error:'Ungültiges Konto.'});if(!accountType)return send(res,400,{error:'Ungültiger Kontotyp.'});if(!validLogo(b.logoDataUrl))return send(res,400,{error:'Logo ist zu groß oder kein PNG/JPG/WebP.'});
      if(accountType==='company'&&!cleanLine(b.companyName))return send(res,400,{error:'Für ein Geschäftskonto fehlt der Firmenname.'});
      const saved=await persistProfile(userId,{...b,accountType},'admin');
      return send(res,200,{ok:true,...saved});
    }

    if(req.method==='POST'&&action==='update-account'){
      const b=await readJson(req),userId=String(b.userId||''),accountType=normalizeType(b.accountType),createdSource=normalizeSource(b.createdSource||'legacy');
      if(!/^[0-9a-f-]{36}$/i.test(userId))return send(res,400,{error:'Ungültiges Konto.'});if(!accountType)return send(res,400,{error:'Ungültiger Kontotyp.'});if(!validLogo(b.logoDataUrl))return send(res,400,{error:'Logo ist zu groß oder kein PNG/JPG/WebP.'});
      if(accountType==='company'&&!cleanLine(b.companyName))return send(res,400,{error:'Für ein Geschäftskonto fehlt der Firmenname.'});
      const saved=await persistProfile(userId,{...b,accountType,createdSource},createdSource);
      return send(res,200,{ok:true,...saved});
    }

    if(req.method==='POST'&&action==='reset-password'){
      const b=await readJson(req),userId=String(b.userId||''),newPassword=String(b.newPassword||'');if(!/^[0-9a-f-]{36}$/i.test(userId))return send(res,400,{error:'Ungültiges Konto.'});if(newPassword.length<10)return send(res,400,{error:'Das neue Passwort braucht mindestens 10 Zeichen.'});const data=await rpc('app_reset_password_by_user',{p_user_id:userId,p_new_password:newPassword});if(data?.error)return send(res,400,{error:data.error});return send(res,200,{ok:true});
    }

    if(req.method!=='GET'||action!=='overview')return send(res,405,{error:'Nicht unterstützte Aktion.'});
    const [users,brands,profiles,memories,projects,products,knowledge,agents,usage,approvals,factors,sessions,chats]=await Promise.all([safeRows('app_users'),safeRows('app_brand_kits'),safeRows('app_company_profiles'),safeRows('app_memory_items'),safeRows('app_projects'),safeRows('app_products'),safeRows('app_knowledge_files'),safeRows('app_agent_runs'),safeRows('app_usage_events'),safeRows('app_approvals'),safeRows('app_user_2fa'),safeRows('app_sessions'),safeRows('app_chat_state')]);
    const brandMap=new Map(brands.map(x=>[x.user_id,x])),profileMap=new Map(profiles.map(x=>[x.user_id,x])),metaMap=memoryProfiles(memories);
    const projectMap=grouped(projects,'owner_id'),productMap=grouped(products),knowledgeMap=grouped(knowledge),agentMap=grouped(agents),usageMap=grouped(usage),approvalMap=grouped(approvals),sessionMap=grouped(sessions),chatMap=grouped(chats);const factorMap=new Map(factors.map(x=>[x.user_id,Boolean(x.enabled)]));

    const accounts=await Promise.all(users.map(async u=>{
      const b=brandMap.get(u.id)||{},p=profileMap.get(u.id)||{},m=metaMap.get(u.id)||{};
      const candidateCompany=first(m['firma'],p.company_name,b.company_name);
      const metaType=normalizeType(m['kontotyp']),dbType=normalizeType(u.account_type);
      const accountType=metaType||dbType||(candidateCompany?'company':'private');
      const isCompany=accountType==='company';
      const companyName=isCompany?candidateCompany:'';
      const ownSessions=sessionMap.get(u.id)||[],chat=(chatMap.get(u.id)||[])[0]||null;
      return{
        id:u.id,username:String(u.username||''),
        first_name:first(m['vorname'],u.first_name),last_name:first(m['nachname'],u.last_name),email:first(m['normale e-mail'],u.email),phone:first(m['private telefonnummer'],u.phone),birth_date:first(m['geburtsdatum'],u.birth_date),
        role:u.role||'user',team_role:u.team_role||'member',account_type:accountType,stored_account_type:accountType,
        created_source:normalizeSource(first(m['erstellt durch'],u.created_source,'legacy')),created_by:u.created_by||null,active:u.active!==false,must_change_password:Boolean(u.must_change_password),created_at:u.created_at||null,
        twoFactor:factorMap.get(u.id)||false,sessionCount:ownSessions.filter(x=>!x.expires_at||new Date(x.expires_at)>new Date()).length,lastSessionAt:latest(ownSessions),
        company:{
          company_name:companyName,
          company_type:isCompany?first(m['branche'],p.company_type,b.company_type):'',
          company_type_other:isCompany?first(m['andere branche'],p.company_type_other,b.company_type_other):'',
          owner_name:isCompany?first(m['inhaber'],p.owner_name,b.owner_name):'',
          company_email:isCompany?first(m['firmen-e-mail'],p.company_email,b.company_email):'',
          company_phone:isCompany?first(m['firmen-telefon'],p.company_phone,b.company_phone):'',
          private_phone:isCompany?first(m['privates telefon'],p.private_phone,b.private_phone):'',
          website:isCompany?first(m['website'],p.website,b.website):'',instagram:isCompany?first(m['instagram'],p.instagram,b.instagram):'',address:isCompany?first(m['adresse'],p.address,b.address):'',opening_hours:isCompany?first(m['öffnungszeiten'],p.opening_hours,b.opening_hours):'',
          design_style:first(m['designstil'],p.design_style,b.design_style,'modern-premium'),primary_color:first(m['primärfarbe'],p.primary_color,b.primary_color,'#7258ff'),secondary_color:first(m['sekundärfarbe'],p.secondary_color,b.secondary_color,'#39d6d0'),logo:isCompany?await signedLogo(p,b):''
        },
        contents:{projects:(projectMap.get(u.id)||[]).map(x=>({id:x.id,name:x.name,type:x.type,created_at:x.created_at,updated_at:x.updated_at})).slice(0,200),products:(productMap.get(u.id)||[]).map(x=>({id:x.id,name:x.name,ean:x.ean,brand:x.brand,category:x.category,normal_price:x.normal_price,offer_price:x.offer_price,updated_at:x.updated_at})).slice(0,200),knowledge:(knowledgeMap.get(u.id)||[]).map(x=>({id:x.id,name:x.original_name,status:x.status,mime_type:x.mime_type,created_at:x.created_at,updated_at:x.updated_at})).slice(0,200),agents:(agentMap.get(u.id)||[]).map(x=>({id:x.id,status:x.status,task:x.task||x.prompt||x.title||'',created_at:x.created_at,updated_at:x.updated_at})).slice(0,100),usage:(usageMap.get(u.id)||[]).map(x=>({id:x.id,kind:x.kind,status:x.status,model:x.model,created_at:x.created_at})).slice(0,100),approvals:(approvalMap.get(u.id)||[]).length,chatUpdatedAt:chat?.updated_at||null,chatData:chat?.data||null}
      };
    }));
    return send(res,200,{accounts,currentUserId:me.id,enrichmentAvailable:users.length>0,profileStorage:'memory+brand-kit'});
  }catch(error){return send(res,/angemeldet|Sitzung/i.test(error?.message||'')?401:500,{error:error?.message||'Admin-Daten konnten nicht geladen werden.'})}
}
