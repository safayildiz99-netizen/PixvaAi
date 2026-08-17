import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BadgeEuro, CheckCircle2, CloudDownload, Copy, Database, Image, KeyRound, LogOut, Plus, Save, ShieldCheck, Trash2, UserCircle2, Video } from 'lucide-react';
import { api, downloadText } from '../api.js';
import { formatPlanPrice, getPlan, getPlanCatalog, normalizeSubscription } from '../plans.js';


const API_SCOPE_LABELS={chat:'Chat',brain:'PIXVA Brain',flyer:'Flyer',website:'Website',image:'Bilder',video:'Video'};

function money(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function limitText(value, suffix = '') {
  const number = Number(value);
  return number < 0 ? 'Unbegrenzt' : `${number}${suffix}`;
}

export default function AccountSettings({ user, onUserChanged, subscription, onSubscriptionChanged, onOpenPlans, customPlans = [], planPrices = {}, betaPlanPrices = {} }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState(null);
  const [usageError, setUsageError] = useState('');
  const [dataBusy, setDataBusy] = useState('');
  const [apiKeys, setApiKeys] = useState([]);
  const [apiKeyForm, setApiKeyForm] = useState({ name:'Meine Integration', scopes:['chat','brain','flyer','website'], rateLimitPerMinute:30, expiresDays:0 });
  const [revealedApiKey, setRevealedApiKey] = useState('');
  const [apiBusy, setApiBusy] = useState('');
  const catalog = useMemo(() => getPlanCatalog(customPlans), [customPlans]);
  const currentSubscription = normalizeSubscription(subscription, customPlans);
  const plan = useMemo(() => getPlan(currentSubscription.planId, customPlans), [currentSubscription.planId, customPlans]);

  useEffect(() => {
    api('/api/usage/me')
      .then((result) => { setUsage(result); setUsageError(''); })
      .catch((requestError) => { setUsage(null); setUsageError(requestError.message || 'Nutzung konnte nicht geladen werden.'); });
  }, [currentSubscription.planId]);


  async function loadApiKeys() {
    try { const result = await api('/api/pixva?action=api-keys-list'); setApiKeys(result.keys || []); }
    catch (requestError) { setError(requestError.message || 'API-Keys konnten nicht geladen werden.'); }
  }
  useEffect(() => { loadApiKeys(); }, [user?.id]);

  function toggleApiScope(scope) {
    setApiKeyForm((old) => ({ ...old, scopes: old.scopes.includes(scope) ? old.scopes.filter((item) => item !== scope) : [...old.scopes, scope] }));
  }
  async function createApiKey() {
    if (!apiKeyForm.scopes.length) return setError('Wähle mindestens eine API-Berechtigung.');
    setApiBusy('create'); setError(''); setStatus(''); setRevealedApiKey('');
    try {
      const result = await api('/api/pixva?action=api-key-create', { method:'POST', body:JSON.stringify(apiKeyForm) });
      setRevealedApiKey(result.key || '');
      setStatus('API-Key erstellt. Er wird nur jetzt vollständig angezeigt.');
      await loadApiKeys();
    } catch (requestError) { setError(requestError.message || 'API-Key konnte nicht erstellt werden.'); }
    finally { setApiBusy(''); }
  }
  async function revokeApiKey(item) {
    if (!window.confirm(`API-Key ${item.name || item.prefix} wirklich widerrufen?`)) return;
    setApiBusy(item.id); setError(''); setStatus('');
    try { await api('/api/pixva?action=api-key-revoke', { method:'POST', body:JSON.stringify({ id:item.id }) }); setStatus('API-Key wurde widerrufen.'); await loadApiKeys(); }
    catch (requestError) { setError(requestError.message || 'API-Key konnte nicht widerrufen werden.'); }
    finally { setApiBusy(''); }
  }
  async function copyApiKey() {
    if (!revealedApiKey) return;
    try { await navigator.clipboard.writeText(revealedApiKey); setStatus('API-Key kopiert.'); }
    catch { setError('API-Key konnte nicht automatisch kopiert werden.'); }
  }

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
    setDataBusy(`plan-${planId}`); setStatus(''); setError('');
    try {
      const result = await api('/api/subscription/select', { method: 'POST', body: JSON.stringify({ planId }) });
      onSubscriptionChanged?.(normalizeSubscription(result.subscription, customPlans));
      setStatus(`${getPlan(planId, customPlans).name} ist jetzt als kostenloser Beta-Test aktiv. Es wurde nichts berechnet.`);
    } catch (requestError) { setError(requestError.message || 'Der Testzugang konnte nicht aktiviert werden.'); }
    finally { setDataBusy(''); }
  }

  async function cancelSubscription() {
    if (currentSubscription.planId === 'free') return;
    if (!window.confirm(`${plan.name} wirklich kündigen? Dein Konto wechselt sofort auf Free. In der Beta wird nichts berechnet.`)) return;
    setDataBusy('subscription'); setStatus(''); setError('');
    try {
      const result = await api('/api/subscription/cancel', { method: 'POST' });
      onSubscriptionChanged?.(normalizeSubscription(result.subscription, customPlans));
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
        <div className="account-plan-name"><div><span>Aktiver Zugang</span><b>{plan.name}{user.role === 'admin' ? ' · Admin' : ''}</b></div><strong>{formatPlanPrice(betaPlanPrices?.[plan.id] ?? plan.betaPrice ?? 0)}<small>/ Beta</small></strong></div>
        <p>Späterer Beispielpreis: {formatPlanPrice(planPrices?.[plan.id] ?? plan.examplePrice)} pro Monat. Während der Beta gibt es keine Zahlung und keine automatische Verlängerung mit Abbuchung.</p>
        <div className="beta-plan-test-row">{catalog.map((entry)=><button key={entry.id} className={currentSubscription.planId===entry.id?'active':''} disabled={Boolean(dataBusy)} onClick={()=>testPlan(entry.id)}>{entry.name} testen · {formatPlanPrice(betaPlanPrices?.[entry.id] ?? entry.betaPrice ?? 0)}</button>)}</div>
        <div className="account-plan-actions"><button className="primary-btn" onClick={onOpenPlans}><BadgeEuro size={17}/>Abos vergleichen</button>{currentSubscription.planId !== 'free' && <button onClick={cancelSubscription} disabled={dataBusy === 'subscription'}><LogOut size={17}/>Abo kündigen</button>}</div>
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

    <article className="account-card pixva-api-card">
      <h3><KeyRound size={19}/> PIXVA API-Keys</h3>
      <p>Erstelle eigene Schlüssel für Websites, Apps und Automationen. Der vollständige Schlüssel wird nur einmal angezeigt; PIXVA speichert serverseitig nur seinen SHA-256-Hash.</p>
      <div className="pixva-api-create-grid">
        <label>Name<input value={apiKeyForm.name} onChange={(event)=>setApiKeyForm({...apiKeyForm,name:event.target.value})} placeholder="z. B. Website Integration"/></label>
        <label>Anfragen pro Minute<input type="number" min="1" max="120" value={apiKeyForm.rateLimitPerMinute} onChange={(event)=>setApiKeyForm({...apiKeyForm,rateLimitPerMinute:Number(event.target.value)})}/></label>
        <label>Gültigkeit<select value={apiKeyForm.expiresDays} onChange={(event)=>setApiKeyForm({...apiKeyForm,expiresDays:Number(event.target.value)})}><option value={0}>Unbegrenzt</option><option value={30}>30 Tage</option><option value={90}>90 Tage</option><option value={365}>1 Jahr</option></select></label>
      </div>
      <div className="pixva-api-scopes">{Object.entries(API_SCOPE_LABELS).map(([scope,label])=><label key={scope}><input type="checkbox" checked={apiKeyForm.scopes.includes(scope)} onChange={()=>toggleApiScope(scope)}/>{label}</label>)}</div>
      <button className="primary-btn" onClick={createApiKey} disabled={apiBusy==='create'}><Plus size={17}/>{apiBusy==='create'?'Wird erstellt …':'API-Key erstellen'}</button>

      {revealedApiKey && <div className="pixva-api-reveal"><b>Nur jetzt vollständig sichtbar</b><code>{revealedApiKey}</code><button onClick={copyApiKey}><Copy size={16}/>Kopieren</button><small>Speichere diesen Key sicher. Nach dem Verlassen dieser Ansicht kann PIXVA ihn nicht erneut im Klartext anzeigen.</small></div>}

      <div className="pixva-api-key-list">{apiKeys.length===0?<p>Noch keine API-Keys.</p>:apiKeys.map((item)=><div className="pixva-api-key-row" key={item.id}>
        <div><b>{item.name}</b><code>pixva_live_{item.prefix}_••••••••</code><small>{(item.scopes||[]).map(scope=>API_SCOPE_LABELS[scope]||scope).join(' · ')} · {item.rateLimitPerMinute}/Min. · {item.active?'AKTIV':'WIDERRUFEN'}</small>{item.lastUsedAt&&<small>Zuletzt verwendet: {new Date(item.lastUsedAt).toLocaleString('de-DE')}</small>}</div>
        {item.active&&<button onClick={()=>revokeApiKey(item)} disabled={apiBusy===item.id}><Trash2 size={16}/>Widerrufen</button>}
      </div>)}</div>

      <details className="pixva-api-docs"><summary>Public API Beispiele</summary>
        <p>Basis-URL: <code>{typeof window==='undefined'?'https://deine-domain.de':window.location.origin}</code></p>
        <pre>{`curl -X POST ${typeof window==='undefined'?'https://deine-domain.de':window.location.origin}/api/v1/chat \
  -H "Authorization: Bearer <DEIN_PIXVA_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Erstelle einen kurzen Werbetext für meine Firma"}'`}</pre>
        <p>Weitere Endpunkte: <code>/api/v1/brain</code>, <code>/api/v1/blueprint</code>, <code>/api/v1/image</code>, <code>/api/v1/video</code>, <code>/api/v1/status</code>. Bei Bild und Video muss zusätzlich <code>confirmCost=true</code> gesendet werden.</p>
      </details>
    </article>

    {usageError && <article className="account-card usage-card"><div className="info-box">KI-Nutzung konnte nicht geladen werden: {usageError}</div></article>}
    {usage && <article className="account-card usage-card">
      <h3><BarChart3 size={19}/> Meine KI-Nutzung</h3>
      <div className="usage-metrics usage-metrics-expanded">
        <div><Image size={18}/><span>Bilder heute</span><b>{usage.usage?.dailyImages || 0} / {limitText(usage.limits?.dailyImageLimit)}</b><small>{money(usage.usage?.dailyImageCostUsd)} heute · {money(usage.usage?.monthlyImageCostUsd)} Monat</small></div>
        <div><Video size={18}/><span>Videosekunden heute</span><b>{usage.usage?.dailyVideoSeconds || 0} / {limitText(usage.limits?.dailyVideoSecondsLimit, ' s')}</b><small>{money(usage.usage?.dailyVideoCostUsd)} heute · {money(usage.usage?.monthlyVideoCostUsd)} Monat</small></div>
        <div><BarChart3 size={18}/><span>API-Kosten heute</span><b>{money(usage.usage?.dailyCostUsd)}</b><small>Bild und Video zusammen</small></div>
        <div><BarChart3 size={18}/><span>API-Kosten diesen Monat</span><b>{money(usage.usage?.monthlyCostUsd)} / {Number(usage.limits?.monthlyBudgetUsd) < 0 ? 'Unbegrenzt' : money(usage.limits?.monthlyBudgetUsd)}</b><small>Nur abgeschlossene Aufträge</small></div>
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
