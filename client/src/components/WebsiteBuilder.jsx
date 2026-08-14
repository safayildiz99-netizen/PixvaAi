import { useEffect, useMemo, useState } from 'react';
import { Download, Globe2, Save, Sparkles } from 'lucide-react';
import { api, downloadText } from '../api.js';

const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const attr=(v='')=>esc(v).replace(/`/g,'&#96;');

function themeFor(type,brand={}){
  if(type==='supermarkt')return{
    label:'SUPERMARKT · FRISCHE · ANGEBOTE',primary:'#e4312b',secondary:'#0d6a46',dark:'#062d25',light:'#fff8e8',
    slogan:`Frische, Auswahl und Angebote für jeden Tag.`,
    intro:'Entdecke frische Produkte, starke Wochenangebote und persönliche Beratung.',
    services:['Frische Lebensmittel','Obst & Gemüse','Wochenangebote','Service & Beratung']
  };
  if(type==='elektriker')return{
    label:'ELEKTRO · TECHNIK · SERVICE',primary:'#ffd52a',secondary:'#1594d2',dark:'#061a2a',light:'#f4f9fc',
    slogan:'Sichere Elektrik. Saubere Arbeit. Zuverlässiger Service.',
    intro:'Elektroinstallation, Wartung und moderne Lösungen für Privat- und Gewerbekunden.',
    services:['Elektroinstallation','Modernisierung','Wartung & Prüfung','Service & Beratung']
  };
  if(type==='werbetechnik')return{
    label:'WERBETECHNIK · DESIGN · MONTAGE',primary:'#f7c948',secondary:'#ffffff',dark:'#101010',light:'#f5f4ef',
    slogan:'Wir machen deine Marke sichtbar.',
    intro:'Schilder, Druck, Folierung und Werbetechnik – professionell geplant und umgesetzt.',
    services:['Schilder & Leuchtwerbung','Dibond & Plattendruck','Folierung & Beschriftung','Druck & Montage']
  };
  return{
    label:`${String(brand.company_type_other||'UNTERNEHMEN').toUpperCase()} · SERVICE`,
    primary:brand.primary_color||'#7258ff',secondary:brand.secondary_color||'#39d6d0',dark:'#081722',light:'#f6f8fa',
    slogan:'Professionell. Persönlich. Passend zu deinem Unternehmen.',
    intro:'Leistungen, Beratung und Kontakt – modern präsentiert im Stil deiner Firma.',
    services:['Unsere Leistungen','Persönliche Beratung','Individuelle Lösungen','Kontakt & Service']
  };
}

function siteFromBrand(brand={}){
  const type=brand.company_type||'sonstiges';
  const t=themeFor(type,brand);
  return{
    company:brand.company_name||'Meine Firma',
    companyType:type,
    companyTypeOther:brand.company_type_other||'',
    ownerName:brand.owner_name||'',
    slogan:t.slogan,
    intro:t.intro,
    services:t.services,
    cta:'Jetzt kostenlos anfragen',
    phone:brand.company_phone||'',
    privatePhone:brand.private_phone||'',
    email:brand.company_email||'',
    address:brand.address||'',
    website:brand.website||'',
    instagram:brand.instagram||'',
    primary:t.primary,
    secondary:t.secondary,
    dark:t.dark,
    light:t.light,
    label:t.label,
    logoDataUrl:brand.logo_data_url||'',
    logoPath:brand.logo_path||''
  };
}

function mergeProjectWithBrand(projectSite,brand){
  const fromBrand=siteFromBrand(brand);
  if(!projectSite)return fromBrand;
  const oldPlaceholder=!projectSite.company||/yildiz werbetechnik/i.test(projectSite.company);
  if(oldPlaceholder)return{...fromBrand};
  return{
    ...fromBrand,
    ...projectSite,
    logoDataUrl:projectSite.logoDataUrl||fromBrand.logoDataUrl,
    phone:projectSite.phone||fromBrand.phone,
    email:projectSite.email||fromBrand.email,
    website:projectSite.website||fromBrand.website,
    instagram:projectSite.instagram||fromBrand.instagram,
    address:projectSite.address||fromBrand.address,
    ownerName:projectSite.ownerName||fromBrand.ownerName
  };
}

function buildHtml(d){
  const cards=(d.services||[]).map((s,i)=>`<article><b>0${i+1}</b><h3>${esc(s)}</h3><p>Professionell, zuverlässig und passend zu ${esc(d.company)}.</p></article>`).join('');
  const logo=d.logoDataUrl?`<img class="brand-logo" src="${attr(d.logoDataUrl)}" alt="${attr(d.company)} Logo">`:`<strong class="brand-name">${esc(d.company)}</strong>`;
  const contactItems=[
    d.phone&&`<a href="tel:${attr(d.phone)}">${esc(d.phone)}</a>`,
    d.email&&`<a href="mailto:${attr(d.email)}">${esc(d.email)}</a>`,
    d.website&&`<a href="${attr(/^https?:\/\//i.test(d.website)?d.website:`https://${d.website}`)}">${esc(d.website)}</a>`,
    d.instagram&&`<span>${esc(d.instagram)}</span>`
  ].filter(Boolean).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.company)}</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Arial,sans-serif;background:${d.light};color:${d.dark}}header{min-height:82vh;background:${d.dark};color:white;padding:28px 7vw;display:flex;flex-direction:column}.top{display:flex;align-items:center;justify-content:space-between;gap:22px}.brand-logo{width:min(190px,34vw);height:82px;object-fit:contain;object-position:left center;background:white;border-radius:14px;padding:9px}.brand-name{font-size:22px}.contact-top{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.contact-top a,.contact-top span{color:white;text-decoration:none;font-weight:700}.hero{max-width:980px;margin:auto 0}.hero small{color:${d.primary};letter-spacing:.2em;font-weight:800}.hero h1{font-size:clamp(3rem,8vw,7rem);line-height:.92;margin:.25em 0}.hero p{font-size:1.25rem;max-width:720px;color:#d1d1d1}.btn{display:inline-block;background:${d.primary};color:${d.dark};padding:16px 25px;border-radius:999px;text-decoration:none;font-weight:900;margin-top:20px}section{padding:80px 7vw}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}.grid article{background:white;padding:28px;border-radius:18px;box-shadow:0 14px 40px #0000000c}.grid b{color:${d.primary}}.contact{background:${d.primary};display:grid;grid-template-columns:1.2fr 1fr;gap:35px;align-items:center}.contact h2{font-size:clamp(2rem,5vw,4.4rem);margin:0}.contact-list{display:grid;gap:9px}.contact-list a,.contact-list span{color:${d.dark};text-decoration:none;font-weight:800}.owner{opacity:.75}footer{padding:28px 7vw;background:${d.dark};color:#aaa;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}@media(max-width:760px){header{min-height:72vh}.top{align-items:flex-start;flex-direction:column}.contact{grid-template-columns:1fr}.hero h1{font-size:3.2rem}}
</style></head><body><header><div class="top">${logo}<div class="contact-top">${contactItems}</div></div><div class="hero"><small>${esc(d.label||'UNTERNEHMEN')}</small><h1>${esc(d.slogan)}</h1><p>${esc(d.intro)}</p><a class="btn" href="#kontakt">${esc(d.cta)}</a></div></header><section><h2>Unsere Leistungen</h2><div class="grid">${cards}</div></section><section class="contact" id="kontakt"><div><h2>${esc(d.cta)}</h2><p>${esc(d.address)}</p>${d.ownerName?`<p class="owner">Ansprechpartner: ${esc(d.ownerName)}</p>`:''}</div><div class="contact-list">${contactItems}</div></section><footer><span>© ${new Date().getFullYear()} ${esc(d.company)}</span><span>${esc(d.address)}</span></footer></body></html>`;
}

export default function WebsiteBuilder({project,onSaved}){
  const [brand,setBrand]=useState(null);
  const [data,setData]=useState(()=>project?.data?.site||siteFromBrand({}));
  const [projectName,setProjectName]=useState(project?.name||'Neue Firmenwebsite');
  const [projectId,setProjectId]=useState(project?.id||'');
  const [status,setStatus]=useState('');
  const [aiLoading,setAiLoading]=useState(false);

  useEffect(()=>{
    let alive=true;
    async function loadBrand(){
      try{
        const result=await api('/api/pixva?action=overview');
        if(!alive)return;
        const b=result.brand||{};
        setBrand(b);
        setData(old=>mergeProjectWithBrand(project?.data?.site||old,b));
        if(!project?.id&&b.company_name)setProjectName(`Website – ${b.company_name}`);
      }catch(error){if(alive)setStatus(error.message)}
    }
    loadBrand();
    return()=>{alive=false};
  },[project?.id]);

  useEffect(()=>{
    if(project){
      setProjectId(project.id);
      setProjectName(project.name);
      setData(old=>mergeProjectWithBrand(project.data?.site||old,brand||{}));
    }
  },[project?.id]);

  const html=useMemo(()=>buildHtml(data),[data]);
  const update=(key,value)=>setData(old=>({...old,[key]:value}));

  async function resetToCompany(){
    if(!brand)return;
    setData(siteFromBrand(brand));
    setProjectName(`Website – ${brand.company_name||'Firma'}`);
    setStatus('Firmenprofil übernommen.');
  }

  async function aiText(){
    setAiLoading(true);setStatus('PIXVA erstellt branchengerechte Texte …');
    try{
      const r=await api('/api/ai/chat',{method:'POST',body:JSON.stringify({prompt:`Erstelle für die Firma "${data.company}" aus der Branche "${data.companyType}${data.companyTypeOther?` / ${data.companyTypeOther}`:''}" einen professionellen Website-Slogan und eine kurze Einleitung. Antworte exakt:
SLOGAN: ...
TEXT: ...
Nutze keine erfundenen Firmendaten.`})});
      const sm=r.answer.match(/SLOGAN:\s*(.*)/i),tx=r.answer.match(/TEXT:\s*([\s\S]*)/i);
      setData(o=>({...o,slogan:sm?.[1]?.trim()||o.slogan,intro:tx?.[1]?.trim()||o.intro}));
      setStatus('Texte übernommen.');
    }catch(e){setStatus(e.message)}finally{setAiLoading(false)}
  }

  async function save(){
    setStatus('Speichern …');
    try{
      const payload={name:projectName,type:'website',data:{site:data,pixvaCompanyTemplate:true}};
      const r=projectId?await api(`/api/projects/${projectId}`,{method:'PUT',body:JSON.stringify(payload)}):await api('/api/projects',{method:'POST',body:JSON.stringify(payload)});
      setProjectId(r.project.id);setStatus('Gespeichert');onSaved?.(r.project);
    }catch(e){setStatus(e.message)}
  }

  return <section className="website-builder">
    <aside className="site-controls">
      <h2><Globe2 size={21}/> Website-Builder</h2>
      <button className="primary-btn" onClick={resetToCompany}>Firmenprofil & Theme übernehmen</button>
      <label>Projektname<input value={projectName} onChange={e=>setProjectName(e.target.value)}/></label>
      <label>Firmenname<input value={data.company||''} onChange={e=>update('company',e.target.value)}/></label>
      <label>Branche<select value={data.companyType||'sonstiges'} onChange={e=>{const type=e.target.value;const t=themeFor(type,{...brand,company_type_other:data.companyTypeOther});setData(o=>({...o,companyType:type,label:t.label,primary:t.primary,secondary:t.secondary,dark:t.dark,light:t.light,slogan:t.slogan,intro:t.intro,services:t.services}))}}><option value="supermarkt">Supermarkt</option><option value="werbetechnik">Werbetechnik</option><option value="elektriker">Elektriker</option><option value="sonstiges">Sonstiges</option></select></label>
      <label>Slogan<input value={data.slogan||''} onChange={e=>update('slogan',e.target.value)}/></label>
      <label>Einleitung<textarea rows={4} value={data.intro||''} onChange={e=>update('intro',e.target.value)}/></label>
      <label>Leistungen<textarea rows={5} value={(data.services||[]).join('\n')} onChange={e=>update('services',e.target.value.split('\n').filter(Boolean))}/></label>
      <label>CTA<input value={data.cta||''} onChange={e=>update('cta',e.target.value)}/></label>
      <label>Firmen-Telefon<input value={data.phone||''} onChange={e=>update('phone',e.target.value)}/></label>
      <label>Firmen-E-Mail<input value={data.email||''} onChange={e=>update('email',e.target.value)}/></label>
      <label>Website<input value={data.website||''} onChange={e=>update('website',e.target.value)}/></label>
      <label>Instagram<input value={data.instagram||''} onChange={e=>update('instagram',e.target.value)}/></label>
      <label>Adresse<input value={data.address||''} onChange={e=>update('address',e.target.value)}/></label>
      <label>Inhaber / Ansprechpartner<input value={data.ownerName||''} onChange={e=>update('ownerName',e.target.value)}/></label>
      {data.logoDataUrl&&<div className="pixva-site-logo-preview"><span>Firmenlogo</span><img src={data.logoDataUrl} alt="Firmenlogo"/></div>}
      <div className="color-row"><label>Akzent<input type="color" value={data.primary||'#7258ff'} onChange={e=>update('primary',e.target.value)}/></label><label>Dunkel<input type="color" value={data.dark||'#081722'} onChange={e=>update('dark',e.target.value)}/></label></div>
      <button onClick={aiText} disabled={aiLoading}><Sparkles size={17}/>{aiLoading?'PIXVA schreibt …':'Texte mit PIXVA erstellen'}</button>
      <button onClick={save}><Save size={17}/>Speichern</button>
      <button className="primary-btn" onClick={()=>downloadText(`${projectName.replace(/\W+/g,'-')||'website'}.html`,html,'text/html')}><Download size={17}/>HTML exportieren</button>
      {status&&<div className="status-line">{status}</div>}
    </aside>
    <div className="site-preview"><div className="browser-bar"><i/><i/><i/><span>Live-Vorschau</span></div><iframe title="Website Vorschau" srcDoc={html}/></div>
  </section>;
}
