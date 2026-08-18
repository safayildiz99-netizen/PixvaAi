import { createClient } from '@supabase/supabase-js';

const BUCKET='pixva-private';

function supabase(){
  const url=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
  if(!url||!key)return null;
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function first(...values){
  for(const value of values){
    if(value!==undefined&&value!==null&&String(value).trim()!=='')return value;
  }
  return '';
}
function memoryLines(items){
  const out={};
  for(const item of items||[]){
    if(!/firmenprofil/i.test(String(item.title||'')))continue;
    for(const raw of String(item.content||'').split(/\r?\n/)){
      const m=raw.match(/^([^:]+):\s*(.*)$/);
      if(!m)continue;
      const key=m[1].trim().toLowerCase();
      if(!(key in out))out[key]=m[2].trim();
    }
  }
  return out;
}
function typeDefaults(type,other=''){
  if(type==='supermarkt')return{
    label:'Supermarkt',
    style:'frische-angebote-markt',
    primary:'#0c6847',secondary:'#e52d2d',
    websiteHeadline:'Frische Angebote für jeden Tag.',
    websiteIntro:'Frische Produkte, starke Aktionen und persönliche Beratung – passend zu deinem Markt.',
    services:['Frische Lebensmittel','Obst & Gemüse','Wochenangebote','Service & Beratung'],
    flyerTitle:'FRISCHE ANGEBOTE',
    flyerSubject:'Obst & Gemüse Angebot',
    flyerOffer:'3,49 €',
    imageIdea:'appetitliche frische Lebensmittel, Obst und Gemüse, professionelle Supermarkt-Werbung'
  };
  if(type==='werbetechnik')return{
    label:'Werbetechnik',
    style:'moderne-werbetechnik-premium',
    primary:'#111111',secondary:'#f7c948',
    websiteHeadline:'Wir machen Marken sichtbar.',
    websiteIntro:'Schilder, Druck, Folierung und Werbetechnik – professionell geplant und umgesetzt.',
    services:['Schilder & Leuchtwerbung','Dibond & Plattendruck','Folierung & Beschriftung','Druck & Montage'],
    flyerTitle:'DIBOND ANGEBOT',
    flyerSubject:'E1 bedruckte Dibond Platte',
    flyerOffer:'44,99 €',
    imageIdea:'hochwertige bedruckte Dibond-Platte, moderne Werbetechnik, professionelle Montage und Druckqualität'
  };
  if(type==='elektriker')return{
    label:'Elektriker',
    style:'technik-elektro-vertrauen',
    primary:'#0a263f',secondary:'#ffd42a',
    websiteHeadline:'Sichere Elektrik. Saubere Arbeit.',
    websiteIntro:'Elektroinstallation, Wartung und moderne Lösungen für Privat- und Gewerbekunden.',
    services:['Elektroinstallation','Modernisierung','Wartung & Prüfung','Service & Beratung'],
    flyerTitle:'ELEKTRO AKTION',
    flyerSubject:'Elektro-Check',
    flyerOffer:'-20%',
    imageIdea:'moderner Sicherungskasten, professionelle Elektroinstallation, saubere technische Arbeit, vertrauenswürdig'
  };
  if(type==='programmierer')return{
    label:'Programmierer · Software & KI',
    style:'software-ki-premium',
    primary:'#7258ff',secondary:'#39d6d0',
    websiteHeadline:'Digitale Lösungen, die für dich arbeiten.',
    websiteIntro:'Websites, Software, Automationen und KI-Lösungen für Unternehmen.',
    services:['Webentwicklung','Softwareentwicklung','KI & Automationen','Digitale Systeme'],
    flyerTitle:'WEBSEITE & KI-PAKET',
    flyerSubject:'Software, Website & KI',
    flyerOffer:'29,99 €',
    imageIdea:'moderne Softwareentwicklung, Webdesign, KI und Automatisierung, hochwertig, professionell, digital und technisch'
  };
  return{
    label:other||'Unternehmen',
    style:'modern-premium',
    primary:'#7258ff',secondary:'#39d6d0',
    websiteHeadline:'Professionell. Persönlich. Passend.',
    websiteIntro:'Leistungen und Beratung – modern präsentiert im Stil deiner Firma.',
    services:['Unsere Leistungen','Persönliche Beratung','Individuelle Lösungen','Kontakt & Service'],
    flyerTitle:'ANGEBOT',
    flyerSubject:other||'Unsere Leistung',
    flyerOffer:'AKTION',
    imageIdea:`professionelles Werbemotiv für ${other||'ein Unternehmen'}, hochwertig, modern und realistisch`
  };
}
function cleanCompanyType(value,other){
  const type=String(value||'').toLowerCase().trim();
  const combined=`${type} ${String(other||'').toLowerCase()}`;
  if(/programm|software|webentwick|entwickler|developer|\bit\b/.test(combined))return 'programmierer';
  if(/supermarkt|market|lebensmittel/.test(combined))return 'supermarkt';
  if(/werbetechnik|werbung|druck|folierung/.test(combined))return 'werbetechnik';
  if(/elektrik|elektro/.test(combined))return 'elektriker';
  if(type==='sonstiges'||other)return 'sonstiges';
  return '';
}

export async function getPixvaBrainContext(user){
  const db=supabase();
  if(!db||!user?.id)return{user:user||null,isCompany:false,company:{},defaults:typeDefaults('sonstiges'),sources:[]};

  const [profileRes,brandRes,memoryRes,productRes,userRes]=await Promise.all([
    db.from('app_company_profiles').select('*').eq('user_id',user.id).maybeSingle(),
    db.from('app_brand_kits').select('*').eq('user_id',user.id).maybeSingle(),
    db.from('app_memory_items').select('category,title,content').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(40),
    db.from('app_products').select('ean,name,brand,weight,category,normal_price,offer_price,image_url').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(60),
    db.from('app_users').select('*').eq('id',user.id).maybeSingle()
  ]);

  const profile=profileRes.data||{},brand=brandRes.data||{},u=userRes.data||user||{},mem=memoryLines(memoryRes.data||[]);
  let signedLogo='';
  const logoPath=first(profile.logo_path,brand.logo_path,mem['logo-pfad']);
  if(!first(profile.logo_data_url,brand.logo_data_url)&&logoPath){
    try{
      const {data}=await db.storage.from(BUCKET).createSignedUrl(logoPath,3600);
      signedLogo=data?.signedUrl||'';
    }catch{}
  }

  const companyType=cleanCompanyType(first(mem['branche'],profile.company_type,brand.company_type),first(mem['andere branche'],profile.company_type_other,brand.company_type_other));
  const companyTypeOther=first(mem['andere branche'],profile.company_type_other,brand.company_type_other,companyType==='sonstiges'?mem['branche']:'');
  const defaults=typeDefaults(companyType||'sonstiges',companyTypeOther);
  const company={
    companyName:first(mem['firma'],profile.company_name,brand.company_name),
    companyType:companyType||'sonstiges',
    companyTypeOther,
    industryLabel:companyType==='sonstiges'?(companyTypeOther||defaults.label):defaults.label,
    ownerName:first(mem['inhaber'],profile.owner_name,brand.owner_name),
    personalEmail:first(mem['normale e-mail'],profile.personal_email,u.email),
    companyEmail:first(mem['firmen-e-mail'],profile.company_email,brand.company_email),
    personalPhone:first(mem['private telefonnummer'],profile.personal_phone,u.phone),
    companyPhone:first(mem['firmen-telefon'],profile.company_phone,brand.company_phone),
    privatePhone:first(mem['privates telefon'],profile.private_phone,brand.private_phone),
    website:first(mem['website'],profile.website,brand.website),
    instagram:first(mem['instagram'],profile.instagram,brand.instagram),
    address:first(mem['adresse'],profile.address,brand.address),
    openingHours:first(mem['öffnungszeiten'],profile.opening_hours,brand.opening_hours),
    logoDataUrl:first(profile.logo_data_url,brand.logo_data_url),
    logoUrl:signedLogo,
    logoPath:first(mem['logo-pfad'],profile.logo_path,brand.logo_path),
    primaryColor:first(mem['primärfarbe'],profile.primary_color,brand.primary_color,defaults.primary),
    secondaryColor:first(mem['sekundärfarbe'],profile.secondary_color,brand.secondary_color,defaults.secondary),
    fontFamily:first(profile.font_family,brand.font_family,'Inter'),
    designStyle:first(mem['designstil'],profile.design_style,brand.design_style,defaults.style),
    language:first(profile.language,brand.language,'de')
  };
  const storedType=String(first(mem['kontotyp'],u.account_type)).toLowerCase();
  const companySignal=Boolean(company.companyName||company.companyTypeOther||company.companyEmail||company.companyPhone||company.website||company.instagram||company.address||company.logoDataUrl||company.logoUrl||company.logoPath||mem['branche']);
  const isCompany=storedType==='company'||(storedType!=='private'&&companySignal);
  const missing=[];
  if(isCompany&&!company.companyName)missing.push('Firmenname');
  if(isCompany&&!company.companyType)missing.push('Branche');
  if(isCompany&&!company.logoDataUrl&&!company.logoUrl)missing.push('Logo');

  const sources=[];
  if(profileRes.data)sources.push('company-profile');
  if(brandRes.data)sources.push('brand-kit');
  if((memoryRes.data||[]).length)sources.push('memory');
  if(userRes.data)sources.push('account');

  return{
    user:u,
    isCompany,
    company,
    defaults,
    products:productRes.data||[],
    memory:memoryRes.data||[],
    sources,
    missing,
    ready:!isCompany||missing.length===0
  };
}

export function brainInstructions(brain,target='general',userPrompt=''){
  if(!brain?.isCompany)return String(userPrompt||'');
  const c=brain.company||{},d=brain.defaults||{};
  const contacts=[
    c.companyPhone&&`Firmen-Telefon: ${c.companyPhone}`,
    c.companyEmail&&`Firmen-E-Mail: ${c.companyEmail}`,
    c.website&&`Website: ${c.website}`,
    c.instagram&&`Instagram: ${c.instagram}`,
    c.address&&`Adresse: ${c.address}`
  ].filter(Boolean).join(' | ');
  return [
    `PIXVA BRAIN – MODUL ${String(target).toUpperCase()}`,
    `Firma: ${c.companyName}`,
    `Branche: ${c.industryLabel}`,
    c.ownerName?`Inhaber/Ansprechpartner: ${c.ownerName}`:'',
    contacts,
    `Designstil: ${c.designStyle}; Primärfarbe ${c.primaryColor}; Sekundärfarbe ${c.secondaryColor}; Schrift ${c.fontFamily}.`,
    `Branchenlogik: ${d.imageIdea}.`,
    'Verwende die echten Firmendaten. Erfinde keine Telefonnummern, E-Mails, Websites, Adressen oder Namen.',
    'Wenn ein Firmenlogo vorhanden ist, muss es als echte Marke erhalten bleiben und darf nicht erfunden, umgeschrieben oder verzerrt werden.',
    String(userPrompt||'')
  ].filter(Boolean).join('\n');
}

export function deterministicBlueprint(brain,target='website'){
  const c=brain.company||{},d=brain.defaults||{};
  if(target==='flyer'||target==='image')return{
    headline:d.flyerTitle,
    subject:d.flyerSubject,
    offer:d.flyerOffer,
    subline:`${c.companyName||'Deine Firma'} · ${c.industryLabel||d.label}`,
    cta:'Jetzt anfragen',
    imagePrompt:d.imageIdea,
    primary:c.primaryColor||d.primary,
    secondary:c.secondaryColor||d.secondary
  };
  return{
    headline:d.websiteHeadline,
    intro:d.websiteIntro,
    services:d.services,
    cta:'Jetzt anfragen',
    primary:c.primaryColor||d.primary,
    secondary:c.secondaryColor||d.secondary
  };
}

export async function upsertCompanyProfile(userId,payload={}){
  const db=supabase();if(!db||!userId)return;
  const clean=v=>String(v??'').replace(/[\r\n]+/g,' ').trim();
  const requestedType=String(payload.accountType??payload.account_type??'').toLowerCase();
  const accountType=requestedType==='private'||payload.isCompany===false?'private':'company';
  let logoPath=clean(payload.logoPath??payload.logo_path??'');
  const logoData=clean(payload.logoDataUrl??payload.logo_data_url??payload.companyLogoDataUrl??'');
  if(logoData&&!logoPath){
    const m=logoData.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
    if(m){
      const ext=m[1].includes('png')?'png':m[1].includes('webp')?'webp':'jpg';
      logoPath=`${userId}/brand/profile-logo.${ext}`;
      try{await db.storage.from(BUCKET).upload(logoPath,Buffer.from(m[2],'base64'),{contentType:m[1],upsert:true})}catch{}
    }
  }
  const row={
    user_id:userId,
    company_name:accountType==='company'?clean(payload.companyName??payload.company_name??''):'',
    company_type:accountType==='company'?clean(payload.companyType??payload.company_type??''):'',
    company_type_other:accountType==='company'?clean(payload.companyTypeOther??payload.company_type_other??''):'',
    owner_name:accountType==='company'?clean(payload.ownerName??payload.owner_name??payload.companyOwner??''):'',
    personal_email:clean(payload.email??payload.personalEmail??''),
    company_email:accountType==='company'?clean(payload.companyEmail??payload.company_email??''):'',
    personal_phone:clean(payload.phone??payload.personalPhone??''),
    company_phone:accountType==='company'?clean(payload.companyPhone??payload.company_phone??''):'',
    private_phone:accountType==='company'?clean(payload.privatePhone??payload.private_phone??''):'',
    website:accountType==='company'?clean(payload.website??payload.companyWebsite??''):'',
    instagram:accountType==='company'?clean(payload.instagram??payload.companyInstagram??''):'',
    address:accountType==='company'?clean(payload.address??payload.companyAddress??''):'',
    opening_hours:accountType==='company'?clean(payload.openingHours??payload.opening_hours??''):'',
    logo_data_url:'',logo_path:logoPath,
    primary_color:clean(payload.primaryColor??payload.primary_color??'#7258ff'),
    secondary_color:clean(payload.secondaryColor??payload.secondary_color??'#39d6d0'),
    font_family:clean(payload.fontFamily??payload.font_family??'Inter'),
    design_style:clean(payload.designStyle??payload.design_style??'modern-premium'),
    language:clean(payload.language??'de'),source:clean(payload.source||'pixva-brain'),updated_at:new Date().toISOString()
  };

  try{
    const existing=await db.from('app_company_profiles').select('*').eq('user_id',userId).maybeSingle();
    if(!existing.error){
      const merged={...(existing.data||{}),...Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v||existing.data?.[k]||'']))};
      merged.user_id=userId;merged.updated_at=new Date().toISOString();
      await db.from('app_company_profiles').upsert(merged,{onConflict:'user_id'});
    }
  }catch{}

  try{
    await db.from('app_brand_kits').upsert({
      user_id:userId,company_name:row.company_name,logo_path:logoPath,primary_color:row.primary_color,secondary_color:row.secondary_color,
      font_family:row.font_family,address:row.address,opening_hours:row.opening_hours,instagram:row.instagram,language:row.language,
      design_style:row.design_style,notes:'',updated_at:new Date().toISOString()
    },{onConflict:'user_id'});
  }catch{}

  const content=[
    `Kontotyp: ${accountType}`,
    `Erstellt durch: ${clean(payload.createdSource??payload.created_source??payload.source??'legacy')}`,
    `Vorname: ${clean(payload.firstName??payload.first_name??'')}`,
    `Nachname: ${clean(payload.lastName??payload.last_name??'')}`,
    `Normale E-Mail: ${row.personal_email}`,
    `Private Telefonnummer: ${row.personal_phone}`,
    `Geburtsdatum: ${clean(payload.birthDate??payload.birth_date??'')}`,
    `Firma: ${row.company_name}`,
    `Branche: ${row.company_type==='sonstiges'?(row.company_type_other||'sonstiges'):row.company_type}`,
    `Andere Branche: ${row.company_type_other}`,
    `Inhaber: ${row.owner_name}`,
    `Firmen-E-Mail: ${row.company_email}`,
    `Firmen-Telefon: ${row.company_phone}`,
    `Privates Telefon: ${row.private_phone}`,
    `Website: ${row.website}`,
    `Instagram: ${row.instagram}`,
    `Adresse: ${row.address}`,
    `Öffnungszeiten: ${row.opening_hours}`,
    `Primärfarbe: ${row.primary_color}`,
    `Sekundärfarbe: ${row.secondary_color}`,
    `Designstil: ${row.design_style}`,
    `Logo-Pfad: ${logoPath}`,
    `Zusätzliche Registrierungsfelder: ${JSON.stringify(payload.customFields&&typeof payload.customFields==='object'?payload.customFields:{})}`
  ].join('\n');
  try{
    const existing=await db.from('app_memory_items').select('id').eq('user_id',userId).eq('category','pixva-account-profile').limit(1);
    const memory={user_id:userId,category:'pixva-account-profile',title:'PIXVA Firmenprofil',content,updated_at:new Date().toISOString()};
    if(existing.data?.[0]?.id)await db.from('app_memory_items').update(memory).eq('id',existing.data[0].id);
    else await db.from('app_memory_items').insert(memory);
  }catch{}
}
