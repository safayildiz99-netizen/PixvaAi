import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Film, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api.js';

function newScene(index) {
  return { id: crypto.randomUUID(), title: `Abschnitt ${index + 1}`, prompt: 'Moderne Werbetechnik-Firma bei der Montage einer hochwertigen Leuchtreklame, dynamische Kamerafahrt, realistisch', duration: 4, model: 'wan', url: '', status: '' };
}

export default function VideoStudio({ project, onSaved }) {
  const [projectName, setProjectName] = useState(project?.name || 'Neues Werbevideo');
  const [projectId, setProjectId] = useState(project?.id || '');
  const [scenes, setScenes] = useState(project?.data?.scenes?.length ? project.data.scenes : [newScene(0), newScene(1)]);
  const [mergedUrl, setMergedUrl] = useState(project?.data?.mergedUrl || '');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!project) return;
    setProjectName(project.name); setProjectId(project.id);
    setScenes(project.data?.scenes?.length ? project.data.scenes : [newScene(0)]);
    setMergedUrl(project.data?.mergedUrl || '');
  }, [project?.id]);

  const updateScene = (id, patch) => setScenes((old) => old.map((s) => s.id === id ? { ...s, ...patch } : s));
  function moveScene(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes]; [next[index], next[target]] = [next[target], next[index]]; setScenes(next);
  }

  async function generate(scene) {
    updateScene(scene.id, { status: 'Video wird generiert …' });
    try {
      const result = await api('/api/ai/video', { method: 'POST', body: JSON.stringify({ prompt: scene.prompt, duration: Number(scene.duration), model: scene.model, width: 720, height: 1280 }) });
      updateScene(scene.id, { url: result.url, status: 'Fertig' });
    } catch (error) { updateScene(scene.id, { status: error.message }); }
  }

  async function mergeVideos() {
    const urls = scenes.map((s) => s.url).filter(Boolean);
    if (!urls.length) return setStatus('Erst mindestens einen Abschnitt generieren.');
    setStatus('Abschnitte werden zusammengefügt …');
    try { const result = await api('/api/video/merge', { method: 'POST', body: JSON.stringify({ urls }) }); setMergedUrl(result.url); setStatus('Gesamtvideo ist fertig.'); }
    catch (error) { setStatus(error.message); }
  }

  async function saveProject() {
    setStatus('Speichern …');
    try {
      const payload = { name: projectName, type: 'video', data: { scenes, mergedUrl } };
      const result = projectId ? await api(`/api/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(payload) }) : await api('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
      setProjectId(result.project.id); setStatus('Gespeichert'); onSaved?.(result.project);
    } catch (error) { setStatus(error.message); }
  }

  return <section className="video-studio">
    <div className="studio-header"><div><h2><Film size={22}/> Video-Studio mit sichtbarer Timeline</h2><p>Jeder Abschnitt bleibt einzeln sichtbar, verschiebbar und editierbar.</p></div><div className="header-actions"><input value={projectName} onChange={(e)=>setProjectName(e.target.value)}/><button onClick={saveProject}><Save size={17}/>Speichern</button><button className="primary-btn" onClick={()=>setScenes((old)=>[...old,newScene(old.length)])}><Plus size={17}/>Abschnitt</button></div></div>
    <div className="timeline">{scenes.map((scene,index)=><article className="scene-card" key={scene.id}>
      <div className="scene-index">{index+1}</div>
      <div className="scene-main"><div className="scene-title-row"><input value={scene.title} onChange={(e)=>updateScene(scene.id,{title:e.target.value})}/><div className="scene-buttons"><button onClick={()=>moveScene(index,-1)}><ArrowUp size={16}/></button><button onClick={()=>moveScene(index,1)}><ArrowDown size={16}/></button><button onClick={()=>setScenes((old)=>old.filter((x)=>x.id!==scene.id))}><Trash2 size={16}/></button></div></div>
      <textarea value={scene.prompt} onChange={(e)=>updateScene(scene.id,{prompt:e.target.value})} rows={3}/><div className="scene-settings"><label>Dauer<select value={scene.duration} onChange={(e)=>updateScene(scene.id,{duration:Number(e.target.value)})}><option value="2">2 Sek.</option><option value="4">4 Sek.</option><option value="6">6 Sek.</option><option value="8">8 Sek.</option></select></label><label>Modell<select value={scene.model} onChange={(e)=>updateScene(scene.id,{model:e.target.value})}><option value="wan">Wan</option><option value="wan-fast">Wan Fast</option><option value="seedance">Seedance</option><option value="veo">Veo</option></select></label><button className="primary-btn" onClick={()=>generate(scene)}><Sparkles size={16}/>Generieren</button></div>{scene.status&&<div className="scene-status">{scene.status}</div>}</div>
      <div className="scene-preview">{scene.url?<video src={scene.url} controls playsInline/>:<div className="empty-preview"><Film size={30}/>Noch kein Clip</div>}</div>
    </article>)}</div>
    <div className="merge-panel"><div><h3>Gesamtvideo</h3><p>Einzelne Clips erzeugen, speichern und herunterladen. Das automatische Zusammenfügen ist auf dem kostenlosen Vercel-Tarif noch nicht aktiviert.</p></div><button className="primary-btn" onClick={mergeVideos}><Film size={17}/>MP4 zusammenfügen</button></div>
    {status&&<div className="status-line">{status}</div>}{mergedUrl&&<div className="merged-result"><video src={mergedUrl} controls playsInline/><a className="primary-btn" href={mergedUrl} download><Download size={17}/>Gesamtvideo herunterladen</a></div>}
  </section>;
}
