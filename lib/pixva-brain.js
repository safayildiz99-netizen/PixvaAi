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
      out[m[1].trim().toLowerCase()]=m[2].trim();
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
    db.from('app_users').select('id,username,first_name,last_name,email,phone,birth_date,role,team_role,account_type,created_source').eq('id',user.id).maybeSingle()
  ]);

  const profile=profileRes.data||{},brand=brandRes.data||{},u=userRes.data||user||{},mem=memoryLines(memoryRes.data||[]);
  let signedLogo='';
  const logoPath=first(profile.logo_path,brand.logo_path);
  if(!first(profile.logo_data_url,brand.logo_data_url)&&logoPath){
    try{
      const {data}=await db.storage.from(BUCKET).createSignedUrl(logoPath,3600);
      signedLogo=data?.signedUrl||'';
    }catch{}
  }

  const companyType=cleanCompanyType(first(profile.company_type,brand.company_type),first(profile.company_type_other,brand.company_type_other,mem['branche']));
  const companyTypeOther=first(profile.company_type_other,brand.company_type_other,companyType==='sonstiges'?mem['branche']:'');
  const defaults=typeDefaults(companyType||'sonstiges',companyTypeOther);
  const company={
    companyName:first(profile.company_name,brand.company_name,mem['firma']),
    companyType:companyType||'sonstiges',
    companyTypeOther,
    industryLabel:companyType==='sonstiges'?(companyTypeOther||defaults.label):defaults.label,
    ownerName:first(profile.owner_name,brand.owner_name,mem['inhaber']),
    personalEmail:first(profile.personal_email,u.email,mem['normale e-mail']),
    companyEmail:first(profile.company_email,brand.company_email,mem['firmen-e-mail']),
    personalPhone:first(profile.personal_phone,u.phone,mem['private telefonnummer']),
    companyPhone:first(profile.company_phone,brand.company_phone,mem['firmen-telefon']),
    privatePhone:first(profile.private_phone,brand.private_phone,mem['privates telefon']),
    website:first(profile.website,brand.website,mem['website']),
    instagram:first(profile.instagram,brand.instagram,mem['instagram']),
    address:first(profile.address,brand.address,mem['adresse']),
    openingHours:first(profile.opening_hours,brand.opening_hours),
    logoDataUrl:first(profile.logo_data_url,brand.logo_data_url),
    logoUrl:signedLogo,
    logoPath,
    primaryColor:first(profile.primary_color,brand.primary_color,defaults.primary),
    secondaryColor:first(profile.secondary_color,brand.secondary_color,defaults.secondary),
    fontFamily:first(profile.font_family,brand.font_family,'Inter'),
    designStyle:first(profile.design_style,brand.design_style,defaults.style),
    language:first(profile.language,brand.language,'de')
  };
  const isCompany=String(u.account_type||'')==='company'||Boolean(company.companyName);
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
  const row={
    user_id:userId,
    company_name:String(payload.companyName??payload.company_name??'').trim(),
    company_type:String(payload.companyType??payload.company_type??'').trim(),
    company_type_other:String(payload.companyTypeOther??payload.company_type_other??'').trim(),
    owner_name:String(payload.ownerName??payload.owner_name??payload.companyOwner??'').trim(),
    personal_email:String(payload.email??payload.personalEmail??'').trim(),
    company_email:String(payload.companyEmail??payload.company_email??'').trim(),
    personal_phone:String(payload.phone??payload.personalPhone??'').trim(),
    company_phone:String(payload.companyPhone??payload.company_phone??'').trim(),
    private_phone:String(payload.privatePhone??payload.private_phone??'').trim(),
    website:String(payload.website??payload.companyWebsite??'').trim(),
    instagram:String(payload.instagram??payload.companyInstagram??'').trim(),
    address:String(payload.address??payload.companyAddress??'').trim(),
    opening_hours:String(payload.openingHours??payload.opening_hours??'').trim(),
    logo_data_url:String(payload.logoDataUrl??payload.logo_data_url??payload.companyLogoDataUrl??'').trim(),
    logo_path:String(payload.logoPath??payload.logo_path??'').trim(),
    primary_color:String(payload.primaryColor??payload.primary_color??'#7258ff').trim(),
    secondary_color:String(payload.secondaryColor??payload.secondary_color??'#39d6d0').trim(),
    font_family:String(payload.fontFamily??payload.font_family??'Inter').trim(),
    design_style:String(payload.designStyle??payload.design_style??'modern-premium').trim(),
    language:String(payload.language??'de').trim(),
    source:String(payload.source||'pixva-brain'),
    updated_at:new Date().toISOString()
  };
  const existing=await db.from('app_company_profiles').select('*').eq('user_id',userId).maybeSingle();
  const merged={...(existing.data||{}),...Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v||existing.data?.[k]||'']))};
  merged.user_id=userId;merged.updated_at=new Date().toISOString();
  await db.from('app_company_profiles').upsert(merged,{onConflict:'user_id'});
}
