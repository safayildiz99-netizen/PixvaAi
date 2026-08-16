/* PIXVA V11.8.2 WEBSITE – PROGRAMMIERER + ECHTE PROFILDATEN */
import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Download, Globe2, Save } from 'lucide-react';
import { api, downloadText } from '../api.js';

const PIXVA_LOGO='/pixva-logo.png';
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const attr=(v='')=>esc(v).replace(/`/g,'&#96;');
const typeKey=(type,other='')=>{
  const raw=`${type||''} ${other||''}`.toLowerCase();
  if(/programm|software|webentwick|entwickler|developer|it\b/.test(raw))return'programmierer';
  if(/supermarkt|market|lebensmittel/.test(raw))return'supermarkt';
  if(/werbetechnik|werbung|druck|folierung/.test(raw))return'werbetechnik';
  if(/elektrik|elektro/.test(raw))return'elektriker';
  return'sonstiges';
};

function example(type='programmierer',other=''){
  if(type==='programmierer')return{
    company:'PIXVA',industry:'Programmierer · Software & KI',headline:'Software, Websites & KI, die Arbeit abnimmt.',
    intro:'Webentwicklung, Automatisierung und KI-Lösungen – modern, schnell und passend zu deinem Projekt.',
    services:['Websites & Web-Apps','KI & Automatisierung','Individuelle Software','Integration & Support'],
    phone:'+49 711 1234567',email:'info@pixva-beispiel.de',website:'www.pixva-beispiel.de',instagram:'@pixva',
    address:'Musterstraße 12 · 70173 Stuttgart',owner:'Dein Ansprechpartner',primary:'#7258ff',secondary:'#39d6d0',
    logo:PIXVA_LOGO,oldPrice:'39,99 €',newPrice:'29,99 €',discount:'25% RABATT',priceNote:'pro Monat · nur für Neukunden · 1 Jahr'
  };
  if(type==='supermarkt')return{
    company:'BEISPIEL MARKT',industry:'Supermarkt',headline:'Frische Angebote für jeden Tag.',
    intro:'Frische Produkte, starke Wochenangebote und persönliche Beratung – passend zu deinem Markt.',
    services:['Frische Lebensmittel','Obst & Gemüse','Wochenangebote','Service & Beratung'],
    phone:'+49 711 1234567',email:'info@beispiel-markt.de',website:'www.beispiel-markt.de',instagram:'@beispielmarkt',
    address:'Musterstraße 12 · 70173 Stuttgart',owner:'Beispiel Ansprechpartner',primary:'#0c6847',secondary:'#e52d2d',
    logo:PIXVA_LOGO,oldPrice:'4,99 €',newPrice:'3,49 €',discount:'ANGEBOT',priceNote:'Beispiel-Aktionspreis'
  };
  if(type==='werbetechnik')return{
    company:'BEISPIEL WERBETECHNIK',industry:'Werbetechnik',headline:'Wir machen Marken sichtbar.',
    intro:'Schilder, Dibond, Druck, Folierung und Montage – professionell geplant und umgesetzt.',
    services:['Schilder & Leuchtwerbung','Dibond & Plattendruck','Folierung & Beschriftung','Druck & Montage'],
    phone:'+49 711 1234567',email:'info@beispiel-werbetechnik.de',website:'www.beispiel-werbetechnik.de',instagram:'@beispielwerbetechnik',
    address:'Musterstraße 12 · 70173 Stuttgart',owner:'Beispiel Ansprechpartner',primary:'#111111',secondary:'#f7c948',
    logo:PIXVA_LOGO,oldPrice:'59,99 €',newPrice:'44,99 €',discount:'25% RABATT',priceNote:'Dibond Beispielangebot'
  };
  if(type==='elektriker')return{
    company:'BEISPIEL ELEKTRO',industry:'Elektriker',headline:'Sichere Elektrik. Saubere Arbeit.',
    intro:'Elektroinstallation, Wartung und moderne Lösungen für Privat- und Gewerbekunden.',
    services:['Elektroinstallation','Modernisierung','Wartung & Prüfung','Service & Beratung'],
    phone:'+49 711 1234567',email:'info@beispiel-elektro.de',website:'www.beispiel-elektro.de',instagram:'@beispielelektro',
    address:'Musterstraße 12 · 70173 Stuttgart',owner:'Beispiel Ansprechpartner',primary:'#0a263f',secondary:'#ffd42a',
    logo:PIXVA_LOGO,oldPrice:'',newPrice:'-20%',discount:'ELEKTRO-CHECK',priceNote:'Beispiel-Rabattaktion'
  };
  return{
    company:'BEISPIEL FIRMA',industry:other||'Unternehmen',headline:'Professionell. Persönlich. Passend.',
    intro:'Leistungen, Beratung und Kontakt – modern präsentiert im Stil deiner Firma.',
    services:['Unsere Leistungen','Persönliche Beratung','Individuelle Lösungen','Kontakt & Service'],
    phone:'+49 711 1234567',email:'info@beispiel-firma.de',website:'www.beispiel-firma.de',instagram:'@beispielfirma',
    address:'Musterstraße 12 · 70173 Stuttgart',owner:'Beispiel Ansprechpartner',primary:'#7258ff',secondary:'#39d6d0',
    logo:PIXVA_LOGO,oldPrice:'',newPrice:'AKTION',discount:'BEISPIEL',priceNote:'Beispielangebot'
  };
}

function preparedSite(brain){
  const c=brain?.company||{};
  const kind=typeKey(c.companyType,c.companyTypeOther);
  const e=example(kind,c.companyTypeOther||'');
  const hasReal=Boolean(c.companyName||c.companyPhone||c.companyEmail||c.website||c.instagram||c.address||c.ownerName||c.logoDataUrl||c.logoUrl);
  const realOr=(real,fallback)=>String(real||'').trim()?real:(hasReal?'':fallback);
  return{
    company:realOr(c.companyName,e.company),industry:realOr(c.industryLabel,e.industry),companyType:kind,
    headline:brain?.defaults?.websiteHeadline&&kind!=='programmierer'?brain.defaults.websiteHeadline:e.headline,
    intro:brain?.defaults?.websiteIntro&&kind!=='programmierer'?brain.defaults.websiteIntro:e.intro,
    services:brain?.defaults?.services?.length&&kind!=='programmierer'?brain.defaults.services:e.services,
    cta:'Jetzt anfragen',phone:realOr(c.companyPhone,e.phone),email:realOr(c.companyEmail,e.email),website:realOr(c.website,e.website),
    instagram:realOr(c.instagram,e.instagram),address:realOr(c.address,e.address),owner:realOr(c.ownerName,e.owner),
    primary:c.primaryColor||e.primary,secondary:c.secondaryColor||e.secondary,font:c.fontFamily||'Inter',
    logo:c.logoDataUrl||c.logoUrl||(hasReal?'':e.logo),exampleMode:!hasReal,
    oldPrice:e.oldPrice,newPrice:e.newPrice,discount:e.discount,priceNote:e.priceNote
  };
}

function buildHtml(d){
  const safeLogo=d.logo||PIXVA_LOGO;
  const websiteHref=/^https?:\/\//i.test(d.website)?d.website:`https://${d.website||'pixva.example'}`;
  const contacts=[
    d.phone?`<a href="tel:${attr(d.phone)}">${esc(d.phone)}</a>`:'',
    d.email?`<a href="mailto:${attr(d.email)}">${esc(d.email)}</a>`:'',
    d.website?`<a href="${attr(websiteHref)}">${esc(d.website)}</a>`:'',
    d.instagram?`<span>${esc(d.instagram)}</span>`:''
  ].filter(Boolean).join('');
  const cards=(d.services||[]).map((s,i)=>`<article><b>0${i+1}</b><h3>${esc(s)}</h3><p>Professionell, zuverlässig und passend zu ${esc(d.company||'deinem Projekt')}.</p></article>`).join('');
  const price=d.newPrice?`<div class="offer"><div><small>${d.oldPrice?`STATT ${esc(d.oldPrice)}`:'AKTION'}</small><strong>${esc(d.newPrice)}</strong><span>${esc(d.priceNote||'')}</span></div><b>${esc(d.discount||'ANGEBOT')}</b></div>`:'';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.company||'PIXVA')}</title><style>
*{box-sizing:border-box}body{margin:0;font-family:${esc(d.font)},Arial,sans-serif;background:#f5f7f9;color:#071923}.example{background:#ffda45;color:#111;padding:10px 6vw;text-align:center;font-weight:900}header{min-height:84vh;background:#061923;color:#fff;padding:28px 6vw;display:flex;flex-direction:column}.top{display:flex;align-items:center;justify-content:space-between;gap:20px}.logo{max-width:220px;max-height:92px;object-fit:contain}.links{display:flex;gap:14px;flex-wrap:wrap;justify-content:flex-end}.links a,.links span{color:#fff;text-decoration:none;font-weight:750}.hero{margin:auto 0;max-width:1080px}.industry{color:${d.secondary};font-weight:900;letter-spacing:.16em;text-transform:uppercase}.hero h1{font-size:clamp(3rem,6.5vw,6.6rem);line-height:.95;margin:.24em 0}.hero p{font-size:1.25rem;max-width:780px;color:#c1d1db}.btn{display:inline-block;background:${d.primary};color:#fff;padding:16px 26px;border-radius:999px;text-decoration:none;font-weight:900;margin-top:18px}.offer{margin-top:28px;max-width:680px;border:1px solid #ffffff35;border-radius:22px;padding:20px;display:flex;align-items:center;justify-content:space-between;gap:20px;background:#ffffff0b}.offer small,.offer span{display:block;color:#a9bdc8}.offer strong{display:block;font-size:3rem;line-height:1.05}.offer>b{background:${d.secondary};color:#071923;padding:12px 16px;border-radius:999px}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:30px}.fact{padding:13px;border:1px solid #ffffff27;border-radius:12px}.fact small{display:block;color:#86a5b6}.services{padding:78px 6vw}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}.grid article{padding:26px;background:#fff;border-radius:18px;box-shadow:0 16px 50px #00000010}.grid b{color:${d.primary}}.contact{background:${d.primary};color:#fff;padding:75px 6vw;display:grid;grid-template-columns:1.1fr 1fr;gap:35px}.contact h2{font-size:clamp(2.6rem,5vw,5rem);margin:0}.contact-list{display:grid;gap:10px}.contact-list a,.contact-list span{color:#fff;text-decoration:none;font-weight:800}footer{background:#061923;color:#9eb2bd;padding:25px 6vw;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}@media(max-width:760px){.top{flex-direction:column;align-items:flex-start}.links{justify-content:flex-start}.contact{grid-template-columns:1fr}.offer{align-items:flex-start;flex-direction:column}}
</style></head><body>${d.exampleMode?'<div class="example">PIXVA PROGRAMMIERER-BEISPIEL · echte gespeicherte Firmendaten ersetzen diese Werte automatisch</div>':''}<header><div class="top"><img class="logo" src="${attr(safeLogo)}" alt="${attr(d.company||'PIXVA')} Logo"><div class="links">${contacts}</div></div><div class="hero"><div class="industry">${esc(d.industry||'Software & KI')}</div><h1>${esc(d.headline)}</h1><p>${esc(d.intro)}</p><a class="btn" href="#kontakt">${esc(d.cta)}</a>${price}<div class="facts"><div class="fact"><small>Firma</small><b>${esc(d.company||'—')}</b></div><div class="fact"><small>Inhaber / Ansprechpartner</small><b>${esc(d.owner||'—')}</b></div><div class="fact"><small>Telefon</small><b>${esc(d.phone||'—')}</b></div><div class="fact"><small>E-Mail</small><b>${esc(d.email||'—')}</b></div><div class="fact"><small>Adresse</small><b>${esc(d.address||'—')}</b></div></div></div></header><section class="services"><h2>Unsere Leistungen</h2><div class="grid">${cards}</div></section><section class="contact" id="kontakt"><div><h2>${esc(d.cta)}</h2><p>${esc(d.company||'PIXVA')}</p><p>${esc(d.address||'')}</p></div><div class="contact-list">${contacts}</div></section><footer><span>© ${new Date().getFullYear()} ${esc(d.company||'PIXVA')}</span><span>${esc([d.phone,d.email,d.website].filter(Boolean).join(' · '))}</span></footer></body></html>`;
}

export default function WebsiteBuilder({project,onSaved}){
  const [data,setData]=useState(()=>project?.data?.site||preparedSite(null));
  const [projectName,setProjectName]=useState(project?.name||'PIXVA Programmierer-Beispiel');
  const [projectId,setProjectId]=useState(project?.id||'');
  const [status,setStatus]=useState('Programmierer-Beispiel ist sofort sichtbar. Gespeicherte Profildaten werden im Hintergrund geladen.');
  useEffect(()=>{
    if(project?.id)return;
    let alive=true;
    api('/api/pixva?action=brain-context').then(brain=>{
      if(!alive)return;const next=preparedSite(brain);setData(next);
      setProjectName(next.exampleMode?'PIXVA Programmierer-Beispiel':`Website – ${next.company||'Firma'}`);
      setStatus(next.exampleMode?'Programmierer-Beispiel aktiv – im Admin kannst du dein Firmenprofil vollständig speichern.':'Gespeichertes Firmenprofil, Logo und Kontaktdaten wurden geladen.');
    }).catch(()=>{});
    return()=>{alive=false};
  },[project?.id]);
  const source=useMemo(()=>buildHtml(data),[data]);
  const patch=(key,value)=>setData(old=>({...old,[key]:value}));
  async function save(){
    try{
      const payload={name:projectName,type:'website',data:{site:data,pixvaAutoCompany:true}};
      const result=projectId?await api(`/api/projects/${projectId}`,{method:'PUT',body:JSON.stringify(payload)}):await api('/api/projects',{method:'POST',body:JSON.stringify(payload)});
      setProjectId(result.project.id);setStatus('Website gespeichert.');onSaved?.(result.project);
    }catch(error){setStatus(error.message)}
  }
  return <section className="website-builder">
    <aside className="site-controls">
      <h2><Globe2 size={21}/> Website-Builder</h2>
      <div className="pixva-brain-chip"><BrainCircuit size={16}/>{data.exampleMode?'PIXVA · PROGRAMMIERER-BEISPIEL':'ECHTE FIRMENDATEN AKTIV'}</div>
      <label>Projektname<input value={projectName} onChange={e=>setProjectName(e.target.value)}/></label>
      <label>Firmenname<input value={data.company} onChange={e=>patch('company',e.target.value)}/></label><label>Branche<input value={data.industry} onChange={e=>patch('industry',e.target.value)}/></label>
      <label>Slogan<input value={data.headline} onChange={e=>patch('headline',e.target.value)}/></label><label>Einleitung<textarea rows={4} value={data.intro} onChange={e=>patch('intro',e.target.value)}/></label>
      <label>Leistungen<textarea rows={5} value={(data.services||[]).join('\n')} onChange={e=>patch('services',e.target.value.split('\n').filter(Boolean))}/></label>
      <div className="pixva-price-fields"><label>Beispiel vorher<input value={data.oldPrice||''} onChange={e=>patch('oldPrice',e.target.value)}/></label><label>Beispiel jetzt<input value={data.newPrice||''} onChange={e=>patch('newPrice',e.target.value)}/></label><label>Rabatt<input value={data.discount||''} onChange={e=>patch('discount',e.target.value)}/></label></div>
      <label>Firmen-Telefon<input value={data.phone} onChange={e=>patch('phone',e.target.value)}/></label><label>Firmen-E-Mail<input value={data.email} onChange={e=>patch('email',e.target.value)}/></label>
      <label>Website<input value={data.website} onChange={e=>patch('website',e.target.value)}/></label><label>Instagram<input value={data.instagram} onChange={e=>patch('instagram',e.target.value)}/></label>
      <label>Adresse<input value={data.address} onChange={e=>patch('address',e.target.value)}/></label><label>Inhaber<input value={data.owner} onChange={e=>patch('owner',e.target.value)}/></label>
      <div className="pixva-site-logo-preview"><span>{data.exampleMode?'PIXVA Beispiel-Logo':'Gespeichertes Firmenlogo'}</span><img src={data.logo||PIXVA_LOGO} alt="Logo"/></div>
      <button onClick={save}><Save size={17}/>Speichern</button><button className="primary-btn" onClick={()=>downloadText(`${projectName.replace(/\W+/g,'-')||'website'}.html`,source,'text/html')}><Download size={17}/>HTML exportieren</button><div className="status-line">{status}</div>
    </aside>
    <div className="site-preview"><div className="browser-bar"><i/><i/><i/><span>Live-Vorschau · automatisch</span></div><iframe title="Website Vorschau" srcDoc={source}/></div>
  </section>;
}
