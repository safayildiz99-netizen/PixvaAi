import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Download, Globe2, Save } from 'lucide-react';
import { api, downloadText } from '../api.js';

const EXAMPLE_LOGO="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5MDAiIGhlaWdodD0iNDIwIiB2aWV3Qm94PSIwIDAgOTAwIDQyMCI+CjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAiIHkxPSIwIiB4Mj0iMSIgeTI9IjEiPjxzdG9wIHN0b3AtY29sb3I9IiM3MjU4ZmYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMzOWQ2ZDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz4KPHJlY3Qgd2lkdGg9IjkwMCIgaGVpZ2h0PSI0MjAiIHJ4PSI3MCIgZmlsbD0iI2ZmZiIvPgo8cmVjdCB4PSIyOCIgeT0iMjgiIHdpZHRoPSI4NDQiIGhlaWdodD0iMzY0IiByeD0iNTIiIGZpbGw9InVybCgjZykiLz4KPHRleHQgeD0iNDUwIiB5PSIxODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjgwIiBmb250LXdlaWdodD0iODAwIiBmaWxsPSIjZmZmIj5CRUlTUElFTCBMT0dPPC90ZXh0Pgo8dGV4dCB4PSI0NTAiIHk9IjI1OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMzEiIGZvbnQtd2VpZ2h0PSI2MDAiIGZpbGw9IiNlYWZmZmYiPmF1dG9tYXRpc2NoIGR1cmNoIGRlaW4gRmlybWVubG9nbyBlcnNldHp0PC90ZXh0Pgo8L3N2Zz4=";
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const attr=(v='')=>esc(v).replace(/`/g,'&#96;');

function example(type='sonstiges', other=''){
  if(type==='supermarkt') return {
    company:'BEISPIEL MARKT', industry:'Supermarkt', headline:'Frische Angebote für jeden Tag.',
    intro:'Frische Produkte, starke Wochenangebote und persönliche Beratung – passend zu deinem Markt.',
    services:['Frische Lebensmittel','Obst & Gemüse','Wochenangebote','Service & Beratung'],
    phone:'+49 711 1234567', email:'info@beispiel-markt.de', website:'www.beispiel-markt.de',
    instagram:'@beispielmarkt', address:'Musterstraße 12 · 70173 Stuttgart', owner:'Max Mustermann',
    primary:'#0c6847', secondary:'#e52d2d'
  };
  if(type==='werbetechnik') return {
    company:'BEISPIEL WERBETECHNIK', industry:'Werbetechnik', headline:'Wir machen Marken sichtbar.',
    intro:'Schilder, Dibond, Druck, Folierung und Montage – professionell geplant und umgesetzt.',
    services:['Schilder & Leuchtwerbung','Dibond & Plattendruck','Folierung & Beschriftung','Druck & Montage'],
    phone:'+49 711 1234567', email:'info@beispiel-werbetechnik.de', website:'www.beispiel-werbetechnik.de',
    instagram:'@beispielwerbetechnik', address:'Musterstraße 12 · 70173 Stuttgart', owner:'Max Mustermann',
    primary:'#111111', secondary:'#f7c948'
  };
  if(type==='elektriker') return {
    company:'BEISPIEL ELEKTRO', industry:'Elektriker', headline:'Sichere Elektrik. Saubere Arbeit.',
    intro:'Elektroinstallation, Wartung und moderne Lösungen für Privat- und Gewerbekunden.',
    services:['Elektroinstallation','Modernisierung','Wartung & Prüfung','Service & Beratung'],
    phone:'+49 711 1234567', email:'info@beispiel-elektro.de', website:'www.beispiel-elektro.de',
    instagram:'@beispielelektro', address:'Musterstraße 12 · 70173 Stuttgart', owner:'Max Mustermann',
    primary:'#0a263f', secondary:'#ffd42a'
  };
  return {
    company:'BEISPIEL FIRMA', industry:other||'Unternehmen', headline:'Professionell. Persönlich. Passend.',
    intro:'Leistungen, Beratung und Kontakt – modern präsentiert im Stil deiner Firma.',
    services:['Unsere Leistungen','Persönliche Beratung','Individuelle Lösungen','Kontakt & Service'],
    phone:'+49 711 1234567', email:'info@beispiel-firma.de', website:'www.beispiel-firma.de',
    instagram:'@beispielfirma', address:'Musterstraße 12 · 70173 Stuttgart', owner:'Max Mustermann',
    primary:'#7258ff', secondary:'#39d6d0'
  };
}

function preparedSite(brain){
  const c=brain?.company||{};
  const type=c.companyType||'sonstiges';
  const e=example(type,c.companyTypeOther||'');
  const hasReal=Boolean(c.companyName||c.companyPhone||c.companyEmail||c.website||c.instagram||c.address||c.logoDataUrl||c.logoUrl);
  const pick=(real,fallback)=>String(real||'').trim()?real:fallback;
  return {
    company:pick(c.companyName,e.company), industry:pick(c.industryLabel,e.industry), companyType:type,
    headline:brain?.defaults?.websiteHeadline||e.headline,
    intro:brain?.defaults?.websiteIntro||e.intro,
    services:brain?.defaults?.services?.length?brain.defaults.services:e.services,
    cta:'Jetzt anfragen',
    phone:pick(c.companyPhone,e.phone), email:pick(c.companyEmail,e.email),
    website:pick(c.website,e.website), instagram:pick(c.instagram,e.instagram),
    address:pick(c.address,e.address), owner:pick(c.ownerName,e.owner),
    primary:c.primaryColor||e.primary, secondary:c.secondaryColor||e.secondary,
    logo:c.logoDataUrl||c.logoUrl||EXAMPLE_LOGO, font:c.fontFamily||'Inter',
    exampleMode:!hasReal
  };
}

function buildHtml(d){
  const websiteHref=/^https?:\/\//i.test(d.website)?d.website:`https://${d.website}`;
  const contact=[
    `<a href="tel:${attr(d.phone)}">${esc(d.phone)}</a>`,
    `<a href="mailto:${attr(d.email)}">${esc(d.email)}</a>`,
    `<a href="${attr(websiteHref)}">${esc(d.website)}</a>`,
    `<span>${esc(d.instagram)}</span>`
  ].join('');
  const cards=(d.services||[]).map((s,i)=>`<article><b>0${i+1}</b><h3>${esc(s)}</h3><p>Professionell, zuverlässig und passend zu ${esc(d.company)}.</p></article>`).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.company)}</title><style>
*{box-sizing:border-box}body{margin:0;font-family:${esc(d.font)},Arial,sans-serif;background:#f6f8fa;color:#071923}.example{background:#ffda45;color:#111;padding:10px 6vw;text-align:center;font-weight:900}header{min-height:84vh;background:#061923;color:#fff;padding:28px 6vw;display:flex;flex-direction:column}.top{display:flex;align-items:center;justify-content:space-between;gap:20px}.logo{max-width:220px;max-height:92px;object-fit:contain;background:#fff;padding:8px;border-radius:14px}.links{display:flex;gap:14px;flex-wrap:wrap;justify-content:flex-end}.links a,.links span{color:#fff;text-decoration:none;font-weight:750}.hero{margin:auto 0;max-width:1050px}.industry{color:${d.secondary};font-weight:900;letter-spacing:.18em;text-transform:uppercase}.hero h1{font-size:clamp(3.3rem,7vw,7rem);line-height:.94;margin:.24em 0}.hero p{font-size:1.3rem;max-width:760px;color:#c1d1db}.btn{display:inline-block;background:${d.primary};color:#fff;padding:16px 26px;border-radius:999px;text-decoration:none;font-weight:900;margin-top:18px}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:30px}.fact{padding:13px;border:1px solid #ffffff27;border-radius:12px}.fact small{display:block;color:#86a5b6}.services{padding:78px 6vw}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}.grid article{padding:26px;background:#fff;border-radius:18px;box-shadow:0 16px 50px #00000010}.grid b{color:${d.primary}}.contact{background:${d.primary};color:#fff;padding:75px 6vw;display:grid;grid-template-columns:1.1fr 1fr;gap:35px}.contact h2{font-size:clamp(2.6rem,5vw,5rem);margin:0}.contact-list{display:grid;gap:10px}.contact-list a,.contact-list span{color:#fff;text-decoration:none;font-weight:800}footer{background:#061923;color:#9eb2bd;padding:25px 6vw;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}@media(max-width:760px){.top{flex-direction:column;align-items:flex-start}.links{justify-content:flex-start}.contact{grid-template-columns:1fr}}
</style></head><body>${d.exampleMode?'<div class="example">BEISPIELVORSCHAU · echte Firmendaten ersetzen diese Werte automatisch</div>':''}<header><div class="top"><img class="logo" src="${attr(d.logo)}" alt="${attr(d.company)} Logo"><div class="links">${contact}</div></div><div class="hero"><div class="industry">${esc(d.industry)}</div><h1>${esc(d.headline)}</h1><p>${esc(d.intro)}</p><a class="btn" href="#kontakt">${esc(d.cta)}</a><div class="facts"><div class="fact"><small>Firma</small><b>${esc(d.company)}</b></div><div class="fact"><small>Inhaber / Ansprechpartner</small><b>${esc(d.owner)}</b></div><div class="fact"><small>Telefon</small><b>${esc(d.phone)}</b></div><div class="fact"><small>E-Mail</small><b>${esc(d.email)}</b></div><div class="fact"><small>Adresse</small><b>${esc(d.address)}</b></div></div></div></header><section class="services"><h2>Unsere Leistungen</h2><div class="grid">${cards}</div></section><section class="contact" id="kontakt"><div><h2>${esc(d.cta)}</h2><p>${esc(d.company)}</p><p>${esc(d.address)}</p></div><div class="contact-list">${contact}</div></section><footer><span>© ${new Date().getFullYear()} ${esc(d.company)}</span><span>${esc(d.phone)} · ${esc(d.email)} · ${esc(d.website)}</span></footer></body></html>`;
}

export default function WebsiteBuilder({project,onSaved}){
  const [data,setData]=useState(()=>project?.data?.site||preparedSite(null));
  const [projectName,setProjectName]=useState(project?.name||'Beispiel Firmenwebsite');
  const [projectId,setProjectId]=useState(project?.id||'');
  const [status,setStatus]=useState('Vorlage ist sofort bereit. PIXVA gleicht im Hintergrund dein Firmenprofil ab.');

  useEffect(()=>{
    if(project?.id)return;
    let alive=true;
    api('/api/pixva?action=brain-context').then((brain)=>{
      if(!alive)return;
      const next=preparedSite(brain);
      setData(next);
      setProjectName(next.exampleMode?'Beispiel Firmenwebsite':`Website – ${next.company}`);
      setStatus(next.exampleMode?'Beispielmodus aktiv – echte Firmendaten fehlen noch.':'Echte Firmendaten wurden automatisch eingesetzt.');
    }).catch(()=>{});
    return()=>{alive=false};
  },[project?.id]);

  const source=useMemo(()=>buildHtml(data),[data]);
  const patch=(key,value)=>setData(old=>({...old,[key]:value}));

  async function save(){
    try{
      const payload={name:projectName,type:'website',data:{site:data,pixvaAutoCompany:true}};
      const result=projectId
        ?await api(`/api/projects/${projectId}`,{method:'PUT',body:JSON.stringify(payload)})
        :await api('/api/projects',{method:'POST',body:JSON.stringify(payload)});
      setProjectId(result.project.id); setStatus('Website gespeichert.'); onSaved?.(result.project);
    }catch(error){setStatus(error.message)}
  }

  return <section className="website-builder">
    <aside className="site-controls">
      <h2><Globe2 size={21}/> Website-Builder</h2>
      <div className="pixva-brain-chip"><BrainCircuit size={16}/>{data.exampleMode?'BEISPIEL sofort aktiv':'Firmendaten automatisch aktiv'}</div>
      <label>Projektname<input value={projectName} onChange={e=>setProjectName(e.target.value)}/></label>
      <label>Firmenname<input value={data.company} onChange={e=>patch('company',e.target.value)}/></label>
      <label>Branche<input value={data.industry} onChange={e=>patch('industry',e.target.value)}/></label>
      <label>Slogan<input value={data.headline} onChange={e=>patch('headline',e.target.value)}/></label>
      <label>Einleitung<textarea rows={4} value={data.intro} onChange={e=>patch('intro',e.target.value)}/></label>
      <label>Leistungen<textarea rows={5} value={(data.services||[]).join('\\n')} onChange={e=>patch('services',e.target.value.split('\\n').filter(Boolean))}/></label>
      <label>Firmen-Telefon<input value={data.phone} onChange={e=>patch('phone',e.target.value)}/></label>
      <label>Firmen-E-Mail<input value={data.email} onChange={e=>patch('email',e.target.value)}/></label>
      <label>Website<input value={data.website} onChange={e=>patch('website',e.target.value)}/></label>
      <label>Instagram<input value={data.instagram} onChange={e=>patch('instagram',e.target.value)}/></label>
      <label>Adresse<input value={data.address} onChange={e=>patch('address',e.target.value)}/></label>
      <label>Inhaber<input value={data.owner} onChange={e=>patch('owner',e.target.value)}/></label>
      <div className="pixva-site-logo-preview"><span>{data.exampleMode?'Beispiel-Logo':'Firmenlogo'}</span><img src={data.logo} alt="Logo"/></div>
      <button onClick={save}><Save size={17}/>Speichern</button>
      <button className="primary-btn" onClick={()=>downloadText(`${projectName.replace(/\W+/g,'-')||'website'}.html`,source,'text/html')}><Download size={17}/>HTML exportieren</button>
      <div className="status-line">{status}</div>
    </aside>
    <div className="site-preview"><div className="browser-bar"><i/><i/><i/><span>Live-Vorschau · automatisch</span></div><iframe title="Website Vorschau" srcDoc={source}/></div>
  </section>;
}
