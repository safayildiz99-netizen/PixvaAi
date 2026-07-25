import { useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, Camera, Cloud, FileText, ImagePlus, Paperclip, User, Video, WandSparkles, X } from 'lucide-react';
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
  if (item.kind === 'video') return { kind: 'video', name: item.name, previewUrl: item.previewUrl, size: item.size };
  return { kind: 'file', name: item.name, size: item.size };
}

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hallo! Ich bin Yildiz AI. Du kannst mir Fragen stellen, Bilder und Videos direkt erzeugen sowie Dateien per Drag & Drop hochladen.' }
  ]);
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
  const hasPayload = useMemo(() => Boolean(String(input || '').trim() || attachments.length), [input, attachments.length]);

  function removeAttachment(id) {
    setAttachments((old) => old.filter((item) => item.id !== id));
  }

  function addGenericFile(file) {
    setAttachments((old) => [...old, {
      id: crypto.randomUUID(), kind: 'file', name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream'
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
          mimeType: file.type || 'image/jpeg', previewUrl: reader.result, data: reader.result
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
      mimeType: file.type || 'video/mp4', previewUrl, frames: [], extracting: true
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

  async function generateImageMessage(clean, history, userMessage) {
    setStatus('Yildiz AI erstellt dein Bild …');
    const result = await api('/api/ai/image', {
      method: 'POST',
      body: JSON.stringify({ prompt: clean, aspect: 'post', style: 'realistic' })
    });
    setMessages((old) => [...old, {
      role: 'assistant',
      content: result.fallback ? 'Ich habe ein Ersatzmotiv erstellt, weil der externe Bilddienst gerade nicht erreichbar war.' : 'Hier ist dein Bild. Du kannst es direkt öffnen oder herunterladen.',
      attachments: [{ kind: 'image', name: 'yildiz-ai-bild.png', previewUrl: result.imageDataUrl, data: result.imageDataUrl }]
    }]);
    setStatus(`Bild erstellt${result.provider ? ` · ${result.provider}` : ''}`);
  }

  async function generateVideoMessage(clean, sourceImages = []) {
    setStatus('Yildiz AI erstellt zuerst Szenenbilder und rendert dann das Video mit Musik …');
    const images = sourceImages.filter(Boolean).slice(0, 6);
    if (!images.length) {
      const scenePrompts = [
        `${clean}. Scene 1: strong opening shot, clearly visible real subjects and real environment, cinematic, photorealistic, vertical video frame, no text.`,
        `${clean}. Scene 2: main action from a different camera angle, clearly visible subjects, dynamic movement, photorealistic, vertical video frame, no text.`,
        `${clean}. Scene 3: detailed close-up or medium shot, realistic lighting, coherent characters and environment, vertical video frame, no text.`,
        `${clean}. Scene 4: strong final hero shot, visually rich background, cinematic and photorealistic, vertical video frame, no text.`
      ];
      for (let index = 0; index < scenePrompts.length; index += 1) {
        setStatus(`Yildiz AI erstellt echtes Szenenbild ${index + 1} von ${scenePrompts.length} …`);
        const result = await api('/api/ai/image', {
          method: 'POST',
          body: JSON.stringify({ prompt: scenePrompts[index], aspect: 'story', style: 'realistic' })
        });
        if (!result?.imageDataUrl || result?.fallback) {
          throw new Error('Ein echtes Szenenbild konnte nicht erzeugt werden. Das Video wurde abgebrochen, damit kein Farb-/Text-Platzhalter exportiert wird.');
        }
        images.push(result.imageDataUrl);
      }
    }
    setStatus('Bilder fertig. Video wird jetzt im Browser mit Übergängen und Musik gerendert …');
    const video = await renderGeneratedVideo(images, clean);
    setMessages((old) => [...old, {
      role: 'assistant',
      content: `Hier ist dein Video mit automatisch erzeugten Szenenbildern, Bewegung und Hintergrundmusik. Format: ${video.ext.toUpperCase()}.`,
      attachments: [{ kind: 'video', name: `yildiz-ai-video.${video.ext}`, previewUrl: video.url }]
    }]);
    setStatus(`Video erstellt · ${video.ext.toUpperCase()} · Musik automatisch hinzugefügt`);
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
      attachments: attachments.map(fileMessageAttachment)
    };

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
        await generateImageMessage(clean, history, userMessage);
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
      setLoading(false);
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setDragActive(false);
    processFiles(event.dataTransfer.files).catch((error) => setStatus(error.message || 'Datei konnte nicht geladen werden.'));
  }

  return (
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
  );
}
