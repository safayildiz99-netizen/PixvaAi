import { useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3, CheckCircle2, ClipboardCopy, Cpu, Eye, Image, KeyRound,
  LayoutDashboard, MessageSquareText, Monitor, Palette, Plus, RefreshCw, Save,
  Search, Shield, ShieldAlert, UserRoundCog, Video, XCircle
} from 'lucide-react';
import { api } from '../api.js';

const DEFAULT_UI_SETTINGS = {
  defaultView: 'chat',
  workView: 'projects',
  allowGuest: true,
  showFlyer: true,
  showImage: true,
  showVideo: true,
  showWebsite: true,
  showProjects: true,
  announcement: '',
  maintenanceMode: false,
  compactSidebar: false
};

function money(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function normalizeLimitUser(item) {
  return {
    dailyImageLimit: Number(item?.limits?.dailyImageLimit ?? 20),
    dailyVideoSecondsLimit: Number(item?.limits?.dailyVideoSecondsLimit ?? 24),
    monthlyBudgetUsd: Number(item?.limits?.monthlyBudgetUsd ?? 10),
    allowImages: item?.limits?.allowImages !== false,
    allowVideos: item?.limits?.allowVideos !== false
  };
}

function generateTemporaryPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%';
  const all = upper + lower + digits + symbols;
  const pick = (source) => source[Math.floor(Math.random() * source.length)];
  const values = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (values.length < 14) values.push(pick(all));
  return values.sort(() => Math.random() - 0.5).join('');
}

function formatDate(value) {
  if (!value) return '–';
  try { return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
  catch { return '–'; }
}

function copyText(value) {
  return navigator.clipboard?.writeText(String(value || ''));
}

export default function Admin({ user, uiSettings = DEFAULT_UI_SETTINGS, onSettingsChanged }) {
  const [tab, setTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [usageUsers, setUsageUsers] = useState([]);
  const [totalMonthlyCost, setTotalMonthlyCost] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const [temporaryPasswords, setTemporaryPasswords] = useState({});
  const [chatAccounts, setChatAccounts] = useState([]);
  const [chatSearch, setChatSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [chatData, setChatData] = useState({ username: '', chats: [], updatedAt: null });
  const [selectedChatId, setSelectedChatId] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({ ...DEFAULT_UI_SETTINGS, ...uiSettings });
  const [auditLog, setAuditLog] = useState([]);

  async function loadCore() {
    try {
      const response = await api('/api/users');
      let usage = { users: [], totalMonthlyCostUsd: 0 };
      try {
        usage = await api('/api/admin/usage');
      } catch (usageError) {
        setStatus(`KI-Limits konnten nicht geladen werden: ${usageError.message}`);
      }
      setUsers(response.users || []);
      setUsageUsers(usage.users || []);
      setTotalMonthlyCost(Number(usage.totalMonthlyCostUsd || 0));
      setDrafts(Object.fromEntries((usage.users || []).map((item) => [item.id, normalizeLimitUser(item)])));
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function loadChatAccounts() {
    try {
      const response = await api('/api/admin/chat-accounts');
      setChatAccounts(response.users || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function loadAuditLog() {
    try {
      const response = await api('/api/admin/audit-log');
      setAuditLog(response.events || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => { loadCore(); }, []);
  useEffect(() => { setSettingsDraft({ ...DEFAULT_UI_SETTINGS, ...uiSettings }); }, [uiSettings]);
  useEffect(() => {
    if (tab === 'chats') loadChatAccounts();
    if (tab === 'system') loadAuditLog();
  }, [tab]);

  const usageById = useMemo(() => Object.fromEntries(usageUsers.map((item) => [item.id, item])), [usageUsers]);
  const filteredChatAccounts = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    return chatAccounts.filter((item) => !query || String(item.username || '').toLowerCase().includes(query));
  }, [chatAccounts, chatSearch]);
  const selectedSession = useMemo(() => {
    return chatData.chats.find((item) => item.id === selectedChatId) || chatData.chats[0] || null;
  }, [chatData, selectedChatId]);

  async function createUser(event) {
    event.preventDefault(); setStatus('');
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(newUser) });
      setNewUser({ username: '', password: '', role: 'user' });
      setStatus('Konto erstellt. Das Startpasswort kann vom Nutzer beim ersten Login geändert werden.');
      loadCore();
    } catch (error) { setStatus(error.message); }
  }

  async function toggle(target) {
    try { await api(`/api/users/${target.id}`, { method: 'PATCH', body: JSON.stringify({ active: !target.active }) }); loadCore(); }
    catch (error) { setStatus(error.message); }
  }

  function patchDraft(id, patch) {
    setDrafts((old) => ({ ...old, [id]: { ...(old[id] || {}), ...patch } }));
  }

  async function saveLimits(target) {
    const draft = drafts[target.id] || normalizeLimitUser(usageById[target.id]);
    try {
      await api('/api/admin/usage-limits', {
        method: 'POST',
        body: JSON.stringify({ userId: target.id, ...draft })
      });
      setStatus(`Limits für ${target.username} gespeichert.`);
      loadCore();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function resetPassword(target) {
    const suggested = generateTemporaryPassword();
    const nextPassword = window.prompt(`Neues temporäres Passwort für ${target.username}:`, suggested);
    if (!nextPassword) return;
    if (nextPassword.length < 8) {
      setStatus('Das temporäre Passwort braucht mindestens 8 Zeichen.');
      return;
    }
    if (!window.confirm(`Passwort für ${target.username} wirklich zurücksetzen? Alle bestehenden Sitzungen werden beendet.`)) return;
    try {
      await api('/api/admin/reset-password', {
        method: 'POST',
        body: JSON.stringify({ userId: target.id, newPassword: nextPassword })
      });
      setTemporaryPasswords((old) => ({ ...old, [target.id]: nextPassword }));
      setStatus(`Passwort für ${target.username} wurde zurückgesetzt. Es wird nur jetzt einmal angezeigt.`);
      loadCore();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function openUserChats(account) {
    setSelectedAccountId(account.id);
    setChatLoading(true);
    setStatus('');
    try {
      const response = await api(`/api/admin/user-chats/${account.id}`);
      const chats = Array.isArray(response.chats) ? response.chats : [];
      setChatData({ username: response.username || account.username, chats, updatedAt: response.updatedAt || null });
      setSelectedChatId(chats[0]?.id || '');
    } catch (error) {
      setStatus(error.message);
      setChatData({ username: account.username, chats: [], updatedAt: null });
      setSelectedChatId('');
    } finally {
      setChatLoading(false);
    }
  }

  function patchSettings(patch) {
    setSettingsDraft((old) => ({ ...old, ...patch }));
  }

  function resetViewDefaults() {
    setSettingsDraft({ ...DEFAULT_UI_SETTINGS });
  }

  async function saveViewSettings() {
    try {
      const response = await api('/api/admin/ui-settings', {
        method: 'POST',
        body: JSON.stringify({ settings: settingsDraft })
      });
      const saved = { ...DEFAULT_UI_SETTINGS, ...(response.settings || settingsDraft) };
      setSettingsDraft(saved);
      onSettingsChanged?.(saved);
      setStatus('App-Ansicht gespeichert. Die Standardansicht bleibt im Yildiz-AI-Layout.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  return <section className="admin-page admin-control-center">
    <div className="page-heading admin-heading">
      <div><h2><Shield size={22}/> Admin-Kontrollzentrum</h2><p>Konten, private Chat-Prüfung, App-Ansicht, KI-Limits und Systemstatus.</p></div>
      <button onClick={() => { loadCore(); if (tab === 'chats') loadChatAccounts(); if (tab === 'system') loadAuditLog(); }}><RefreshCw size={16}/>Aktualisieren</button>
    </div>

    <div className="admin-tabs" role="tablist">
      <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><LayoutDashboard size={16}/>Übersicht</button>
      <button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}><UserRoundCog size={16}/>Konten</button>
      <button className={tab === 'chats' ? 'active' : ''} onClick={() => setTab('chats')}><MessageSquareText size={16}/>Alle Chats</button>
      <button className={tab === 'view' ? 'active' : ''} onClick={() => setTab('view')}><Palette size={16}/>Ansicht</button>
      <button className={tab === 'system' ? 'active' : ''} onClick={() => setTab('system')}><Activity size={16}/>System</button>
    </div>

    {status && <div className="status-line admin-status">{status}</div>}

    {tab === 'overview' && <>
      <div className="admin-stat-grid">
        <article><UserRoundCog/><span>Konten</span><strong>{users.length}</strong><small>{users.filter((item) => item.active).length} aktiv</small></article>
        <article><Image/><span>Bilder heute</span><strong>{usageUsers.reduce((sum, item) => sum + Number(item?.usage?.dailyImages || 0), 0)}</strong><small>über OpenAI</small></article>
        <article><Video/><span>Video heute</span><strong>{usageUsers.reduce((sum, item) => sum + Number(item?.usage?.dailyVideoSeconds || 0), 0)} s</strong><small>über Sora</small></article>
        <article><BarChart3/><span>Kosten Monat</span><strong>{money(totalMonthlyCost)}</strong><small>geschätzte Nutzung</small></article>
      </div>
      <div className="admin-grid admin-grid-two">
        <article className="admin-card"><h3><Cpu size={19}/> KI-Dienste</h3><div className="service-row ok"><CheckCircle2/>Gemini Chat verbunden</div><div className="service-row ok"><CheckCircle2/>OpenAI Bildroute aktiv</div><div className="service-row ok"><CheckCircle2/>Sora-Videoroute aktiv</div><p>Die API-Schlüssel bleiben ausschließlich serverseitig in Vercel.</p></article>
        <article className="admin-card"><h3><ShieldAlert size={19}/> Sicherheitsregeln</h3><p>Passwörter werden nur als nicht rückrechenbare Hashes gespeichert. Ein Admin kann sie deshalb nicht lesen, sondern sicher zurücksetzen.</p><div className="info-box">Chat-Zugriffe durch Admins werden im Audit-Protokoll mit Zeitpunkt und Zielkonto gespeichert.</div></article>
      </div>
    </>}

    {tab === 'accounts' && <>
      <div className="admin-grid admin-grid-two">
        <article className="admin-card"><h3><UserRoundCog size={19}/> Neues Konto ohne E-Mail</h3><form onSubmit={createUser}><label>Benutzername<input value={newUser.username} onChange={(event)=>setNewUser({...newUser,username:event.target.value})} required/></label><label>Startpasswort<input type="password" minLength={8} value={newUser.password} onChange={(event)=>setNewUser({...newUser,password:event.target.value})} required/></label><label>Rolle<select value={newUser.role} onChange={(event)=>setNewUser({...newUser,role:event.target.value})}><option value="user">Mitarbeiter</option><option value="admin">Admin</option></select></label><button className="primary-btn"><Plus size={17}/>Konto erstellen</button></form></article>
        <article className="admin-card"><h3><KeyRound size={19}/> Sichere Passwortverwaltung</h3><p>Bestehende Passwörter werden niemals im Klartext gespeichert oder angezeigt.</p><p>Über „Passwort zurücksetzen“ erzeugst du ein temporäres Passwort. Es wird einmal angezeigt und der Nutzer muss es anschließend ändern.</p></article>
      </div>

      <div className="user-table"><h3>Konten und Limits</h3>{users.map((account)=>{
        const usage = usageById[account.id]?.usage || {};
        const draft = drafts[account.id] || normalizeLimitUser(usageById[account.id]);
        const visiblePassword = temporaryPasswords[account.id];
        return <div className="user-limit-card" key={account.id}>
          <div className="user-limit-head"><div><b>{account.username}</b><span>{account.role==='admin'?'Admin':'Mitarbeiter'} · {account.active?'aktiv':'deaktiviert'} · {account.mustChangePassword?'Passwortänderung erforderlich':'eigenes Passwort gesetzt'}</span></div><div className="account-actions"><button onClick={()=>resetPassword(account)}><KeyRound size={15}/>Passwort zurücksetzen</button><button onClick={()=>toggle(account)} disabled={account.id===user.id}>{account.active?'Deaktivieren':'Aktivieren'}</button></div></div>
          {visiblePassword && <div className="temporary-password"><div><b>Temporäres Passwort – nur einmal sichtbar</b><code>{visiblePassword}</code></div><button onClick={() => copyText(visiblePassword)}><ClipboardCopy size={16}/>Kopieren</button></div>}
          <div className="usage-mini-row"><span><Image size={15}/>Heute: {usage.dailyImages || 0} Bilder</span><span><Video size={15}/>Heute: {usage.dailyVideoSeconds || 0} s Video</span><span><BarChart3 size={15}/>Monat: {money(usage.monthlyCostUsd)}</span></div>
          <div className="limit-editor-grid"><label>Bilder pro Tag<input type="number" min="-1" value={draft.dailyImageLimit} onChange={(event)=>patchDraft(account.id,{dailyImageLimit:Number(event.target.value)})}/><small>-1 = unbegrenzt</small></label><label>Videosekunden pro Tag<input type="number" min="-1" value={draft.dailyVideoSecondsLimit} onChange={(event)=>patchDraft(account.id,{dailyVideoSecondsLimit:Number(event.target.value)})}/><small>-1 = unbegrenzt</small></label><label>Monatsbudget in US-Dollar<input type="number" min="-1" step="0.01" value={draft.monthlyBudgetUsd} onChange={(event)=>patchDraft(account.id,{monthlyBudgetUsd:Number(event.target.value)})}/><small>-1 = unbegrenzt</small></label><label className="checkbox-row"><input type="checkbox" checked={draft.allowImages} onChange={(event)=>patchDraft(account.id,{allowImages:event.target.checked})}/>Bilder erlauben</label><label className="checkbox-row"><input type="checkbox" checked={draft.allowVideos} onChange={(event)=>patchDraft(account.id,{allowVideos:event.target.checked})}/>Videos erlauben</label><button className="primary-btn" onClick={()=>saveLimits(account)}><Save size={16}/>Limits speichern</button></div>
        </div>})}</div>
    </>}

    {tab === 'chats' && <div className="admin-chat-audit">
      <aside className="admin-chat-users">
        <div className="admin-search"><Search size={15}/><input value={chatSearch} onChange={(event)=>setChatSearch(event.target.value)} placeholder="Konten durchsuchen"/></div>
        <div className="audit-notice"><Eye size={16}/><span>Nur-Lese-Zugriff. Jeder Aufruf wird protokolliert.</span></div>
        {filteredChatAccounts.map((account) => <button key={account.id} className={selectedAccountId === account.id ? 'active' : ''} onClick={() => openUserChats(account)}><div><b>{account.username}</b><span>{account.role === 'admin' ? 'Admin' : 'Mitarbeiter'}</span></div><small>{account.chatCount || 0} Chats<br/>{formatDate(account.updatedAt)}</small></button>)}
      </aside>
      <section className="admin-chat-browser">
        {!selectedAccountId && <div className="admin-empty"><MessageSquareText size={34}/><b>Konto auswählen</b><span>Dann werden die synchronisierten Chats dieses Kontos schreibgeschützt angezeigt.</span></div>}
        {chatLoading && <div className="admin-empty"><RefreshCw className="spin"/><b>Chats werden geladen …</b></div>}
        {!chatLoading && selectedAccountId && <>
          <header><div><h3>{chatData.username}</h3><span>Letzte Synchronisierung: {formatDate(chatData.updatedAt)}</span></div><small>{chatData.chats.length} Chats</small></header>
          <div className="admin-chat-layout">
            <nav>{chatData.chats.length ? chatData.chats.map((session) => <button key={session.id} className={(selectedSession?.id || '') === session.id ? 'active' : ''} onClick={() => setSelectedChatId(session.id)}><b>{session.title || 'Neuer Chat'}</b><span>{formatDate(session.updatedAt || session.createdAt)}</span></button>) : <p>Keine Cloud-Chats vorhanden.</p>}</nav>
            <div className="admin-message-view">{selectedSession ? (selectedSession.messages || []).map((message, index) => <article key={message.id || index} className={message.role === 'user' ? 'user' : 'assistant'}><strong>{message.role === 'user' ? chatData.username : 'Yildiz AI'}</strong><p>{message.content || '–'}</p>{Array.isArray(message.attachments) && message.attachments.length > 0 && <small>{message.attachments.length} Anhang/Anhänge gespeichert</small>}</article>) : <div className="admin-empty"><MessageSquareText/><span>Kein Chat ausgewählt.</span></div>}</div>
          </div>
        </>}
      </section>
    </div>}

    {tab === 'view' && <div className="admin-view-grid">
      <article className="admin-card admin-view-settings"><h3><Palette size={19}/> App-Ansicht verwalten</h3><p>Die Standardwerte entsprechen der aktuellen Yildiz-AI-Ansicht. Änderungen wirken nach dem Speichern für alle Konten.</p><label>Startansicht<select value={settingsDraft.defaultView} onChange={(event)=>patchSettings({defaultView:event.target.value})}><option value="chat">Chat</option><option value="flyer">Angebote & Flyer</option><option value="image">Motive & Editor</option><option value="video">Video-Studio</option><option value="website">Website-Builder</option><option value="projects">Projekte</option></select></label><label>„Work“-Ziel<select value={settingsDraft.workView} onChange={(event)=>patchSettings({workView:event.target.value})}><option value="projects">Projekte</option><option value="flyer">Angebote & Flyer</option><option value="image">Motive & Editor</option><option value="video">Video-Studio</option><option value="website">Website-Builder</option></select></label><div className="admin-toggle-grid"><label><input type="checkbox" checked={settingsDraft.allowGuest} onChange={(event)=>patchSettings({allowGuest:event.target.checked})}/>Gastmodus erlauben</label><label><input type="checkbox" checked={settingsDraft.showFlyer} onChange={(event)=>patchSettings({showFlyer:event.target.checked})}/>Angebote & Flyer</label><label><input type="checkbox" checked={settingsDraft.showImage} onChange={(event)=>patchSettings({showImage:event.target.checked})}/>Motive & Editor</label><label><input type="checkbox" checked={settingsDraft.showVideo} onChange={(event)=>patchSettings({showVideo:event.target.checked})}/>Video-Studio</label><label><input type="checkbox" checked={settingsDraft.showWebsite} onChange={(event)=>patchSettings({showWebsite:event.target.checked})}/>Website-Builder</label><label><input type="checkbox" checked={settingsDraft.showProjects} onChange={(event)=>patchSettings({showProjects:event.target.checked})}/>Projekte</label><label><input type="checkbox" checked={settingsDraft.compactSidebar} onChange={(event)=>patchSettings({compactSidebar:event.target.checked})}/>Kompakte Seitenleiste</label><label><input type="checkbox" checked={settingsDraft.maintenanceMode} onChange={(event)=>patchSettings({maintenanceMode:event.target.checked})}/>Wartungshinweis aktiv</label></div><label>Globale Mitteilung<textarea rows="3" value={settingsDraft.announcement} onChange={(event)=>patchSettings({announcement:event.target.value})} placeholder="Optionaler Hinweis oberhalb des Arbeitsbereichs"/></label><div className="admin-view-actions"><button onClick={resetViewDefaults}>1:1 Standard wiederherstellen</button><button className="primary-btn" onClick={saveViewSettings}><Save size={16}/>Ansicht speichern</button></div></article>
      <article className="admin-card admin-live-preview"><h3><Monitor size={19}/> Vorschau</h3><div className={`mini-app-preview ${settingsDraft.compactSidebar ? 'compact' : ''}`}><aside><div className="mini-logo">yildiz<span>☆</span>AI</div><b>Neues Design</b><span>Chat</span>{settingsDraft.showFlyer && <span>Angebote & Flyer</span>}{settingsDraft.showImage && <span>Motive & Editor</span>}{settingsDraft.showVideo && <span>Video-Studio</span>}{settingsDraft.showWebsite && <span>Website-Builder</span>}{settingsDraft.showProjects && <span>Projekte</span>}</aside><main><header><b>Yildiz AI Chat</b><i>Chat&nbsp;&nbsp;&nbsp; Work</i></header>{settingsDraft.announcement && <div className="mini-announcement">{settingsDraft.announcement}</div>}<section><div className="mini-status">Yildiz AI · Gemini + OpenAI + Sora</div><div className="mini-message">Hallo! Ich bin Yildiz AI.</div><div className="mini-input">Frag Yildiz AI …</div></section></main></div><small>Die Vorschau zeigt die feste Desktop-Struktur. Auf kleineren Geräten bleibt sie responsiv.</small></article>
    </div>}

    {tab === 'system' && <div className="admin-grid admin-grid-two">
      <article className="admin-card"><h3><Activity size={19}/> Systemstatus</h3><div className="service-row ok"><CheckCircle2/>Supabase Konten & Cloud-Sync</div><div className="service-row ok"><CheckCircle2/>OpenAI Bilder</div><div className="service-row ok"><CheckCircle2/>Sora Videos</div><div className="service-row ok"><CheckCircle2/>Gemini Chat</div><div className="service-row warning"><XCircle/>Status wird bei echten Anfragen endgültig geprüft</div></article>
      <article className="admin-card"><h3><Shield size={19}/> Letzte Admin-Aktionen</h3><div className="audit-list">{auditLog.length ? auditLog.map((event) => <div key={event.id}><b>{event.action}</b><span>{event.targetUsername || 'System'} · {formatDate(event.createdAt)}</span></div>) : <p>Noch keine protokollierten Aktionen.</p>}</div></article>
    </div>}
  </section>;
}
