import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Download, Globe2, RefreshCw, Save } from 'lucide-react';
import { api, downloadText } from '../api.js';

const EXAMPLE_LOGO="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5MDAiIGhlaWdodD0iNDIwIiB2aWV3Qm94PSIwIDAgOTAwIDQyMCI+CjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAiIHkxPSIwIiB4Mj0iMSIgeTI9IjEiPjxzdG9wIHN0b3AtY29sb3I9IiM3MjU4ZmYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMzOWQ2ZDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz4KPHJlY3Qgd2lkdGg9IjkwMCIgaGVpZ2h0PSI0MjAiIHJ4PSI3MCIgZmlsbD0iI2ZmZmZmZiIvPgo8cmVjdCB4PSIyOCIgeT0iMjgiIHdpZHRoPSI4NDQiIGhlaWdodD0iMzY0IiByeD0iNTIiIGZpbGw9InVybCgjZykiLz4KPHRleHQgeD0iNDUwIiB5PSIxODUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjgyIiBmb250LXdlaWdodD0iODAwIiBmaWxsPSIjZmZmZmZmIj5CRUlTUElFTCBMT0dPPC90ZXh0Pgo8dGV4dCB4PSI0NTAiIHk9IjI2MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMzQiIGZvbnQtd2VpZ2h0PSI2MDAiIGZpbGw9IiNlYWZmZmYiPndpcmQgZHVyY2ggZGVpbiBGaXJtZW5sb2dvIGVyc2V0enQ8L3RleHQ+Cjwvc3ZnPg==";
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const attr=(v='')=>esc(v).replace(/`/g,'&#96;');

function exampleFor(type='sonstiges',other=''){
  if(type==='supermarkt')return{
    company:'BEISPIEL MARKT',industryLabel:'Supermarkt',headline:'Frische Angebote für jeden Tag.',
    intro:'Frische Produkte, starke Aktionen und persönliche Beratung – passend zu deinem Markt.',
    services:['Frische Lebensmittel','Obst & Gemüse','Wochenangebote','Service & Beratung'],
    phone:'+49 711 1234567',email:'info@beispiel-markt.de',website:'www.beispiel-markt.de',
    instagram:'@beispielmarkt',address:'Musterstraße 12 · 70173 Stuttgart',ownerName:'Max Mustermann',
    primary:'#0c6847',secondary:'#e52d2d'
  };
  if(type==='werbetechnik')return{
    company:'BEISPIEL WERBETECHNIK',industryLabel:'Werbetechnik',headline:'Wir machen Marken sichtbar.',
    intro:'Schilder, Druck, Folierung und Werbetechnik – professionell geplant und umgesetzt.',
    services:['Schilder & Leuchtwerbung','Dibond & Plattendruck','Folierung & Beschriftung','Druck & Montage'],
    phone:'+49 711 1234567',email:'info@beispiel-werbetechnik.de',website:'www.beispiel-werbetechnik.de',
    instagram:'@beispielwerbetechnik',address:'Musterstraße 12 · 70173 Stuttgart',ownerName:'Max Mustermann',
    primary:'#111111',secondary:'#f7c948'
  };
  if(type==='elektriker')return{
    company:'BEISPIEL ELEKTRO',industryLabel:'Elektriker',headline:'Sichere Elektrik. Saubere Arbeit.',
    intro:'Elektroinstallation, Wartung und moderne Lösungen für Privat- und Gewerbekunden.',
    services:['Elektroinstallation','Modernisierung','Wartung & Prüfung','Service & Beratung'],
    phone:'+49 711 1234567',email:'info@beispiel-elektro.de',website:'www.beispiel-elektro.de',
    instagram:'@beispielelektro',address:'Musterstraße 12 · 70173 Stuttgart',ownerName:'Max Mustermann',
    primary:'#0a263f',secondary:'#ffd42a'
  };
  return{
    company:'BEISPIEL FIRMA',industryLabel:other||'Unternehmen',headline:'Professionell. Persönlich. Passend.',
    intro:'Leistungen und Beratung – modern präsentiert im Stil deiner Firma.',
    services:['Unsere Leistungen','Persönliche Beratung','Individuelle Lösungen','Kontakt & Service'],
    phone:'+49 711 1234567',email:'info@beispiel-firma.de',website:'www.beispiel-firma.de',
    instagram:'@beispielfirma',address:'Musterstraße 12 · 70173 Stuttgart',ownerName:'Max Mustermann',
    primary:'#7258ff',secondary:'#39d6d0'
  };
}

function siteFromBrain(brain,blueprint={}){
  const c=brain?.company||{},d=brain?.defaults||{};
  const example=exampleFor(c.companyType||'sonstiges',c.companyTypeOther||'');
  const hasReal=Boolean(c.companyName||c.companyPhone||c.companyEmail||c.website||c.instagram||c.address||c.logoDataUrl||c.logoUrl);
  const use=(real,exampleValue)=>String(real||'').trim()?real:exampleValue;
  return{
    company:use(c.companyName,example.company),
    companyType:c.companyType||'sonstiges',
    companyTypeOther:c.companyTypeOther||'',
    industryLabel:use(c.industryLabel,example.industryLabel),
    ownerName:use(c.ownerName,example.ownerName),
    headline:blueprint.headline||d.websiteHeadline||example.headline,
    intro:blueprint.intro||d.websiteIntro||example.intro,
    services:Array.isArray(blueprint.services)&&blueprint.services.length?blueprint.services:(d.services?.length?d.services:example.services),
    cta:blueprint.cta||'Jetzt anfragen',
    phone:use(c.companyPhone,example.phone),
    privatePhone:c.privatePhone||c.personalPhone||'',
    email:use(c.companyEmail,example.email),
    personalEmail:c.personalEmail||'',
    address:use(c.address,example.address),
    website:use(c.website,example.website),
    instagram:use(c.instagram,example.instagram),
    primary:blueprint.primary||c.primaryColor||d.primary||example.primary,
    secondary:blueprint.secondary||c.secondaryColor||d.secondary||example.secondary,
    dark:'#061722',light:'#f7f8fa',
    logoDataUrl:c.logoDataUrl||'',
    logoUrl:c.logoUrl||'',
    displayLogo:c.logoDataUrl||c.logoUrl||EXAMPLE_LOGO,
    fontFamily:c.fontFamily||'Inter',
    exampleMode:!hasReal
  };
}

function buildHtml(d){
  const brand=`<img class="logo" src="${attr(d.displayLogo||EXAMPLE_LOGO)}" alt="${attr(d.company)} Logo">`;
  const links=[
    d.phone&&`<a href="tel:${attr(d.phone)}">${esc(d.phone)}</a>`,
    d.email&&`<a href="mailto:${attr(d.email)}">${esc(d.email)}</a>`,
    d.website&&`<a href="${attr(/^https?:\/\//i.test(d.website)?d.website:`https://${d.website}`)}">${esc(d.website)}</a>`,
    d.instagram&&`<span>${esc(d.instagram)}</span>`
  ].filter(Boolean).join('');
  const services=(d.services||[]).map((s,i)=>`<article><b>0${i+1}</b><h3>${esc(s)}</h3><p>Passend zu ${esc(d.company)} und der Branche.</p></article>`).join('');
  const banner=d.exampleMode?`<div class="example-banner">BEISPIELVORSCHAU · Diese Daten werden automatisch durch echte Firmendaten ersetzt</div>`:'';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.company)}</title><style>
*{box-sizing:border-box}body{margin:0;font-family:${esc(d.fontFamily)},Arial,sans-serif;background:${d.light};color:${d.dark}}.example-banner{background:#ffda45;color:#111;padding:9px 6vw;font-weight:900;font-size:13px;text-align:center}header{min-height:82vh;background:${d.dark};color:white;padding:28px 6vw;display:flex;flex-direction:column}.top{display:flex;align-items:center;justify-content:space-between;gap:20px}.logo{max-width:210px;max-height:90px;object-fit:contain;background:white;padding:8px;border-radius:14px}.links{display:flex;gap:14px;flex-wrap:wrap;justify-content:flex-end}.links a,.links span{color:white;text-decoration:none;font-weight:700}.hero{margin:auto 0;max-width:1020px}.industry{color:${d.secondary};letter-spacing:.18em;font-weight:900;text-transform:uppercase}.hero h1{font-size:clamp(3rem,7vw,7.2rem);line-height:.93;margin:.24em 0}.hero p{font-size:1.28rem;max-width:760px;color:#c6d2da}.btn{display:inline-block;background:${d.primary};color:white;text-decoration:none;padding:16px 25px;border-radius:999px;font-weight:900;margin-top:18px}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:32px}.fact{padding:13px;border:1px solid #ffffff24;border-radius:12px}.fact small{display:block;color:#8fa9b8}.services{padding:78px 6vw}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}.grid article{background:white;border-radius:18px;padding:26px;box-shadow:0 18px 55px #0000000c}.grid b{color:${d.primary}}.contact{padding:76px 6vw;background:${d.primary};color:white;display:grid;grid-template-columns:1.1fr 1fr;gap:35px}.contact h2{font-size:clamp(2.5rem,5vw,5rem);margin:0}.contact-list{display:grid;gap:10px}.contact-list a,.contact-list span{color:white;text-decoration:none;font-weight:800}footer{background:${d.dark};color:#9cb0bb;padding:26px 6vw;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}@media(max-width:760px){.top{align-items:flex-start;flex-direction:column}.links{justify-content:flex-start}.contact{grid-template-columns:1fr}}
</style></head><body>${banner}<header><div class="top">${brand}<div class="links">${links}</div></div><div class="hero"><div class="industry">${esc(d.industryLabel)}</div><h1>${esc(d.headline)}</h1><p>${esc(d.intro)}</p><a class="btn" href="#kontakt">${esc(d.cta)}</a><div class="facts"><div class="fact"><small>Ansprechpartner</small><b>${esc(d.ownerName)}</b></div><div class="fact"><small>Adresse</small><b>${esc(d.address)}</b></div><div class="fact"><small>Telefon</small><b>${esc(d.phone)}</b></div><div class="fact"><small>E-Mail</small><b>${esc(d.email)}</b></div></div></div></header><section class="services"><h2>Unsere Leistungen</h2><div class="grid">${services}</div></section><section class="contact" id="kontakt"><div><h2>${esc(d.cta)}</h2><p>${esc(d.company)}</p><p>${esc(d.address)}</p></div><div class="contact-list">${links}</div></section><footer><span>© ${new Date().getFullYear()} ${esc(d.company)}</span><span>${esc(d.phone)} · ${esc(d.email)} · ${esc(d.website)}</span></footer></body></html>`;
}

export default function WebsiteBuilder({project,onSaved}){
  const [brain,setBrain]=useState(null);
  const [data,setData]=useState(null);
  const [projectName,setProjectName]=useState(project?.name||'Firmenwebsite');
  const [projectId,setProjectId]=useState(project?.id||'');
  const [status,setStatus]=useState('PIXVA Brain lädt Firmenprofil …');
  const [aiLoading,setAiLoading]=useState(false);

  async function loadBrain(forceAI=false){
    setStatus('PIXVA Brain liest Firmenprofil, Beispiele und Branchenlogik …');
    try{
      const b=await api('/api/pixva?action=brain-context');
      setBrain(b);
      let blueprint={};
      try{
        const r=await api('/api/pixva?action=brain-blueprint',{method:'POST',body:JSON.stringify({target:'website',instruction:forceAI?'Website neu planen':'Website auf Firmenprofil abstimmen'})});
        blueprint=r.blueprint||{};
      }catch{}
      const next=siteFromBrain(b,blueprint);
      setData(next);
      setProjectName(project?.name||(next.exampleMode?'Beispiel Firmenwebsite':`Website – ${next.company}`));
      setStatus(next.exampleMode?'BEISPIELMODUS: echte Firmendaten fehlen noch – Layout ist vollständig vorbereitet.':`Echte Firmendaten aktiv · ${next.company} · ${next.industryLabel}`);
    }catch(e){
      const next=siteFromBrain({},{});
      setData(next);setStatus(`Beispielmodus aktiv · Firmenprofil konnte nicht geladen werden: ${e.message}`);
    }
  }

  useEffect(()=>{loadBrain(false)},[project?.id]);
  const html=useMemo(()=>buildHtml(data||siteFromBrain(brain||{},{})),[data,brain]);
  const update=(key,value)=>setData(old=>({...old,[key]:value}));

  async function save(){
    if(!data)return;
    try{
      const payload={name:projectName,type:'website',data:{site:data,pixvaBrainVersion:7}};
      const r=projectId?await api(`/api/projects/${projectId}`,{method:'PUT',body:JSON.stringify(payload)}):await api('/api/projects',{method:'POST',body:JSON.stringify(payload)});
      setProjectId(r.project.id);setStatus('Gespeichert');onSaved?.(r.project);
    }catch(e){setStatus(e.message)}
  }

  if(!data)return <section className="website-builder"><aside className="site-controls"><h2><BrainCircuit/>PIXVA Website Brain</h2><div className="status-line">{status}</div></aside><div className="site-preview"/></section>;

  return <section className="website-builder">
    <aside className="site-controls">
      <h2><Globe2 size={21}/> Website-Builder</h2>
      <div className="pixva-brain-chip"><BrainCircuit size={16}/>{data.exampleMode?'BEISPIELMODUS – vollständig vorbereitet':'PIXVA Brain · echte Firmendaten aktiv'}</div>
      <button className="primary-btn" onClick={()=>loadBrain(true)} disabled={aiLoading}><RefreshCw size={16}/>Website aus Profil neu erstellen</button>
      <label>Projektname<input value={projectName} onChange={e=>setProjectName(e.target.value)}/></label>
      <label>Firmenname<input value={data.company} onChange={e=>update('company',e.target.value)}/></label>
      <label>Branche<input value={data.industryLabel} onChange={e=>update('industryLabel',e.target.value)}/></label>
      <label>Slogan<input value={data.headline} onChange={e=>update('headline',e.target.value)}/></label>
      <label>Einleitung<textarea rows={4} value={data.intro} onChange={e=>update('intro',e.target.value)}/></label>
      <label>Leistungen<textarea rows={5} value={(data.services||[]).join('\\n')} onChange={e=>update('services',e.target.value.split('\\n').filter(Boolean))}/></label>
      <label>Firmen-Telefon<input value={data.phone} onChange={e=>update('phone',e.target.value)}/></label>
      <label>Firmen-E-Mail<input value={data.email} onChange={e=>update('email',e.target.value)}/></label>
      <label>Website<input value={data.website} onChange={e=>update('website',e.target.value)}/></label>
      <label>Instagram<input value={data.instagram} onChange={e=>update('instagram',e.target.value)}/></label>
      <label>Adresse<input value={data.address} onChange={e=>update('address',e.target.value)}/></label>
      <label>Inhaber / Ansprechpartner<input value={data.ownerName} onChange={e=>update('ownerName',e.target.value)}/></label>
      <div className="pixva-site-logo-preview"><span>{data.exampleMode?'Beispiel-Logo':'Aktives Firmenlogo'}</span><img src={data.displayLogo||EXAMPLE_LOGO} alt="Logo"/></div>
      <button onClick={save}><Save size={17}/>Speichern</button>
      <button className="primary-btn" onClick={()=>downloadText(`${projectName.replace(/\W+/g,'-')||'website'}.html`,html,'text/html')}><Download size={17}/>HTML exportieren</button>
      {status&&<div className="status-line">{status}</div>}
    </aside>
    <div className="site-preview"><div className="browser-bar"><i/><i/><i/><span>Live-Vorschau · {data.exampleMode?'BEISPIEL':'ECHTE DATEN'}</span></div><iframe title="Website Vorschau" srcDoc={html}/></div>
  </section>;
}
