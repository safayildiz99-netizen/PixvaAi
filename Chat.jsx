import { useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, Cloud, Download, ImagePlus, Paperclip, User, Video, WandSparkles, X } from 'lucide-react';
import { api } from '../api.js';

const quickPrompts = [
  'Erstelle ein fotorealistisches Bild von einem modernen Büro.',
  'Erstelle ein kurzes Werbevideo mit Bildern und Musik.',
  'Analysiere mein hochgeladenes Bild oder Video.'
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

function isImageRequest(text) {
  const value = String(text || '').toLowerCase();
  return /(erstelle|erzeuge|generiere|mach|mache|zeichne|baue).{0,45}(bild|foto|grafik|poster|plakat|sticker|thumbnail|logo)/i.test(value) ||
    /^(bild|foto|grafik|poster|sticker)\s*:/i.test(value);
}

function isVideoRequest(text) {
  const value = String(text || '').toLowerCase();
  return /(erstelle|erzeuge|generiere|mach|mache|baue).{0,45}(video|viedeo|reel|clip|film|animation)/i.test(value) ||
    /^(video|viedeo|reel|clip)\s*:/i.test(value);
}

function detectAspect(text, fallback = 'post') {
  const value = String(text || '').toLowerCase();
  if (/16\s*[:x]\s*9|querformat|youtube|landscape/.test(value)) return 'landscape';
  if (/9\s*[:x]\s*16|story|reel|hochformat/.test(value)) return 'story';
  if (/1\s*[:x]\s*1|quadrat|square/.test(value)) return 'square';
  return fallback;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Generiertes Szenenbild konnte nicht geladen werden.'));
    image.src = url;
  });
}

function drawCover(ctx, image, width, height, progress) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * (1 + progress * 0.05);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  const x = (width - w) / 2 + Math.sin(progress * Math.PI) * width * 0.02;
  const y = (height - h) / 2;
  ctx.drawImage(image, x, y, w, h);
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

function startGeneratedMusic(audioContext, destination, totalDuration) {
  const master = audioContext.createGain();
  master.gain.value = 0.055;
  master.connect(destination);
  const notes = [130.81, 164.81, 196, 246.94, 196, 164.81];
  const nodes = [];
  for (let time = 0, index = 0; time < totalDuration + 1; time += 0.62, index += 1) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = notes[index % notes.length];
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime + time);
    gain.gain.exponentialRampToValueAtTime(0.8, audioContext.currentTime + time + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + time + 0.55);
    oscillator.connect(gain).connect(master);
    oscillator.start(audioContext.currentTime + time);
    oscillator.stop(audioContext.currentTime + time + 0.58);
    nodes.push(oscillator);
  }
  return nodes;
}

async function renderGeneratedVideo(imageUrls, prompt, aspect, onProgress) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('Dieser Browser kann Videos nicht direkt rendern. Nutze das Video-Studio für den PDF-/ZIP-Fallback.');
  }

  const landscape = aspect === 'landscape';
  const square = aspect === 'square';
  const width = landscape ? 1280 : square ? 900 : 720;
  const height = landscape ? 720 : square ? 900 : 1280;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(24);
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  await audioContext.resume();
  const destination = audioContext.createMediaStreamDestination();
  startGeneratedMusic(audioContext, destination, imageUrls.length * 2.2);
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

  const mimeType = bestRecorderMime();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : undefined);
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start(400);

  const images = [];
  for (const url of imageUrls) images.push(await loadImage(url));
  const sceneDuration = 2.2;
  const total = images.length * sceneDuration;
  let elapsed = 0;

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const started = performance.now();
    await new Promise((resolve) => {
      const frame = () => {
        const seconds = (performance.now() - started) / 1000;
        const progress = Math.min(1, seconds / sceneDuration);
        ctx.fillStyle = '#071018';
        ctx.fillRect(0, 0, width, height);
        drawCover(ctx, image, width, height, progress);
        const fade = Math.min(1, progress / 0.12, (1 - progress) / 0.12);
        if (fade < 1) {
          ctx.fillStyle = `rgba(7,16,24,${1 - Math.max(0, fade)})`;
          ctx.fillRect(0, 0, width, height);
        }
        const gradient = ctx.createLinearGradient(0, height * 0.62, 0, height);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,.75)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, height * 0.55, width, height * 0.45);
        ctx.fillStyle = '#ffd400';
        ctx.font = `800 ${Math.max(22, width / 34)}px Arial`;
        ctx.fillText(`SZENE 0${index + 1}`, width * 0.07, height * 0.84);
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${Math.max(30, width / 22)}px Arial`;
        ctx.fillText(String(prompt || 'Yildiz AI Video').slice(0, 55), width * 0.07, height * 0.9, width * 0.86);
        onProgress?.(Math.round(((elapsed + Math.min(seconds, sceneDuration)) / total) * 100));
        if (seconds < sceneDuration) requestAnimationFrame(frame);
        else resolve();
      };
      frame();
    });
    elapsed += sceneDuration;
  }

  recorder.stop();
  await stopped;
  await audioContext.close();
  const finalMime = recorder.mimeType || mimeType || 'video/webm';
  const blob = new Blob(chunks, { type: finalMime });
  return {
    url: URL.createObjectURL(blob),
    extension: finalMime.includes('mp4') ? 'mp4' : 'webm'
  };
}

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hallo! Ich bin Yildiz AI. Du kannst mir Fragen stellen sowie Bilder und Videos direkt erstellen oder hochladen.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Gemini läuft serverseitig in Chrome, Opera, Safari und Edge.');
  const [attachments, setAttachments] = useState([]);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const hasPayload = useMemo(() => String(input || '').trim() || attachments.length, [input, attachments.length]);

  function removeAttachment(id) {
    setAttachments((old) => old.filter((item) => item.id !== id));
  }

  function onImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 4.2 * 1024 * 1024) {
      setStatus('Bild ist zu groß. Bitte maximal ca. 4 MB wählen.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachments((old) => [...old, {
        id: crypto.randomUUID(), kind: 'image', name: file.name, size: file.size,
        mimeType: file.type || 'image/jpeg', previewUrl: reader.result, data: reader.result
      }].slice(-4));
      setStatus('Bild hinzugefügt. Stelle jetzt deine Frage dazu.');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  async function onVideoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    const id = crypto.randomUUID();
    setAttachments((old) => [...old, {
      id, kind: 'video', name: file.name, size: file.size,
      mimeType: file.type || 'video/mp4', previewUrl, frames: [], extracting: true
    }].slice(-4));
    setStatus('Yildiz AI liest vier Vorschaubilder aus dem Video …');
    try {
      const frames = await extractVideoFrames(file, previewUrl);
      setAttachments((old) => old.map((item) => item.id === id ? { ...item, frames, extracting: false } : item));
      setStatus('Video vorbereitet. Yildiz AI kann die wichtigsten Frames analysieren.');
    } catch (error) {
      setAttachments((old) => old.map((item) => item.id === id ? { ...item, extracting: false } : item));
      setStatus(error.message || 'Video geladen, Frame-Analyse war nicht möglich.');
    }
    event.target.value = '';
  }

  async function createImageMessage(clean) {
    const aspect = detectAspect(clean, 'post');
    setStatus('Yildiz AI erstellt dein Bild …');
    const result = await api('/api/ai/image', {
      method: 'POST',
      body: JSON.stringify({ prompt: clean, aspect, style: 'realistic' })
    });
    setMessages((old) => [...old, {
      role: 'assistant',
      content: result.fallback
        ? 'Der Online-Bildgenerator war nicht erreichbar. Ich habe ein bearbeitbares Ersatzmotiv erstellt.'
        : `Bild erstellt${result.provider ? ` · ${result.provider}` : ''}`,
      imageUrl: result.imageDataUrl,
      downloadName: 'yildiz-ai-bild.png'
    }]);
    setStatus('Bild fertig. Du kannst es öffnen oder herunterladen.');
  }

  async function createVideoMessage(clean) {
    const aspect = detectAspect(clean, 'story');
    const scenePrompts = [
      `${clean}. Establishing shot, wide composition, photorealistic`,
      `${clean}. Medium shot, dynamic perspective, photorealistic`,
      `${clean}. Close-up final advertising shot, photorealistic`
    ];
    const imageUrls = [];
    for (let index = 0; index < scenePrompts.length; index += 1) {
      setStatus(`Yildiz AI erstellt Szenenbild ${index + 1} von ${scenePrompts.length} …`);
      const result = await api('/api/ai/image', {
        method: 'POST',
        body: JSON.stringify({ prompt: scenePrompts[index], aspect, style: 'realistic' })
      });
      imageUrls.push(result.imageDataUrl);
    }
    setStatus('Video wird mit Bewegung, Übergängen und Hintergrundmusik gerendert …');
    const video = await renderGeneratedVideo(imageUrls, clean, aspect, (percent) => {
      setStatus(`Video wird gerendert … ${percent}%`);
    });
    setMessages((old) => [...old, {
      role: 'assistant',
      content: `Video fertig · 3 KI-Szenen · Übergänge · Hintergrundmusik · ${video.extension.toUpperCase()}`,
      videoUrl: video.url,
      downloadName: `yildiz-ai-video.${video.extension}`,
      generatedImages: imageUrls
    }]);
    setStatus('Video fertig. Du kannst es abspielen und herunterladen.');
  }

  async function sendMessage(text = input) {
    const clean = String(text || '').trim();
    if ((!clean && !attachments.length) || loading) return;
    if (attachments.some((item) => item.extracting)) {
      setStatus('Bitte kurz warten, bis die Videoframes vorbereitet sind.');
      return;
    }

    const history = messages;
    const outgoingAttachments = attachments.map(({ id, previewUrl, extracting, ...rest }) => rest);
    const userMessage = {
      role: 'user',
      content: clean || 'Bitte analysiere den Anhang.',
      attachments: attachments.map(({ id, data, frames, extracting, ...rest }) => rest)
    };

    setMessages((old) => [...old, userMessage]);
    setInput('');
    setAttachments([]);
    setLoading(true);

    try {
      if (!outgoingAttachments.length && isVideoRequest(clean)) {
        await createVideoMessage(clean);
      } else if (!outgoingAttachments.length && isImageRequest(clean)) {
        await createImageMessage(clean);
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
      setStatus('Die Medienerstellung konnte nicht abgeschlossen werden. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="chat-shell">
      <div className="local-ai-banner"><Cloud size={17}/><div><b>Yildiz AI mit Medienerstellung</b><span>{status} · Bilder und Videos werden direkt im Chat erstellt</span></div></div>
      <div className="chat-messages">
        {messages.map((message, index) => (
          <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
            <div className="avatar">{message.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}</div>
            <div className="message-body">
              <div>{message.content}</div>
              {message.imageUrl && (
                <div className="generated-media">
                  <img src={message.imageUrl} alt="Von Yildiz AI generiert" />
                  <a href={message.imageUrl} download={message.downloadName || 'yildiz-ai-bild.png'}><Download size={16}/>Bild herunterladen</a>
                </div>
              )}
              {message.videoUrl && (
                <div className="generated-media video-result">
                  <video src={message.videoUrl} controls playsInline />
                  <a href={message.videoUrl} download={message.downloadName || 'yildiz-ai-video.webm'}><Download size={16}/>Video herunterladen</a>
                  {Array.isArray(message.generatedImages) && <div className="generated-scene-strip">{message.generatedImages.map((url, sceneIndex) => <img key={sceneIndex} src={url} alt={`Szene ${sceneIndex + 1}`} />)}</div>}
                </div>
              )}
              {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                <div className="message-attachments">
                  {message.attachments.map((item, i) => item.kind === 'image' ? (
                    <div className="attachment-card" key={`${item.name}-${i}`}><img src={item.previewUrl || item.data} alt={item.name || 'Bild'} /><span>{item.name}</span></div>
                  ) : (
                    <div className="attachment-card video" key={`${item.name}-${i}`}>
                      {item.previewUrl ? <video src={item.previewUrl} controls playsInline /> : <div className="video-placeholder"><Video size={24}/></div>}
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
              {item.kind === 'image' ? <img src={item.previewUrl} alt={item.name} /> : <video src={item.previewUrl} controls playsInline />}
              <div className="composer-meta"><b>{item.name}</b><span>{item.kind === 'image' ? 'Bild' : 'Video'} {item.size ? `· ${formatSize(item.size)}` : ''}{item.extracting ? ' · wird analysiert …' : ''}</span></div>
              <button type="button" onClick={() => removeAttachment(item.id)}><X size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="quick-row">{quickPrompts.map((prompt) => <button key={prompt} onClick={() => sendMessage(prompt)}><WandSparkles size={14} />{prompt}</button>)}</div>
      <div className="chat-input-wrap">
        <div className="chat-upload-row">
          <button type="button" className="upload-pill" onClick={() => imageInputRef.current?.click()}><ImagePlus size={15}/>Bild</button>
          <button type="button" className="upload-pill" onClick={() => videoInputRef.current?.click()}><Video size={15}/>Video</button>
          <button type="button" className="upload-pill" onClick={() => imageInputRef.current?.click()}><Paperclip size={15}/>Anhang</button>
          <input ref={imageInputRef} type="file" accept="image/*" onChange={onImageUpload} hidden />
          <input ref={videoInputRef} type="file" accept="video/*" onChange={onVideoUpload} hidden />
        </div>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Frag Yildiz AI …" onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        }} />
        <button className="send-btn" onClick={() => sendMessage()} disabled={loading || !hasPayload}><ArrowUp size={20} /></button>
      </div>
    </section>
  );
}
