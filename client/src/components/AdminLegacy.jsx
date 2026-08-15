import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDown, ArrowUp, BadgeEuro, BarChart3, CheckCircle2, ClipboardCopy, Cpu, Crown, Eye, EyeOff, GripVertical, Image, KeyRound, Laptop,
  LayoutDashboard, MessageSquareText, Monitor, Palette, Plus, Redo2, RefreshCw, RotateCcw, Save, Smartphone, Tablet,
  Search, Shield, ShieldAlert, Trash2, Undo2, UserRoundCog, Video, XCircle
} from 'lucide-react';
import { api } from '../api.js';
import { formatPlanPrice, getPlan, getPlanCatalog, normalizeCustomPlan } from '../plans.js';

const DEFAULT_NAV_ITEMS = [
  { id:'chat', label:'Chat', visible:true },
  { id:'flyer', label:'Angebote & Flyer', visible:true },
  { id:'image', label:'Motive & Editor', visible:true },
  { id:'video', label:'Video-Studio', visible:true },
  { id:'website', label:'Website-Builder', visible:true },
  { id:'projects', label:'Projekte', visible:true },
  { id:'plans', label:'Abos & Preise', visible:true }
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
  showPlans: true,
  announcement: '',
  maintenanceMode: false,
  compactSidebar: false,
  mobileHistoryDrawer: true,
  costPromptMode: 'all',
  costPromptOverrides: {},
  customPlans: [],
  navItems: DEFAULT_NAV_ITEMS,
  texts: {
    appTitle:'PIXVA Chat', newDesign:'Neues Design', chatTab:'Chat', workTab:'Work',
    statusTitle:'PIXVA · Gemini + OpenAI + Sora',
    welcome:'Hallo! Ich bin PIXVA. Du kannst mir Fragen stellen, Bilder und Videos direkt erzeugen sowie Dateien erstellen und hochladen.',
    composer:'Frag PIXVA …',
    flyerTitle:'Angebote & Flyer', flyerSubtitle:'Bearbeitbare Vorlagen für Angebote, Produkte und Preise.',
    imageTitle:'Motive & Editor', imageSubtitle:'Bilder, Motive, Texte und Ebenen direkt bearbeiten.',
    videoTitle:'Video-Studio', videoSubtitle:'Szenen, Texte, Musik und Videos in einem Projekt.',
    websiteTitle:'Website-Builder', websiteSubtitle:'Webseiten gestalten und als HTML oder ZIP exportieren.',
    projectsTitle:'Projekte', projectsSubtitle:'Deine gespeicherten Designs, Videos und Webseiten.',
    plansTitle:'Abos & Preise', plansSubtitle:'Free, Creator und Studio Pro – während der Beta ohne Zahlung.'
  },
  theme: { sidebarWidth:255, accentBlue:'#63c7ff', accentYellow:'#ffd400' },
  planPrices: { free:0, creator:9.99, studio:24.99 },
  betaPlanPrices: { free:0, creator:0, studio:0 },
  paymentsEnabled: false,
  paymentProvider: 'paypal',
  paymentMerchantLabel: '',
  planPurchasable: { free:false, creator:true, studio:true },
  paidAccessDays: 30
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
    theme:{...DEFAULT_UI_SETTINGS.theme,...(value.theme||{})},
    planPrices:{...DEFAULT_UI_SETTINGS.planPrices,...(value.planPrices||{})},
    betaPlanPrices:{...DEFAULT_UI_SETTINGS.betaPlanPrices,...(value.betaPlanPrices||{})},
    planPurchasable:{...DEFAULT_UI_SETTINGS.planPurchasable,...(value.planPurchasable||{})},
    costPromptOverrides:{...(value.costPromptOverrides||{})},
    customPlans:Array.isArray(value.customPlans)?value.customPlans.map(normalizeCustomPlan):[]
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
    showProjects:visibility.projects!==false,
    showPlans:visibility.plans!==false
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

function InlineTextEditor({ as = 'span', value = '', active = false, multiline = false, className = '', placeholder = 'Text anklicken', onActivate, onCommit, onCancel }) {
  const [draft, setDraft] = useState(String(value || ''));
  useEffect(() => { setDraft(String(value || '')); }, [value, active]);
  const Tag = as;
  const finish = () => { onCommit?.(draft); };
  if (active) {
    const common = {
      className: `live-inline-editor ${multiline ? 'multiline' : ''} ${className}`, 
      value: draft,
      autoFocus: true,
      onFocus: (event) => event.currentTarget.select(),
      onChange: (event) => setDraft(event.target.value),
      onBlur: finish,
      onClick: (event) => event.stopPropagation(),
      onKeyDown: (event) => {
        if (event.key === 'Escape') { event.preventDefault(); setDraft(String(value || '')); onCancel?.(); }
        if (!multiline && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
        if (multiline && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.blur(); }
      }
    };
    return multiline ? <textarea {...common}/> : <input type="text" {...common}/>;
  }
  return <Tag className={className} onClick={(event) => { event.stopPropagation(); onActivate?.(); }} title="Zum Bearbeiten anklicken">{String(value || '') || placeholder}</Tag>;
}

export default function Admin({ user, uiSettings = DEFAULT_UI_SETTINGS, onSettingsChanged, onOpenView }) {
  const [tab, setTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [usageUsers, setUsageUsers] = useState([]);
  const [totalDailyCost, setTotalDailyCost] = useState(0);
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
  const [billingConfig, setBillingConfig] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionSummary, setSubscriptionSummary] = useState({ free:0, creator:0, studio:0 });
  const [previewPage, setPreviewPage] = useState('chat');
  const [editingTextKey, setEditingTextKey] = useState('');
  const [newPlan, setNewPlan] = useState({ name:'', description:'', examplePrice:14.99, betaPrice:0, recommended:false, access:{ flyer:true, image:true, paidImages:true, video:false, paidVideos:false, website:false, projects:true } });

  async function loadCore() {
    try {
      const response = await api('/api/users');
      let usage = { users: [], totalDailyCostUsd: 0, totalMonthlyCostUsd: 0 };
      try {
        usage = await api('/api/admin/usage');
      } catch (usageError) {
        setStatus(`KI-Limits konnten nicht geladen werden: ${usageError.message}`);
      }
      setUsers(response.users || []);
      setUsageUsers(usage.users || []);
      setTotalDailyCost(Number(usage.totalDailyCostUsd || 0));
      setTotalMonthlyCost(Number(usage.totalMonthlyCostUsd || 0));
      setDrafts(Object.fromEntries((usage.users || []).map((item) => [item.id, normalizeLimitUser(item)])));
      try {
        const subscriptionData = await api('/api/admin/subscriptions');
        setSubscriptions(subscriptionData.users || []);
        setSubscriptionSummary(subscriptionData.summary || { free:0, creator:0, studio:0 });
      } catch (subscriptionError) {
        setStatus(`Abos konnten nicht geladen werden: ${subscriptionError.message}`);
      }
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

  async function loadBillingConfig() {
    try {
      setBillingConfig(await api('/api/billing?action=config'));
    } catch (error) {
      setBillingConfig({ configured:false, error:error.message });
    }
  }
  useEffect(() => { loadCore(); }, []);
  useEffect(() => { setSettingsDraft(normalizeSettings(uiSettings)); setViewHistory({ past: [], future: [] }); }, [uiSettings]);
  useEffect(() => {
    if (tab === 'chats') loadChatAccounts();
    if (tab === 'subscriptions') { loadCore(); loadBillingConfig(); }
    if (tab === 'system') { loadAuditLog(); loadHealth(); }
  }, [tab]);

  const usageById = useMemo(() => Object.fromEntries(usageUsers.map((item) => [item.id, item])), [usageUsers]);
  const subscriptionById = useMemo(() => Object.fromEntries(subscriptions.map((item) => [item.id, item])), [subscriptions]);
  const catalog = useMemo(() => getPlanCatalog(settingsDraft.customPlans), [settingsDraft.customPlans]);
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

  async function saveSubscription(target, planId) {
    try {
      await api('/api/admin/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ userId: target.id, planId })
      });
      setStatus(`Beta-Abo für ${target.username} auf ${getPlan(planId,settingsDraft.customPlans).name} gesetzt.`);
      loadCore();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function saveAccountCostPrompt(userId, value) {
    try {
      const overrides = { ...(settingsDraft.costPromptOverrides || {}) };
      if (value === 'inherit') delete overrides[userId];
      else overrides[userId] = value;
      const next = withLegacyVisibility({ ...settingsDraft, costPromptOverrides: overrides });
      const response = await api('/api/admin/ui-settings', { method:'POST', body:JSON.stringify({ settings: next }) });
      const saved = normalizeSettings(response.settings || next);
      setSettingsDraft(saved);
      onSettingsChanged?.(saved);
      setStatus('Kostenabfrage für das Konto gespeichert.');
    } catch (error) { setStatus(error.message); }
  }

  function addCustomPlan() {
    const normalized = normalizeCustomPlan({
      ...newPlan,
      id: newPlan.name,
      eyebrow: 'Individueller Beta-Zugang',
      features: [
        newPlan.access.flyer && 'Angebote- und Flyer-Editor',
        newPlan.access.image && 'Motive- und Bildeditor',
        newPlan.access.paidImages && 'OpenAI-Bilder nach Kostenregel',
        newPlan.access.video && 'Video-Studio',
        newPlan.access.paidVideos && 'Sora-Videos nach Kostenregel',
        newPlan.access.website && 'Website-Builder',
        newPlan.access.projects && 'Cloud-Projekte'
      ].filter(Boolean),
      access: { chat:true, freeImageSearch:true, files:true, ...newPlan.access }
    }, (settingsDraft.customPlans || []).length);
    if (!newPlan.name.trim()) { setStatus('Bitte zuerst einen Namen für das neue Abo eintragen.'); return; }
    if (catalog.some((plan) => plan.id === normalized.id)) { setStatus('Ein Abo mit diesem Namen oder Kürzel existiert bereits.'); return; }
    applyViewChange((old) => ({
      ...old,
      customPlans:[...(old.customPlans || []), normalized],
      planPrices:{...old.planPrices,[normalized.id]:normalized.examplePrice},
      betaPlanPrices:{...old.betaPlanPrices,[normalized.id]:normalized.betaPrice}
    }));
    setNewPlan({ name:'', description:'', examplePrice:14.99, betaPrice:0, recommended:false, access:{ flyer:true, image:true, paidImages:true, video:false, paidVideos:false, website:false, projects:true } });
    setStatus('Neues Abo hinzugefügt. Jetzt oben „Preise & Abos speichern“ drücken.');
  }

  function patchCustomPlan(planId, patch) {
    applyViewChange((old) => ({ ...old, customPlans:(old.customPlans || []).map((plan) => plan.id === planId ? normalizeCustomPlan({ ...plan, ...patch }) : plan) }));
  }

  function removeCustomPlan(planId) {
    if (!window.confirm('Dieses eigene Abo wirklich entfernen? Konten mit diesem Abo fallen danach auf Free zurück.')) return;
    applyViewChange((old) => {
      const planPrices={...old.planPrices}; const betaPlanPrices={...old.betaPlanPrices};
      delete planPrices[planId]; delete betaPlanPrices[planId];
      return { ...old, customPlans:(old.customPlans || []).filter((plan)=>plan.id!==planId), planPrices, betaPlanPrices };
    });
    setStatus('Abo entfernt. Bitte speichern.');
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

  function patchPlanPrice(planId, value, beta = false) {
    const numeric = Math.max(0, Number(String(value).replace(',', '.')) || 0);
    const key = beta ? 'betaPlanPrices' : 'planPrices';
    applyViewChange((old) => ({ ...old, [key]: { ...(old[key] || {}), [planId]: numeric } }));
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
      setStatus('Ansicht und Abo-Preise gespeichert. Die Änderungen sind sofort in PIXVA aktiv.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  const previewTitleKey = previewPage === 'chat' ? 'appTitle' : `${previewPage}Title`;
  const previewSubtitleKey = previewPage === 'chat' ? 'welcome' : `${previewPage}Subtitle`;
  const previewTitle = settingsDraft.texts[previewTitleKey] || DEFAULT_UI_SETTINGS.texts[previewTitleKey] || settingsDraft.navItems.find((item)=>item.id===previewPage)?.label || 'PIXVA';
  const previewSubtitle = settingsDraft.texts[previewSubtitleKey] || DEFAULT_UI_SETTINGS.texts[previewSubtitleKey] || '';

  return <section className="admin-page admin-control-center">
    <div className="page-heading admin-heading">
      <div><h2><Shield size={22}/> Admin-Kontrollzentrum</h2><p>Konten, private Chat-Prüfung, App-Ansicht, KI-Limits und Systemstatus.</p></div>
      <button onClick={() => { loadCore(); if (tab === 'chats') loadChatAccounts(); if (tab === 'system') { loadAuditLog(); loadHealth(); } }}><RefreshCw size={16}/>Aktualisieren</button>
    </div>

    <div className="admin-tabs" role="tablist">
      <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><LayoutDashboard size={16}/>Übersicht</button>
      <button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}><UserRoundCog size={16}/>Konten</button>
      <button className={tab === 'chats' ? 'active' : ''} onClick={() => setTab('chats')}><MessageSquareText size={16}/>Alle Chats</button>
      <button className={tab === 'subscriptions' ? 'active' : ''} onClick={() => setTab('subscriptions')}><BadgeEuro size={16}/>Abos</button>
      <button className={tab === 'view' ? 'active' : ''} onClick={() => setTab('view')}><Palette size={16}/>Ansicht</button>
      <button className={tab === 'system' ? 'active' : ''} onClick={() => setTab('system')}><Activity size={16}/>System</button>
    </div>

    {status && <div className="status-line admin-status">{status}</div>}

    {tab === 'overview' && <>
      <div className="admin-stat-grid">
        <article><UserRoundCog/><span>Konten</span><strong>{users.length}</strong><small>{users.filter((item) => item.active).length} aktiv</small></article>
        <article><Image/><span>Bilder heute</span><strong>{usageUsers.reduce((sum, item) => sum + Number(item?.usage?.dailyImages || 0), 0)}</strong><small>über OpenAI</small></article>
        <article><Video/><span>Video heute</span><strong>{usageUsers.reduce((sum, item) => sum + Number(item?.usage?.dailyVideoSeconds || 0), 0)} s</strong><small>über Sora</small></article>
        <article><BarChart3/><span>Kosten heute</span><strong>{money(totalDailyCost)}</strong><small>Bilder und Videos</small></article>
        <article><BarChart3/><span>Kosten Monat</span><strong>{money(totalMonthlyCost)}</strong><small>Bilder und Videos</small></article>
        <article><BadgeEuro/><span>Bezahlte Beta-Pläne</span><strong>{catalog.filter((plan)=>plan.id!=='free').reduce((sum,plan)=>sum+Number(subscriptionSummary?.[plan.id]||0),0)}</strong><small>Beta selbst bleibt 0,00 €</small></article>
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
          <div className="usage-mini-row usage-mini-costs"><span><Image size={15}/>{usage.dailyImages || 0} Bilder · heute {money(usage.dailyImageCostUsd)} · Monat {money(usage.monthlyImageCostUsd)}</span><span><Video size={15}/>{usage.dailyVideoSeconds || 0} s Video · heute {money(usage.dailyVideoCostUsd)} · Monat {money(usage.monthlyVideoCostUsd)}</span><span><BarChart3 size={15}/>Gesamt heute {money(usage.dailyCostUsd)} · Monat {money(usage.monthlyCostUsd)}</span></div>
          <div className="limit-editor-grid"><label>Bilder pro Tag<input type="number" min="-1" value={draft.dailyImageLimit} onChange={(event)=>patchDraft(account.id,{dailyImageLimit:Number(event.target.value)})}/><small>-1 = unbegrenzt</small></label><label>Videosekunden pro Tag<input type="number" min="-1" value={draft.dailyVideoSecondsLimit} onChange={(event)=>patchDraft(account.id,{dailyVideoSecondsLimit:Number(event.target.value)})}/><small>-1 = unbegrenzt</small></label><label>Monatsbudget in US-Dollar<input type="number" min="-1" step="0.01" value={draft.monthlyBudgetUsd} onChange={(event)=>patchDraft(account.id,{monthlyBudgetUsd:Number(event.target.value)})}/><small>-1 = unbegrenzt</small></label><label className="checkbox-row"><input type="checkbox" checked={draft.allowImages} onChange={(event)=>patchDraft(account.id,{allowImages:event.target.checked})}/>Bilder erlauben</label><label className="checkbox-row"><input type="checkbox" checked={draft.allowVideos} onChange={(event)=>patchDraft(account.id,{allowVideos:event.target.checked})}/>Videos erlauben</label><label>Kostenabfrage für dieses Konto<select value={settingsDraft.costPromptOverrides?.[account.id] || 'inherit'} onChange={(event)=>saveAccountCostPrompt(account.id,event.target.value)}><option value="inherit">Globale Einstellung übernehmen</option><option value="all">Immer vorher fragen</option><option value="none">Ohne Nachfrage starten</option></select><small>Ohne Nachfrage können trotzdem API-Kosten entstehen.</small></label><button className="primary-btn" onClick={()=>saveLimits(account)}><Save size={16}/>Limits speichern</button></div>
        </div>})}</div>
    </>}

    {tab === 'subscriptions' && <div className="admin-subscriptions-panel">
      <article className="admin-card paypal-admin-card">
        <div className="plan-price-admin-head">
          <div><h3><BadgeEuro size={19}/> PayPal-Zahlungen</h3><p>Der Käufer wird sicher zu PayPal weitergeleitet. Das Geld geht an das PayPal-Business-Konto, dessen API-Zugang in Vercel hinterlegt ist.</p></div>
          <button className="primary-btn" onClick={saveViewSettings}><Save size={16}/>Zahlungen speichern</button>
        </div>
        <div className="paypal-settings-grid">
          <label className="checkbox-row"><input type="checkbox" checked={Boolean(settingsDraft.paymentsEnabled)} onChange={(event)=>patchSettings({paymentsEnabled:event.target.checked})}/>Echte Zahlungen aktivieren</label>
          <label>Zahlungsanbieter<select value={settingsDraft.paymentProvider || 'paypal'} onChange={(event)=>patchSettings({paymentProvider:event.target.value})}><option value="paypal">PayPal</option><option value="disabled">Deaktiviert</option></select></label>
          <label>Angezeigtes Empfängerkonto<input value={settingsDraft.paymentMerchantLabel || ''} onChange={(event)=>patchSettings({paymentMerchantLabel:event.target.value})} placeholder="z. B. PIXVA / zahlung@firma.de"/><small>Nur Anzeige. Das echte Empfängerkonto wird durch PAYPAL_CLIENT_ID und PAYPAL_CLIENT_SECRET bestimmt.</small></label>
          <label>Zugangsdauer pro Zahlung<input type="number" min="1" max="365" value={Number(settingsDraft.paidAccessDays || 30)} onChange={(event)=>patchSettings({paidAccessDays:Math.max(1,Number(event.target.value)||30)})}/><small>Tage, danach läuft der bezahlte Zugang ab.</small></label>
        </div>
        <div className={`service-row ${billingConfig?.configured ? 'ok' : 'bad'}`}>{billingConfig?.configured ? <CheckCircle2/> : <XCircle/>}{billingConfig?.configured ? `PayPal ${billingConfig.environment === 'live' ? 'LIVE' : 'Sandbox'} verbunden` : 'PayPal-Zugang in Vercel noch nicht vollständig eingetragen'}</div>
        <div className="info-box">Kartendaten und PayPal-Passwörter werden niemals in PIXVA gespeichert. Zum Wechsel des Empfängerkontos werden in Vercel die API-Zugangsdaten des gewünschten PayPal-Business-Kontos eingetragen.</div>
      </article>
      <div className="admin-stat-grid subscription-admin-stats">
        {catalog.map((plan)=><article key={plan.id}><BadgeEuro size={20}/><span>{plan.name}</span><strong>{subscriptionSummary?.[plan.id] || 0}</strong><small>{formatPlanPrice(settingsDraft.planPrices?.[plan.id] ?? plan.examplePrice)} / Monat</small></article>)}
      </div>

      <article className="admin-card plan-price-admin-card">
        <div className="plan-price-admin-head"><div><h3><BadgeEuro size={19}/> Preise & Abos verwalten</h3><p>Preise, kostenlose Testphase und echte PayPal-Käufe. Zahlungen können jederzeit global ausgeschaltet werden; Preise bleiben trotzdem sichtbar.</p></div><button className="primary-btn" onClick={saveViewSettings}><Save size={16}/>Preise & Abos speichern</button></div>
        <div className="plan-price-editor-grid">
          {catalog.map((plan) => <div className="plan-price-editor-card" key={plan.id}>
            <div><b>{plan.name}</b><span>{plan.eyebrow}</span></div>
            {plan.custom && <><label>Name<input value={plan.name} onChange={(event)=>patchCustomPlan(plan.id,{name:event.target.value})}/></label><label>Beschreibung<textarea value={plan.description} onChange={(event)=>patchCustomPlan(plan.id,{description:event.target.value})}/></label></>}
            <label>Späterer Monatspreis (€)<input type="number" min="0" step="0.01" value={settingsDraft.planPrices?.[plan.id] ?? plan.examplePrice} onChange={(event)=>patchPlanPrice(plan.id,event.target.value,false)}/></label>
            <label>Beta-Preis (€)<input type="number" min="0" step="0.01" value={settingsDraft.betaPlanPrices?.[plan.id] ?? plan.betaPrice} onChange={(event)=>patchPlanPrice(plan.id,event.target.value,true)}/></label>
            {plan.custom && <div className="plan-access-checkboxes">
              {['flyer','image','paidImages','video','paidVideos','website','projects'].map((feature)=><label className="checkbox-row" key={feature}><input type="checkbox" checked={Boolean(plan.access?.[feature])} onChange={(event)=>patchCustomPlan(plan.id,{access:{...plan.access,[feature]:event.target.checked}})}/>{({flyer:'Flyer',image:'Bildeditor',paidImages:'OpenAI-Bilder',video:'Video-Studio',paidVideos:'Sora-Videos',website:'Webseiten',projects:'Projekte'})[feature]}</label>)}
            </div>}
            <label className="checkbox-row"><input type="checkbox" checked={Boolean(settingsDraft.planPurchasable?.[plan.id])} disabled={plan.id==='free'} onChange={(event)=>patchSettings({planPurchasable:{...(settingsDraft.planPurchasable||{}),[plan.id]:event.target.checked}})}/>Über PayPal kaufbar</label>
            <small>Vorschau: {settingsDraft.paymentsEnabled ? `${formatPlanPrice(settingsDraft.planPrices?.[plan.id] ?? plan.examplePrice)} für ${Number(settingsDraft.paidAccessDays||30)} Tage` : `${formatPlanPrice(settingsDraft.betaPlanPrices?.[plan.id] ?? plan.betaPrice)} im kostenlosen Modus`} · Listenpreis {formatPlanPrice(settingsDraft.planPrices?.[plan.id] ?? plan.examplePrice)}</small>
            {plan.custom && <button className="danger-btn" onClick={()=>removeCustomPlan(plan.id)}><Trash2 size={15}/>Eigenes Abo löschen</button>}
          </div>)}
        </div>
      </article>

      <article className="admin-card new-plan-admin-card">
        <h3><Plus size={19}/> Neues Abo hinzufügen</h3>
        <div className="new-plan-grid">
          <label>Name<input value={newPlan.name} onChange={(event)=>setNewPlan({...newPlan,name:event.target.value})} placeholder="z. B. Business"/></label>
          <label>Beschreibung<input value={newPlan.description} onChange={(event)=>setNewPlan({...newPlan,description:event.target.value})} placeholder="Für Teams und Unternehmen"/></label>
          <label>Monatspreis (€)<input type="number" min="0" step="0.01" value={newPlan.examplePrice} onChange={(event)=>setNewPlan({...newPlan,examplePrice:Number(event.target.value)})}/></label>
          <label>Beta-Preis (€)<input type="number" min="0" step="0.01" value={newPlan.betaPrice} onChange={(event)=>setNewPlan({...newPlan,betaPrice:Number(event.target.value)})}/></label>
        </div>
        <div className="plan-access-checkboxes">
          {['flyer','image','paidImages','video','paidVideos','website','projects'].map((feature)=><label className="checkbox-row" key={feature}><input type="checkbox" checked={Boolean(newPlan.access?.[feature])} onChange={(event)=>setNewPlan({...newPlan,access:{...newPlan.access,[feature]:event.target.checked}})}/>{({flyer:'Flyer',image:'Bildeditor',paidImages:'OpenAI-Bilder',video:'Video-Studio',paidVideos:'Sora-Videos',website:'Webseiten',projects:'Projekte'})[feature]}</label>)}
        </div>
        <button className="primary-btn" onClick={addCustomPlan}><Plus size={16}/>Abo hinzufügen</button>
      </article>

      <article className="admin-card beta-admin-note"><h3><BadgeEuro size={19}/> Kostenlos oder bezahlt</h3><p>Ist „Echte Zahlungen“ ausgeschaltet, bleibt der bisherige kostenlose Beta-Modus aktiv. Ist er eingeschaltet, können nur die markierten Abos über PayPal gekauft werden. Nicht kaufbare Abos zeigen weiterhin den Preis, besitzen aber keinen Kaufknopf.</p></article>
      <div className="subscription-user-list">
        {users.map((account) => {
          const entry = subscriptionById[account.id] || { planId:'free', status:'active' };
          const planId = getPlan(entry.planId || 'free',settingsDraft.customPlans).id;
          return <article key={account.id} className="subscription-user-row">
            <div><b>{account.username}</b><span>{getPlan(planId,settingsDraft.customPlans).name} · {entry.status || 'active'}{account.role === 'admin' ? ' · Adminrechte' : ''}</span></div>
            <label>Beta-Abo<select value={planId} onChange={(event)=>saveSubscription(account,event.target.value)}>{catalog.map((plan)=><option key={plan.id} value={plan.id}>{plan.name} · Beta {formatPlanPrice(settingsDraft.betaPlanPrices?.[plan.id] ?? plan.betaPrice)}</option>)}</select></label>
          </article>;
        })}
      </div>
    </div>}

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
            <div className="admin-message-view">{selectedSession ? (selectedSession.messages || []).map((message, index) => <article key={message.id || index} className={message.role === 'user' ? 'user' : 'assistant'}><strong>{message.role === 'user' ? chatData.username : 'PIXVA'}</strong><p>{message.content || '–'}</p>{Array.isArray(message.attachments) && message.attachments.length > 0 && <small>{message.attachments.length} Anhang/Anhänge gespeichert</small>}</article>) : <div className="admin-empty"><MessageSquareText/><span>Kein Chat ausgewählt.</span></div>}</div>
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
          <button onClick={()=>onOpenView?.(previewPage)}><Eye size={16}/>Echte Seite öffnen</button>
          <button className="primary-btn" onClick={saveViewSettings}><Save size={16}/>Ansicht speichern</button>
        </div>
      </div>

      <div className="visual-device-switcher" aria-label="Vorschaugröße">
        <button className={previewDevice === 'desktop' ? 'active' : ''} onClick={() => setPreviewDevice('desktop')}><Laptop size={16}/>Desktop</button>
        <button className={previewDevice === 'tablet' ? 'active' : ''} onClick={() => setPreviewDevice('tablet')}><Tablet size={16}/>Tablet</button>
        <button className={previewDevice === 'mobile' ? 'active' : ''} onClick={() => setPreviewDevice('mobile')}><Smartphone size={16}/>Handy</button>
      </div>

      <div className="visual-page-switcher" aria-label="Seite in der Vorschau">
        {settingsDraft.navItems.filter((item)=>item.visible!==false).map((item)=><button key={item.id} className={previewPage===item.id?'active':''} onClick={()=>{setPreviewPage(item.id);setSelectedVisualId(`nav-${item.id}`)}}>{item.label}</button>)}
      </div>

      <div className="visual-editor-switches">
        <button className={settingsDraft.allowGuest ? 'active' : ''} onClick={()=>patchSettings({allowGuest:!settingsDraft.allowGuest})}>{settingsDraft.allowGuest ? <Eye size={15}/> : <EyeOff size={15}/>}Gastmodus</button>
        <button className={settingsDraft.compactSidebar ? 'active' : ''} onClick={()=>patchSettings({compactSidebar:!settingsDraft.compactSidebar})}>Kompakte Seitenleiste</button>
        <button className={settingsDraft.maintenanceMode ? 'active warning' : ''} onClick={()=>patchSettings({maintenanceMode:!settingsDraft.maintenanceMode})}>Wartungshinweis</button>
        <div className="admin-cost-prompt-control"><span>Kostenabfrage</span><button className={settingsDraft.costPromptMode !== 'none' ? 'active' : ''} onClick={()=>patchSettings({costPromptMode:'all'})}>Für alle</button><button className={settingsDraft.costPromptMode === 'none' ? 'active warning' : ''} onClick={()=>patchSettings({costPromptMode:'none'})}>Für niemanden</button></div>
        <label>Startansicht<select value={settingsDraft.defaultView} onChange={(event)=>patchSettings({defaultView:event.target.value})}><option value="chat">Chat</option><option value="flyer">Angebote & Flyer</option><option value="image">Motive & Editor</option><option value="video">Video-Studio</option><option value="website">Website-Builder</option><option value="projects">Projekte</option><option value="plans">Abos & Preise</option></select></label>
        <label>Work-Ziel<select value={settingsDraft.workView} onChange={(event)=>patchSettings({workView:event.target.value})}><option value="projects">Projekte</option><option value="flyer">Angebote & Flyer</option><option value="image">Motive & Editor</option><option value="video">Video-Studio</option><option value="website">Website-Builder</option></select></label>
      </div>

      <div className={`live-view-stage device-${previewDevice}`} style={{'--preview-sidebar':`${Math.max(210,Math.min(360,Number(settingsDraft.theme.sidebarWidth||255)))}px`,'--preview-blue':settingsDraft.theme.accentBlue,'--preview-yellow':settingsDraft.theme.accentYellow}}>
        <aside className={settingsDraft.compactSidebar ? 'compact' : ''}>
          <div className="live-logo">yildiz<span>☆</span>AI</div>
          <div role="button" tabIndex={0} className={`live-editable new-design ${selectedVisualId==='text-newDesign'?'selected':''}`} onClick={()=>{setSelectedVisualId('text-newDesign');setEditingTextKey('newDesign')}}>
            <InlineTextEditor value={settingsDraft.texts.newDesign} active={editingTextKey==='newDesign'} onActivate={()=>{setSelectedVisualId('text-newDesign');setEditingTextKey('newDesign')}} onCommit={(value)=>{patchText('newDesign',value);setEditingTextKey('')}} onCancel={()=>setEditingTextKey('')}/>
          </div>
          <nav>
            {settingsDraft.navItems.filter((item)=>item.visible!==false).map((item)=><div
              role="button"
              tabIndex={0}
              key={item.id}
              draggable={editingTextKey !== `nav-${item.id}`}
              onDragStart={()=>setDragVisualId(item.id)}
              onDragOver={(event)=>event.preventDefault()}
              onDrop={()=>dropNav(item.id)}
              className={`live-editable live-nav-item ${selectedVisualId===`nav-${item.id}`?'selected':''}`}
              onClick={()=>{setSelectedVisualId(`nav-${item.id}`);setPreviewPage(item.id)}}
            ><GripVertical size={13}/><InlineTextEditor value={item.label} active={editingTextKey===`nav-${item.id}`} onActivate={()=>{setSelectedVisualId(`nav-${item.id}`);setPreviewPage(item.id);setEditingTextKey(`nav-${item.id}`)}} onCommit={(value)=>{patchNav(item.id,{label:value});setEditingTextKey('')}} onCancel={()=>setEditingTextKey('')}/></div>)}
          </nav>
          <div className="live-sidebar-footer"><span>Mein Konto</span><span>Admin</span></div>
        </aside>
        <main>
          <header>
            <InlineTextEditor as="b" className={`live-editable text-only ${selectedVisualId===`text-${previewTitleKey}`?'selected':''}`} value={previewTitle} active={editingTextKey===previewTitleKey} onActivate={()=>{setSelectedVisualId(`text-${previewTitleKey}`);setEditingTextKey(previewTitleKey)}} onCommit={(value)=>{patchText(previewTitleKey,value);setEditingTextKey('')}} onCancel={()=>setEditingTextKey('')}/>
            <div className="live-tabs"><InlineTextEditor className={`live-editable text-only ${selectedVisualId==='text-chatTab'?'selected':''}`} value={settingsDraft.texts.chatTab} active={editingTextKey==='chatTab'} onActivate={()=>{setSelectedVisualId('text-chatTab');setEditingTextKey('chatTab')}} onCommit={(value)=>{patchText('chatTab',value);setEditingTextKey('')}} onCancel={()=>setEditingTextKey('')}/><InlineTextEditor className={`live-editable text-only ${selectedVisualId==='text-workTab'?'selected':''}`} value={settingsDraft.texts.workTab} active={editingTextKey==='workTab'} onActivate={()=>{setSelectedVisualId('text-workTab');setEditingTextKey('workTab')}} onCommit={(value)=>{patchText('workTab',value);setEditingTextKey('')}} onCancel={()=>setEditingTextKey('')}/></div>
          </header>
          {settingsDraft.announcement && <InlineTextEditor as="div" multiline className={`live-announcement live-editable ${selectedVisualId==='text-announcement'?'selected':''}`} value={settingsDraft.announcement} active={editingTextKey==='announcement'} onActivate={()=>{setSelectedVisualId('text-announcement');setEditingTextKey('announcement')}} onCommit={(value)=>{patchSettings({announcement:value});setEditingTextKey('')}} onCancel={()=>setEditingTextKey('')}/>}
          {previewPage === 'chat' ? <section>
            <InlineTextEditor as="div" className={`live-status live-editable ${selectedVisualId==='text-statusTitle'?'selected':''}`} value={settingsDraft.texts.statusTitle} active={editingTextKey==='statusTitle'} onActivate={()=>{setSelectedVisualId('text-statusTitle');setEditingTextKey('statusTitle')}} onCommit={(value)=>{patchText('statusTitle',value);setEditingTextKey('')}} onCancel={()=>setEditingTextKey('')}/>
            <InlineTextEditor as="div" multiline className={`live-welcome live-editable ${selectedVisualId==='text-welcome'?'selected':''}`} value={settingsDraft.texts.welcome} active={editingTextKey==='welcome'} onActivate={()=>{setSelectedVisualId('text-welcome');setEditingTextKey('welcome')}} onCommit={(value)=>{patchText('welcome',value);setEditingTextKey('')}} onCancel={()=>setEditingTextKey('')}/>
            <div className="live-spacer"/>
            <InlineTextEditor as="div" className={`live-composer live-editable ${selectedVisualId==='text-composer'?'selected':''}`} value={settingsDraft.texts.composer} active={editingTextKey==='composer'} onActivate={()=>{setSelectedVisualId('text-composer');setEditingTextKey('composer')}} onCommit={(value)=>{patchText('composer',value);setEditingTextKey('')}} onCancel={()=>setEditingTextKey('')}/>
          </section> : <section className={`live-page-preview page-${previewPage}`}>
            <div className="live-page-heading">
              <InlineTextEditor as="h2" className={`live-editable ${selectedVisualId===`text-${previewTitleKey}`?'selected':''}`} value={previewTitle} active={editingTextKey===previewTitleKey} onActivate={()=>{setSelectedVisualId(`text-${previewTitleKey}`);setEditingTextKey(previewTitleKey)}} onCommit={(value)=>{patchText(previewTitleKey,value);setEditingTextKey('')}} onCancel={()=>setEditingTextKey('')}/>
              <InlineTextEditor as="p" multiline className={`live-editable ${selectedVisualId===`text-${previewSubtitleKey}`?'selected':''}`} value={previewSubtitle} active={editingTextKey===previewSubtitleKey} onActivate={()=>{setSelectedVisualId(`text-${previewSubtitleKey}`);setEditingTextKey(previewSubtitleKey)}} onCommit={(value)=>{patchText(previewSubtitleKey,value);setEditingTextKey('')}} onCancel={()=>setEditingTextKey('')}/>
            </div>
            {previewPage === 'plans' ? <div className="live-plan-cards">{catalog.map((plan)=><article key={plan.id}><b>{plan.name}</b><label><span>Monat</span><input aria-label={`${plan.name} Monatspreis`} type="number" min="0" step="0.01" value={settingsDraft.planPrices?.[plan.id] ?? plan.examplePrice} onChange={(event)=>patchPlanPrice(plan.id,event.target.value,false)}/></label><label><span>Beta</span><input aria-label={`${plan.name} Beta-Preis`} type="number" min="0" step="0.01" value={settingsDraft.betaPlanPrices?.[plan.id] ?? plan.betaPrice} onChange={(event)=>patchPlanPrice(plan.id,event.target.value,true)}/></label></article>)}</div> : previewPage === 'projects' ? <div className="live-project-cards"><article/><article/><article/></div> : previewPage === 'website' ? <div className="live-website-preview"><aside/><main><div/><div/><div/></main></div> : previewPage === 'video' ? <div className="live-video-preview"><aside/><main>▶</main><aside/></div> : <div className="live-editor-preview"><aside/><main><div className="live-canvas-sheet">{previewPage === 'flyer' ? 'ANGEBOTE' : 'MOTIV'}</div></main><aside/></div>}
          </section>}
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
