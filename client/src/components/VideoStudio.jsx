import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Download, FileArchive, FileImage, FileText, Film,
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
    status: '',
    transition: 'fade',
    animation: 'zoom',
    textPosition: 'bottom',
    textColor: '#ffffff',
    accentColor: '#ffd400',
    overlayOpacity: 0.72,
    fontScale: 1,
    fontFamily: 'Arial',
    fontWeight: 800,
    textAlign: 'left',
    showText: true,
    trimStart: 0,
    mediaScale: 1,
    mediaX: 0,
    mediaY: 0,
    mediaRotation: 0,
    mediaOpacity: 1,
    textX: 7,
    textY: 76
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

function drawCover(ctx, source, width, height, progress = 0, animation = 'zoom', scene = {}) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) return;
  const baseScale = Math.max(width / sourceWidth, height / sourceHeight);
  let animationZoom = 1;
  let driftX = 0;
  let driftY = 0;
  if (animation === 'zoom') animationZoom = 1 + progress * .09;
  if (animation === 'zoom-out') animationZoom = 1.09 - progress * .09;
  if (animation === 'pan-left') driftX = (0.5 - progress) * width * .12;
  if (animation === 'pan-right') driftX = (progress - 0.5) * width * .12;
  if (animation === 'pan-up') driftY = (0.5 - progress) * height * .1;
  const manualScale = Math.max(.25, Number(scene.mediaScale || 1));
  const drawWidth = sourceWidth * baseScale * animationZoom * manualScale;
  const drawHeight = sourceHeight * baseScale * animationZoom * manualScale;
  const manualX = Number(scene.mediaX || 0) / 100 * width;
  const manualY = Number(scene.mediaY || 0) / 100 * height;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, Number(scene.mediaOpacity ?? 1)));
  ctx.translate(width / 2 + driftX + manualX, height / 2 + driftY + manualY);
  ctx.rotate(Number(scene.mediaRotation || 0) * Math.PI / 180);
  ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
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
  if (!scene.showText) return;
  const isTop = scene.textPosition === 'top';
  const gradient = ctx.createLinearGradient(0, isTop ? 0 : height * .45, 0, isTop ? height * .48 : height);
  if (isTop) {
    gradient.addColorStop(0, `rgba(0,0,0,${Number(scene.overlayOpacity ?? .72)})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height * .5);
  } else {
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${Number(scene.overlayOpacity ?? .72)})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, height * .42, width, height * .58);
  }

  const baseY = Math.max(height * .04, Math.min(height * .90, height * (Number(scene.textY ?? (isTop ? 10 : 78)) / 100)));
  const scale = Number(scene.fontScale || 1);
  ctx.fillStyle = scene.accentColor || '#ffd400';
  const family = scene.fontFamily || 'Arial';
  const weight = Number(scene.fontWeight || 800);
  ctx.textAlign = scene.textAlign || 'left';
  const manualTextX = Math.max(3, Math.min(97, Number(scene.textX ?? 7))) / 100 * width;
  const textX = scene.textAlign === 'center' ? manualTextX : scene.textAlign === 'right' ? manualTextX : manualTextX;
  ctx.font = `${weight} ${Math.max(18, width / 36) * scale}px ${family}`;
  ctx.fillText(`0${index + 1}`, textX, baseY);
  ctx.fillStyle = scene.textColor || '#ffffff';
  ctx.font = `${weight} ${Math.max(30, width / 18) * scale}px ${family}`;
  const title = String(scene.title || `Abschnitt ${index + 1}`).slice(0, 42);
  ctx.fillText(title, textX, baseY + height * .06, width * .86);
  ctx.fillStyle = scene.textColor || 'rgba(255,255,255,.78)';
  ctx.globalAlpha = .78;
  ctx.font = `500 ${Math.max(16, width / 38) * scale}px ${family}`;
  ctx.fillText(String(scene.prompt || '').slice(0, 88), textX, baseY + height * .11, width * .86);
  ctx.globalAlpha = 1;

  if (scene.transition === 'fade') {
    const fade = Math.min(1, localProgress / .12, (1 - localProgress) / .12);
    if (fade < 1) {
      ctx.fillStyle = `rgba(7,16,24,${1 - Math.max(0, fade)})`;
      ctx.fillRect(0, 0, width, height);
    }
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
      drawCover(ctx, await loadImage(scene.imageUrl), width, height, .25, 'none', scene);
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
      drawCover(ctx, video, width, height, 0, 'none', scene);
      return canvas.toDataURL('image/jpeg', .88);
    } catch { /* fallback below */ }
  }
  drawEmpty(ctx, width, height, scene);
  return canvas.toDataURL('image/jpeg', .88);
}

function createGeneratedMusic(audioContext, destination, totalDuration, style, volume = .5) {
  if (style === 'none') return [];
  const master = audioContext.createGain();
  master.gain.value = (style === 'dynamic' ? .085 : .055) * Math.max(0, Math.min(1, volume));
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
  const [musicVolume, setMusicVolume] = useState(project?.data?.musicVolume ?? .55);
  const [selectedSceneId, setSelectedSceneId] = useState(project?.data?.scenes?.[0]?.id || scenes[0]?.id || '');
  const [status, setStatus] = useState('Aus Prompts oder eigenen Bildern entsteht ein echtes Video mit Bewegung, Übergängen und Hintergrundmusik.');
  const [rendering, setRendering] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState('');
  const [resultBlob, setResultBlob] = useState(null);
  const [resultExt, setResultExt] = useState('webm');
  const hiddenCanvasRef = useRef(null);
  const sceneClipboardRef = useRef(null);
  const mediaDragRef = useRef(null);
  const textDragRef = useRef(null);
  const format = useMemo(() => formats[formatKey] || formats.story, [formatKey]);
  const totalDuration = useMemo(() => scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0), [scenes]);
  const selectedScene = useMemo(() => scenes.find((scene) => scene.id === selectedSceneId) || scenes[0], [scenes, selectedSceneId]);

  useEffect(() => {
    if (!project) return;
    setProjectName(project.name);
    setProjectId(project.id);
    setScenes(project.data?.scenes?.length ? project.data.scenes : [newScene(0)]);
    setFormatKey(project.data?.format || 'story');
    setMusicStyle(project.data?.musicStyle || 'soft');
    setMusicVolume(project.data?.musicVolume ?? .55);
    setSelectedSceneId((project.data?.scenes?.[0] || scenes[0])?.id || '');
  }, [project?.id]);

  function applyVideoTemplate(type) {
    const presets = {
      offer: [
        { title: 'ANGEBOT DER WOCHE', prompt: 'Großer aufmerksamkeitsstarker Einstieg mit Marktlogo und Produktwelt.', duration: 3, animation: 'zoom', textPosition: 'top' },
        { title: 'PRODUKT IM FOKUS', prompt: 'Produkt groß im Bild, Preis und Angebotsinformation klar sichtbar.', duration: 4, animation: 'pan-right', textPosition: 'bottom' },
        { title: 'JETZT ZUGREIFEN', prompt: 'Abschluss mit Adresse, Logo und Call-to-Action.', duration: 3, animation: 'zoom-out', textPosition: 'bottom' }
      ],
      cloud: [
        { title: 'WILLKOMMEN', prompt: 'Heller Wolkenhintergrund, weiche Bewegung und freundliche Musik.', duration: 4, animation: 'pan-up', textPosition: 'bottom', accentColor: '#63c7ff' },
        { title: 'DEIN KANAL', prompt: 'Logo groß in der Mitte mit sanfter Einblendung.', duration: 4, animation: 'zoom', textPosition: 'bottom', accentColor: '#ffd400' }
      ],
      social: [
        { title: 'STOPP SCROLLEN', prompt: 'Starker Social-Media-Hook, nahes Motiv, dynamische Bewegung.', duration: 2, animation: 'zoom', textPosition: 'top' },
        { title: 'DAS IST NEU', prompt: 'Hauptinformation mit Produkt oder Person.', duration: 4, animation: 'pan-left', textPosition: 'bottom' },
        { title: 'MEHR ERFAHREN', prompt: 'Klarer Abschluss mit Logo und Handlungsaufforderung.', duration: 3, animation: 'zoom-out', textPosition: 'bottom' }
      ]
    };
    const source = presets[type] || presets.offer;
    const next = source.map((item, index) => ({ ...newScene(index), ...item }));
    setScenes(next); setSelectedSceneId(next[0].id); setStatus('Videovorlage geladen. Ersetze die Bilder oder lasse KI-Bilder erzeugen.');
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (!selectedScene) return;
      if (modifier && key === 'c') { event.preventDefault(); sceneClipboardRef.current = { ...selectedScene }; }
      else if (modifier && key === 'v' && sceneClipboardRef.current) {
        event.preventDefault(); const clone = { ...sceneClipboardRef.current, id: crypto.randomUUID(), title: `${sceneClipboardRef.current.title} Kopie` };
        setScenes((old) => [...old, clone]); setSelectedSceneId(clone.id);
      } else if (modifier && key === 'd') { event.preventDefault(); duplicateScene(selectedScene); }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) { event.preventDefault(); deleteScene(selectedScene); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedScene]);

  const updateScene = (id, patch) => setScenes((old) => old.map((scene) => scene.id === id ? { ...scene, ...patch } : scene));

  function moveScene(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes];
    [next[index], next[target]] = [next[target], next[index]];
    setScenes(next);
  }

  function addScene() {
    const scene = newScene(scenes.length);
    setScenes((old) => [...old, scene]);
    setSelectedSceneId(scene.id);
  }

  function duplicateScene(scene) {
    const clone = { ...scene, id: crypto.randomUUID(), title: `${scene.title} Kopie` };
    setScenes((old) => {
      const index = old.findIndex((item) => item.id === scene.id);
      const next = [...old];
      next.splice(index + 1, 0, clone);
      return next;
    });
    setSelectedSceneId(clone.id);
  }

  function deleteScene(scene) {
    setScenes((old) => {
      const remaining = old.filter((item) => item.id !== scene.id);
      if (!remaining.length) remaining.push(newScene(0));
      setSelectedSceneId(remaining[0].id);
      return remaining;
    });
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
      const payload = { name: projectName, type: 'video', data: { scenes: safeScenes, format: formatKey, musicStyle, musicVolume } };
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
        gain.gain.value = Math.max(0, Math.min(1, musicVolume));
        customAudioSource.connect(gain).connect(destination);
        customAudioSource.start();
      } else {
        createGeneratedMusic(audioContext, destination, totalDuration, musicStyle, musicVolume);
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
          try { video = await loadVideo(scene.videoUrl); video.currentTime = Math.max(0, Number(scene.trimStart || 0)); await video.play(); } catch { video = null; }
        }

        const start = performance.now();
        await new Promise((resolve) => {
          const frame = () => {
            const localSeconds = (performance.now() - start) / 1000;
            const localProgress = Math.min(1, localSeconds / duration);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (image) drawCover(ctx, image, canvas.width, canvas.height, localProgress, scene.animation, scene);
            else if (video && video.readyState >= 2) drawCover(ctx, video, canvas.width, canvas.height, localProgress, scene.animation, scene);
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
    zip.file('projekt.json', JSON.stringify({ projectName, format: formatKey, musicStyle, musicVolume, scenes }, null, 2));
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


  function startMediaDrag(event) {
    if (!selectedScene) return;
    event.preventDefault();
    mediaDragRef.current = { x: event.clientX, y: event.clientY, startX: Number(selectedScene.mediaX || 0), startY: Number(selectedScene.mediaY || 0) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveMediaDrag(event) {
    const drag = mediaDragRef.current;
    if (!drag || !selectedScene) return;
    const rect = event.currentTarget.getBoundingClientRect();
    updateScene(selectedScene.id, {
      mediaX: drag.startX + ((event.clientX - drag.x) / Math.max(1, rect.width)) * 100,
      mediaY: drag.startY + ((event.clientY - drag.y) / Math.max(1, rect.height)) * 100
    });
  }

  function endMediaDrag() { mediaDragRef.current = null; }

  function startTextDrag(event) {
    if (!selectedScene) return;
    event.preventDefault();
    event.stopPropagation();
    textDragRef.current = { x: event.clientX, y: event.clientY, startX: Number(selectedScene.textX ?? 7), startY: Number(selectedScene.textY ?? 76) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveTextDrag(event) {
    const drag = textDragRef.current;
    if (!drag || !selectedScene) return;
    const rect = event.currentTarget.parentElement.getBoundingClientRect();
    updateScene(selectedScene.id, {
      textX: Math.max(3, Math.min(97, drag.startX + ((event.clientX - drag.x) / Math.max(1, rect.width)) * 100)),
      textY: Math.max(3, Math.min(92, drag.startY + ((event.clientY - drag.y) / Math.max(1, rect.height)) * 100))
    });
  }

  function endTextDrag() { textDragRef.current = null; }

  return (
    <section className="video-editor-pro">
      <div className="studio-header">
        <div><h2><Film size={22}/> Video-Editor</h2><p>Canva-inspirierte Arbeitsfläche mit Szenen, Text, Übergängen, Animationen, Musik und Export.</p></div>
        <div className="header-actions"><input value={projectName} onChange={(event) => setProjectName(event.target.value)}/><button onClick={saveProject}><Save size={17}/>{canSave ? 'Speichern' : 'Anmelden'}</button><button className="primary-btn" onClick={addScene}><Plus size={17}/>Szene</button></div>
      </div>

      <div className="video-editor-main">
        <aside className="video-media-panel">
          <h3>Vorlagen & Medien</h3>
          <div className="video-template-gallery">
            <button onClick={() => applyVideoTemplate('offer')}><img src="/templates/atlas-grid.jpg" alt="Angebotsvideo"/><span>Angebotsvideo</span></button>
            <button onClick={() => applyVideoTemplate('cloud')}><span className="video-template-cloud">☁</span><span>Kanal-Intro</span></button>
            <button onClick={() => applyVideoTemplate('social')}><span className="video-template-social">▶</span><span>Social Reel</span></button>
          </div>
          <label>Format<select value={formatKey} onChange={(event) => setFormatKey(event.target.value)}>{Object.entries(formats).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
          <label>Musikstil<select value={musicStyle} onChange={(event) => setMusicStyle(event.target.value)}><option value="soft">Sanft automatisch</option><option value="dynamic">Dynamisch automatisch</option><option value="none">Keine Musik</option></select></label>
          <label>Musiklautstärke <span>{Math.round(musicVolume * 100)} %</span><input type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))}/></label>
          <label className="clip-upload"><Music2 size={16}/>Eigene Musik<input type="file" accept="audio/*" onChange={(event) => setMusicFile(event.target.files?.[0] || null)}/></label>
          <button onClick={generateAllImages} disabled={generatingAll}>{generatingAll ? <LoaderCircle className="spin" size={17}/> : <Sparkles size={17}/>}Alle KI-Bilder erzeugen</button>
          <div className="video-project-info"><b>{scenes.length} Szenen</b><span>{totalDuration} Sekunden</span><span>{format.label}</span><span>Cmd/Ctrl+C, V, D und Löschen funktionieren für Szenen.</span></div>
        </aside>

        <div className="video-preview-workspace">
          <div className={`video-stage-preview format-${formatKey}`} style={{ aspectRatio: `${format.width}/${format.height}` }} onPointerDown={startMediaDrag} onPointerMove={moveMediaDrag} onPointerUp={endMediaDrag} onPointerCancel={endMediaDrag}>
            <div className="video-media-transform" style={{ transform: `translate(calc(-50% + ${Number(selectedScene?.mediaX || 0)}%), calc(-50% + ${Number(selectedScene?.mediaY || 0)}%)) scale(${Number(selectedScene?.mediaScale || 1)}) rotate(${Number(selectedScene?.mediaRotation || 0)}deg)`, opacity: Number(selectedScene?.mediaOpacity ?? 1) }}>
              {selectedScene?.videoUrl ? <video src={selectedScene.videoUrl} controls playsInline/> : selectedScene?.imageUrl ? <img src={selectedScene.imageUrl} alt={selectedScene.title}/> : <div className="empty-preview"><FileImage size={42}/>Bild oder Video für diese Szene hochladen</div>}
            </div>
            {selectedScene?.showText && <div className="preview-text-overlay free-position" onPointerDown={startTextDrag} onPointerMove={moveTextDrag} onPointerUp={endTextDrag} onPointerCancel={endTextDrag} style={{ left: `${Number(selectedScene.textX ?? 7)}%`, top: `${Number(selectedScene.textY ?? 76)}%`, color: selectedScene.textColor || '#fff', background: `linear-gradient(90deg, rgba(0,0,0,${selectedScene.overlayOpacity ?? .72}), transparent)`, fontFamily: selectedScene.fontFamily || 'Arial', textAlign: selectedScene.textAlign || 'left' }}><small style={{ color: selectedScene.accentColor || '#ffd400' }}>YILDIZ AI</small><h3 style={{ fontSize: `${1.6 * Number(selectedScene.fontScale || 1)}rem`, fontWeight: selectedScene.fontWeight || 800 }}>{selectedScene.title}</h3><p>{selectedScene.prompt}</p></div>}
          </div>
          <div className="video-preview-actions">
            <label className="clip-upload"><Upload size={16}/>Bild/Video<input type="file" accept="image/*,video/*" onChange={(event) => selectedScene && uploadMedia(selectedScene, event)}/></label>
            <button onClick={() => selectedScene && generateSceneImage(selectedScene)}><ImagePlus size={16}/>KI-Bild</button>
            <button onClick={() => selectedScene && duplicateScene(selectedScene)}><Copy size={16}/>Duplizieren</button>
            <button onClick={() => selectedScene && deleteScene(selectedScene)}><Trash2 size={16}/>Löschen</button>
          </div>
        </div>

        <aside className="video-inspector-panel">
          <h3>Szenen-Eigenschaften</h3>
          {selectedScene && <>
            <label>Titel<input value={selectedScene.title} onChange={(event) => updateScene(selectedScene.id, { title: event.target.value })}/></label>
            <label>Beschreibung<textarea rows={4} value={selectedScene.prompt} onChange={(event) => updateScene(selectedScene.id, { prompt: event.target.value })}/></label>
            <div className="inspector-grid">
              <label>Dauer<select value={selectedScene.duration} onChange={(event) => updateScene(selectedScene.id, { duration: Number(event.target.value) })}><option value="2">2 Sek.</option><option value="4">4 Sek.</option><option value="6">6 Sek.</option><option value="8">8 Sek.</option><option value="12">12 Sek.</option></select></label>
              <label>Start im Clip<input type="number" min="0" step="0.1" value={selectedScene.trimStart || 0} onChange={(event) => updateScene(selectedScene.id, { trimStart: Number(event.target.value) })}/></label>
            </div>
            <label>Animation<select value={selectedScene.animation || 'zoom'} onChange={(event) => updateScene(selectedScene.id, { animation: event.target.value })}><option value="zoom">Langsam hineinzoomen</option><option value="zoom-out">Langsam herauszoomen</option><option value="pan-left">Nach links schwenken</option><option value="pan-right">Nach rechts schwenken</option><option value="pan-up">Nach oben schwenken</option><option value="none">Keine Bewegung</option></select></label>
            <label>Übergang<select value={selectedScene.transition || 'fade'} onChange={(event) => updateScene(selectedScene.id, { transition: event.target.value })}><option value="fade">Ein-/Ausblenden</option><option value="none">Kein Übergang</option></select></label>
            <div className="inspector-grid">
              <label>Schrift<select value={selectedScene.fontFamily || 'Arial'} onChange={(event) => updateScene(selectedScene.id, { fontFamily: event.target.value })}><option>Arial</option><option>Inter</option><option>Georgia</option><option>Impact</option><option>Times New Roman</option><option>Verdana</option></select></label>
              <label>Gewicht<select value={selectedScene.fontWeight || 800} onChange={(event) => updateScene(selectedScene.id, { fontWeight: Number(event.target.value) })}><option value="400">Normal</option><option value="700">Fett</option><option value="800">Extra Fett</option><option value="900">Schwarz</option></select></label>
            </div>
            <div className="inspector-grid">
              <label>Ausrichtung<select value={selectedScene.textAlign || 'left'} onChange={(event) => updateScene(selectedScene.id, { textAlign: event.target.value })}><option value="left">Links</option><option value="center">Mitte</option><option value="right">Rechts</option></select></label>
              <label>Textposition<select value={selectedScene.textPosition || 'bottom'} onChange={(event) => updateScene(selectedScene.id, { textPosition: event.target.value })}><option value="bottom">Unten</option><option value="top">Oben</option></select></label>
            </div>
            <label className="checkbox-row"><input type="checkbox" checked={selectedScene.showText !== false} onChange={(event) => updateScene(selectedScene.id, { showText: event.target.checked })}/>Text im Video anzeigen</label>
            <div className="inspector-grid">
              <label>Textfarbe<input type="color" value={selectedScene.textColor || '#ffffff'} onChange={(event) => updateScene(selectedScene.id, { textColor: event.target.value })}/></label>
              <label>Akzent<input type="color" value={selectedScene.accentColor || '#ffd400'} onChange={(event) => updateScene(selectedScene.id, { accentColor: event.target.value })}/></label>
            </div>
            <label>Textgröße <span>{Number(selectedScene.fontScale || 1).toFixed(1)}×</span><input type="range" min=".6" max="1.8" step=".1" value={selectedScene.fontScale || 1} onChange={(event) => updateScene(selectedScene.id, { fontScale: Number(event.target.value) })}/></label>
            <label>Overlay <span>{Math.round(Number(selectedScene.overlayOpacity ?? .72) * 100)} %</span><input type="range" min="0" max="1" step=".05" value={selectedScene.overlayOpacity ?? .72} onChange={(event) => updateScene(selectedScene.id, { overlayOpacity: Number(event.target.value) })}/></label>
            <h4>Bild/Video frei positionieren</h4>
            <label>Zoom <span>{Number(selectedScene.mediaScale || 1).toFixed(2)}×</span><input type="range" min=".5" max="2.5" step=".05" value={selectedScene.mediaScale || 1} onChange={(event) => updateScene(selectedScene.id, { mediaScale: Number(event.target.value) })}/></label>
            <div className="inspector-grid"><label>X-Position<input type="number" step="1" value={Math.round(Number(selectedScene.mediaX || 0))} onChange={(event) => updateScene(selectedScene.id, { mediaX: Number(event.target.value) })}/></label><label>Y-Position<input type="number" step="1" value={Math.round(Number(selectedScene.mediaY || 0))} onChange={(event) => updateScene(selectedScene.id, { mediaY: Number(event.target.value) })}/></label></div>
            <div className="inspector-grid"><label>Drehung<input type="number" step="1" value={Number(selectedScene.mediaRotation || 0)} onChange={(event) => updateScene(selectedScene.id, { mediaRotation: Number(event.target.value) })}/></label><label>Deckkraft<input type="number" min="0" max="1" step=".05" value={Number(selectedScene.mediaOpacity ?? 1)} onChange={(event) => updateScene(selectedScene.id, { mediaOpacity: Number(event.target.value) })}/></label></div>
            <h4>Text frei positionieren</h4>
            <div className="inspector-grid"><label>Text X<input type="number" min="0" max="100" value={Math.round(Number(selectedScene.textX ?? 7))} onChange={(event) => updateScene(selectedScene.id, { textX: Number(event.target.value) })}/></label><label>Text Y<input type="number" min="0" max="100" value={Math.round(Number(selectedScene.textY ?? 76))} onChange={(event) => updateScene(selectedScene.id, { textY: Number(event.target.value) })}/></label></div>
            <p className="panel-note">Du kannst das Bild/Video direkt in der Vorschau ziehen. Den Text ebenfalls direkt anfassen und verschieben.</p>
            {selectedScene.status && <div className="scene-status">{selectedScene.status}</div>}
          </>}
        </aside>
      </div>

      <div className="video-timeline-pro">
        <div className="timeline-toolbar"><b>Timeline</b><button onClick={addScene}><Plus size={15}/>Szene hinzufügen</button></div>
        <div className="timeline-track-pro">
          {scenes.map((scene, index) => <button key={scene.id} className={`timeline-clip-pro ${scene.id === selectedScene?.id ? 'active' : ''}`} onClick={() => setSelectedSceneId(scene.id)}>
            <span className="clip-number">{index + 1}</span>
            <div className="clip-thumb">{scene.videoUrl ? <video src={scene.videoUrl} muted/> : scene.imageUrl ? <img src={scene.imageUrl} alt=""/> : <FileImage size={24}/>}</div>
            <b>{scene.title}</b><small>{scene.duration} Sek. · {scene.animation}</small>
            <div className="clip-move"><i onClick={(event) => { event.stopPropagation(); moveScene(index, -1); }}><ArrowLeft size={13}/></i><i onClick={(event) => { event.stopPropagation(); moveScene(index, 1); }}><ArrowRight size={13}/></i></div>
          </button>)}
        </div>
      </div>

      <div className="render-panel">
        <div><h3>Export</h3><p>Video mit echten Szenenbildern, Bewegung, Text und Musik rendern. MP4, sofern der Browser es unterstützt; sonst WebM.</p></div>
        <div className="render-actions"><button className="primary-btn" onClick={renderVideo} disabled={rendering}>{rendering ? <LoaderCircle className="spin" size={17}/> : <Film size={17}/>} {rendering ? `Rendering ${progress}%` : 'Video rendern'}</button><button onClick={() => createStoryboardPdf()}><FileText size={17}/>PDF</button><button onClick={downloadPngFrames}><FileImage size={17}/>PNG</button><button onClick={exportProjectZip}><FileArchive size={17}/>ZIP</button></div>
      </div>
      {rendering && <div className="render-progress"><span style={{ width: `${progress}%` }}/></div>}
      {resultUrl && <div className="video-result"><video src={resultUrl} controls playsInline/><button className="primary-btn" onClick={() => downloadBlob(resultBlob, `${safeName(projectName)}.${resultExt}`)}><Download size={17}/>Video als {resultExt.toUpperCase()} herunterladen</button></div>}
      <canvas ref={hiddenCanvasRef} className="hidden-render-canvas"/>
      {status && <div className="status-line">{status}</div>}
    </section>
  );
}
