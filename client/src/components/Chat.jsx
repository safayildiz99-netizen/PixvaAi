import { useState } from 'react';
import { ArrowUp, Bot, Cpu, User, WandSparkles } from 'lucide-react';
import { getLocalModelName, localAiSupported, localChat } from '../localAi.js';

const quickPrompts = [
  'Erkläre mir ein schwieriges Thema ganz einfach.',
  'Hilf mir bei einer Website oder einem Programmierproblem.',
  'Erstelle einen professionellen Flyertext für meine Firma.'
];

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hallo! Ich bin Yildiz AI. Ich laufe kostenlos direkt in deinem Browser. Beim ersten Start wird einmal ein lokales KI-Modell geladen.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(localAiSupported() ? 'Kostenloser lokaler Modus bereit zum Laden.' : 'WebGPU ist in diesem Browser nicht verfügbar.');

  async function send(text = input) {
    const clean = text.trim();
    if (!clean || loading) return;
    const history = messages;
    setMessages((old) => [...old, { role: 'user', content: clean }]);
    setInput('');
    setLoading(true);
    try {
      const answer = await localChat(clean, history, setProgress);
      setMessages((old) => [...old, { role: 'assistant', content: answer }]);
    } catch (error) {
      setMessages((old) => [...old, { role: 'assistant', content: `Lokale KI konnte nicht starten: ${error.message}` }]);
      setProgress('Lokale KI ist momentan nicht verfügbar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="chat-shell">
      <div className="local-ai-banner"><Cpu size={17}/><div><b>Lokale KI ohne API und ohne Guthaben</b><span>{progress} · Modell: {getLocalModelName()}</span></div></div>
      <div className="chat-messages">
        {messages.map((message, index) => (
          <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
            <div className="avatar">{message.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}</div>
            <div className="message-body">{message.content}</div>
          </article>
        ))}
        {loading && <article className="message assistant"><div className="avatar"><Bot size={18} /></div><div className="message-body typing">{progress}</div></article>}
      </div>
      <div className="quick-row">
        {quickPrompts.map((prompt) => <button key={prompt} onClick={() => send(prompt)}><WandSparkles size={14} />{prompt}</button>)}
      </div>
      <div className="chat-input-wrap">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Frag Yildiz AI …" onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        }} />
        <button className="send-btn" onClick={() => send()} disabled={loading}><ArrowUp size={20} /></button>
      </div>
    </section>
  );
}
