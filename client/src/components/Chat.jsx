import { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { ArrowUp, Bot, Camera, Check, ChevronDown, ChevronUp, Cloud, Copy, Download, Edit3, ExternalLink, FileDown, FileText, ImagePlus, Images, Menu, MessageSquarePlus, Paperclip, Pin, PinOff, RotateCcw, Search, Settings2, Square, Trash2, User, Video, WandSparkles, X } from 'lucide-react';
import { api, getToken } from '../api.js';

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


function looksLikeFreeImageSearchPrompt(text) {
  const value = String(text || '').toLowerCase();
  const asksForExisting = /(gib|zeig|find|finde|such|suche|such mir|wo finde|bild von|foto von|produktbild|packung|verpackung)/.test(value);
  const asksForImage = /(bild|foto|produkt|packung|verpackung|logo)/.test(value);
  const asksToGenerate = /(erstell|erstelle|generier|generiere|zeichne|male|entwirf|design|werbebild|poster|flyer)/.test(value);
  return asksForExisting && asksForImage && !asksToGenerate;
}

function extractImageSearchQuery(text) {
  let value = String(text || '').trim();
  value = value
    .replace(/^\s*(gib|zeige?|finde?|suche?|such)\s+(mir\s+)?/i, '')
    .replace(/\s+als\s+(pdf|datei|jpg|jpeg|png)\b.*$/i, '')
    .replace(/\b(ein|eine|einen|das|die|der)\s+(bild|foto|produktbild)\s+(von|der|des)?\s*/i, '')
    .replace(/[?!]+$/g, '')
    .trim();
  return `${value || String(text || '').trim()} Produktbild`.replace(/\s+/g, ' ').slice(0, 180);
}

function requestedFileType(text) {
  const value = String(text || '').toLowerCase();
  if (/\b(pdf)\b/.test(value)) return 'pdf';
  if (/\b(csv)\b/.test(value)) return 'csv';
  if (/\b(json)\b/.test(value)) return 'json';
  if (/\b(html?)\b|webseite als datei/.test(value)) return 'html';
  if (/\b(markdown|md-datei)\b/.test(value)) return 'md';
  if (/\b(txt|textdatei)\b/.test(value)) return 'txt';
  return '';
}

function safeFileName(value, fallback = 'yildiz-ai-datei') {
  const clean = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return clean || fallback;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Datei konnte nicht vorbereitet werden.'));
    reader.readAsDataURL(blob);
  });
}

async function fetchRemoteImageDataUrl(url) {
  const response = await fetch(`/api/ai/image-proxy?url=${encodeURIComponent(url)}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || 'Produktbild konnte nicht geladen werden.');
  }
  return blobToDataUrl(await response.blob());
}

async function normalizeImageDataUrlForPdf(dataUrl) {
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Bild konnte nicht in die PDF eingefügt werden.'));
    element.src = dataUrl;
  });
  const max = 1800;
  const scale = Math.min(1, max / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

async function createFileAttachment(type, content, title = 'Yildiz AI', imageUrl = '') {
  const base = safeFileName(title, 'yildiz-ai');
  let blob;
  let name;
  let mimeType;

  if (type === 'pdf') {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const margin = 16;
    pdf.setProperties({ title, creator: 'Yildiz AI' });
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(String(title || 'Yildiz AI').slice(0, 90), margin, 18);
    let cursorY = 28;
    if (imageUrl) {
      const source = String(imageUrl).startsWith('data:image/') ? imageUrl : await fetchRemoteImageDataUrl(imageUrl);
      const jpeg = await normalizeImageDataUrlForPdf(source);
      const props = pdf.getImageProperties(jpeg);
      const maxWidth = 210 - margin * 2;
      const maxHeight = 230;
      const ratio = Math.min(maxWidth / props.width, maxHeight / props.height);
      const width = props.width * ratio;
      const height = props.height * ratio;
      pdf.addImage(jpeg, 'JPEG', (210 - width) / 2, cursorY, width, height, undefined, 'FAST');
      cursorY += height + 8;
    }
    const cleanText = String(content || '').replace(/https?:\/\/\S+/g, (url) => url.slice(0, 110));
    if (cleanText.trim()) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.5);
      const lines = pdf.splitTextToSize(cleanText, 210 - margin * 2);
      for (const line of lines) {
        if (cursorY > 282) { pdf.addPage(); cursorY = 18; }
        pdf.text(line, margin, cursorY);
        cursorY += 5.2;
      }
    }
    blob = pdf.output('blob');
    name = `${base}.pdf`;
    mimeType = 'application/pdf';
  } else {
    const map = {
      csv: ['text/csv;charset=utf-8', 'csv'], json: ['application/json;charset=utf-8', 'json'],
      html: ['text/html;charset=utf-8', 'html'], md: ['text/markdown;charset=utf-8', 'md'],
      txt: ['text/plain;charset=utf-8', 'txt']
    };
    const [mime, extension] = map[type] || map.txt;
    blob = new Blob([String(content || '')], { type: mime });
    name = `${base}.${extension}`;
    mimeType = mime;
  }
  const previewUrl = URL.createObjectURL(blob);
  let data = '';
  if (blob.size < 2300000) data = await blobToDataUrl(blob).catch(() => '');
  return { kind: 'file', name, size: blob.size, mimeType, previewUrl, data, blob };
}

function openExternal(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function MessageContent({ text }) {
  const lines = String(text || '').split(/\n/);
  return <div className="message-markdown">{lines.map((line, index) => {
    const value = line.trim();
    if (!value) return <br key={index}/>;
    if (/^#{1,3}\s+/.test(value)) return <strong className="md-heading" key={index}>{value.replace(/^#{1,3}\s+/, '')}</strong>;
    if (/^[-*]\s+/.test(value)) return <div className="md-list-item" key={index}><span>•</span><span>{value.replace(/^[-*]\s+/, '')}</span></div>;
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return <div key={index}>{parts.map((part, partIndex) => /^\*\*.*\*\*$/.test(part) ? <strong key={partIndex}>{part.slice(2,-2)}</strong> : <span key={partIndex}>{part}</span>)}</div>;
  })}</div>;
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

function formatUsd(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function estimateImagePrice(settings) {
  const portrait = settings.aspect !== 'square';
  const table = {
    low: portrait ? 0.02 : 0.015,
    medium: portrait ? 0.07 : 0.05,
    high: portrait ? 0.24 : 0.18,
    auto: portrait ? 0.07 : 0.05
  };
  return table[settings.quality] ?? table.medium;
}

function estimateVideoPrice(settings) {
  const seconds = Number(settings.seconds || 4);
  return seconds * (settings.model === 'sora-2-pro' ? 0.30 : 0.10);
}

function delayWithSignal(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Abgebrochen', 'AbortError'));
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); cleanup(); reject(new DOMException('Abgebrochen', 'AbortError')); };
    const cleanup = () => signal?.removeEventListener('abort', abort);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function prepareImageEditReference(dataUrl, maxEdge = 1536) {
  if (!String(dataUrl || '').startsWith('data:image/')) return '';
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Das Referenzbild konnte nicht vorbereitet werden.'));
    element.src = dataUrl;
  });
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Das Referenzbild konnte nicht verarbeitet werden.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

function downloadMedia(source, filename) {
  const anchor = document.createElement('a');
  anchor.href = source;
  anchor.download = filename || 'yildiz-ai-datei';
  anchor.click();
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
  return { kind: 'file', name: item.name, size: item.size, mimeType: item.mimeType, data: item.data || '', text: item.text || '', blob: item.blob };
}


const CHAT_DB = 'yildiz-ai-chat-history-v2';
const CHAT_STORE = 'sessions';
const MAX_CLOUD_MEDIA_CHARS = 3_500_000;
const WELCOME_MESSAGE = { id: 'welcome', role: 'assistant', createdAt: Date.now(), content: 'Hallo! Ich bin Yildiz AI. Du kannst mir Fragen stellen, Bilder und Videos direkt erzeugen sowie Dateien erstellen und per Drag & Drop hochladen.' };

function makeChatSession() {
  return {
    id: crypto.randomUUID(),
    title: 'Neuer Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
    messages: [{ ...WELCOME_MESSAGE }]
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
    imageUrl: portableString(item.imageUrl || ''),
    sourceUrl: portableString(item.sourceUrl || ''),
    title: String(item.title || '').slice(0, 180),
    source: String(item.source || '').slice(0, 120),
    text: String(item.text || '').slice(0, 30000),
    searchQuery: String(item.searchQuery || '').slice(0, 180),
    cloudMediaMissing: Boolean((item.kind === 'video' || item.kind === 'file') && !previewUrl)
  };
}

function cleanForCloudStorage(sessions) {
  return sessions.map((session) => ({
    id: session.id,
    title: String(session.title || 'Neuer Chat').slice(0, 120),
    createdAt: Number(session.createdAt || Date.now()),
    updatedAt: Number(session.updatedAt || Date.now()),
    pinned: Boolean(session.pinned),
    messages: (session.messages || []).map((message) => ({
      id: String(message.id || crypto.randomUUID()),
      role: message.role === 'user' ? 'user' : 'assistant',
      createdAt: Number(message.createdAt || Date.now()),
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
    id: message.id || crypto.randomUUID(),
    createdAt: Number(message.createdAt || Date.now()),
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

export default function Chat({ onOpenVideoProject, accountId = 'guest', isGuest = true, uiText = {} }) {
  const welcomeMessage = useMemo(() => ({ ...WELCOME_MESSAGE, content: uiText.welcome || WELCOME_MESSAGE.content }), [uiText.welcome]);
  const [messages, setMessages] = useState([welcomeMessage]);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [historyReady, setHistoryReady] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Gemini beantwortet Fragen. OpenAI erstellt echte Bilder und Sora-Videos mit Ton. Uploads funktionieren per Drag & Drop.');
  const [attachments, setAttachments] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [creationMode, setCreationMode] = useState('auto');
  const [showMediaSettings, setShowMediaSettings] = useState(false);
  const [imageSettings, setImageSettings] = useState({ aspect: 'post', quality: 'medium', style: 'auto', model: 'gpt-image-2', background: 'auto' });
  const [videoSettings, setVideoSettings] = useState({ seconds: '4', aspect: 'story', model: 'sora-2', useReference: false });
  const [editingMessageId, setEditingMessageId] = useState('');
  const [editingText, setEditingText] = useState('');
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const cameraImageRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const anyFileRef = useRef(null);
  const lastSendRef = useRef({ text: '', at: 0 });
  const sendingRef = useRef(false);
  const abortRef = useRef(null);
  const activeVideoJobRef = useRef(null);
  const activeChatIdRef = useRef('');
  const generationRef = useRef({ id: '', chatId: '' });
  const cloudUpdatedAtRef = useRef(0);
  const ownerKey = useMemo(() => String(accountId || 'guest'), [accountId]);
  const cloudEnabled = !isGuest && ownerKey !== 'guest';
  const hasPayload = useMemo(() => Boolean(String(input || '').trim() || attachments.length), [input, attachments.length]);
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);
  useEffect(() => {
    if (!historyOpen) return undefined;
    const close = (event) => { if (event.key === 'Escape') setHistoryOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [historyOpen]);

  function isCurrentGeneration(runId) {
    return Boolean(runId) && generationRef.current.id === runId && generationRef.current.chatId === activeChatIdRef.current;
  }

  function setGenerationStatus(runId, text) {
    if (isCurrentGeneration(runId)) setStatus(text);
  }

  function appendGenerationMessage(runId, message) {
    if (!isCurrentGeneration(runId)) return false;
    setMessages((old) => [...old, message]);
    return true;
  }

  const filteredSessions = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    return chatSessions
      .filter((session) => !query || String(session.title || '').toLowerCase().includes(query))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
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
        setMessages(hydrateMessages(first.messages).map((message)=>message.id==='welcome'?{...message,content:uiText.welcome||message.content}:message));
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
          setMessages(hydrateMessages(first.messages).map((message)=>message.id==='welcome'?{...message,content:uiText.welcome||message.content}:message));
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
    setHistoryOpen(false);
    if (loading) stopGeneration();
    sendingRef.current = false;
    const next = makeChatSession();
    next.messages = [{ ...welcomeMessage }];
    setChatSessions((old) => [next, ...old]);
    setActiveChatId(next.id);
    setMessages(next.messages);
    setAttachments([]);
    setInput('');
    setStatus('Neuer Chat geöffnet.');
  }

  function openChat(session) {
    setHistoryOpen(false);
    if (loading) stopGeneration();
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
        if (!remaining.length) {
          next.messages = [{ ...welcomeMessage }];
          remaining.push(next);
        }
        setActiveChatId(next.id);
        setMessages(hydrateMessages(next.messages));
      }
      return remaining;
    });
  }

  function renameChat(event, session) {
    event.stopPropagation();
    const title = window.prompt('Neuer Chatname:', session.title || 'Neuer Chat');
    if (!title?.trim()) return;
    setChatSessions((old) => old.map((item) => item.id === session.id ? { ...item, title: title.trim().slice(0, 120), updatedAt: Date.now() } : item));
  }

  function togglePinChat(event, session) {
    event.stopPropagation();
    setChatSessions((old) => old.map((item) => item.id === session.id ? { ...item, pinned: !item.pinned, updatedAt: Date.now() } : item));
  }

  function deleteAllChats() {
    if (!window.confirm('Wirklich alle Chats dieses Kontos löschen?')) return;
    const next = makeChatSession();
    next.messages = [{ ...welcomeMessage }];
    setChatSessions([next]);
    setActiveChatId(next.id);
    setMessages(next.messages);
    setStatus('Alle Chats wurden gelöscht.');
  }

  async function copyMessage(message) {
    try {
      await navigator.clipboard.writeText(String(message.content || ''));
      setStatus('Nachricht kopiert.');
    } catch {
      setStatus('Nachricht konnte nicht kopiert werden.');
    }
  }

  function deleteMessage(messageId) {
    setMessages((old) => old.filter((message) => message.id !== messageId));
  }

  function startEditMessage(message) {
    setEditingMessageId(message.id);
    setEditingText(message.content || '');
  }

  function saveEditedMessage() {
    const clean = editingText.trim();
    if (!clean) return;
    setMessages((old) => old.map((message) => message.id === editingMessageId ? { ...message, content: clean, editedAt: Date.now() } : message));
    setEditingMessageId('');
    setEditingText('');
    setStatus('Nachricht geändert.');
  }

  function reuseImage(item) {
    const source = item.data || item.previewUrl;
    if (!source) return setStatus('Dieses Bild ist nicht mehr lokal verfügbar.');
    setAttachments((old) => [...old, {
      id: crypto.randomUUID(), kind: 'image', name: item.name || 'referenz.png', size: item.size || 0,
      mimeType: item.mimeType || 'image/png', previewUrl: source, data: source
    }].slice(-4));
    setCreationMode('image');
    setShowMediaSettings(true);
    setStatus('Bild als Referenz hinzugefügt. Beschreibe jetzt die gewünschte Änderung.');
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

  async function addGenericFile(file) {
    const mimeType = file.type || 'application/octet-stream';
    const item = { id: crypto.randomUUID(), kind: 'file', name: file.name, size: file.size, mimeType, blob: file, data: '', text: '' };
    if (file.size <= 8 * 1024 * 1024 && mimeType === 'application/pdf') {
      item.data = await blobToDataUrl(file);
    } else if (file.size <= 2 * 1024 * 1024 && (/^text\//.test(mimeType) || /\.(txt|csv|json|md|html?|xml)$/i.test(file.name))) {
      item.text = await file.text();
    }
    setAttachments((old) => [...old, item].slice(-4));
    setStatus(`Datei „${file.name}“ hinzugefügt${item.data || item.text ? ' und für die Analyse vorbereitet' : ''}.`);
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
      else await addGenericFile(file);
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

  async function generateImageMessage(clean, selectedAttachments, signal, requestId, runId) {
    const referenceItem = selectedAttachments.find((item) => item.kind === 'image' && (item.data || item.previewUrl));
    setGenerationStatus(runId, referenceItem ? 'OpenAI bearbeitet dein Referenzbild …' : 'OpenAI erstellt dein Bild …');
    const referenceImage = referenceItem ? await prepareImageEditReference(referenceItem.data || referenceItem.previewUrl) : '';
    const result = await api('/api/ai/image', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        requestId,
        prompt: clean,
        aspect: imageSettings.aspect,
        style: imageSettings.style === 'auto' ? inferImageStyle(clean) : imageSettings.style,
        quality: imageSettings.quality,
        model: imageSettings.model,
        background: imageSettings.background,
        referenceImage
      })
    });
    const imageSource = result?.imageDataUrl || result?.imageUrl || '';
    if (!imageSource) throw new Error('OpenAI hat keine Bilddatei geliefert.');
    await preloadImage(imageSource);
    const imageAttachment = {
      kind: 'image',
      name: result.edited
        ? `yildiz-ai-bearbeitet.${result.mimeType === 'image/png' ? 'png' : 'webp'}`
        : `yildiz-ai-openai.${result.mimeType === 'image/png' ? 'png' : 'webp'}`,
      previewUrl: imageSource,
      data: result?.imageDataUrl || imageSource,
      mimeType: result.mimeType || (String(imageSource).startsWith('data:image/webp') ? 'image/webp' : 'image/png')
    };
    const generatedAttachments = [imageAttachment];
    if (requestedFileType(clean) === 'pdf') {
      try {
        generatedAttachments.push(await createFileAttachment('pdf', 'Mit Yildiz AI erstelltes Bild.', clean.slice(0, 72) || 'Yildiz AI Bild', imageSource));
      } catch {}
    }
    appendGenerationMessage(runId, {
      id: crypto.randomUUID(),
      role: 'assistant',
      createdAt: Date.now(),
      content: `${result.edited ? 'Bild bearbeitet' : 'Bild erstellt'} · ${result.provider || 'OpenAI'} · ${imageSettings.quality} · geschätzt ${formatUsd(result.estimatedCostUsd ?? estimateImagePrice(imageSettings))}.${requestedFileType(clean) === 'pdf' ? ' PDF wurde ebenfalls erstellt.' : ''}`,
      attachments: generatedAttachments
    });
    setGenerationStatus(runId, `Bild fertig · ${result.provider || 'OpenAI'}`);
  }

  async function waitForSoraVideo(jobId, requestId, signal, runId) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 12 * 60 * 1000) {
      await delayWithSignal(7000, signal);
      const job = await api(`/api/ai/video?action=status&id=${encodeURIComponent(jobId)}&requestId=${encodeURIComponent(requestId)}`, { signal });
      const progress = Number(job?.progress || 0);
      setGenerationStatus(runId, job?.status === 'queued' ? 'Sora: Auftrag wartet …' : `Sora erstellt dein Video … ${progress ? `${Math.round(progress)} %` : ''}`);
      if (job?.status === 'completed') return job;
      if (job?.status === 'failed') throw new Error(job?.error?.message || 'Sora konnte das Video nicht erstellen.');
    }
    throw new Error('Sora braucht länger als erwartet. Der Auftrag läuft möglicherweise noch.');
  }

  async function downloadSoraVideo(jobId, requestId, signal) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api/ai/video?action=content&id=${encodeURIComponent(jobId)}&requestId=${encodeURIComponent(requestId)}`, { signal, headers });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || 'Das fertige Sora-Video konnte nicht geladen werden.');
    }
    const blob = await response.blob();
    return { blob, url: URL.createObjectURL(blob) };
  }

  async function generateVideoMessage(clean, sourceImages, signal, requestId, runId) {
    const targetWidth = videoSettings.aspect === 'landscape' ? 1280 : 720;
    const targetHeight = videoSettings.aspect === 'landscape' ? 720 : 1280;
    const rawReferenceImage = sourceImages.find((value) => String(value || '').startsWith('data:image/')) || '';
    setGenerationStatus(runId, rawReferenceImage ? 'Referenzbild wird exakt für Sora angepasst …' : 'Sora-Videoauftrag wird gestartet …');
    const referenceImage = rawReferenceImage
      ? await prepareSoraReferenceImage(rawReferenceImage, targetWidth, targetHeight)
      : '';

    const created = await api('/api/ai/video', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        requestId,
        prompt: clean,
        aspect: videoSettings.aspect,
        size: `${targetWidth}x${targetHeight}`,
        seconds: videoSettings.seconds,
        model: videoSettings.model,
        referenceImage
      })
    });
    if (!created?.id) throw new Error('OpenAI hat keine Video-ID geliefert.');
    activeVideoJobRef.current = { id: created.id, requestId };

    const completed = ['completed', 'failed'].includes(created.status)
      ? created
      : await waitForSoraVideo(created.id, requestId, signal, runId);
    if (completed.status !== 'completed') throw new Error(completed?.error?.message || 'Sora konnte das Video nicht erstellen.');
    setGenerationStatus(runId, 'Sora-Video fertig. MP4 wird geladen …');
    const video = await downloadSoraVideo(created.id, requestId, signal);
    const duration = Number(completed.seconds || created.seconds || videoSettings.seconds || 4);

    const editableScene = {
      id: crypto.randomUUID(), title: 'SORA VIDEO', prompt: clean, duration,
      imageUrl: '', videoUrl: video.url, fileName: 'sora-video.mp4', mediaType: 'video',
      status: 'Mit OpenAI Sora erstellt', transition: 'fade', animation: 'none',
      textPosition: 'bottom', textColor: '#ffffff', accentColor: '#ffd400', overlayOpacity: 0.25,
      fontScale: 1, fontFamily: 'Arial', fontWeight: 800, textAlign: 'left', showText: false,
      trimStart: 0, mediaScale: 1, mediaX: 0, mediaY: 0, mediaRotation: 0, mediaOpacity: 1,
      textX: 7, textY: 76
    };
    const videoProject = {
      name: String(clean || 'Sora Video').slice(0, 64), type: 'video',
      data: { scenes: [editableScene], format: videoSettings.aspect === 'landscape' ? 'landscape' : 'story', musicStyle: 'none', musicVolume: 0 }
    };

    appendGenerationMessage(runId, {
      id: crypto.randomUUID(),
      role: 'assistant',
      createdAt: Date.now(),
      content: `Sora-Video fertig · ${duration} Sekunden · ${created.model || videoSettings.model} · geschätzt ${formatUsd(created.estimatedCostUsd ?? estimateVideoPrice(videoSettings))}.`,
      attachments: [{ kind: 'video', name: 'yildiz-ai-sora.mp4', previewUrl: video.url, blob: video.blob, projectData: videoProject }]
    });
    activeVideoJobRef.current = null;
    setGenerationStatus(runId, 'Sora-Video erstellt · MP4 · mit Ton');
  }


  async function createPdfFromSearchResult(item, title = 'Produktbild') {
    try {
      setStatus('PDF wird erstellt …');
      const file = await createFileAttachment('pdf', `Bildquelle: ${item.sourceUrl || item.imageUrl || ''}`, title, item.imageUrl || item.thumbnailUrl);
      setMessages((old) => [...old, {
        id: crypto.randomUUID(), role: 'assistant', createdAt: Date.now(),
        content: 'PDF fertig erstellt.', attachments: [file]
      }]);
      setStatus('PDF wurde erstellt und kann heruntergeladen werden.');
    } catch (error) {
      setStatus(error.message || 'PDF konnte nicht erstellt werden.');
    }
  }

  async function generateFreeImageSearchMessage(clean, signal, runId) {
    const query = extractImageSearchQuery(clean);
    setGenerationStatus(runId, 'Kostenlose Produktbildsuche läuft …');
    const response = await fetch(`/api/ai/image-search?q=${encodeURIComponent(query)}`, { signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Die kostenlose Bildsuche ist fehlgeschlagen.');
    const results = Array.isArray(data.results) ? data.results : [];
    const attachments = results.map((item) => ({
      kind: 'image-link',
      name: item.title || query,
      title: item.title || query,
      previewUrl: `/api/ai/image-proxy?url=${encodeURIComponent(item.thumbnailUrl || item.imageUrl)}`,
      imageUrl: item.imageUrl || item.thumbnailUrl,
      thumbnailUrl: item.thumbnailUrl || item.imageUrl,
      sourceUrl: item.sourceUrl,
      source: item.source,
      searchQuery: query
    }));
    const fileType = requestedFileType(clean);
    if (fileType === 'pdf' && attachments[0]?.imageUrl) {
      try {
        const pdf = await createFileAttachment('pdf', `Kostenlos gefundenes Produktbild.\nQuelle: ${attachments[0].sourceUrl || attachments[0].imageUrl}`, attachments[0].title || query, attachments[0].imageUrl);
        attachments.unshift(pdf);
      } catch (error) {
        attachments.unshift({ kind: 'link', name: 'PDF konnte nicht automatisch erstellt werden', title: error.message, sourceUrl: data.searchLinks?.googleImages || '' });
      }
    }
    if (!results.length) {
      attachments.push({ kind: 'link', name: 'Google Bilder öffnen', title: query, sourceUrl: data.searchLinks?.googleImages });
      attachments.push({ kind: 'link', name: 'Bing Bilder öffnen', title: query, sourceUrl: data.searchLinks?.bingImages });
    }
    appendGenerationMessage(runId, {
      id: crypto.randomUUID(), role: 'assistant', createdAt: Date.now(),
      content: results.length
        ? `Hier sind kostenlos gefundene Bilder zu „${query.replace(/ Produktbild$/i, '')}“. Dafür wurde kein OpenAI-Guthaben verbraucht. Prüfe vor einer gewerblichen Nutzung die Bildrechte der jeweiligen Quelle.${fileType === 'pdf' ? ' Die PDF wurde direkt erstellt.' : ''}`
        : `Direkte Bildtreffer konnten gerade nicht geladen werden. Öffne einen der kostenlosen Suchlinks für „${query.replace(/ Produktbild$/i, '')}“.`,
      attachments
    });
    setGenerationStatus(runId, 'Kostenlose Bildsuche abgeschlossen · 0,00 €');
  }

  async function attachRequestedFile(runId, clean, answer) {
    const type = requestedFileType(clean);
    if (!type) return false;
    const title = clean.replace(/\b(als|in)\s+(pdf|csv|json|html?|markdown|md-datei|txt|textdatei)\b.*$/i, '').trim().slice(0, 80) || 'Yildiz AI Datei';
    const file = await createFileAttachment(type, answer, title);
    appendGenerationMessage(runId, {
      id: crypto.randomUUID(), role: 'assistant', createdAt: Date.now(),
      content: `Fertig – ich habe die ${type.toUpperCase()}-Datei erstellt.`,
      attachments: [file]
    });
    setGenerationStatus(runId, `${type.toUpperCase()}-Datei erstellt.`);
    return true;
  }

  async function stopGeneration() {
    const activeRun = generationRef.current.id;
    abortRef.current?.controller?.abort();
    const active = activeVideoJobRef.current;
    if (active?.id) {
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      fetch(`/api/ai/video?action=delete&id=${encodeURIComponent(active.id)}&requestId=${encodeURIComponent(active.requestId)}`, { method: 'DELETE', headers }).catch(() => {});
    }
    activeVideoJobRef.current = null;
    generationRef.current = { id: '', chatId: '' };
    abortRef.current = null;
    sendingRef.current = false;
    setLoading(false);
    if (activeRun) setStatus('Erstellung abgebrochen.');
  }

  function retryAssistant(index) {
    let userIndex = index - 1;
    while (userIndex >= 0 && messages[userIndex]?.role !== 'user') userIndex -= 1;
    if (userIndex < 0) return;
    const userMessage = messages[userIndex];
    const restoredAttachments = (userMessage.attachments || []).map((item) => ({ ...item, id: crypto.randomUUID() }));
    const displayBase = messages.slice(0, index);
    const historyBase = messages.slice(0, userIndex);
    sendMessage(userMessage.content, restoredAttachments, { retry: true, appendUser: false, displayBase, historyBase });
  }

  async function sendMessage(text = input, providedAttachments = attachments, options = {}) {
    const clean = String(text || '').trim();
    const selectedAttachments = Array.isArray(providedAttachments) ? providedAttachments : [];
    if (sendingRef.current) return;
    const now = Date.now();
    if (!options.retry && clean && lastSendRef.current.text === clean && now - lastSendRef.current.at < 5000) return;
    if ((!clean && !selectedAttachments.length) || loading) return;
    if (selectedAttachments.some((item) => item.extracting)) {
      setStatus('Bitte kurz warten, bis die Videoframes vorbereitet sind.');
      return;
    }

    const videoAction = creationMode === 'video' || (creationMode === 'auto' && clean && looksLikeVideoPrompt(clean));
    const imageSearchAction = !videoAction && clean && looksLikeFreeImageSearchPrompt(clean);
    const imageAction = !videoAction && !imageSearchAction && (creationMode === 'image' || (creationMode === 'auto' && clean && looksLikeImagePrompt(clean)));
    if ((videoAction || imageAction) && isGuest) {
      setStatus('Bitte anmelden: Kostenpflichtige OpenAI-Bilder und Sora-Videos sind zum Schutz deines Guthabens nur für Konten freigeschaltet.');
      return;
    }

    if (imageAction) {
      const accepted = window.confirm(`Geschätzte Kosten für dieses Bild: ${formatUsd(estimateImagePrice(imageSettings))}. Jetzt erstellen?`);
      if (!accepted) return;
    }
    if (videoAction) {
      const accepted = window.confirm(`Geschätzte Kosten für dieses Video: ${formatUsd(estimateVideoPrice(videoSettings))} (${videoSettings.seconds} Sekunden). Jetzt erstellen?`);
      if (!accepted) return;
    }

    sendingRef.current = true;
    lastSendRef.current = { text: clean, at: now };
    const controller = new AbortController();
    const runId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    generationRef.current = { id: runId, chatId: activeChatId };
    abortRef.current = { controller, runId };
    const history = options.historyBase || messages;
    const outgoingAttachments = selectedAttachments.map(({ id, previewUrl, extracting, ...rest }) => rest);
    const userMessage = {
      id: crypto.randomUUID(), role: 'user', createdAt: Date.now(),
      content: clean || 'Bitte analysiere den Anhang.',
      attachments: selectedAttachments.map(fileMessageAttachment)
    };

    if (clean && options.appendUser !== false) {
      setChatSessions((old) => old.map((session) => session.id === activeChatId && session.title === 'Neuer Chat'
        ? { ...session, title: clean.replace(/\s+/g, ' ').slice(0, 42), updatedAt: Date.now() }
        : session));
    }
    if (options.appendUser === false) setMessages(options.displayBase || messages);
    else setMessages((old) => [...old, userMessage]);
    setInput('');
    setAttachments([]);
    setLoading(true);

    try {
      if (imageSearchAction) {
        await generateFreeImageSearchMessage(clean, controller.signal, runId);
      } else if (videoAction) {
        const uploadedImages = selectedAttachments
          .filter((item) => item.kind === 'image')
          .map((item) => item.data || item.previewUrl)
          .filter(Boolean);
        let videoReferenceImages = [];
        const explicitlyRequested = videoSettings.useReference || wantsImageReferenceForVideo(clean);
        if (explicitlyRequested) {
          videoReferenceImages = uploadedImages;
          if (!videoReferenceImages.length) {
            videoReferenceImages = [...messages].reverse()
              .flatMap((message) => Array.isArray(message.attachments) ? message.attachments : [])
              .filter((item) => item.kind === 'image')
              .map((item) => item.data || item.previewUrl)
              .filter(Boolean)
              .slice(0, 1);
          }
        }
        await generateVideoMessage(clean, videoReferenceImages, controller.signal, requestId, runId);
      } else if (imageAction) {
        await generateImageMessage(clean, selectedAttachments, controller.signal, requestId, runId);
      } else {
        setGenerationStatus(runId, 'Yildiz AI denkt …');
        const result = await api('/api/ai/chat', {
          method: 'POST', signal: controller.signal,
          body: JSON.stringify({ message: clean, history, attachments: outgoingAttachments })
        });
        const fileCreated = await attachRequestedFile(runId, clean, result.answer);
        if (!fileCreated) appendGenerationMessage(runId, { id: crypto.randomUUID(), role: 'assistant', createdAt: Date.now(), content: result.answer });
        if (!fileCreated) setGenerationStatus(runId, `Gemini verbunden${result.model ? ` · ${result.model}` : ''}`);
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        setGenerationStatus(runId, 'Erstellung abgebrochen.');
      } else if (isCurrentGeneration(runId)) {
        appendGenerationMessage(runId, { id: crypto.randomUUID(), role: 'assistant', createdAt: Date.now(), content: error.message || 'Unbekannter Fehler.' });
        setGenerationStatus(runId, 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
      }
    } finally {
      if (generationRef.current.id === runId) {
        generationRef.current = { id: '', chatId: '' };
        sendingRef.current = false;
        abortRef.current = null;
        setLoading(false);
      }
    }
  }


  function renderMessageAttachment(item, index) {
    const key = `${item.name || item.kind}-${index}`;
    if (item.kind === 'image-link') {
      return <div className="attachment-card image-search-card" key={key}>
        <img src={item.previewUrl} alt={item.title || item.name || 'Gefundenes Bild'} loading="lazy" />
        <b>{item.title || item.name}</b>
        {item.source && <span>{item.source}</span>}
        <div className="attachment-actions">
          <button onClick={() => openExternal(item.imageUrl)}><ExternalLink size={14}/>Bild öffnen</button>
          {item.sourceUrl && <button onClick={() => openExternal(item.sourceUrl)}><Search size={14}/>Quelle</button>}
          <button onClick={() => createPdfFromSearchResult(item, item.title || item.name)}><FileDown size={14}/>PDF</button>
        </div>
      </div>;
    }
    if (item.kind === 'image') {
      return <div className="attachment-card" key={key}>
        <img src={item.previewUrl || item.data} alt={item.name || 'Bild'} />
        <span>{item.name}</span>
        <div className="attachment-actions">
          <button onClick={() => downloadMedia(item.previewUrl || item.data, item.name || 'yildiz-ai.png')}><Download size={14}/>Speichern</button>
          <button onClick={() => reuseImage(item)}><ImagePlus size={14}/>Als Referenz</button>
        </div>
      </div>;
    }
    if (item.kind === 'video') {
      return <div className="attachment-card video" key={key}>
        {item.previewUrl ? <video src={item.previewUrl} controls playsInline /> : <div className="video-placeholder"><Video size={24}/><small>{item.cloudMediaMissing ? 'Videodatei war nur lokal verfügbar' : 'Keine Vorschau'}</small></div>}
        <span>{item.name} {item.size ? `· ${formatSize(item.size)}` : ''}</span>
        <div className="attachment-actions">
          {item.previewUrl && <button onClick={() => downloadMedia(item.previewUrl, item.name || 'yildiz-ai-video.mp4')}><Download size={14}/>Speichern</button>}
          {item.projectData?.data?.scenes?.length > 0 && <button className="edit-video-project-btn" onClick={() => onOpenVideoProject?.(item.projectData)}><Edit3 size={15}/>Video-Studio</button>}
        </div>
      </div>;
    }
    if (item.kind === 'link') {
      return <div className="attachment-card file link-card" key={key}>
        <div className="file-placeholder"><Images size={26}/></div>
        <b>{item.name || 'Link öffnen'}</b>
        {item.title && <span>{item.title}</span>}
        <div className="attachment-actions"><button onClick={() => openExternal(item.sourceUrl)}><ExternalLink size={14}/>Öffnen</button></div>
      </div>;
    }
    const source = item.previewUrl || item.data;
    return <div className="attachment-card file" key={key}>
      <div className="file-placeholder"><FileText size={26}/></div>
      <span>{item.name} {item.size ? `· ${formatSize(item.size)}` : ''}</span>
      {source && <div className="attachment-actions">
        <button onClick={() => openExternal(source)}><ExternalLink size={14}/>Öffnen</button>
        <button onClick={() => downloadMedia(source, item.name || 'yildiz-ai-datei')}><Download size={14}/>Speichern</button>
      </div>}
    </div>;
  }

  function onDrop(event) {
    event.preventDefault();
    setDragActive(false);
    processFiles(event.dataTransfer.files).catch((error) => setStatus(error.message || 'Datei konnte nicht geladen werden.'));
  }

  return (
    <section className="chat-workspace-pro">
      <div className="chat-mobile-toolbar"><button onClick={() => setHistoryOpen(true)}><Menu size={17}/>Chats</button><button onClick={newChat}><MessageSquarePlus size={17}/>Neuer Chat</button></div>
      {historyOpen && <button className="chat-history-backdrop" aria-label="Chatverlauf schließen" onClick={() => setHistoryOpen(false)}/>}
      <aside className={`chat-history-panel ${historyOpen ? 'open' : ''}`}>
        <button className="new-chat-button" onClick={newChat}><MessageSquarePlus size={18}/>Neuer Chat</button>
        <div className="chat-history-top-actions">
          <button className="chat-export-button" onClick={exportCurrentChat}><Download size={16}/>Speichern</button>
          <button className="chat-export-button danger-soft" onClick={deleteAllChats}><Trash2 size={16}/>Alle löschen</button>
        </div>
        <label className="chat-search"><Search size={15}/><input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Chats suchen" /></label>
        <div className="chat-history-list">
          {filteredSessions.map((session) => (
            <div key={session.id} className={`chat-history-item ${session.id === activeChatId ? 'active' : ''}`} onClick={() => openChat(session)} role="button" tabIndex={0}>
              <span>{session.pinned && <Pin size={12}/>} {session.title || 'Neuer Chat'}</span>
              <small>{new Date(session.updatedAt || session.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</small>
              <div className="chat-history-actions">
                <button onClick={(event) => togglePinChat(event, session)} title={session.pinned ? 'Lösen' : 'Anheften'}>{session.pinned ? <PinOff size={13}/> : <Pin size={13}/>}</button>
                <button onClick={(event) => renameChat(event, session)} title="Umbenennen"><Edit3 size={13}/></button>
                <button onClick={(event) => deleteChat(event, session.id)} title="Löschen"><Trash2 size={13}/></button>
              </div>
            </div>
          ))}
        </div>
        <p className="chat-save-note">{cloudEnabled ? 'Chats sind privat an dieses Konto gebunden und werden geräteübergreifend synchronisiert.' : 'Gast-Chats bleiben nur auf diesem Gerät.'} Mit „Chat speichern“ kannst du zusätzlich eine TXT-Datei herunterladen.</p>
      </aside>
      <section className="chat-shell">
      <div className="local-ai-banner"><Cloud size={17}/><div><b>{uiText.statusTitle || 'Yildiz AI · Gemini + OpenAI + Sora'}</b><span>{status} · Keine lokale GPU und keine Pflicht-Anmeldung</span></div></div>
      <div className="chat-messages">
        {messages.map((message, index) => (
          <article className={`message ${message.role}`} key={message.id || `${message.role}-${index}`}>
            <div className="avatar">{message.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}</div>
            <div className="message-body">
              {editingMessageId === message.id ? (
                <div className="message-edit-box">
                  <textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} />
                  <div><button onClick={saveEditedMessage}><Check size={15}/>Speichern</button><button onClick={() => { setEditingMessageId(''); setEditingText(''); }}><X size={15}/>Abbrechen</button></div>
                </div>
              ) : <MessageContent text={message.content}/>}

              {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                <div className="message-attachments">
                  {message.attachments.map(renderMessageAttachment)}
                </div>
              )}

              <div className="message-actions">
                <button onClick={() => copyMessage(message)} title="Kopieren"><Copy size={14}/></button>
                {message.role === 'user' && <button onClick={() => startEditMessage(message)} title="Bearbeiten"><Edit3 size={14}/></button>}
                {message.role === 'assistant' && index > 0 && <button onClick={() => retryAssistant(index)} title="Antwort erneut erstellen"><RotateCcw size={14}/></button>}
                {message.id !== 'welcome' && <button onClick={() => deleteMessage(message.id)} title="Nachricht löschen"><Trash2 size={14}/></button>}
              </div>
            </div>
          </article>
        ))}
        {loading && <article className="message assistant"><div className="avatar"><Bot size={18} /></div><div className="message-body typing"><span>{status}</span><button className="stop-generation-btn" onClick={stopGeneration}><Square size={14}/>Stoppen</button></div></article>}
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
        <div className="creation-mode-row">
          <div className="creation-mode-tabs">
            <button type="button" className={creationMode === 'auto' ? 'active' : ''} onClick={() => setCreationMode('auto')}>Auto</button>
            <button type="button" className={creationMode === 'image' ? 'active' : ''} onClick={() => { setCreationMode('image'); setShowMediaSettings(true); }}><ImagePlus size={14}/>Bild</button>
            <button type="button" className={creationMode === 'video' ? 'active' : ''} onClick={() => { setCreationMode('video'); setShowMediaSettings(true); }}><Video size={14}/>Video</button>
          </div>
          <button type="button" className="media-settings-toggle" onClick={() => setShowMediaSettings((value) => !value)}><Settings2 size={15}/>Einstellungen {showMediaSettings ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
          <span className="cost-preview">{creationMode === 'video' ? `ca. ${formatUsd(estimateVideoPrice(videoSettings))}` : creationMode === 'image' ? `ca. ${formatUsd(estimateImagePrice(imageSettings))}` : 'Modus automatisch'}</span>
        </div>

        {showMediaSettings && <div className="media-settings-panel">
          {(creationMode === 'auto' || creationMode === 'image') && <div className="media-settings-section">
            <h4><ImagePlus size={16}/>Bildeinstellungen</h4>
            <div className="media-settings-grid">
              <label>Format<select value={imageSettings.aspect} onChange={(event) => setImageSettings({ ...imageSettings, aspect: event.target.value })}><option value="square">Quadratisch</option><option value="post">Hochformat</option><option value="landscape">Querformat</option></select></label>
              <label>Qualität<select value={imageSettings.quality} onChange={(event) => setImageSettings({ ...imageSettings, quality: event.target.value })}><option value="low">Entwurf</option><option value="medium">Standard</option><option value="high">Hoch</option></select></label>
              <label>Stil<select value={imageSettings.style} onChange={(event) => setImageSettings({ ...imageSettings, style: event.target.value })}><option value="auto">Automatisch</option><option value="realistic">Fotorealistisch</option><option value="poster">Werbedesign</option><option value="product">Produktfoto</option><option value="studio">Studio</option></select></label>
              <label>Hintergrund<select value={imageSettings.background} onChange={(event) => setImageSettings({ ...imageSettings, background: event.target.value })}><option value="auto">Automatisch</option><option value="opaque">Deckend</option><option value="transparent">Transparent</option></select></label>
            </div>
            <small>Ein angehängtes Bild wird im Bildmodus als Referenz bearbeitet. Preis ist eine Schätzung und wird vor dem Start bestätigt.</small>
          </div>}
          {(creationMode === 'auto' || creationMode === 'video') && <div className="media-settings-section">
            <h4><Video size={16}/>Videoeinstellungen</h4>
            <div className="media-settings-grid">
              <label>Länge<select value={videoSettings.seconds} onChange={(event) => setVideoSettings({ ...videoSettings, seconds: event.target.value })}><option value="4">4 Sekunden</option><option value="8">8 Sekunden</option><option value="12">12 Sekunden</option></select></label>
              <label>Format<select value={videoSettings.aspect} onChange={(event) => setVideoSettings({ ...videoSettings, aspect: event.target.value })}><option value="story">Hochformat 9:16</option><option value="landscape">Querformat 16:9</option></select></label>
              <label>Modell<select value={videoSettings.model} onChange={(event) => setVideoSettings({ ...videoSettings, model: event.target.value })}><option value="sora-2">Sora 2</option><option value="sora-2-pro">Sora 2 Pro</option></select></label>
              <label className="checkbox-row"><input type="checkbox" checked={videoSettings.useReference} onChange={(event) => setVideoSettings({ ...videoSettings, useReference: event.target.checked })}/>Angehängtes/letztes Bild verwenden</label>
            </div>
            <small>Geschätzte Kosten: {formatUsd(estimateVideoPrice(videoSettings))}. Sora 2 Pro ist deutlich teurer.</small>
          </div>}
          {isGuest && <div className="media-login-note">Chat und Editoren funktionieren als Gast. Für OpenAI-Bilder und Sora-Videos bitte anmelden.</div>}
        </div>}

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
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={`${uiText.composer || 'Frag Yildiz AI …'} · z. B. „Suche mir ein Produktbild als PDF“`} onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        }} />
        <button className="send-btn" onClick={() => sendMessage()} disabled={loading || !hasPayload}><ArrowUp size={20} /></button>
      </div>
      </section>
    </section>
  );
}
