import { useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, Cloud, ImagePlus, Paperclip, User, Video, WandSparkles, X } from 'lucide-react';
import { api } from '../api.js';

const quickPrompts = [
  'Erkläre mir ein schwieriges Thema ganz einfach.',
  'Hilf mir bei einer Website oder einem Programmierproblem.',
  'Erstelle einen professionellen Flyertext für meine Firma.'
];

function formatSize(size) {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hallo! Ich bin Yildiz AI. Ich beantworte allgemeine Fragen und helfe zusätzlich bei Design, Werbetechnik, Flyern, Webseiten und Angeboten.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Gemini läuft serverseitig und funktioniert in Chrome, Opera, Safari und Edge. Bilder und Videos können jetzt hochgeladen werden.');
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
    if (file.size > 4.5 * 1024 * 1024) {
      setStatus('Bild ist zu groß. Bitte maximal ca. 4,5 MB wählen.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachments((old) => [...old, {
        id: crypto.randomUUID(), kind: 'image', name: file.name, size: file.size,
        mimeType: file.type || 'image/*', previewUrl: reader.result, data: reader.result
      }].slice(-4));
      setStatus('Bild hinzugefügt. Du kannst jetzt eine Frage dazu stellen.');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function onVideoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setAttachments((old) => [...old, {
      id: crypto.randomUUID(), kind: 'video', name: file.name, size: file.size,
      mimeType: file.type || 'video/*', previewUrl
    }].slice(-4));
    setStatus('Video hinzugefügt. In dieser Version wird das Video lokal angezeigt und als Dateianhang mitgesendet.');
    event.target.value = '';
  }

  async function sendMessage(text = input) {
    const clean = String(text || '').trim();
    if ((!clean && !attachments.length) || loading) return;
    const history = messages;
    const outgoingAttachments = attachments.map(({ id, previewUrl, ...rest }) => rest);
    const userMessage = {
      role: 'user',
      content: clean || 'Anhang hochgeladen',
      attachments: attachments.map(({ id, data, ...rest }) => rest)
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
      setStatus('Gemini ist momentan ausgelastet – automatische Modell-Ausweichlösung wurde versucht.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="chat-shell">
      <div className="local-ai-banner"><Cloud size={17}/><div><b>Yildiz AI mit Gemini</b><span>{status} · Keine lokale GPU und keine Anmeldung erforderlich</span></div></div>
      <div className="chat-messages">
        {messages.map((message, index) => (
          <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
            <div className="avatar">{message.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}</div>
            <div className="message-body">
              <div>{message.content}</div>
              {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                <div className="message-attachments">
                  {message.attachments.map((item, i) => item.kind === 'image' ? (
                    <div className="attachment-card" key={`${item.name}-${i}`}>
                      <img src={item.previewUrl || item.data} alt={item.name || 'Bild'} />
                      <span>{item.name}</span>
                    </div>
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
              <div className="composer-meta"><b>{item.name}</b><span>{item.kind === 'image' ? 'Bild' : 'Video'} {item.size ? `· ${formatSize(item.size)}` : ''}</span></div>
              <button type="button" onClick={() => removeAttachment(item.id)}><X size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="quick-row">
        {quickPrompts.map((prompt) => <button key={prompt} onClick={() => sendMessage(prompt)}><WandSparkles size={14} />{prompt}</button>)}
      </div>
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
