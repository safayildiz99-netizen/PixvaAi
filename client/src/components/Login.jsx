import { useState } from 'react';
import { LogIn, ShieldCheck, UserRound } from 'lucide-react';
import { api, setToken } from '../api.js';

export default function Login({ onLogin, onGuest, allowGuest = true }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('SafaStart2026!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const result = await api('/api/auth/login', { method:'POST', body:JSON.stringify({ username, password }) });
      setToken(result.token); onLogin(result.user);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  return <main className="login-page"><section className="login-card">
    <div className="brand-badge"><img src="/yildiz-ai-logo.png" alt="Yildiz AI"/></div>
    <h1>Deine KI für alles.</h1>
    <p>Allgemeine KI, Designs, Flyer, Webseiten und Videos – im Browser und ohne lokale GPU.</p>
    {allowGuest&&<button className="guest-btn" type="button" onClick={onGuest}><UserRound size={18}/>Ohne Anmeldung starten</button>}
    {allowGuest&&<div className="login-divider"><span>oder mit Konto</span></div>}
    <form onSubmit={submit}>
      <label>Benutzername<input value={username} onChange={(e)=>setUsername(e.target.value)} autoComplete="username"/></label>
      <label>Passwort<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="current-password"/></label>
      {error&&<div className="error-box">{error}</div>}
      <button className="primary-btn wide" disabled={loading}><LogIn size={17}/>{loading?'Anmeldung läuft …':'Anmelden'}</button>
    </form>
    <div className="login-hint"><ShieldCheck size={16}/> Im Gastmodus kannst du alles testen und exportieren. Konto wird nur zum dauerhaften Speichern und für Adminfunktionen benötigt.</div>
  </section></main>;
}
