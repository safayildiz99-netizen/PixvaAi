import { useState } from 'react';
import { CheckCircle2, KeyRound, Save, ShieldCheck, UserCircle2 } from 'lucide-react';
import { api } from '../api.js';

export default function AccountSettings({ user, onUserChanged }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function changePassword(event) {
    event.preventDefault();
    setStatus('');
    setError('');
    if (form.newPassword.length < 8) return setError('Das neue Passwort braucht mindestens 8 Zeichen.');
    if (form.newPassword !== form.confirmPassword) return setError('Die beiden neuen Passwörter stimmen nicht überein.');
    if (form.currentPassword === form.newPassword) return setError('Das neue Passwort muss sich vom aktuellen Passwort unterscheiden.');

    setSaving(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setStatus('Dein Passwort wurde erfolgreich geändert.');
      onUserChanged?.({ ...user, mustChangePassword: false });
    } catch (requestError) {
      setError(requestError.message || 'Das Passwort konnte nicht geändert werden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="account-page">
      <div className="page-heading"><div><h2><UserCircle2 size={22}/> Mein Konto</h2><p>Jeder angemeldete Mitarbeiter kann hier sein eigenes Passwort ändern.</p></div></div>
      <div className="account-layout">
        <article className="account-card account-summary">
          <div className="account-avatar-large">{user.username.slice(0, 2).toUpperCase()}</div>
          <div><span>Angemeldet als</span><h3>{user.username}</h3><p>{user.role === 'admin' ? 'Administrator' : 'Mitarbeiter'}</p></div>
          <div className="security-note"><ShieldCheck size={18}/> Dein Passwort wird verschlüsselt in Supabase gespeichert.</div>
        </article>
        <article className="account-card">
          <h3><KeyRound size={19}/> Eigenes Passwort ändern</h3>
          {user.mustChangePassword && <div className="password-required">Bitte ersetze jetzt das Startpasswort durch dein eigenes Passwort.</div>}
          {error && <div className="error-box">{error}</div>}
          {status && <div className="success-box"><CheckCircle2 size={18}/>{status}</div>}
          <form onSubmit={changePassword}>
            <label>Aktuelles Passwort<input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required/></label>
            <label>Neues Passwort<input type="password" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} required/></label>
            <label>Neues Passwort wiederholen<input type="password" autoComplete="new-password" minLength={8} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required/></label>
            <button className="primary-btn" type="submit" disabled={saving}><Save size={17}/>{saving ? 'Wird gespeichert …' : 'Passwort ändern'}</button>
          </form>
        </article>
      </div>
    </section>
  );
}
