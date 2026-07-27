import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BadgeEuro, CheckCircle2, CloudDownload, Database, Image, KeyRound, LogOut, Save, ShieldCheck, Trash2, UserCircle2, Video } from 'lucide-react';
import { api, downloadText } from '../api.js';
import { PLAN_CATALOG, formatPlanPrice, getPlan, normalizeSubscription } from '../plans.js';

function money(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function limitText(value, suffix = '') {
  const number = Number(value);
  return number < 0 ? 'Unbegrenzt' : `${number}${suffix}`;
}

export default function AccountSettings({ user, onUserChanged, subscription, onSubscriptionChanged, onOpenPlans }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState(null);
  const [usageError, setUsageError] = useState('');
  const [dataBusy, setDataBusy] = useState('');
  const currentSubscription = normalizeSubscription(subscription);
  const plan = useMemo(() => getPlan(user.role === 'admin' ? 'studio' : currentSubscription.planId), [currentSubscription.planId, user.role]);

  useEffect(() => {
    api('/api/usage/me')
      .then((result) => { setUsage(result); setUsageError(''); })
      .catch((requestError) => { setUsage(null); setUsageError(requestError.message || 'Nutzung konnte nicht geladen werden.'); });
  }, [currentSubscription.planId]);

  async function changePassword(event) {
    event.preventDefault();
    setStatus(''); setError('');
    if (form.newPassword.length < 8) return setError('Das neue Passwort braucht mindestens 8 Zeichen.');
    if (form.newPassword !== form.confirmPassword) return setError('Die beiden neuen Passwörter stimmen nicht überein.');
    if (form.currentPassword === form.newPassword) return setError('Das neue Passwort muss sich vom aktuellen Passwort unterscheiden.');
    setSaving(true);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }) });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setStatus('Dein Passwort wurde erfolgreich geändert.');
      onUserChanged?.({ ...user, mustChangePassword: false });
    } catch (requestError) {
      setError(requestError.message || 'Das Passwort konnte nicht geändert werden.');
    } finally { setSaving(false); }
  }


  async function testPlan(planId) {
    if (user.role === 'admin') return;
    setDataBusy(`plan-${planId}`); setStatus(''); setError('');
    try {
      const result = await api('/api/subscription/select', { method: 'POST', body: JSON.stringify({ planId }) });
      onSubscriptionChanged?.(normalizeSubscription(result.subscription));
      setStatus(`${getPlan(planId).name} ist jetzt als kostenloser Beta-Test aktiv. Es wurde nichts berechnet.`);
    } catch (requestError) { setError(requestError.message || 'Der Testzugang konnte nicht aktiviert werden.'); }
    finally { setDataBusy(''); }
  }

  async function cancelSubscription() {
    if (user.role === 'admin' || currentSubscription.planId === 'free') return;
    if (!window.confirm(`${plan.name} wirklich kündigen? Dein Konto wechselt sofort auf Free. In der Beta wird nichts berechnet.`)) return;
    setDataBusy('subscription'); setStatus(''); setError('');
    try {
      const result = await api('/api/subscription/cancel', { method: 'POST' });
      onSubscriptionChanged?.(normalizeSubscription(result.subscription));
      setStatus('Abo gekündigt. Dein Konto verwendet jetzt Free.');
    } catch (requestError) { setError(requestError.message); }
    finally { setDataBusy(''); }
  }

  async function exportData() {
    setDataBusy('export'); setStatus(''); setError('');
    try {
      const result = await api('/api/account/export');
      downloadText(`yildiz-ai-${user.username}-daten.json`, JSON.stringify(result, null, 2), 'application/json');
      setStatus('Dein Datenexport wurde heruntergeladen.');
    } catch (requestError) { setError(requestError.message); }
    finally { setDataBusy(''); }
  }

  async function deleteCloud(kind) {
    const label = kind === 'chats' ? 'alle Cloud-Chats' : 'alle Cloud-Projekte';
    if (!window.confirm(`${label} dieses Kontos wirklich unwiderruflich löschen?`)) return;
    setDataBusy(kind); setStatus(''); setError('');
    try {
      await api(kind === 'chats' ? '/api/account/delete-chats' : '/api/account/delete-projects', { method: 'POST' });
      setStatus(`${label} wurden gelöscht.`);
    } catch (requestError) { setError(requestError.message); }
    finally { setDataBusy(''); }
  }

  function clearLocalData() {
    if (!window.confirm('Lokale Entwürfe und Cache-Daten auf diesem Gerät löschen? Dein Login bleibt erhalten.')) return;
    const keep = new Set(['yildiz_ai_token']);
    const keys = Object.keys(localStorage);
    for (const key of keys) if (key.startsWith('yildiz_ai_') && !keep.has(key)) localStorage.removeItem(key);
    setStatus('Lokale Entwürfe und Cache-Daten dieses Geräts wurden gelöscht.');
  }

  return <section className="account-page">
    <div className="page-heading"><div><h2><UserCircle2 size={22}/> Mein Konto</h2><p>Passwort, Beta-Abo, Nutzung und Datenschutz.</p></div></div>
    {error && <div className="error-box">{error}</div>}
    {status && <div className="success-box"><CheckCircle2 size={18}/>{status}</div>}

    <div className="account-layout">
      <article className="account-card account-summary">
        <div className="account-avatar-large">{user.username.slice(0, 2).toUpperCase()}</div>
        <div><span>Angemeldet als</span><h3>{user.username}</h3><p>{user.role === 'admin' ? 'Administrator' : 'Nutzerkonto'}</p></div>
        <div className="security-note"><ShieldCheck size={18}/> Chats und Projekte sind privat an dieses Konto gebunden.</div>
      </article>

      <article className="account-card subscription-account-card">
        <h3><BadgeEuro size={19}/> Mein Beta-Abo</h3>
        <div className="account-plan-name"><div><span>Aktiver Zugang</span><b>{user.role === 'admin' ? 'Admin · Vollzugriff' : plan.name}</b></div><strong>{formatPlanPrice(0)}<small>/ Beta</small></strong></div>
        <p>Späterer Beispielpreis: {formatPlanPrice(plan.examplePrice)} pro Monat. Während der Beta gibt es keine Zahlung und keine automatische Verlängerung mit Abbuchung.</p>
        {user.role !== 'admin' && <div className="beta-plan-test-row">{PLAN_CATALOG.map((entry)=><button key={entry.id} className={currentSubscription.planId===entry.id?'active':''} disabled={Boolean(dataBusy)} onClick={()=>testPlan(entry.id)}>{entry.name} testen · 0,00 €</button>)}</div>}
        <div className="account-plan-actions"><button className="primary-btn" onClick={onOpenPlans}><BadgeEuro size={17}/>Abos vergleichen</button>{user.role !== 'admin' && currentSubscription.planId !== 'free' && <button onClick={cancelSubscription} disabled={dataBusy === 'subscription'}><LogOut size={17}/>Abo kündigen</button>}</div>
      </article>

      <article className="account-card">
        <h3><KeyRound size={19}/> Eigenes Passwort ändern</h3>
        {user.mustChangePassword && <div className="password-required">Bitte ersetze jetzt das Startpasswort durch dein eigenes Passwort.</div>}
        <form onSubmit={changePassword}>
          <label>Aktuelles Passwort<input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required/></label>
          <label>Neues Passwort<input type="password" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} required/></label>
          <label>Neues Passwort wiederholen<input type="password" autoComplete="new-password" minLength={8} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required/></label>
          <button className="primary-btn" type="submit" disabled={saving}><Save size={17}/>{saving ? 'Wird gespeichert …' : 'Passwort ändern'}</button>
        </form>
      </article>
    </div>

    {usageError && <article className="account-card usage-card"><div className="info-box">KI-Nutzung konnte nicht geladen werden: {usageError}</div></article>}
    {usage && <article className="account-card usage-card">
      <h3><BarChart3 size={19}/> Meine KI-Nutzung</h3>
      <div className="usage-metrics">
        <div><Image size={18}/><span>Bilder heute</span><b>{usage.usage?.dailyImages || 0} / {limitText(usage.limits?.dailyImageLimit)}</b></div>
        <div><Video size={18}/><span>Videosekunden heute</span><b>{usage.usage?.dailyVideoSeconds || 0} / {limitText(usage.limits?.dailyVideoSecondsLimit, ' s')}</b></div>
        <div><BarChart3 size={18}/><span>API-Kosten diesen Monat</span><b>{money(usage.usage?.monthlyCostUsd)} / {Number(usage.limits?.monthlyBudgetUsd) < 0 ? 'Unbegrenzt' : money(usage.limits?.monthlyBudgetUsd)}</b></div>
      </div>
      <div className="info-box">Das Beta-Abo kostet dich 0,00 €. Diese Anzeige betrifft nur mögliches OpenAI-/Sora-API-Guthaben des Betreibers.</div>
    </article>}

    <article className="account-card privacy-card">
      <h3><Database size={19}/> Datenschutz & Datenkontrolle</h3>
      <p>Du kannst deine gespeicherten Kontodaten exportieren oder einzelne Datenbereiche löschen.</p>
      <div className="privacy-actions">
        <button onClick={exportData} disabled={Boolean(dataBusy)}><CloudDownload size={17}/>Daten exportieren</button>
        <button onClick={() => deleteCloud('chats')} disabled={Boolean(dataBusy)}><Trash2 size={17}/>Cloud-Chats löschen</button>
        <button onClick={() => deleteCloud('projects')} disabled={Boolean(dataBusy)}><Trash2 size={17}/>Cloud-Projekte löschen</button>
        <button onClick={clearLocalData} disabled={Boolean(dataBusy)}><Trash2 size={17}/>Lokale Daten löschen</button>
      </div>
    </article>
  </section>;
}
