import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import {
  ArrowDown, ArrowUp, Download, FileArchive, FileImage, FileText, Film,
  ImagePlus, LoaderCircle, Music2, Plus, Save, Sparkles, Trash2, Upload
} from 'lucide-react';
import { api } from '../api.js';

const formats = {
  story: { label: '9:16 · Story/Reel', width: 720, height: 1280 },
  landscape: { label: '16:9 · YouTube/Website', width: 1280, height: 720 },
  square: { label: '1:1 · Quadrat', width: 900, height: 900 }
};

function newScene(index) {
  return {
    id: crypto.randomUUID(),
    title: `Abschnitt ${index + 1}`,
    prompt: 'Fotorealistische Werbeszene, hochwertige Beleuchtung und klare Bildkomposition.',
    duration: 4,
    imageUrl: '',
    videoUrl: '',
    fileName: '',
    mediaType: '',
    status: ''
  };
}

function safeName(value, fallback = 'datei') {
  return String(value || fallback).trim().replace(/[^a-z0-9äöüß_-]+/gi, '-').replace(/^-+|-+$/g, '') || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    image.crossOrigin = 'anonymous';
    image.src = url;
  });
}

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error('Videoclip konnte nicht geladen werden.'));
  });
}

function drawCover(ctx, source, width, height, progress = 0) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) return;
  const baseScale = Math.max(width / sourceWidth, height / sourceHeight);
  const zoom = 1 + progress * 0.06;
  const drawWidth = sourceWidth * baseScale * zoom;
  const drawHeight = sourceHeight * baseScale * zoom;
  const driftX = Math.sin(progress * Math.PI) * width * 0.025;
  const driftY = Math.cos(progress * Math.PI) * height * 0.018;
  ctx.drawImage(source, (width - drawWidth) / 2 + driftX, (height - drawHeight) / 2 + driftY, drawWidth, drawHeight);
}

function drawEmpty(ctx, width, height, scene) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#071018');
  gradient.addColorStop(.6, '#164466');
  gradient.addColorStop(1, '#ffd400');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  ctx.beginPath();
  ctx.arc(width * .2, height * .2, Math.min(width, height) * .2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `800 ${Math.max(34, width / 18)}px Arial`;
  ctx.fillStyle = '#fff';
  ctx.fillText(scene.title || 'Yildiz AI', width * .08, height * .72);
}

function drawOverlay(ctx, width, height, scene, index, localProgress) {
  const gradient = ctx.createLinearGradient(0, height * .55, 0, height);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,.82)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, height * .45, width, height * .55);

  ctx.fillStyle = '#ffd400';
  ctx.font = `800 ${Math.max(18, width / 36)}px Arial`;
  ctx.fillText(`0${index + 1}`, width * .07, height * .78);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.max(30, width / 18)}px Arial`;
  const title = String(scene.title || `Abschnitt ${index + 1}`).slice(0, 42);
  ctx.fillText(title, width * .07, height * .84, width * .86);
  ctx.fillStyle = 'rgba(255,255,255,.78)';
  ctx.font = `500 ${Math.max(16, width / 38)}px Arial`;
  ctx.fillText('YILDIZ AI · AUTOMATISCHES MEDIENDESIGN', width * .07, height * .9, width * .86);

  const fade = Math.min(1, localProgress / .12, (1 - localProgress) / .12);
  if (fade < 1) {
    ctx.fillStyle = `rgba(7,16,24,${1 - Math.max(0, fade)})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function bestRecorderMime() {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

async function urlToBlob(url) {
  const response = await fetch(url);
  return response.blob();
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function scenePoster(scene, width = 960, height = 540) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (scene.imageUrl) {
    try {
      drawCover(ctx, await loadImage(scene.imageUrl), width, height, .25);
      return canvas.toDataURL('image/jpeg', .88);
    } catch { /* fallback below */ }
  }
  if (scene.videoUrl) {
    try {
      const video = await loadVideo(scene.videoUrl);
      await new Promise((resolve) => {
        video.onseeked = resolve;
        video.currentTime = Math.min(0.2, Math.max(0, video.duration - .05));
      });
      drawCover(ctx, video, width, height, 0);
      return canvas.toDataURL('image/jpeg', .88);
    } catch { /* fallback below */ }
  }
  drawEmpty(ctx, width, height, scene);
  return canvas.toDataURL('image/jpeg', .88);
}

function createGeneratedMusic(audioContext, destination, totalDuration, style) {
  if (style === 'none') return [];
  const master = audioContext.createGain();
  master.gain.value = style === 'dynamic' ? .085 : .055;
  master.connect(destination);
  const notes = style === 'dynamic'
    ? [130.81, 164.81, 196, 246.94, 196, 164.81]
    : [110, 146.83, 164.81, 146.83];
  const step = style === 'dynamic' ? .55 : 1.15;
  const nodes = [];
  for (let time = 0, i = 0; time < totalDuration + 1; time += step, i += 1) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = style === 'dynamic' ? 'triangle' : 'sine';
    oscillator.frequency.value = notes[i % notes.length];
    gain.gain.setValueAtTime(0, audioContext.currentTime + time);
    gain.gain.linearRampToValueAtTime(1, audioContext.currentTime + time + .08);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + time + Math.min(step, .9));
    oscillator.connect(gain).connect(master);
    oscillator.start(audioContext.currentTime + time);
    oscillator.stop(audioContext.currentTime + time + Math.min(step, 1));
    nodes.push(oscillator);
  }
  return nodes;
}

export default function VideoStudio({ project, onSaved, canSave = true }) {
  const [projectName, setProjectName] = useState(project?.name || 'Neues KI-Werbevideo');
  const [projectId, setProjectId] = useState(project?.id || '');
  const [scenes, setScenes] = useState(project?.data?.scenes?.length ? project.data.scenes : [newScene(0), newScene(1), newScene(2)]);
  const [formatKey, setFormatKey] = useState(project?.data?.format || 'story');
  const [musicStyle, setMusicStyle] = useState(project?.data?.musicStyle || 'soft');
  const [musicFile, setMusicFile] = useState(null);
  const [status, setStatus] = useState('Aus Prompts oder eigenen Bildern entsteht ein echtes Video mit Bewegung, Übergängen und Hintergrundmusik.');
  const [rendering, setRendering] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState('');
  const [resultBlob, setResultBlob] = useState(null);
  const [resultExt, setResultExt] = useState('webm');
  const hiddenCanvasRef = useRef(null);
  const format = useMemo(() => formats[formatKey] || formats.story, [formatKey]);
  const totalDuration = useMemo(() => scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0), [scenes]);

  useEffect(() => {
    if (!project) return;
    setProjectName(project.name);
    setProjectId(project.id);
    setScenes(project.data?.scenes?.length ? project.data.scenes : [newScene(0)]);
    setFormatKey(project.data?.format || 'story');
    setMusicStyle(project.data?.musicStyle || 'soft');
  }, [project?.id]);

  const updateScene = (id, patch) => setScenes((old) => old.map((scene) => scene.id === id ? { ...scene, ...patch } : scene));

  function moveScene(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes];
    [next[index], next[target]] = [next[target], next[index]];
    setScenes(next);
  }

  function uploadMedia(scene, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      updateScene(scene.id, { videoUrl: url, imageUrl: '', mediaType: 'video', fileName: file.name, status: 'Videoclip geladen.' });
    } else {
      updateScene(scene.id, { imageUrl: url, videoUrl: '', mediaType: 'image', fileName: file.name, status: 'Bild geladen.' });
    }
    event.target.value = '';
  }

  async function generateSceneImage(scene) {
    updateScene(scene.id, { status: 'KI-Bild wird erstellt …' });
    try {
      const result = await api('/api/ai/image', {
        method: 'POST',
        body: JSON.stringify({ prompt: scene.prompt, aspect: formatKey, style: 'realistic' })
      });
      updateScene(scene.id, {
        imageUrl: result.imageDataUrl,
        videoUrl: '',
        mediaType: 'image',
        fileName: `${safeName(scene.title, 'szene')}.png`,
        status: result.fallback ? 'Lokales Ersatzmotiv erstellt.' : `KI-Bild erstellt · ${result.provider || 'Bildmodell'}`
      });
    } catch (error) {
      updateScene(scene.id, { status: error.message });
    }
  }

  async function generateAllImages() {
    setGeneratingAll(true);
    setStatus('Yildiz AI erstellt die Szenenbilder nacheinander …');
    try {
      for (const scene of scenes) {
        if (!scene.imageUrl && !scene.videoUrl) await generateSceneImage(scene);
      }
      setStatus('Alle fehlenden Szenenbilder wurden erstellt. Jetzt kannst du das Video rendern.');
    } finally {
      setGeneratingAll(false);
    }
  }

  async function saveProject() {
    if (!canSave) {
      setStatus('Zum dauerhaften Speichern bitte anmelden. ZIP-, PDF- und Videoexport funktionieren auch als Gast.');
      return;
    }
    setStatus('Speichern …');
    try {
      const safeScenes = scenes.map((scene) => ({
        ...scene,
        imageUrl: scene.imageUrl?.startsWith('blob:') ? '' : scene.imageUrl,
        videoUrl: scene.videoUrl?.startsWith('blob:') ? '' : scene.videoUrl
      }));
      const payload = { name: projectName, type: 'video', data: { scenes: safeScenes, format: formatKey, musicStyle } };
      const result = projectId
        ? await api(`/api/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await api('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
      setProjectId(result.project.id);
      setStatus('Projekt gespeichert. Lokale Upload-Dateien bei Bedarf zusätzlich als ZIP sichern.');
      onSaved?.(result.project);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function renderVideo() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      setStatus('Dieser Browser kann kein Video direkt rendern. Nutze den PDF-/PNG-/ZIP-Fallback.');
      return;
    }
    if (!scenes.length) return;
    setRendering(true);
    setProgress(0);
    setStatus('Video wird in Echtzeit gerendert. Tab bitte offen lassen …');

    let audioContext;
    let customAudioSource;
    try {
      const canvas = hiddenCanvasRef.current;
      canvas.width = format.width;
      canvas.height = format.height;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(30);

      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      const destination = audioContext.createMediaStreamDestination();
      if (musicFile) {
        const audioBuffer = await audioContext.decodeAudioData(await musicFile.arrayBuffer());
        customAudioSource = audioContext.createBufferSource();
        customAudioSource.buffer = audioBuffer;
        customAudioSource.loop = true;
        const gain = audioContext.createGain();
        gain.gain.value = .22;
        customAudioSource.connect(gain).connect(destination);
        customAudioSource.start();
      } else {
        createGeneratedMusic(audioContext, destination, totalDuration, musicStyle);
      }
      destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

      const mimeType = bestRecorderMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start(500);

      let elapsed = 0;
      for (let index = 0; index < scenes.length; index += 1) {
        const scene = scenes[index];
        const duration = Math.max(1, Number(scene.duration || 4));
        let image = null;
        let video = null;
        if (scene.imageUrl) {
          try { image = await loadImage(scene.imageUrl); } catch { image = null; }
        } else if (scene.videoUrl) {
          try { video = await loadVideo(scene.videoUrl); await video.play(); } catch { video = null; }
        }

        const start = performance.now();
        await new Promise((resolve) => {
          const frame = () => {
            const localSeconds = (performance.now() - start) / 1000;
            const localProgress = Math.min(1, localSeconds / duration);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (image) drawCover(ctx, image, canvas.width, canvas.height, localProgress);
            else if (video && video.readyState >= 2) drawCover(ctx, video, canvas.width, canvas.height, localProgress);
            else drawEmpty(ctx, canvas.width, canvas.height, scene);
            drawOverlay(ctx, canvas.width, canvas.height, scene, index, localProgress);
            setProgress(Math.round(((elapsed + Math.min(localSeconds, duration)) / Math.max(1, totalDuration)) * 100));
            if (localSeconds < duration) requestAnimationFrame(frame);
            else resolve();
          };
          frame();
        });
        elapsed += duration;
        if (video) video.pause();
      }

      recorder.stop();
      await stopped;
      try { customAudioSource?.stop(); } catch {}
      customAudioSource = null;
      const finalMime = recorder.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: finalMime });
      const extension = finalMime.includes('mp4') ? 'mp4' : 'webm';
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultBlob(blob);
      setResultExt(extension);
      setProgress(100);
      setStatus(extension === 'mp4'
        ? 'Video als MP4 fertig – inklusive Bilder, Übergänge und Musik.'
        : 'Video fertig. Dein Browser hat WebM statt MP4 erzeugt; PDF-, PNG- und ZIP-Fallbacks sind ebenfalls verfügbar.');
    } catch (error) {
      setStatus(`Videorendering fehlgeschlagen: ${error.message}. Nutze PDF-, PNG- oder ZIP-Export als Fallback.`);
    } finally {
      setRendering(false);
      try { customAudioSource?.stop?.(); } catch {}
      try { audioContext?.close?.(); } catch {}
    }
  }

  async function createStoryboardPdf(returnBlob = false) {
    setStatus('Storyboard-PDF wird erstellt …');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    for (let index = 0; index < scenes.length; index += 1) {
      if (index) doc.addPage('a4', 'landscape');
      const scene = scenes[index];
      const poster = await scenePoster(scene);
      doc.setFillColor(7, 16, 24);
      doc.rect(0, 0, 297, 210, 'F');
      doc.addImage(poster, 'JPEG', 12, 12, 186, 105);
      doc.setTextColor(255, 212, 0);
      doc.setFontSize(12);
      doc.text(`SZENE ${index + 1} · ${scene.duration} SEKUNDEN`, 207, 24);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text(String(scene.title || `Abschnitt ${index + 1}`).slice(0, 48), 207, 38, { maxWidth: 78 });
      doc.setTextColor(205, 220, 230);
      doc.setFontSize(11);
      doc.text(String(scene.prompt || ''), 207, 58, { maxWidth: 76 });
      doc.setFontSize(10);
      doc.text(`Projekt: ${projectName}\nFormat: ${format.label}\nMusik: ${musicFile?.name || musicStyle}`, 12, 135);
    }
    const blob = doc.output('blob');
    if (returnBlob) return blob;
    downloadBlob(blob, `${safeName(projectName, 'storyboard')}.pdf`);
    setStatus('Storyboard-PDF heruntergeladen.');
  }

  async function downloadPngFrames() {
    setStatus('PNG-Szenen werden vorbereitet …');
    const zip = new JSZip();
    for (let index = 0; index < scenes.length; index += 1) {
      const poster = await scenePoster(scenes[index], format.width, format.height);
      zip.file(`szene-${String(index + 1).padStart(2, '0')}.png`, poster.split(',')[1], { base64: true });
    }
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `${safeName(projectName)}-png-szenen.zip`);
    setStatus('PNG-Szenen als ZIP heruntergeladen.');
  }

  async function exportProjectZip() {
    setStatus('Projekt-ZIP wird erstellt …');
    const zip = new JSZip();
    zip.file('projekt.json', JSON.stringify({ projectName, format: formatKey, musicStyle, scenes }, null, 2));
    zip.file('README.txt', 'Yildiz AI Medienprojekt\nEnthält Projektdatei, Szenenbilder, Storyboard und – falls bereits gerendert – das Video.');
    const media = zip.folder('medien');
    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      if (scene.imageUrl) {
        try { media.file(`szene-${index + 1}.png`, await urlToBlob(scene.imageUrl)); } catch { /* skip */ }
      }
      if (scene.videoUrl) {
        try { media.file(`clip-${index + 1}-${safeName(scene.fileName, 'video')}`, await urlToBlob(scene.videoUrl)); } catch { /* skip */ }
      }
    }
    zip.file('storyboard.pdf', await createStoryboardPdf(true));
    if (resultBlob) zip.file(`${safeName(projectName)}.${resultExt}`, resultBlob);
    if (musicFile) zip.file(`musik-${safeName(musicFile.name, 'audio')}`, musicFile);
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `${safeName(projectName)}-projekt.zip`);
    setStatus('Komplettes Projekt als ZIP heruntergeladen.');
  }

  return (
    <section className="video-studio advanced-video">
      <div className="studio-header">
        <div><h2><Film size={22}/> KI-Video-Studio</h2><p>Prompts oder eigene Medien → animiertes Video mit Übergängen und Hintergrundmusik.</p></div>
        <div className="header-actions"><input value={projectName} onChange={(e) => setProjectName(e.target.value)}/><button onClick={saveProject}><Save size={17}/>{canSave ? 'Speichern' : 'Anmelden zum Speichern'}</button><button className="primary-btn" onClick={() => setScenes((old) => [...old, newScene(old.length)])}><Plus size={17}/>Abschnitt</button></div>
      </div>

      <div className="video-global-controls">
        <label>Videoformat<select value={formatKey} onChange={(e) => setFormatKey(e.target.value)}>{Object.entries(formats).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        <label>Hintergrundmusik<select value={musicStyle} onChange={(e) => setMusicStyle(e.target.value)}><option value="soft">Sanft automatisch</option><option value="dynamic">Dynamisch automatisch</option><option value="none">Keine Musik</option></select></label>
        <label className="clip-upload"><Music2 size={16}/>Eigene Musik<input type="file" accept="audio/*" onChange={(e) => setMusicFile(e.target.files?.[0] || null)}/></label>
        <button onClick={generateAllImages} disabled={generatingAll}>{generatingAll ? <LoaderCircle className="spin" size={17}/> : <Sparkles size={17}/>}Alle Szenenbilder</button>
        <span className="duration-pill">{totalDuration} Sek.</span>
      </div>

      <div className="timeline">
        {scenes.map((scene, index) => <article className="scene-card" key={scene.id}>
          <div className="scene-index">{index + 1}</div>
          <div className="scene-main">
            <div className="scene-title-row"><input value={scene.title} onChange={(e) => updateScene(scene.id, { title: e.target.value })}/><div className="scene-buttons"><button onClick={() => moveScene(index, -1)}><ArrowUp size={16}/></button><button onClick={() => moveScene(index, 1)}><ArrowDown size={16}/></button><button onClick={() => setScenes((old) => old.filter((item) => item.id !== scene.id))}><Trash2 size={16}/></button></div></div>
            <textarea value={scene.prompt} onChange={(e) => updateScene(scene.id, { prompt: e.target.value })} rows={3}/>
            <div className="scene-settings">
              <label>Dauer<select value={scene.duration} onChange={(e) => updateScene(scene.id, { duration: Number(e.target.value) })}><option value="2">2 Sek.</option><option value="4">4 Sek.</option><option value="6">6 Sek.</option><option value="8">8 Sek.</option></select></label>
              <label className="clip-upload"><Upload size={16}/>Bild/Video<input type="file" accept="image/*,video/*" onChange={(e) => uploadMedia(scene, e)}/></label>
              <button onClick={() => generateSceneImage(scene)}><ImagePlus size={16}/>KI-Bild</button>
            </div>
            {scene.status && <div className="scene-status">{scene.status} {scene.fileName}</div>}
          </div>
          <div className="scene-preview">{scene.videoUrl ? <video src={scene.videoUrl} controls playsInline/> : scene.imageUrl ? <img src={scene.imageUrl} alt={scene.title}/> : <div className="empty-preview"><FileImage size={30}/>Bild hochladen oder erzeugen</div>}</div>
        </article>)}
      </div>

      <div className="render-panel">
        <div><h3>Video erstellen</h3><p>Yildiz AI bewegt die Bilder automatisch, setzt Übergänge und fügt Musik hinzu. MP4 wird genutzt, wenn dein Browser es unterstützt; sonst WebM.</p></div>
        <div className="render-actions"><button className="primary-btn" onClick={renderVideo} disabled={rendering}>{rendering ? <LoaderCircle className="spin" size={17}/> : <Film size={17}/>} {rendering ? `Rendering ${progress}%` : 'Video rendern'}</button><button onClick={() => createStoryboardPdf()}><FileText size={17}/>PDF</button><button onClick={downloadPngFrames}><FileImage size={17}/>PNG</button><button onClick={exportProjectZip}><FileArchive size={17}/>ZIP</button></div>
      </div>
      {rendering && <div className="render-progress"><span style={{ width: `${progress}%` }}/></div>}
      {resultUrl && <div className="video-result"><video src={resultUrl} controls playsInline/><button className="primary-btn" onClick={() => downloadBlob(resultBlob, `${safeName(projectName)}.${resultExt}`)}><Download size={17}/>Video als {resultExt.toUpperCase()} herunterladen</button></div>}
      <canvas ref={hiddenCanvasRef} className="hidden-render-canvas"/>
      {status && <div className="status-line">{status}</div>}
    </section>
  );
}
