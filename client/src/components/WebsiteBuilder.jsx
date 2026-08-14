import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Download, Globe2, RefreshCw, Save, Sparkles } from 'lucide-react';
import { api, downloadText } from '../api.js';

const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const attr=(v='')=>esc(v).replace(/`/g,'&#96;');

function defaultSite(brain,blueprint={}){
  const c=brain?.company||{},d=brain?.defaults||{};
  return{
    company:c.companyName||'',
    companyType:c.companyType||'sonstiges',
    companyTypeOther:c.companyTypeOther||'',
    industryLabel:c.industryLabel||d.label||'Unternehmen',
    ownerName:c.ownerName||'',
    headline:blueprint.headline||d.websiteHeadline||'Professionell. Persönlich. Passend.',
    intro:blueprint.intro||d.websiteIntro||'Leistungen und Kontakt passend zu deiner Firma.',
    services:Array.isArray(blueprint.services)&&blueprint.services.length?blueprint.services:(d.services||[]),
    cta:blueprint.cta||'Jetzt anfragen',
    phone:c.companyPhone||'',
    privatePhone:c.privatePhone||c.personalPhone||'',
    email:c.companyEmail||'',
    personalEmail:c.personalEmail||'',
    address:c.address||'',
    website:c.website||'',
    instagram:c.instagram||'',
    primary:blueprint.primary||c.primaryColor||d.primary||'#7258ff',
    secondary:blueprint.secondary||c.secondaryColor||d.secondary||'#39d6d0',
    dark:'#061722',
    light:'#f7f8fa',
    logoDataUrl:c.logoDataUrl||'',
    logoUrl:c.logoUrl||'',
    logoPath:c.logoPath||'',
    fontFamily:c.fontFamily||'Inter',
    brainVersion:6
  };
}

function mergeSaved(saved,brain,blueprint){
  const base=defaultSite(brain,blueprint);
  if(!saved)return base;
  const generic=!saved.company||['Meine Firma','Yildiz Werbetechnik'].includes(saved.company);
  if(generic)return base;
  return{
    ...base,...saved,
    company:base.company||saved.company,
    companyType:base.companyType||saved.companyType,
    companyTypeOther:base.companyTypeOther||saved.companyTypeOther,
    industryLabel:base.industryLabel||saved.industryLabel,
    ownerName:base.ownerName||saved.ownerName,
    phone:base.phone||saved.phone,
    privatePhone:base.privatePhone||saved.privatePhone,
    email:base.email||saved.email,
    personalEmail:base.personalEmail||saved.personalEmail,
    address:base.address||saved.address,
    website:base.website||saved.website,
    instagram:base.instagram||saved.instagram,
    logoDataUrl:base.logoDataUrl||saved.logoDataUrl,
    logoUrl:base.logoUrl||saved.logoUrl,
    logoPath:base.logoPath||saved.logoPath,
    brainVersion:6
  };
}

function buildHtml(d){
  const logo=d.logoDataUrl||d.logoUrl;
  const brand=logo?`<img class="logo" src="${attr(logo)}" alt="${attr(d.company)} Logo">`:`<strong class="brand">${esc(d.company||'Firma')}</strong>`;
  const links=[
    d.phone&&`<a href="tel:${attr(d.phone)}">${esc(d.phone)}</a>`,
    d.email&&`<a href="mailto:${attr(d.email)}">${esc(d.email)}</a>`,
    d.website&&`<a href="${attr(/^https?:\/\//i.test(d.website)?d.website:`https://${d.website}`)}">${esc(d.website)}</a>`,
    d.instagram&&`<span>${esc(d.instagram)}</span>`
  ].filter(Boolean).join('');
  const services=(d.services||[]).map((s,i)=>`<article><b>0${i+1}</b><h3>${esc(s)}</h3><p>Passend zu ${esc(d.company||'deiner Firma')} und deiner Branche.</p></article>`).join('');
  const footerContact=[d.phone,d.email,d.website,d.instagram].filter(Boolean).map(esc).join(' · ');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.company||'Website')}</title><style>
*{box-sizing:border-box}body{margin:0;font-family:${esc(d.fontFamily||'Inter')},Arial,sans-serif;background:${d.light};color:${d.dark}}header{min-height:82vh;background:${d.dark};color:white;padding:28px 6vw;display:flex;flex-direction:column}.top{display:flex;align-items:center;justify-content:space-between;gap:20px}.logo{max-width:210px;max-height:90px;object-fit:contain;background:white;padding:8px;border-radius:14px}.brand{font-size:24px}.links{display:flex;gap:14px;flex-wrap:wrap;justify-content:flex-end}.links a,.links span{color:white;text-decoration:none;font-weight:700}.hero{margin:auto 0;max-width:1020px}.industry{color:${d.secondary};letter-spacing:.18em;font-weight:900;text-transform:uppercase}.hero h1{font-size:clamp(3rem,7vw,7.2rem);line-height:.93;margin:.24em 0}.hero p{font-size:1.28rem;max-width:760px;color:#c6d2da}.btn{display:inline-block;background:${d.primary};color:white;text-decoration:none;padding:16px 25px;border-radius:999px;font-weight:900;margin-top:18px}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:32px}.fact{padding:13px;border:1px solid #ffffff24;border-radius:12px}.fact small{display:block;color:#8fa9b8}.services{padding:78px 6vw}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}.grid article{background:white;border-radius:18px;padding:26px;box-shadow:0 18px 55px #0000000c}.grid b{color:${d.primary}}.contact{padding:76px 6vw;background:${d.primary};color:white;display:grid;grid-template-columns:1.1fr 1fr;gap:35px}.contact h2{font-size:clamp(2.5rem,5vw,5rem);margin:0}.contact-list{display:grid;gap:10px}.contact-list a,.contact-list span{color:white;text-decoration:none;font-weight:800}footer{background:${d.dark};color:#9cb0bb;padding:26px 6vw;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}@media(max-width:760px){.top{align-items:flex-start;flex-direction:column}.links{justify-content:flex-start}.contact{grid-template-columns:1fr}.hero h1{font-size:3.5rem}}
</style></head><body><header><div class="top">${brand}<div class="links">${links}</div></div><div class="hero"><div class="industry">${esc(d.industryLabel)}</div><h1>${esc(d.headline)}</h1><p>${esc(d.intro)}</p><a class="btn" href="#kontakt">${esc(d.cta)}</a><div class="facts">${d.ownerName?`<div class="fact"><small>Ansprechpartner</small><b>${esc(d.ownerName)}</b></div>`:''}${d.address?`<div class="fact"><small>Adresse</small><b>${esc(d.address)}</b></div>`:''}${d.phone?`<div class="fact"><small>Telefon</small><b>${esc(d.phone)}</b></div>`:''}${d.email?`<div class="fact"><small>E-Mail</small><b>${esc(d.email)}</b></div>`:''}</div></div></header><section class="services"><h2>Unsere Leistungen</h2><div class="grid">${services}</div></section><section class="contact" id="kontakt"><div><h2>${esc(d.cta)}</h2><p>${esc(d.company)}</p><p>${esc(d.address)}</p></div><div class="contact-list">${links}</div></section><footer><span>© ${new Date().getFullYear()} ${esc(d.company)}</span><span>${footerContact}</span></footer></body></html>`;
}

export default function WebsiteBuilder({project,onSaved}){
  const [brain,setBrain]=useState(null);
  const [data,setData]=useState(null);
  const [projectName,setProjectName]=useState(project?.name||'Firmenwebsite');
  const [projectId,setProjectId]=useState(project?.id||'');
  const [status,setStatus]=useState('PIXVA Brain lädt Firmenprofil …');
  const [aiLoading,setAiLoading]=useState(false);

  async function loadBrain(forceAI=false){
    setStatus('PIXVA Brain liest Firmenprofil, Branche, Logo und Kontakte …');
    try{
      const b=await api('/api/pixva?action=brain-context');
      setBrain(b);
      let blueprint={};
      if(b.isCompany){
        try{
          const r=await api('/api/pixva?action=brain-blueprint',{method:'POST',body:JSON.stringify({target:'website',instruction:forceAI?'Website komplett neu planen':'Website automatisch auf Firmenprofil abstimmen'})});
          blueprint=r.blueprint||{};
        }catch{}
      }
      setData(old=>mergeSaved(project?.data?.site||old,b,blueprint));
      if(b.company?.companyName&&!project?.id)setProjectName(`Website – ${b.company.companyName}`);
      if(b.isCompany&&b.missing?.length)setStatus(`Firmenprofil unvollständig: ${b.missing.join(', ')}`);
      else setStatus(`PIXVA Brain aktiv · ${b.company?.companyName||'Privatkonto'} · ${b.company?.industryLabel||''} · ${b.company?.logoDataUrl||b.company?.logoUrl?'Logo aktiv':'kein Logo'}`);
    }catch(e){setStatus(`Firmenprofil konnte nicht geladen werden: ${e.message}`)}
  }

  useEffect(()=>{loadBrain(false)},[project?.id]);

  const html=useMemo(()=>buildHtml(data||defaultSite(brain||{})),[data,brain]);
  const update=(key,value)=>setData(old=>({...old,[key]:value}));

  async function aiRebuild(){
    setAiLoading(true);
    await loadBrain(true);
    setAiLoading(false);
  }

  async function save(){
    if(!data)return;
    setStatus('Speichern …');
    try{
      const payload={name:projectName,type:'website',data:{site:data,pixvaBrainVersion:6}};
      const r=projectId?await api(`/api/projects/${projectId}`,{method:'PUT',body:JSON.stringify(payload)}):await api('/api/projects',{method:'POST',body:JSON.stringify(payload)});
      setProjectId(r.project.id);setStatus('Gespeichert');onSaved?.(r.project);
    }catch(e){setStatus(e.message)}
  }

  if(!data)return <section className="website-builder"><aside className="site-controls"><h2><BrainCircuit/>PIXVA Website Brain</h2><div className="status-line">{status}</div></aside><div className="site-preview"/></section>;

  return <section className="website-builder">
    <aside className="site-controls">
      <h2><Globe2 size={21}/> Website-Builder</h2>
      <div className="pixva-brain-chip"><BrainCircuit size={16}/>PIXVA Brain ist in diesem Modul aktiv</div>
      <button className="primary-btn" onClick={aiRebuild} disabled={aiLoading}><RefreshCw size={16}/>{aiLoading?'PIXVA plant …':'Website automatisch aus Firmenprofil erstellen'}</button>
      <label>Projektname<input value={projectName} onChange={e=>setProjectName(e.target.value)}/></label>
      <label>Firmenname<input value={data.company||''} onChange={e=>update('company',e.target.value)}/></label>
      <label>Branche<input value={data.industryLabel||''} readOnly/></label>
      <label>Slogan<input value={data.headline||''} onChange={e=>update('headline',e.target.value)}/></label>
      <label>Einleitung<textarea rows={4} value={data.intro||''} onChange={e=>update('intro',e.target.value)}/></label>
      <label>Leistungen<textarea rows={5} value={(data.services||[]).join('\n')} onChange={e=>update('services',e.target.value.split('\n').filter(Boolean))}/></label>
      <label>CTA<input value={data.cta||''} onChange={e=>update('cta',e.target.value)}/></label>
      <label>Firmen-Telefon<input value={data.phone||''} onChange={e=>update('phone',e.target.value)}/></label>
      <label>Firmen-E-Mail<input value={data.email||''} onChange={e=>update('email',e.target.value)}/></label>
      <label>Website<input value={data.website||''} onChange={e=>update('website',e.target.value)}/></label>
      <label>Instagram<input value={data.instagram||''} onChange={e=>update('instagram',e.target.value)}/></label>
      <label>Adresse<input value={data.address||''} onChange={e=>update('address',e.target.value)}/></label>
      <label>Inhaber / Ansprechpartner<input value={data.ownerName||''} onChange={e=>update('ownerName',e.target.value)}/></label>
      {(data.logoDataUrl||data.logoUrl)&&<div className="pixva-site-logo-preview"><span>Aktives Firmenlogo</span><img src={data.logoDataUrl||data.logoUrl} alt="Firmenlogo"/></div>}
      <button onClick={save}><Save size={17}/>Speichern</button>
      <button className="primary-btn" onClick={()=>downloadText(`${projectName.replace(/\W+/g,'-')||'website'}.html`,html,'text/html')}><Download size={17}/>HTML exportieren</button>
      {status&&<div className="status-line">{status}</div>}
    </aside>
    <div className="site-preview"><div className="browser-bar"><i/><i/><i/><span>Live-Vorschau · PIXVA Brain</span></div><iframe title="Website Vorschau" srcDoc={html}/></div>
  </section>;
}
