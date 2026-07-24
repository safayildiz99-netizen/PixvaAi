import { useEffect, useMemo, useState } from 'react';
import { Download, Globe2, Save, Sparkles } from 'lucide-react';
import { api, downloadText } from '../api.js';

const defaults = {
  company: 'Yildiz Werbetechnik', slogan: 'Wir machen Marken sichtbar.',
  intro: 'Leuchtwerbung, Fahrzeugfolierung, Schilder, Druck und Montage aus einer Hand.',
  services: ['Leuchtwerbung', 'Fahrzeugfolierung', 'Schilder & Beschriftung', 'Druck & Montage'],
  cta: 'Jetzt kostenloses Angebot anfragen', phone: '+49 000 000000', address: 'Stuttgart, Deutschland',
  primary: '#f7c948', dark: '#101010'
};

const esc = (value='') => String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function buildHtml(d) {
  const cards = d.services.map((s,i)=>`<article><b>0${i+1}</b><h3>${esc(s)}</h3><p>Individuelle Planung, hochwertige Umsetzung und zuverlässige Montage.</p></article>`).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.company)}</title><style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f5f4ef;color:${d.dark}}header{min-height:82vh;background:${d.dark};color:white;padding:32px 7vw;display:flex;flex-direction:column}nav{display:flex;justify-content:space-between;font-weight:800}.hero{max-width:920px;margin:auto 0}.hero small{color:${d.primary};letter-spacing:.2em}.hero h1{font-size:clamp(3rem,8vw,7rem);line-height:.9;margin:.25em 0}.hero p{font-size:1.25rem;max-width:680px;color:#c9c9c9}.btn{display:inline-block;background:${d.primary};color:#111;padding:16px 24px;border-radius:999px;text-decoration:none;font-weight:800;margin-top:20px}section{padding:90px 7vw}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}.grid article{background:white;padding:28px;border-radius:18px}.grid b{color:${d.primary}}.contact{background:${d.primary};display:flex;justify-content:space-between;gap:30px;flex-wrap:wrap}.contact h2{font-size:clamp(2rem,6vw,5rem);margin:0}footer{padding:30px 7vw;background:${d.dark};color:#aaa}@media(max-width:700px){header{min-height:70vh}.hero h1{font-size:3.2rem}}
</style></head><body><header><nav><span>${esc(d.company)}</span><span>${esc(d.phone)}</span></nav><div class="hero"><small>WERBETECHNIK · DESIGN · MONTAGE</small><h1>${esc(d.slogan)}</h1><p>${esc(d.intro)}</p><a class="btn" href="#kontakt">${esc(d.cta)}</a></div></header><section><h2>Unsere Leistungen</h2><div class="grid">${cards}</div></section><section class="contact" id="kontakt"><div><h2>${esc(d.cta)}</h2><p>${esc(d.address)}</p></div><div><strong>${esc(d.phone)}</strong><br><span>${esc(d.company)}</span></div></section><footer>© ${new Date().getFullYear()} ${esc(d.company)}</footer></body></html>`;
}

export default function WebsiteBuilder({ project, onSaved, canSave = true }) {
  const [data,setData]=useState(project?.data?.site || defaults);
  const [projectName,setProjectName]=useState(project?.name || 'Neue Firmenwebsite');
  const [projectId,setProjectId]=useState(project?.id || '');
  const [status,setStatus]=useState('');
  const [aiLoading,setAiLoading]=useState(false);
  useEffect(()=>{ if(project){ setData(project.data?.site||defaults); setProjectName(project.name); setProjectId(project.id); } },[project?.id]);
  const html=useMemo(()=>buildHtml(data),[data]);
  const update=(key,value)=>setData((old)=>({...old,[key]:value}));

  async function aiText(){ setAiLoading(true); setStatus('Gemini erstellt Texte …'); try{ const result=await api('/api/ai/chat',{method:'POST',body:JSON.stringify({message:`Schreibe für die Firma ${data.company} einen kurzen starken Slogan und einen Einleitungstext. Antworte exakt in zwei Zeilen: SLOGAN: ... und TEXT: ...`,history:[]})}); const answer=result.answer||''; const sm=answer.match(/SLOGAN:\s*(.*)/i); const tx=answer.match(/TEXT:\s*(.*)/i); setData((o)=>({...o,slogan:sm?.[1]||o.slogan,intro:tx?.[1]||answer})); setStatus('Texte mit Gemini erstellt und übernommen.'); }catch(e){setStatus(e.message)} finally{setAiLoading(false)} }
  async function save(){ if(!canSave){setStatus('Zum dauerhaften Speichern bitte anmelden. HTML-Export funktioniert auch als Gast.');return;} setStatus('Speichern …'); try{ const payload={name:projectName,type:'website',data:{site:data}}; const r=projectId?await api(`/api/projects/${projectId}`,{method:'PUT',body:JSON.stringify(payload)}):await api('/api/projects',{method:'POST',body:JSON.stringify(payload)}); setProjectId(r.project.id); setStatus('Gespeichert'); onSaved?.(r.project);}catch(e){setStatus(e.message)} }

  return <section className="website-builder"><aside className="site-controls"><h2><Globe2 size={21}/> Website-Builder</h2><label>Projektname<input value={projectName} onChange={(e)=>setProjectName(e.target.value)}/></label><label>Firmenname<input value={data.company} onChange={(e)=>update('company',e.target.value)}/></label><label>Slogan<input value={data.slogan} onChange={(e)=>update('slogan',e.target.value)}/></label><label>Einleitung<textarea rows={4} value={data.intro} onChange={(e)=>update('intro',e.target.value)}/></label><label>Leistungen<textarea rows={5} value={data.services.join('\n')} onChange={(e)=>update('services',e.target.value.split('\n').filter(Boolean))}/></label><label>CTA<input value={data.cta} onChange={(e)=>update('cta',e.target.value)}/></label><label>Telefon<input value={data.phone} onChange={(e)=>update('phone',e.target.value)}/></label><label>Adresse<input value={data.address} onChange={(e)=>update('address',e.target.value)}/></label><div className="color-row"><label>Akzent<input type="color" value={data.primary} onChange={(e)=>update('primary',e.target.value)}/></label><label>Dunkel<input type="color" value={data.dark} onChange={(e)=>update('dark',e.target.value)}/></label></div><button onClick={aiText} disabled={aiLoading}><Sparkles size={17}/>{aiLoading?'Gemini schreibt …':'Texte mit Gemini erstellen'}</button><button onClick={save}><Save size={17}/>{canSave?'Speichern':'Anmelden zum Speichern'}</button><button className="primary-btn" onClick={()=>downloadText(`${projectName.replace(/\W+/g,'-')||'website'}.html`,html,'text/html')}><Download size={17}/>HTML exportieren</button>{status&&<div className="status-line">{status}</div>}</aside><div className="site-preview"><div className="browser-bar"><i/><i/><i/><span>Live-Vorschau</span></div><iframe title="Website Vorschau" srcDoc={html}/></div></section>;
}
