import { useState } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { api, setToken } from '../api.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('SafaStart2026!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      setToken(result.token);
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-badge"><Sparkles size={20} /> Safa AI Studio</div>
        <h1>Werbetechnik. KI. Design.</h1>
        <p>Ohne E-Mail anmelden, Angebote gestalten, Bilder und Videos erzeugen und Webseiten exportieren.</p>
        <form onSubmit={submit}>
          <label>Benutzername<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
          <label>Passwort<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-btn wide" disabled={loading}>{loading ? 'Anmeldung läuft …' : 'Anmelden'}</button>
        </form>
        <div className="login-hint"><ShieldCheck size={16} /> Beim ersten Start: <b>admin</b> / <b>SafaStart2026!</b></div>
      </section>
    </main>
  );
}
