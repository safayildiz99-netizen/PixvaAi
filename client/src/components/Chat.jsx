import { useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, Cloud, ImagePlus, Paperclip, User, Video, WandSparkles, X } from 'lucide-react';
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

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hallo! Ich bin Yildiz AI. Du kannst mir Fragen stellen sowie Bilder und Videos hochladen.' }
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
    setStatus('Yildiz AI denkt …');

    try {
      const result = await api('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: clean, history, attachments: outgoingAttachments })
      });
      setMessages((old) => [...old, { role: 'assistant', content: result.answer }]);
      setStatus(`Gemini verbunden${result.model ? ` · ${result.model}` : ''}`);
    } catch (error) {
      setMessages((old) => [...old, { role: 'assistant', content: error.message }]);
      setStatus('Gemini ist momentan ausgelastet. Bitte versuche es gleich erneut.');
    } finally {
      setLoading(false);
    }
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
