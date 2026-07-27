import { useEffect, useState } from 'react';
import { FileImage, Film, Globe2, LayoutTemplate, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../api.js';

const icons = { flyer: LayoutTemplate, image: FileImage, video: Film, website: Globe2 };
const labels = { flyer: 'Flyer', image: 'Bilddesign', video: 'Video', website: 'Website' };

export default function Projects({ onOpen, refreshKey, uiText = {} }) {
  const [projects,setProjects]=useState([]); const [status,setStatus]=useState('');
  async function load(){ setStatus('Laden …'); try{ const r=await api('/api/projects'); setProjects(r.projects); setStatus(''); }catch(e){setStatus(e.message)} }
  useEffect(()=>{load()},[refreshKey]);
  async function remove(project){ if(!confirm(`„${project.name}“ löschen?`)) return; try{await api(`/api/projects/${project.id}`,{method:'DELETE'}); load();}catch(e){setStatus(e.message)} }
  return <section className="projects-page"><div className="page-heading"><div><h2>{uiText.projectsTitle || 'Projekte'}</h2><p>{uiText.projectsSubtitle || 'Deine gespeicherten Designs, Videos und Webseiten.'}</p></div><button onClick={load}><RefreshCw size={17}/>Aktualisieren</button></div>{status&&<div className="status-line">{status}</div>}<div className="project-grid">{projects.map((project)=>{const Icon=icons[project.type]||LayoutTemplate;return <article className="project-card" key={project.id} onClick={()=>onOpen(project)}><div className="project-icon"><Icon size={28}/></div><div><span>{labels[project.type]||project.type}</span><h3>{project.name}</h3><p>{new Date(project.updatedAt).toLocaleString('de-DE')}</p></div><button className="danger-icon" onClick={(e)=>{e.stopPropagation();remove(project)}}><Trash2 size={17}/></button></article>})}{!projects.length&&!status&&<div className="empty-state">Noch keine Projekte gespeichert.</div>}</div></section>;
}
