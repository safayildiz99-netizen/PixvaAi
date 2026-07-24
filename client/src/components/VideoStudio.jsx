import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Film, Plus, Save, Trash2, Upload } from 'lucide-react';
import { api } from '../api.js';

function newScene(index) {
  return { id: crypto.randomUUID(), title: `Abschnitt ${index + 1}`, prompt: 'Beschreibe hier Inhalt, Text und Übergang dieses Abschnitts.', duration: 4, url: '', fileName: '', status: '' };
}

export default function VideoStudio({ project, onSaved, canSave = true }) {
  const [projectName, setProjectName] = useState(project?.name || 'Neues Werbevideo');
  const [projectId, setProjectId] = useState(project?.id || '');
  const [scenes, setScenes] = useState(project?.data?.scenes?.length ? project.data.scenes : [newScene(0), newScene(1)]);
  const [status, setStatus] = useState('Lokaler Videomodus: eigene Clips hochladen und in der Timeline planen.');

  useEffect(() => {
    if (!project) return;
    setProjectName(project.name); setProjectId(project.id);
    setScenes(project.data?.scenes?.length ? project.data.scenes : [newScene(0)]);
  }, [project?.id]);

  const updateScene = (id, patch) => setScenes((old) => old.map((s) => s.id === id ? { ...s, ...patch } : s));
  function moveScene(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes]; [next[index], next[target]] = [next[target], next[index]]; setScenes(next);
  }

  function uploadClip(scene, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (scene.url?.startsWith('blob:')) URL.revokeObjectURL(scene.url);
    const url = URL.createObjectURL(file);
    updateScene(scene.id, { url, fileName: file.name, status: 'Clip lokal geladen.' });
    event.target.value = '';
  }

  async function saveProject() {
    if (!canSave) { setStatus('Zum dauerhaften Speichern bitte anmelden. Lokale Clips und Timeline bleiben im aktuellen Tab nutzbar.'); return; }
    setStatus('Speichern …');
    try {
      const safeScenes = scenes.map(({ url, ...scene }) => ({ ...scene, url: url?.startsWith('blob:') ? '' : url }));
      const payload = { name: projectName, type: 'video', data: { scenes: safeScenes } };
      const result = projectId ? await api(`/api/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(payload) }) : await api('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
      setProjectId(result.project.id); setStatus('Projektplan gespeichert. Lokale Videodateien müssen nach einem Neustart erneut gewählt werden.'); onSaved?.(result.project);
    } catch (error) { setStatus(error.message); }
  }

  return <section className="video-studio">
    <div className="studio-header"><div><h2><Film size={22}/> Kostenloses lokales Video-Studio</h2><p>Keine Video-Credits und keine Zahlungsaufforderung. Eigene Clips hochladen, Abschnitte verschieben und planen.</p></div><div className="header-actions"><input value={projectName} onChange={(e)=>setProjectName(e.target.value)}/><button onClick={saveProject}><Save size={17}/>{canSave?'Speichern':'Anmelden zum Speichern'}</button><button className="primary-btn" onClick={()=>setScenes((old)=>[...old,newScene(old.length)])}><Plus size={17}/>Abschnitt</button></div></div>
    <div className="timeline">{scenes.map((scene,index)=><article className="scene-card" key={scene.id}>
      <div className="scene-index">{index+1}</div>
      <div className="scene-main"><div className="scene-title-row"><input value={scene.title} onChange={(e)=>updateScene(scene.id,{title:e.target.value})}/><div className="scene-buttons"><button onClick={()=>moveScene(index,-1)}><ArrowUp size={16}/></button><button onClick={()=>moveScene(index,1)}><ArrowDown size={16}/></button><button onClick={()=>setScenes((old)=>old.filter((x)=>x.id!==scene.id))}><Trash2 size={16}/></button></div></div>
      <textarea value={scene.prompt} onChange={(e)=>updateScene(scene.id,{prompt:e.target.value})} rows={3}/><div className="scene-settings"><label>Dauer<select value={scene.duration} onChange={(e)=>updateScene(scene.id,{duration:Number(e.target.value)})}><option value="2">2 Sek.</option><option value="4">4 Sek.</option><option value="6">6 Sek.</option><option value="8">8 Sek.</option><option value="15">15 Sek.</option></select></label><label className="clip-upload"><Upload size={16}/>Clip hochladen<input type="file" accept="video/*" onChange={(e)=>uploadClip(scene,e)}/></label>{scene.url&&<a className="clip-download" href={scene.url} download={scene.fileName||`clip-${index+1}.mp4`}><Download size={16}/>Clip laden</a>}</div>{scene.status&&<div className="scene-status">{scene.status} {scene.fileName}</div>}</div>
      <div className="scene-preview">{scene.url?<video src={scene.url} controls playsInline/>:<div className="empty-preview"><Film size={30}/>Eigenen Clip wählen</div>}</div>
    </article>)}</div>
    <div className="merge-panel"><div><h3>Warum keine automatische KI-Videoerstellung?</h3><p>Echte Text-zu-Video-Modelle benötigen teure GPU-Rechenleistung. Diese Version entfernt das Zahlungssystem vollständig und konzentriert sich deshalb auf einen kostenlosen lokalen Timeline-Editor.</p></div></div>
    {status&&<div className="status-line">{status}</div>}
  </section>;
}
