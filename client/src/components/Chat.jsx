import { useState } from 'react';
import { ArrowUp, Bot, User, WandSparkles } from 'lucide-react';
import { api } from '../api.js';

const quickPrompts = [
  'Erstelle einen Werbetext für eine neue Leuchtreklame.',
  'Schreibe ein Angebot für Fahrzeugfolierung.',
  'Gib mir 5 Instagram-Ideen für eine Werbetechnik-Firma.'
];

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hallo! Ich helfe dir bei Werbetechnik, Angeboten, Flyern, Webseiten und Social Media.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function send(text = input) {
    const clean = text.trim();
    if (!clean || loading) return;
    setMessages((old) => [...old, { role: 'user', content: clean }]);
    setInput('');
    setLoading(true);
    try {
      const result = await api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ prompt: clean }) });
      setMessages((old) => [...old, { role: 'assistant', content: result.answer }]);
    } catch (error) {
      setMessages((old) => [...old, { role: 'assistant', content: `Fehler: ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="chat-shell">
      <div className="chat-messages">
        {messages.map((message, index) => (
          <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
            <div className="avatar">{message.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}</div>
            <div className="message-body">{message.content}</div>
          </article>
        ))}
        {loading && <article className="message assistant"><div className="avatar"><Bot size={18} /></div><div className="message-body typing">Yildiz AI denkt …</div></article>}
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
