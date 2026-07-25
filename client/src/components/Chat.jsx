import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, Camera, Cloud, Download, Edit3, FileText, ImagePlus, MessageSquarePlus, Paperclip, Search, Trash2, User, Video, WandSparkles, X } from 'lucide-react';
import { api } from '../api.js';

const quickPrompts = [
  'Erkläre mir ein schwieriges Thema ganz einfach.',
  'Analysiere mein hochgeladenes Bild oder Video.',
  'Erstelle einen professionellen Flyertext für meine Firma.'
];

function formatSize(size) {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Videoframe konnte nicht gelesen werden.')); };
    const cleanup = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
    };
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', fail, { once: true });
    video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
  });
}

async function extractVideoFrames(file, previewUrl) {
  const video = document.createElement('video');
  video.src = previewUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('Video konnte nicht geöffnet werden.'));
  });

  const canvas = document.createElement('canvas');
  const maxWidth = 640;
  const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext('2d');
  const points = [0.08, 0.33, 0.62, 0.9];
  const frames = [];

  for (const point of points) {
    await seekVideo(video, video.duration * point);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL('image/jpeg', 0.68));
  }
  return frames;
}

function looksLikeImagePrompt(text) {
  const value = String(text || '').toLowerCase();
  return /(erstell|erstelle|generier|generiere|mach|zeichne|male|create|generate)/.test(value) &&
    /(bild|foto|image|grafik|poster|illustration|sticker|logo|cover|banner|thumbnail)/.test(value);
}

function looksLikeVideoPrompt(text) {
  const value = String(text || '').toLowerCase();
  return /(erstell|erstelle|generier|generiere|mach|render|produzier|create|generate)/.test(value) &&
    /(video|film|clip|reel|animation|trailer|short)/.test(value) || /video dazu|mach .* video/.test(value);
}

function makeDirectImageUrl(prompt, aspect = 'post') {
  const sizes = {
    square: [1024, 1024],
    post: [1024, 1280],
    story: [1024, 1792],
    landscape: [1280, 720]
  };
  const [width, height] = sizes[aspect] || sizes.post;
  const finalPrompt = [
    'photorealistic, realistic photography, natural believable lighting, high detail, premium commercial quality',
    'not a painting, not an illustration, not cartoon, no text overlay',
    String(prompt || '').trim()
  ].join(', ');
  const seed = Math.floor(Math.random() * 1_000_000_000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${width}&height=${height}&model=flux&nologo=true&enhance=true&safe=true&seed=${seed}`;
}

function preloadImage(url, timeoutMs = 35000) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error('Bilddienst hat zu lange gebraucht.')), timeoutMs);
    image.onload = () => { clearTimeout(timer); resolve(url); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('Bild konnte nicht geladen werden.')); };
    image.src = url;
  });
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

function createGeneratedMusic(audioContext, destination, totalDuration) {
  const master = audioContext.createGain();
  master.gain.value = 0.07;
  master.connect(destination);
  const notes = [130.81, 164.81, 196, 246.94, 196, 164.81];
  const step = 0.65;
  for (let time = 0, i = 0; time < totalDuration + 1; time += step, i += 1) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = notes[i % notes.length];
    gain.gain.setValueAtTime(0, audioContext.currentTime + time);
    gain.gain.linearRampToValueAtTime(1, audioContext.currentTime + time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + time + Math.min(step, 0.9));
    oscillator.connect(gain).connect(master);
    oscillator.start(audioContext.currentTime + time);
    oscillator.stop(audioContext.currentTime + time + Math.min(step, 1));
  }
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

function drawCover(ctx, source, width, height, progress = 0) {
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) return;
  const baseScale = Math.max(width / sourceWidth, height / sourceHeight);
  const zoom = 1 + progress * 0.06;
  const drawWidth = sourceWidth * baseScale * zoom;
  const drawHeight = sourceHeight * baseScale * zoom;
  const driftX = Math.sin(progress * Math.PI) * width * 0.025;
  const driftY = Math.cos(progress * Math.PI) * height * 0.018;
  ctx.drawImage(source, (width - drawWidth) / 2 + driftX, (height - drawHeight) / 2 + driftY, drawWidth, drawHeight);
}

function drawOverlay(ctx, width, height, title, caption, localProgress, index) {
  const gradient = ctx.createLinearGradient(0, height * 0.55, 0, height);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,.82)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, height * 0.45, width, height * 0.55);
  ctx.fillStyle = '#ffd400';
  ctx.font = `800 ${Math.max(18, width / 36)}px Arial`;
  ctx.fillText(`0${index + 1}`, width * 0.07, height * 0.78);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.max(30, width / 18)}px Arial`;
  ctx.fillText(String(title || 'Yildiz AI').slice(0, 42), width * 0.07, height * 0.84, width * 0.86);
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  ctx.font = `500 ${Math.max(16, width / 38)}px Arial`;
  ctx.fillText(String(caption || 'Automatisch erstellt mit Musik').slice(0, 76), width * 0.07, height * 0.9, width * 0.86);
  const fade = Math.min(1, localProgress / 0.12, (1 - localProgress) / 0.12);
  if (fade < 1) {
    ctx.fillStyle = `rgba(7,16,24,${1 - Math.max(0, fade)})`;
    ctx.fillRect(0, 0, width, height);
  }
}

async function renderGeneratedVideo(imageUrls, prompt) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('Dieser Browser unterstützt kein direktes Video-Rendering.');
  }

  const width = 720;
  const height = 1280;
  const sceneDuration = 3;
  const totalDuration = imageUrls.length * sceneDuration;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  let audioContext;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    const destination = audioContext.createMediaStreamDestination();
    createGeneratedMusic(audioContext, destination, totalDuration);
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

    const mimeType = bestRecorderMime();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(400);

    const images = await Promise.all(imageUrls.map((url) => loadImage(url)));
    let elapsed = 0;

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const start = performance.now();
      await new Promise((resolve) => {
        const frame = () => {
          const localSeconds = (performance.now() - start) / 1000;
          const localProgress = Math.min(1, localSeconds / sceneDuration);
          ctx.clearRect(0, 0, width, height);
          drawCover(ctx, image, width, height, localProgress);
          drawOverlay(ctx, width, height, `Szene ${index + 1}`, prompt, localProgress, index);
          if (localSeconds < sceneDuration) requestAnimationFrame(frame);
          else resolve();
        };
        frame();
      });
      elapsed += sceneDuration;
    }

    recorder.stop();
    await stopped;
    const finalMime = recorder.mimeType || mimeType || 'video/webm';
    const blob = new Blob(chunks, { type: finalMime });
    return {
      blob,
      url: URL.createObjectURL(blob),
      ext: finalMime.includes('mp4') ? 'mp4' : 'webm'
    };
  } finally {
    try { await audioContext?.close?.(); } catch {}
  }
}

function fileMessageAttachment(item) {
  if (item.kind === 'image') return { kind: 'image', name: item.name, previewUrl: item.previewUrl || item.data, data: item.data, size: item.size };
  if (item.kind === 'video') return { kind: 'video', name: item.name, previewUrl: item.previewUrl, size: item.size, blob: item.blob };
  return { kind: 'file', name: item.name, size: item.size, blob: item.blob };
}


const CHAT_DB = 'yildiz-ai-chat-history-v1';
const CHAT_STORE = 'sessions';
const WELCOME_MESSAGE = { role: 'assistant', content: 'Hallo! Ich bin Yildiz AI. Du kannst mir Fragen stellen, Bilder und Videos direkt erzeugen sowie Dateien per Drag & Drop hochladen.' };

function makeChatSession() {
  return {
    id: crypto.randomUUID(),
    title: 'Neuer Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [WELCOME_MESSAGE]
  };
}

function openChatDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CHAT_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHAT_STORE)) db.createObjectStore(CHAT_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readSavedChats() {
  const db = await openChatDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_STORE, 'readonly');
    const request = tx.objectStore(CHAT_STORE).get('all');
    request.onsuccess = () => resolve(Array.isArray(request.result?.value) ? request.result.value : []);
    request.onerror = () => reject(request.error);
  });
}

function cleanForStorage(sessions) {
  return sessions.map((session) => ({
    ...session,
    messages: (session.messages || []).map((message) => ({
      ...message,
      attachments: Array.isArray(message.attachments)
        ? message.attachments.map((item) => ({
            ...item,
            previewUrl: String(item.previewUrl || '').startsWith('blob:') ? '' : item.previewUrl
          }))
        : undefined
    }))
  }));
}

async function writeSavedChats(sessions) {
  const db = await openChatDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_STORE, 'readwrite');
    tx.objectStore(CHAT_STORE).put({ key: 'all', value: cleanForStorage(sessions) });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function hydrateMessages(messages) {
  const hydrated = (messages || []).map((message) => ({
    ...message,
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map((item) => ({
          ...item,
          previewUrl: item.previewUrl || (item.blob instanceof Blob ? URL.createObjectURL(item.blob) : item.data || '')
        }))
      : undefined
  }));
  return hydrated.filter((message, index, all) => {
    if (!index) return true;
    const previous = all[index - 1];
    return !(message.role === previous.role && String(message.content || '').trim() === String(previous.content || '').trim());
  });
}

export default function Chat({ onOpenVideoProject }) {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [historyReady, setHistoryReady] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Gemini läuft serverseitig in Chrome, Opera, Safari und Edge. Bild-, Video- und Datei-Uploads funktionieren auch per Drag & Drop.');
  const [attachments, setAttachments] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const cameraImageRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const anyFileRef = useRef(null);
  const lastSendRef = useRef({ text: '', at: 0 });
  const sendingRef = useRef(false);
  const hasPayload = useMemo(() => Boolean(String(input || '').trim() || attachments.length), [input, attachments.length]);
  const filteredSessions = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    return chatSessions
      .filter((session) => !query || String(session.title || '').toLowerCase().includes(query))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }, [chatSessions, chatSearch]);

  useEffect(() => {
    let cancelled = false;
    readSavedChats().then((saved) => {
      if (cancelled) return;
      const sessions = saved.length ? saved : [makeChatSession()];
      const first = sessions[0];
      setChatSessions(sessions);
      setActiveChatId(first.id);
      setMessages(hydrateMessages(first.messages));
      setHistoryReady(true);
    }).catch(() => {
      const first = makeChatSession();
      setChatSessions([first]);
      setActiveChatId(first.id);
      setMessages(first.messages);
      setHistoryReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!historyReady || !activeChatId) return;
    setChatSessions((old) => old.map((session) => session.id === activeChatId
      ? { ...session, messages, updatedAt: Date.now() }
      : session));
  }, [messages, activeChatId, historyReady]);

  useEffect(() => {
    if (!historyReady || !chatSessions.length) return;
    const timer = setTimeout(() => {
      writeSavedChats(chatSessions).catch(() => setStatus('Chats konnten im Browser nicht gespeichert werden.'));
    }, 400);
    return () => clearTimeout(timer);
  }, [chatSessions, historyReady]);

  function newChat() {
    sendingRef.current = false;
    const next = makeChatSession();
    setChatSessions((old) => [next, ...old]);
    setActiveChatId(next.id);
    setMessages(next.messages);
    setAttachments([]);
    setInput('');
    setStatus('Neuer Chat geöffnet.');
  }

  function openChat(session) {
    setActiveChatId(session.id);
    setMessages(hydrateMessages(session.messages));
    setAttachments([]);
    setInput('');
  }

  function deleteChat(event, id) {
    event.stopPropagation();
    setChatSessions((old) => {
      const remaining = old.filter((session) => session.id !== id);
      if (id === activeChatId) {
        const next = remaining[0] || makeChatSession();
        if (!remaining.length) remaining.push(next);
        setActiveChatId(next.id);
        setMessages(hydrateMessages(next.messages));
      }
      return remaining;
    });
  }

  function removeAttachment(id) {
    setAttachments((old) => old.filter((item) => item.id !== id));
  }

  function exportCurrentChat() {
    const session = chatSessions.find((item) => item.id === activeChatId);
    const lines = (messages || []).map((message) => {
      const speaker = message.role === 'assistant' ? 'Yildiz AI' : 'Du';
      const attachmentNames = Array.isArray(message.attachments) && message.attachments.length
        ? `\nAnhänge: ${message.attachments.map((item) => item.name || item.kind).join(', ')}`
        : '';
      return `${speaker}: ${message.content || ''}${attachmentNames}`;
    });
    const blob = new Blob([`Yildiz AI Chat\n${session?.title || 'Chat'}\n\n${lines.join('\n\n')}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${String(session?.title || 'yildiz-ai-chat').replace(/[^a-z0-9äöüß_-]+/gi, '-')}.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Chat als TXT gespeichert.');
  }

  function addGenericFile(file) {
    setAttachments((old) => [...old, {
      id: crypto.randomUUID(), kind: 'file', name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream', blob: file
    }].slice(-4));
    setStatus(`Datei „${file.name}“ hinzugefügt.`);
  }

  function addImageFile(file) {
    return new Promise((resolve, reject) => {
      if (file.size > 10 * 1024 * 1024) {
        reject(new Error('Bild ist zu groß. Bitte maximal ca. 10 MB wählen.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((old) => [...old, {
          id: crypto.randomUUID(), kind: 'image', name: file.name || 'foto.jpg', size: file.size,
          mimeType: file.type || 'image/jpeg', previewUrl: reader.result, data: reader.result, blob: file
        }].slice(-4));
        resolve();
      };
      reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
      reader.readAsDataURL(file);
    });
  }

  async function addVideoFile(file) {
    const previewUrl = URL.createObjectURL(file);
    const id = crypto.randomUUID();
    setAttachments((old) => [...old, {
      id, kind: 'video', name: file.name || 'video.mp4', size: file.size,
      mimeType: file.type || 'video/mp4', previewUrl, frames: [], extracting: true, blob: file
    }].slice(-4));
    setStatus('Yildiz AI liest vier Vorschaubilder aus dem Video …');
    try {
      const frames = await extractVideoFrames(file, previewUrl);
      setAttachments((old) => old.map((item) => item.id === id ? { ...item, frames, extracting: false } : item));
      setStatus('Video vorbereitet. Du kannst jetzt eine Frage stellen oder das Video analysieren lassen.');
    } catch (error) {
      setAttachments((old) => old.map((item) => item.id === id ? { ...item, extracting: false } : item));
      setStatus(error.message || 'Video geladen, Frame-Analyse war nicht möglich.');
    }
  }

  async function processFiles(fileList) {
    const files = Array.from(fileList || []).slice(0, 4);
    for (const file of files) {
      if (file.type.startsWith('image/')) await addImageFile(file);
      else if (file.type.startsWith('video/')) await addVideoFile(file);
      else addGenericFile(file);
    }
  }

  async function onImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await addImageFile(file);
      setStatus('Bild hinzugefügt. Stelle jetzt deine Frage dazu oder ziehe weitere Dateien hinein.');
    } catch (error) {
      setStatus(error.message);
    }
    event.target.value = '';
  }

  async function onVideoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    await addVideoFile(file);
    event.target.value = '';
  }

  async function onAnyFileUpload(event) {
    const files = event.target.files;
    if (!files?.length) return;
    try {
      await processFiles(files);
    } catch (error) {
      setStatus(error.message || 'Datei konnte nicht verarbeitet werden.');
    }
    event.target.value = '';
  }

  async function generateImageMessage(clean) {
    setStatus('Yildiz AI erstellt dein Bild …');
    let result = null;
    try {
      result = await api('/api/ai/image', {
        method: 'POST',
        body: JSON.stringify({ prompt: clean, aspect: 'post', style: 'realistic' })
      });
    } catch (error) {
      console.warn('Server image route failed, using direct browser fallback', error);
    }

    let imageSource = result?.imageDataUrl || result?.imageUrl || '';
    let provider = result?.provider || '';
    if (!imageSource) {
      imageSource = makeDirectImageUrl(clean, 'post');
      provider = 'kostenloser Browser-Bilddienst';
    }

    await preloadImage(imageSource);
    setMessages((old) => [...old, {
      role: 'assistant',
      content: 'Hier ist dein Bild. Du kannst es direkt öffnen, speichern oder in ein Video übernehmen.',
      attachments: [{ kind: 'image', name: 'yildiz-ai-bild.png', previewUrl: imageSource, data: result?.imageDataUrl || '' }]
    }]);
    setStatus(`Bild erstellt${provider ? ` · ${provider}` : ''}`);
  }

  async function generateVideoMessage(clean, sourceImages = []) {
    setStatus('Yildiz AI erstellt zuerst Szenenbilder und rendert dann das Video mit Musik …');
    const images = sourceImages.filter(Boolean).slice(0, 6);
    const scenePrompts = [
      `${clean}. Scene 1: strong opening shot, clearly visible real subjects and real environment, cinematic, photorealistic, vertical video frame, no text.`,
      `${clean}. Scene 2: main action from a different camera angle, clearly visible subjects, dynamic movement, photorealistic, vertical video frame, no text.`,
      `${clean}. Scene 3: detailed close-up or medium shot, realistic lighting, coherent characters and environment, vertical video frame, no text.`,
      `${clean}. Scene 4: strong final hero shot, visually rich background, cinematic and photorealistic, vertical video frame, no text.`
    ];

    if (!images.length) {
      for (let index = 0; index < scenePrompts.length; index += 1) {
        setStatus(`Yildiz AI erstellt Szenenbild ${index + 1} von ${scenePrompts.length} …`);
        let result = null;
        try {
          result = await api('/api/ai/image', {
            method: 'POST',
            body: JSON.stringify({ prompt: scenePrompts[index], aspect: 'story', style: 'realistic' })
          });
        } catch (error) {
          console.warn('Server scene image failed, using direct fallback', error);
        }
        const imageSource = result?.imageDataUrl || result?.imageUrl || makeDirectImageUrl(scenePrompts[index], 'story');
        await preloadImage(imageSource);
        images.push(imageSource);
      }
    }

    const editableScenes = images.map((imageUrl, index) => ({
      id: crypto.randomUUID(),
      title: index === 0 ? 'STARKE ERÖFFNUNG' : index === images.length - 1 ? 'JETZT ENTDECKEN' : `SZENE ${index + 1}`,
      prompt: scenePrompts[index] || clean,
      duration: 3,
      imageUrl,
      videoUrl: '',
      fileName: `szene-${index + 1}.png`,
      mediaType: 'image',
      status: 'Aus dem Chat erzeugt',
      transition: 'fade',
      animation: index % 2 ? 'pan-right' : 'zoom',
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
    }));

    const videoProject = {
      name: String(clean || 'Yildiz AI Video').slice(0, 64),
      type: 'video',
      data: { scenes: editableScenes, format: 'story', musicStyle: 'dynamic', musicVolume: .55 }
    };

    setStatus('Bilder fertig. Video wird jetzt im Browser mit Übergängen und Musik gerendert …');
    const video = await renderGeneratedVideo(images, clean);
    setMessages((old) => [...old, {
      role: 'assistant',
      content: `Hier ist dein Video. Die ${editableScenes.length} Szenen wurden zusätzlich als bearbeitbares Video-Projekt gespeichert.`,
      attachments: [{
        kind: 'video',
        name: `yildiz-ai-video.${video.ext}`,
        previewUrl: video.url,
        blob: video.blob,
        projectData: videoProject
      }]
    }]);
    setStatus(`Video erstellt · ${video.ext.toUpperCase()} · Im Video-Studio weiter bearbeitbar`);
  }

  async function sendMessage(text = input) {
    const clean = String(text || '').trim();
    if (sendingRef.current) return;
    const now = Date.now();
    if (clean && lastSendRef.current.text === clean && now - lastSendRef.current.at < 5000) return;
    if ((!clean && !attachments.length) || loading) return;
    if (attachments.some((item) => item.extracting)) {
      setStatus('Bitte kurz warten, bis die Videoframes vorbereitet sind.');
      return;
    }
    sendingRef.current = true;
    lastSendRef.current = { text: clean, at: now };

    const history = messages;
    const outgoingAttachments = attachments.map(({ id, previewUrl, extracting, ...rest }) => rest);
    const userMessage = {
      role: 'user',
      content: clean || 'Bitte analysiere den Anhang.',
      attachments: attachments.map(fileMessageAttachment)
    };

    if (clean) {
      setChatSessions((old) => old.map((session) => session.id === activeChatId && session.title === 'Neuer Chat'
        ? { ...session, title: clean.replace(/\s+/g, ' ').slice(0, 42), updatedAt: Date.now() }
        : session));
    }
    setMessages((old) => [...old, userMessage]);
    setInput('');
    setAttachments([]);
    setLoading(true);

    try {
      if (clean && looksLikeVideoPrompt(clean)) {
        const uploadedImages = attachments
          .filter((item) => item.kind === 'image')
          .map((item) => item.previewUrl || item.data)
          .filter(Boolean);
        const recentGeneratedImages = [...messages].reverse()
          .flatMap((message) => Array.isArray(message.attachments) ? message.attachments : [])
          .filter((item) => item.kind === 'image')
          .map((item) => item.previewUrl || item.data)
          .filter(Boolean)
          .slice(0, 4);
        await generateVideoMessage(clean, uploadedImages.length ? uploadedImages : recentGeneratedImages);
      } else if (clean && !outgoingAttachments.length && looksLikeImagePrompt(clean)) {
        await generateImageMessage(clean);
      } else {
        setStatus('Yildiz AI denkt …');
        const result = await api('/api/ai/chat', {
          method: 'POST',
          body: JSON.stringify({ message: clean, history, attachments: outgoingAttachments })
        });
        setMessages((old) => [...old, { role: 'assistant', content: result.answer }]);
        setStatus(`Gemini verbunden${result.model ? ` · ${result.model}` : ''}`);
      }
    } catch (error) {
      setMessages((old) => [...old, { role: 'assistant', content: error.message }]);
      setStatus('Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setDragActive(false);
    processFiles(event.dataTransfer.files).catch((error) => setStatus(error.message || 'Datei konnte nicht geladen werden.'));
  }

  return (
    <section className="chat-workspace-pro">
      <aside className="chat-history-panel">
        <button className="new-chat-button" onClick={newChat}><MessageSquarePlus size={18}/>Neuer Chat</button>
        <button className="chat-export-button" onClick={exportCurrentChat}><Download size={16}/>Aktuellen Chat speichern</button>
        <label className="chat-search"><Search size={15}/><input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Chats suchen" /></label>
        <div className="chat-history-list">
          {filteredSessions.map((session) => (
            <button key={session.id} className={`chat-history-item ${session.id === activeChatId ? 'active' : ''}`} onClick={() => openChat(session)}>
              <span>{session.title || 'Neuer Chat'}</span>
              <small>{new Date(session.updatedAt || session.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</small>
              <i onClick={(event) => deleteChat(event, session.id)} title="Chat löschen"><Trash2 size={14}/></i>
            </button>
          ))}
        </div>
        <p className="chat-save-note">Chats werden automatisch in diesem Browser gespeichert. Mit „Chat speichern“ kannst du zusätzlich eine TXT-Datei herunterladen.</p>
      </aside>
      <section className="chat-shell">
      <div className="local-ai-banner"><Cloud size={17}/><div><b>Yildiz AI mit Medienanalyse</b><span>{status} · Keine lokale GPU und keine Pflicht-Anmeldung</span></div></div>
      <div className="chat-messages">
        {messages.map((message, index) => (
          <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
            <div className="avatar">{message.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}</div>
            <div className="message-body">
              <div>{message.content}</div>
              {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                <div className="message-attachments">
                  {message.attachments.map((item, i) => item.kind === 'image' ? (
                    <div className="attachment-card" key={`${item.name}-${i}`}><img src={item.previewUrl || item.data} alt={item.name || 'Bild'} /><span>{item.name}</span></div>
                  ) : item.kind === 'video' ? (
                    <div className="attachment-card video" key={`${item.name}-${i}`}>
                      {item.previewUrl ? <video src={item.previewUrl} controls playsInline /> : <div className="video-placeholder"><Video size={24}/></div>}
                      <span>{item.name} {item.size ? `· ${formatSize(item.size)}` : ''}</span>
                      {item.projectData?.data?.scenes?.length > 0 && <button className="edit-video-project-btn" onClick={() => onOpenVideoProject?.(item.projectData)}><Edit3 size={15}/>Im Video-Studio bearbeiten</button>}
                    </div>
                  ) : (
                    <div className="attachment-card file" key={`${item.name}-${i}`}>
                      <div className="file-placeholder"><FileText size={26}/></div>
                      <span>{item.name} {item.size ? `· ${formatSize(item.size)}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
        {loading && <article className="message assistant"><div className="avatar"><Bot size={18} /></div><div className="message-body typing">{status}</div></article>}
      </div>

      {attachments.length > 0 && (
        <div className="composer-attachments">
          {attachments.map((item) => (
            <div className="composer-card" key={item.id}>
              {item.kind === 'image' ? <img src={item.previewUrl} alt={item.name} /> : item.kind === 'video' ? <video src={item.previewUrl} controls playsInline /> : <div className="composer-file"><FileText size={24}/></div>}
              <div className="composer-meta"><b>{item.name}</b><span>{item.kind === 'image' ? 'Bild' : item.kind === 'video' ? 'Video' : 'Datei'} {item.size ? `· ${formatSize(item.size)}` : ''}{item.extracting ? ' · wird analysiert …' : ''}</span></div>
              <button type="button" onClick={() => removeAttachment(item.id)}><X size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="quick-row">{quickPrompts.map((prompt) => <button key={prompt} onClick={() => sendMessage(prompt)}><WandSparkles size={14} />{prompt}</button>)}</div>
      <div
        className={`chat-input-wrap dropzone ${dragActive ? 'drag-active' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <div className="chat-upload-row">
          <button type="button" className="upload-pill" onClick={() => imageInputRef.current?.click()}><ImagePlus size={15}/>Bild</button>
          <button type="button" className="upload-pill" onClick={() => videoInputRef.current?.click()}><Video size={15}/>Video</button>
          <button type="button" className="upload-pill" onClick={() => cameraImageRef.current?.click()}><Camera size={15}/>Foto machen</button>
          <button type="button" className="upload-pill" onClick={() => cameraVideoRef.current?.click()}><Video size={15}/>Video aufnehmen</button>
          <button type="button" className="upload-pill" onClick={() => anyFileRef.current?.click()}><Paperclip size={15}/>Datei</button>
          <input ref={imageInputRef} type="file" accept="image/*" onChange={onImageUpload} hidden />
          <input ref={videoInputRef} type="file" accept="video/*" onChange={onVideoUpload} hidden />
          <input ref={cameraImageRef} type="file" accept="image/*" capture="environment" onChange={onImageUpload} hidden />
          <input ref={cameraVideoRef} type="file" accept="video/*" capture="environment" onChange={onVideoUpload} hidden />
          <input ref={anyFileRef} type="file" multiple onChange={onAnyFileUpload} hidden />
        </div>
        <div className="drop-hint">Ziehe Bilder, Videos oder Dateien hier hinein – oder mache direkt ein Foto/Video.</div>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Frag Yildiz AI … oder schreibe z. B. 'Erstelle mir ein Bild …' / 'Erstelle mir ein Video …'" onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        }} />
        <button className="send-btn" onClick={() => sendMessage()} disabled={loading || !hasPayload}><ArrowUp size={20} /></button>
      </div>
      </section>
    </section>
  );
}
