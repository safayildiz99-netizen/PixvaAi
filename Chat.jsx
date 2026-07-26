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

function inferImageStyle(text) {
  const value = String(text || '').toLowerCase();
  if (/(werbebild|werbung|anzeige|kampagne|flyer|poster|social.?media|instagram.?post|banner|angebot)/.test(value)) return 'poster';
  if (/(produktfoto|produktbild|product shot|e.?commerce|freisteller|verpackung)/.test(value)) return 'product';
  if (/(studio|portrait|porträt|headshot)/.test(value)) return 'studio';
  return 'realistic';
}

function wantsImageReferenceForVideo(text) {
  const value = String(text || '').toLowerCase();
  return /(aus (diesem|dem|meinem|letzten) bild|dieses bild|das bild|daraus|bild zu video|image to video|animiere .*bild|verwende .*bild|nutze .*bild|mit dem bild)/.test(value);
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

async function prepareSoraReferenceImage(dataUrl, targetWidth = 720, targetHeight = 1280) {
  if (!String(dataUrl || '').startsWith('data:image/')) return '';

  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Das Referenzbild konnte nicht für Sora vorbereitet werden.'));
    element.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Das Referenzbild konnte nicht verarbeitet werden.');

  // Sora verlangt, dass das Referenzbild exakt dieselbe Breite und Höhe
  // wie das angeforderte Video besitzt. Das Bild wird mittig zugeschnitten.
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = (targetWidth - drawWidth) / 2;
  const drawY = (targetHeight - drawHeight) / 2;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  // JPEG hält die Anfrage deutlich kleiner als das ursprüngliche PNG.
  return canvas.toDataURL('image/jpeg', 0.9);
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


const CHAT_DB = 'yildiz-ai-chat-history-v2';
const CHAT_STORE = 'sessions';
const MAX_CLOUD_MEDIA_CHARS = 3_500_000;
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

function accountStorageKey(ownerKey) {
  const safeOwner = String(ownerKey || 'guest').trim() || 'guest';
  return `account:${safeOwner}`;
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

async function readLocalSavedChats(ownerKey) {
  const db = await openChatDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_STORE, 'readonly');
    const request = tx.objectStore(CHAT_STORE).get(accountStorageKey(ownerKey));
    request.onsuccess = () => resolve(Array.isArray(request.result?.value) ? request.result.value : []);
    request.onerror = () => reject(request.error);
  });
}

function cleanForLocalStorage(sessions) {
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

async function writeLocalSavedChats(ownerKey, sessions) {
  const db = await openChatDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_STORE, 'readwrite');
    tx.objectStore(CHAT_STORE).put({ key: accountStorageKey(ownerKey), value: cleanForLocalStorage(sessions) });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function portableString(value) {
  const text = String(value || '');
  if (!text || text.startsWith('blob:')) return '';
  if (text.startsWith('data:') && text.length > MAX_CLOUD_MEDIA_CHARS) return '';
  return text;
}

function cleanPortableValue(value, depth = 0) {
  if (depth > 8 || value == null) return value == null ? value : undefined;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined;
  if (typeof File !== 'undefined' && value instanceof File) return undefined;
  if (typeof value === 'string') return portableString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => cleanPortableValue(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, cleanPortableValue(item, depth + 1)])
      .filter(([, item]) => item !== undefined));
  }
  return undefined;
}

function cleanAttachmentForCloud(item) {
  const previewUrl = portableString(item.previewUrl || item.data || '');
  const data = portableString(item.data || '');
  return {
    kind: item.kind || 'file',
    name: item.name || 'Datei',
    size: Number(item.size || 0),
    mimeType: item.mimeType || '',
    previewUrl,
    data,
    frames: Array.isArray(item.frames) ? item.frames.map(portableString).filter(Boolean) : undefined,
    projectData: cleanPortableValue(item.projectData),
    cloudMediaMissing: Boolean((item.kind === 'video' || item.kind === 'file') && !previewUrl)
  };
}

function cleanForCloudStorage(sessions) {
  return sessions.map((session) => ({
    id: session.id,
    title: String(session.title || 'Neuer Chat').slice(0, 120),
    createdAt: Number(session.createdAt || Date.now()),
    updatedAt: Number(session.updatedAt || Date.now()),
    messages: (session.messages || []).map((message) => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: String(message.content || ''),
      attachments: Array.isArray(message.attachments)
        ? message.attachments.map(cleanAttachmentForCloud)
        : undefined
    }))
  }));
}

async function readCloudSavedChats() {
  const result = await api('/api/chat-state');
  return {
    chats: Array.isArray(result?.chats) ? result.chats : [],
    updatedAt: result?.updatedAt ? Date.parse(result.updatedAt) || 0 : 0
  };
}

async function writeCloudSavedChats(sessions) {
  const result = await api('/api/chat-state', {
    method: 'PUT',
    body: JSON.stringify({ chats: cleanForCloudStorage(sessions) })
  });
  return result?.updatedAt ? Date.parse(result.updatedAt) || Date.now() : Date.now();
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

export default function Chat({ onOpenVideoProject, accountId = 'guest', isGuest = true }) {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [historyReady, setHistoryReady] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Gemini beantwortet Fragen. OpenAI erstellt echte Bilder und Sora-Videos mit Ton. Uploads funktionieren per Drag & Drop.');
  const [attachments, setAttachments] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const cameraImageRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const anyFileRef = useRef(null);
  const lastSendRef = useRef({ text: '', at: 0 });
  const sendingRef = useRef(false);
  const cloudUpdatedAtRef = useRef(0);
  const ownerKey = useMemo(() => String(accountId || 'guest'), [accountId]);
  const cloudEnabled = !isGuest && ownerKey !== 'guest';
  const hasPayload = useMemo(() => Boolean(String(input || '').trim() || attachments.length), [input, attachments.length]);
  const filteredSessions = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    return chatSessions
      .filter((session) => !query || String(session.title || '').toLowerCase().includes(query))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }, [chatSessions, chatSearch]);

  useEffect(() => {
    let cancelled = false;

    async function loadChats() {
      try {
        let saved = [];
        if (cloudEnabled) {
          const remote = await readCloudSavedChats();
          saved = remote.chats;
          cloudUpdatedAtRef.current = remote.updatedAt;
        } else {
          saved = await readLocalSavedChats(ownerKey);
        }
        if (cancelled) return;
        const sessions = saved.length ? saved : [makeChatSession()];
        const first = sessions[0];
        setChatSessions(sessions);
        setActiveChatId(first.id);
        setMessages(hydrateMessages(first.messages));
        setHistoryReady(true);
        setStatus(cloudEnabled
          ? 'Deine Chats werden privat in deinem Konto gespeichert und auf deinen Geräten synchronisiert.'
          : 'Gast-Chats werden nur auf diesem Gerät gespeichert.');
      } catch (error) {
        try {
          const local = await readLocalSavedChats(ownerKey);
          if (cancelled) return;
          const sessions = local.length ? local : [makeChatSession()];
          const first = sessions[0];
          setChatSessions(sessions);
          setActiveChatId(first.id);
          setMessages(hydrateMessages(first.messages));
          setHistoryReady(true);
          setStatus(cloudEnabled
            ? `Cloud-Synchronisierung nicht erreichbar: ${error.message}. Lokale Sicherung wurde geöffnet.`
            : 'Chats konnten lokal nicht geladen werden.');
        } catch {
          if (cancelled) return;
          const first = makeChatSession();
          setChatSessions([first]);
          setActiveChatId(first.id);
          setMessages(first.messages);
          setHistoryReady(true);
        }
      }
    }

    loadChats();
    return () => { cancelled = true; };
  }, [cloudEnabled, ownerKey]);

  useEffect(() => {
    if (!historyReady || !activeChatId) return;
    setChatSessions((old) => old.map((session) => session.id === activeChatId
      ? { ...session, messages, updatedAt: Date.now() }
      : session));
  }, [messages, activeChatId, historyReady]);

  useEffect(() => {
    if (!historyReady || !chatSessions.length) return;
    const timer = setTimeout(async () => {
      try {
        await writeLocalSavedChats(ownerKey, chatSessions);
        if (cloudEnabled) cloudUpdatedAtRef.current = await writeCloudSavedChats(chatSessions);
      } catch (error) {
        setStatus(cloudEnabled
          ? `Chats konnten nicht mit deinem Konto synchronisiert werden: ${error.message}`
          : 'Chats konnten auf diesem Gerät nicht gespeichert werden.');
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [chatSessions, historyReady, cloudEnabled, ownerKey]);

  useEffect(() => {
    if (!cloudEnabled || !historyReady) return undefined;
    let busy = false;
    const refreshFromCloud = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const remote = await readCloudSavedChats();
        if (remote.updatedAt > cloudUpdatedAtRef.current + 500 && remote.chats.length) {
          cloudUpdatedAtRef.current = remote.updatedAt;
          const first = remote.chats.find((item) => item.id === activeChatId) || remote.chats[0];
          setChatSessions(remote.chats);
          setActiveChatId(first.id);
          setMessages(hydrateMessages(first.messages));
          setStatus('Neueste Chats aus deinem Konto wurden geladen.');
        }
      } catch {
        // Die lokale Sicherung bleibt erhalten; beim nächsten Fokus wird erneut versucht.
      } finally {
        busy = false;
      }
    };
    window.addEventListener('focus', refreshFromCloud);
    document.addEventListener('visibilitychange', refreshFromCloud);
    return () => {
      window.removeEventListener('focus', refreshFromCloud);
      document.removeEventListener('visibilitychange', refreshFromCloud);
    };
  }, [cloudEnabled, historyReady, activeChatId]);

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
    setStatus('OpenAI erstellt dein Bild …');
    const result = await api('/api/ai/image', {
      method: 'POST',
      body: JSON.stringify({
        prompt: clean,
        aspect: 'post',
        style: inferImageStyle(clean),
        quality: 'medium'
      })
    });
    const imageSource = result?.imageDataUrl || result?.imageUrl || '';
    if (!imageSource) throw new Error('OpenAI hat keine Bilddatei geliefert.');
    await preloadImage(imageSource);
    setMessages((old) => [...old, {
      role: 'assistant',
      content: 'Hier ist dein mit OpenAI GPT Image 2 erstelltes Bild in mittlerer Qualität. Du kannst es speichern oder ausdrücklich als Referenz für ein Sora-Video verwenden.',
      attachments: [{ kind: 'image', name: 'yildiz-ai-openai.png', previewUrl: imageSource, data: result?.imageDataUrl || '' }]
    }]);
    setStatus(`Bild erstellt · ${result.provider || 'OpenAI'}`);
  }

  async function waitForSoraVideo(jobId) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 12 * 60 * 1000) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const job = await api(`/api/ai/video?action=status&id=${encodeURIComponent(jobId)}`);
      const progress = Number(job?.progress || 0);
      setStatus(job?.status === 'queued' ? 'Sora: Auftrag wartet …' : `Sora erstellt dein Video … ${progress ? `${Math.round(progress)} %` : ''}`);
      if (job?.status === 'completed') return job;
      if (job?.status === 'failed') throw new Error(job?.error?.message || 'Sora konnte das Video nicht erstellen.');
    }
    throw new Error('Sora braucht länger als erwartet. Der Auftrag läuft möglicherweise noch; versuche es später erneut.');
  }

  async function downloadSoraVideo(jobId) {
    const response = await fetch(`/api/ai/video?action=content&id=${encodeURIComponent(jobId)}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || 'Das fertige Sora-Video konnte nicht geladen werden.');
    }
    const blob = await response.blob();
    return { blob, url: URL.createObjectURL(blob) };
  }

  async function generateVideoMessage(clean, sourceImages = []) {
    const rawReferenceImage = sourceImages.find((value) => String(value || '').startsWith('data:image/')) || '';
    setStatus(rawReferenceImage ? 'Referenzbild wird für Sora angepasst …' : 'Sora-Videoauftrag wird gestartet …');
    const referenceImage = rawReferenceImage
      ? await prepareSoraReferenceImage(rawReferenceImage, 720, 1280)
      : '';

    setStatus('Sora-Videoauftrag wird gestartet …');
    const created = await api('/api/ai/video', {
      method: 'POST',
      body: JSON.stringify({
        prompt: clean,
        aspect: 'story',
        size: '720x1280',
        seconds: '8',
        model: 'sora-2',
        referenceImage
      })
    });
    if (!created?.id) throw new Error('OpenAI hat keine Video-ID geliefert.');

    const completed = ['completed', 'failed'].includes(created.status) ? created : await waitForSoraVideo(created.id);
    if (completed.status !== 'completed') throw new Error(completed?.error?.message || 'Sora konnte das Video nicht erstellen.');
    setStatus('Sora-Video fertig. MP4 wird geladen …');
    const video = await downloadSoraVideo(created.id);
    const duration = Number(completed.seconds || created.seconds || 8);

    const editableScene = {
      id: crypto.randomUUID(),
      title: 'SORA VIDEO',
      prompt: clean,
      duration,
      imageUrl: '',
      videoUrl: video.url,
      fileName: 'sora-video.mp4',
      mediaType: 'video',
      status: 'Mit OpenAI Sora erstellt',
      transition: 'fade',
      animation: 'none',
      textPosition: 'bottom',
      textColor: '#ffffff',
      accentColor: '#ffd400',
      overlayOpacity: 0.25,
      fontScale: 1,
      fontFamily: 'Arial',
      fontWeight: 800,
      textAlign: 'left',
      showText: false,
      trimStart: 0,
      mediaScale: 1,
      mediaX: 0,
      mediaY: 0,
      mediaRotation: 0,
      mediaOpacity: 1,
      textX: 7,
      textY: 76
    };

    const videoProject = {
      name: String(clean || 'Sora Video').slice(0, 64),
      type: 'video',
      data: { scenes: [editableScene], format: 'story', musicStyle: 'none', musicVolume: 0 }
    };

    setMessages((old) => [...old, {
      role: 'assistant',
      content: 'Hier ist dein echtes Sora-Video mit synchronisiertem Ton. Du kannst den Clip im Video-Studio zuschneiden, positionieren, mit Text ergänzen und mit weiteren Szenen kombinieren.',
      attachments: [{
        kind: 'video',
        name: 'yildiz-ai-sora.mp4',
        previewUrl: video.url,
        blob: video.blob,
        projectData: videoProject
      }]
    }]);
    setStatus('Sora-Video erstellt · MP4 · mit Ton');
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

        // Ein normales Text-zu-Video darf nicht automatisch das letzte Chat-Bild
        // als Inpaint-Referenz mitsenden. Das verursachte den Größenfehler.
        let videoReferenceImages = uploadedImages;
        if (!uploadedImages.length && wantsImageReferenceForVideo(clean)) {
          videoReferenceImages = [...messages].reverse()
            .flatMap((message) => Array.isArray(message.attachments) ? message.attachments : [])
            .filter((item) => item.kind === 'image')
            .map((item) => item.previewUrl || item.data)
            .filter(Boolean)
            .slice(0, 1);
        }
        await generateVideoMessage(clean, videoReferenceImages);
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
        <p className="chat-save-note">{cloudEnabled ? 'Chats sind privat an dieses Konto gebunden und werden geräteübergreifend synchronisiert.' : 'Gast-Chats bleiben nur auf diesem Gerät.'} Mit „Chat speichern“ kannst du zusätzlich eine TXT-Datei herunterladen.</p>
      </aside>
      <section className="chat-shell">
      <div className="local-ai-banner"><Cloud size={17}/><div><b>Yildiz AI · Gemini + OpenAI + Sora</b><span>{status} · Keine lokale GPU und keine Pflicht-Anmeldung</span></div></div>
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
                      {item.previewUrl ? <video src={item.previewUrl} controls playsInline /> : <div className="video-placeholder"><Video size={24}/><small>{item.cloudMediaMissing ? 'Videodatei war nur lokal verfügbar' : 'Keine Vorschau'}</small></div>}
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
