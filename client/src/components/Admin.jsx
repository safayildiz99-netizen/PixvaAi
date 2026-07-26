import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDown, ArrowUp, BarChart3, CheckCircle2, ClipboardCopy, Cpu, Eye, EyeOff, GripVertical, Image, KeyRound, Laptop,
  LayoutDashboard, MessageSquareText, Monitor, Palette, Plus, Redo2, RefreshCw, RotateCcw, Save, Smartphone, Tablet,
  Search, Shield, ShieldAlert, Trash2, Undo2, UserRoundCog, Video, XCircle
} from 'lucide-react';
import { api } from '../api.js';

const DEFAULT_NAV_ITEMS = [
  { id:'chat', label:'Chat', visible:true },
  { id:'flyer', label:'Angebote & Flyer', visible:true },
  { id:'image', label:'Motive & Editor', visible:true },
  { id:'video', label:'Video-Studio', visible:true },
  { id:'website', label:'Website-Builder', visible:true },
  { id:'projects', label:'Projekte', visible:true }
];

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
  compactSidebar: false,
  mobileHistoryDrawer: true,
  navItems: DEFAULT_NAV_ITEMS,
  texts: {
    appTitle:'Yildiz AI Chat', newDesign:'Neues Design', chatTab:'Chat', workTab:'Work',
    statusTitle:'Yildiz AI · Gemini + OpenAI + Sora',
    welcome:'Hallo! Ich bin Yildiz AI. Du kannst mir Fragen stellen, Bilder und Videos direkt erzeugen sowie Dateien erstellen und hochladen.',
    composer:'Frag Yildiz AI …'
  },
  theme: { sidebarWidth:255, accentBlue:'#63c7ff', accentYellow:'#ffd400' }
};

function normalizeSettings(value = {}) {
  const incomingNav = Array.isArray(value.navItems) ? value.navItems : [];
  const navItems = incomingNav.length ? incomingNav.filter((item)=>DEFAULT_NAV_ITEMS.some((known)=>known.id===item.id)).map((item)=>({id:item.id,label:String(item.label||DEFAULT_NAV_ITEMS.find((known)=>known.id===item.id)?.label||item.id),visible:item.visible!==false})) : DEFAULT_NAV_ITEMS.map((item)=>({...item}));
  for (const item of DEFAULT_NAV_ITEMS) if (!navItems.some((entry)=>entry.id===item.id)) navItems.push({...item});
  return {
    ...DEFAULT_UI_SETTINGS,
    ...value,
    navItems,
    texts:{...DEFAULT_UI_SETTINGS.texts,...(value.texts||{})},
    theme:{...DEFAULT_UI_SETTINGS.theme,...(value.theme||{})}
  };
}

function withLegacyVisibility(settings) {
  const visibility = Object.fromEntries((settings.navItems||[]).map((item)=>[item.id,item.visible!==false]));
  return {
    ...settings,
    showFlyer:visibility.flyer!==false,
    showImage:visibility.image!==false,
    showVideo:visibility.video!==false,
    showWebsite:visibility.website!==false,
    showProjects:visibility.projects!==false
  };
}

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
  const [settingsDraft, setSettingsDraft] = useState(() => normalizeSettings(uiSettings));
  const [selectedVisualId, setSelectedVisualId] = useState('nav-chat');
  const [dragVisualId, setDragVisualId] = useState('');
  const [auditLog, setAuditLog] = useState([]);
  const [viewHistory, setViewHistory] = useState({ past: [], future: [] });
  const [previewDevice, setPreviewDevice] = useState('desktop');
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

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


  async function loadHealth() {
    setHealthLoading(true);
    try {
      const response = await api('/api/health');
      setHealth(response);
    } catch (error) {
      setHealth({ ok: false, error: error.message, services: {} });
      setStatus(error.message);
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => { loadCore(); }, []);
  useEffect(() => { setSettingsDraft(normalizeSettings(uiSettings)); setViewHistory({ past: [], future: [] }); }, [uiSettings]);
  useEffect(() => {
    if (tab === 'chats') loadChatAccounts();
    if (tab === 'system') { loadAuditLog(); loadHealth(); }
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

  function applyViewChange(updater) {
    setSettingsDraft((old) => {
      const next = typeof updater === 'function' ? updater(old) : { ...old, ...updater };
      if (JSON.stringify(next) === JSON.stringify(old)) return old;
      setViewHistory((history) => ({ past: [...history.past.slice(-39), old], future: [] }));
      return next;
    });
  }

  function undoView() {
    setViewHistory((history) => {
      if (!history.past.length) return history;
      const previous = history.past[history.past.length - 1];
      setSettingsDraft((current) => previous);
      return { past: history.past.slice(0, -1), future: [settingsDraft, ...history.future].slice(0, 40) };
    });
  }

  function redoView() {
    setViewHistory((history) => {
      if (!history.future.length) return history;
      const next = history.future[0];
      setSettingsDraft(next);
      return { past: [...history.past, settingsDraft].slice(-40), future: history.future.slice(1) };
    });
  }

  function patchSettings(patch) {
    applyViewChange((old) => ({ ...old, ...patch }));
  }

  function resetViewDefaults() {
    applyViewChange(() => normalizeSettings(DEFAULT_UI_SETTINGS));
    setSelectedVisualId('nav-chat');
  }

  function patchText(key, value) {
    applyViewChange((old) => ({ ...old, texts: { ...old.texts, [key]: String(value || '').slice(0, 220) } }));
  }

  function patchTheme(patch) {
    applyViewChange((old) => ({ ...old, theme: { ...old.theme, ...patch } }));
  }

  function patchNav(id, patch) {
    applyViewChange((old) => ({ ...old, navItems: old.navItems.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  function moveNav(id, direction) {
    applyViewChange((old) => {
      const next = old.navItems.map((item) => ({ ...item }));
      const index = next.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return old;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...old, navItems: next };
    });
  }

  function dropNav(targetId) {
    if (!dragVisualId || dragVisualId === targetId) return;
    applyViewChange((old) => {
      const next = old.navItems.map((item) => ({ ...item }));
      const sourceIndex = next.findIndex((item) => item.id === dragVisualId);
      const targetIndex = next.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return old;
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return { ...old, navItems: next };
    });
    setDragVisualId('');
  }

  function deleteSelectedVisual() {
    if (selectedVisualId.startsWith('nav-')) {
      const id = selectedVisualId.slice(4);
      if (id === 'chat') return setStatus('Der Chat kann nicht gelöscht werden.');
      patchNav(id, { visible:false });
      setSelectedVisualId('nav-chat');
      return;
    }
    if (selectedVisualId.startsWith('text-')) {
      patchText(selectedVisualId.slice(5), '');
    }
  }

  function selectedNavId() {
    return selectedVisualId.startsWith('nav-') ? selectedVisualId.slice(4) : '';
  }

  async function saveViewSettings() {
    try {
      const response = await api('/api/admin/ui-settings', {
        method: 'POST',
        body: JSON.stringify({ settings: withLegacyVisibility(settingsDraft) })
      });
      const saved = normalizeSettings(response.settings || settingsDraft);
      setSettingsDraft(saved);
      setViewHistory({ past: [], future: [] });
      onSettingsChanged?.(saved);
      setStatus('App-Ansicht gespeichert. Die Standardansicht bleibt im Yildiz-AI-Layout.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  return <section className="admin-page admin-control-center">
    <div className="page-heading admin-heading">
      <div><h2><Shield size={22}/> Admin-Kontrollzentrum</h2><p>Konten, private Chat-Prüfung, App-Ansicht, KI-Limits und Systemstatus.</p></div>
      <button onClick={() => { loadCore(); if (tab === 'chats') loadChatAccounts(); if (tab === 'system') { loadAuditLog(); loadHealth(); } }}><RefreshCw size={16}/>Aktualisieren</button>
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

    {tab === 'view' && <div className="admin-visual-view-editor">
      <div className="visual-editor-head">
        <div><h3><Monitor size={19}/> Live-Ansicht bearbeiten</h3><p>Klicke direkt auf einen Text, um ihn zu ändern. Ziehe Menüeinträge an eine neue Position. Ausgewählte Elemente kannst du verschieben, ausblenden oder zurücksetzen.</p></div>
        <div className="admin-view-actions">
          <button onClick={undoView} disabled={!viewHistory.past.length} title="Rückgängig"><Undo2 size={16}/>Rückgängig</button>
          <button onClick={redoView} disabled={!viewHistory.future.length} title="Wiederholen"><Redo2 size={16}/>Wiederholen</button>
          <button onClick={resetViewDefaults}><RotateCcw size={16}/>1:1 zurücksetzen</button>
          <button className="primary-btn" onClick={saveViewSettings}><Save size={16}/>Ansicht speichern</button>
        </div>
      </div>

      <div className="visual-device-switcher" aria-label="Vorschaugröße">
        <button className={previewDevice === 'desktop' ? 'active' : ''} onClick={() => setPreviewDevice('desktop')}><Laptop size={16}/>Desktop</button>
        <button className={previewDevice === 'tablet' ? 'active' : ''} onClick={() => setPreviewDevice('tablet')}><Tablet size={16}/>Tablet</button>
        <button className={previewDevice === 'mobile' ? 'active' : ''} onClick={() => setPreviewDevice('mobile')}><Smartphone size={16}/>Handy</button>
      </div>

      <div className="visual-editor-switches">
        <button className={settingsDraft.allowGuest ? 'active' : ''} onClick={()=>patchSettings({allowGuest:!settingsDraft.allowGuest})}>{settingsDraft.allowGuest ? <Eye size={15}/> : <EyeOff size={15}/>}Gastmodus</button>
        <button className={settingsDraft.compactSidebar ? 'active' : ''} onClick={()=>patchSettings({compactSidebar:!settingsDraft.compactSidebar})}>Kompakte Seitenleiste</button>
        <button className={settingsDraft.maintenanceMode ? 'active warning' : ''} onClick={()=>patchSettings({maintenanceMode:!settingsDraft.maintenanceMode})}>Wartungshinweis</button>
        <label>Startansicht<select value={settingsDraft.defaultView} onChange={(event)=>patchSettings({defaultView:event.target.value})}><option value="chat">Chat</option><option value="flyer">Angebote & Flyer</option><option value="image">Motive & Editor</option><option value="video">Video-Studio</option><option value="website">Website-Builder</option><option value="projects">Projekte</option></select></label>
        <label>Work-Ziel<select value={settingsDraft.workView} onChange={(event)=>patchSettings({workView:event.target.value})}><option value="projects">Projekte</option><option value="flyer">Angebote & Flyer</option><option value="image">Motive & Editor</option><option value="video">Video-Studio</option><option value="website">Website-Builder</option></select></label>
      </div>

      <div className={`live-view-stage device-${previewDevice}`} style={{'--preview-sidebar':`${Math.max(210,Math.min(360,Number(settingsDraft.theme.sidebarWidth||255)))}px`,'--preview-blue':settingsDraft.theme.accentBlue,'--preview-yellow':settingsDraft.theme.accentYellow}}>
        <aside className={settingsDraft.compactSidebar ? 'compact' : ''}>
          <div className="live-logo">yildiz<span>☆</span>AI</div>
          <button className={`live-editable new-design ${selectedVisualId==='text-newDesign'?'selected':''}`} onClick={()=>setSelectedVisualId('text-newDesign')}>
            <span contentEditable suppressContentEditableWarning onBlur={(event)=>patchText('newDesign',event.currentTarget.textContent)}>{settingsDraft.texts.newDesign}</span>
          </button>
          <nav>
            {settingsDraft.navItems.filter((item)=>item.visible!==false).map((item)=><button
              key={item.id}
              draggable
              onDragStart={()=>setDragVisualId(item.id)}
              onDragOver={(event)=>event.preventDefault()}
              onDrop={()=>dropNav(item.id)}
              className={`live-editable ${selectedVisualId===`nav-${item.id}`?'selected':''}`}
              onClick={()=>setSelectedVisualId(`nav-${item.id}`)}
            ><GripVertical size={13}/><span contentEditable suppressContentEditableWarning onBlur={(event)=>patchNav(item.id,{label:event.currentTarget.textContent})}>{item.label}</span></button>)}
          </nav>
          <div className="live-sidebar-footer"><span>Mein Konto</span><span>Admin</span></div>
        </aside>
        <main>
          <header>
            <b className={`live-editable text-only ${selectedVisualId==='text-appTitle'?'selected':''}`} onClick={()=>setSelectedVisualId('text-appTitle')} contentEditable suppressContentEditableWarning onBlur={(event)=>patchText('appTitle',event.currentTarget.textContent)}>{settingsDraft.texts.appTitle}</b>
            <div className="live-tabs"><span className={`live-editable text-only ${selectedVisualId==='text-chatTab'?'selected':''}`} onClick={()=>setSelectedVisualId('text-chatTab')} contentEditable suppressContentEditableWarning onBlur={(event)=>patchText('chatTab',event.currentTarget.textContent)}>{settingsDraft.texts.chatTab}</span><span className={`live-editable text-only ${selectedVisualId==='text-workTab'?'selected':''}`} onClick={()=>setSelectedVisualId('text-workTab')} contentEditable suppressContentEditableWarning onBlur={(event)=>patchText('workTab',event.currentTarget.textContent)}>{settingsDraft.texts.workTab}</span></div>
          </header>
          {settingsDraft.announcement && <div className={`live-announcement live-editable ${selectedVisualId==='text-announcement'?'selected':''}`} onClick={()=>setSelectedVisualId('text-announcement')} contentEditable suppressContentEditableWarning onBlur={(event)=>patchSettings({announcement:event.currentTarget.textContent})}>{settingsDraft.announcement}</div>}
          <section>
            <div className={`live-status live-editable ${selectedVisualId==='text-statusTitle'?'selected':''}`} onClick={()=>setSelectedVisualId('text-statusTitle')} contentEditable suppressContentEditableWarning onBlur={(event)=>patchText('statusTitle',event.currentTarget.textContent)}>{settingsDraft.texts.statusTitle}</div>
            <div className={`live-welcome live-editable ${selectedVisualId==='text-welcome'?'selected':''}`} onClick={()=>setSelectedVisualId('text-welcome')} contentEditable suppressContentEditableWarning onBlur={(event)=>patchText('welcome',event.currentTarget.textContent)}>{settingsDraft.texts.welcome}</div>
            <div className="live-spacer"/>
            <div className={`live-composer live-editable ${selectedVisualId==='text-composer'?'selected':''}`} onClick={()=>setSelectedVisualId('text-composer')} contentEditable suppressContentEditableWarning onBlur={(event)=>patchText('composer',event.currentTarget.textContent)}>{settingsDraft.texts.composer}</div>
          </section>
        </main>

        <div className="visual-floating-tools">
          <b>{selectedVisualId.startsWith('nav-') ? 'Menüelement' : 'Text ausgewählt'}</b>
          {selectedNavId() && <><button onClick={()=>moveNav(selectedNavId(),-1)} title="Nach oben"><ArrowUp size={15}/></button><button onClick={()=>moveNav(selectedNavId(),1)} title="Nach unten"><ArrowDown size={15}/></button></>}
          <button onClick={deleteSelectedVisual} title="Ausblenden oder leeren"><Trash2 size={15}/></button>
        </div>
      </div>

      <div className="visual-add-panel">
        <div><b><Plus size={16}/>Element hinzufügen</b><span>Ausgeblendete Bereiche erscheinen nach einem Klick wieder direkt in der Vorschau.</span></div>
        <div>{settingsDraft.navItems.filter((item)=>item.visible===false).map((item)=><button key={item.id} onClick={()=>{patchNav(item.id,{visible:true});setSelectedVisualId(`nav-${item.id}`)}}><Plus size={14}/>{item.label}</button>)}{!settingsDraft.announcement&&<button onClick={()=>{patchSettings({announcement:'Neue Mitteilung'});setSelectedVisualId('text-announcement')}}><Plus size={14}/>Mitteilung</button>}</div>
      </div>

      <div className="visual-theme-panel">
        <label>Seitenleistenbreite<input type="range" min="210" max="360" value={settingsDraft.theme.sidebarWidth} onChange={(event)=>patchTheme({sidebarWidth:Number(event.target.value)})}/><span>{settingsDraft.theme.sidebarWidth}px</span></label>
        <label>Blau<input type="color" value={settingsDraft.theme.accentBlue} onChange={(event)=>patchTheme({accentBlue:event.target.value})}/></label>
        <label>Gelb<input type="color" value={settingsDraft.theme.accentYellow} onChange={(event)=>patchTheme({accentYellow:event.target.value})}/></label>
      </div>
    </div>}

    {tab === 'system' && <div className="admin-grid admin-grid-two">
      <article className="admin-card"><h3><Activity size={19}/> Systemstatus</h3>
        {healthLoading && <div className="service-row warning"><RefreshCw className="spin"/>Konfiguration wird kostenlos geprüft …</div>}
        {!healthLoading && ['supabase','gemini','openai','sora'].map((key) => {
          const service = health?.services?.[key];
          const labels = { supabase:'Supabase Konten & Cloud-Sync', gemini:'Gemini Chat', openai:'OpenAI Bilder', sora:'Sora Videos' };
          return <div className={`service-row ${service?.configured ? 'ok' : 'warning'}`} key={key}>{service?.configured ? <CheckCircle2/> : <XCircle/>}{labels[key]} · {service?.configured ? 'konfiguriert' : 'Schlüssel fehlt'}</div>;
        })}
        <div className="info-box">Diese Prüfung kostet 0,00 € und kontrolliert nur die sichere Server-Konfiguration. Eine echte Modellanfrage wird dabei nicht gestartet.</div>
        <button onClick={loadHealth}><RefreshCw size={15}/>Kostenlos erneut prüfen</button>
      </article>
      <article className="admin-card"><h3><Shield size={19}/> Letzte Admin-Aktionen</h3><div className="audit-list">{auditLog.length ? auditLog.map((event) => <div key={event.id}><b>{event.action}</b><span>{event.targetUsername || 'System'} · {formatDate(event.createdAt)}</span></div>) : <p>Noch keine protokollierten Aktionen.</p>}</div></article>
    </div>}
  </section>;
}
