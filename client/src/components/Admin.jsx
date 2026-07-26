import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Cpu, Image, Plus, Save, Shield, UserRoundCog, Video } from 'lucide-react';
import { api } from '../api.js';

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

export default function Admin({ user }) {
  const [users, setUsers] = useState([]);
  const [usageUsers, setUsageUsers] = useState([]);
  const [totalMonthlyCost, setTotalMonthlyCost] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });

  async function load() {
    try {
      const response = await api('/api/users');
      let usage = { users: [], totalMonthlyCostUsd: 0 };
      try {
        usage = await api('/api/admin/usage');
      } catch (usageError) {
        setStatus(`KI-Limits konnten nicht geladen werden: ${usageError.message} Bitte PRO-KERN-UPDATE-ZUM-KOPIEREN.txt in Supabase ausführen.`);
      }
      setUsers(response.users || []);
      setUsageUsers(usage.users || []);
      setTotalMonthlyCost(Number(usage.totalMonthlyCostUsd || 0));
      setDrafts(Object.fromEntries((usage.users || []).map((item) => [item.id, normalizeLimitUser(item)])));
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => { load(); }, []);

  const usageById = useMemo(() => Object.fromEntries(usageUsers.map((item) => [item.id, item])), [usageUsers]);

  async function createUser(event) {
    event.preventDefault(); setStatus('');
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(newUser) });
      setNewUser({ username: '', password: '', role: 'user' });
      setStatus('Konto erstellt. Der Mitarbeiter kann das Startpasswort unter „Mein Konto“ selbst ändern.');
      load();
    } catch (error) { setStatus(error.message); }
  }

  async function toggle(target) {
    try { await api(`/api/users/${target.id}`, { method: 'PATCH', body: JSON.stringify({ active: !target.active }) }); load(); }
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
      load();
    } catch (error) {
      setStatus(error.message);
    }
  }

  return <section className="admin-page">
    <div className="page-heading"><div><h2><Shield size={22}/> Admin & Einstellungen</h2><p>Konten, KI-Limits und geschätzte OpenAI-Kosten verwalten.</p></div></div>
    {status&&<div className="status-line">{status}</div>}
    <div className="admin-grid admin-grid-two">
      <article className="admin-card"><h3><Cpu size={19}/> KI-Dienste</h3><p>Gemini: Chat · OpenAI: Bilder · Sora: Videos</p><div className="info-box">Kostenpflichtige Bilder und Videos sind nur für angemeldete Konten möglich. Dadurch kann kein unbekannter Gast dein Guthaben verbrauchen.</div><small>Serverseitige Limits werden vor jeder OpenAI-Anfrage geprüft.</small></article>
      <article className="admin-card"><h3><UserRoundCog size={19}/> Neues Konto ohne E-Mail</h3><form onSubmit={createUser}><label>Benutzername<input value={newUser.username} onChange={(event)=>setNewUser({...newUser,username:event.target.value})} required/></label><label>Startpasswort<input type="password" minLength={8} value={newUser.password} onChange={(event)=>setNewUser({...newUser,password:event.target.value})} required/></label><label>Rolle<select value={newUser.role} onChange={(event)=>setNewUser({...newUser,role:event.target.value})}><option value="user">Mitarbeiter</option><option value="admin">Admin</option></select></label><button className="primary-btn"><Plus size={17}/>Konto erstellen</button></form></article>
    </div>

    <article className="admin-card admin-cost-summary">
      <h3><BarChart3 size={19}/> Nutzung diesen Monat</h3>
      <strong>{money(totalMonthlyCost)}</strong>
      <p>Geschätzte beziehungsweise abgeschlossene Bild- und Videokosten aller Konten.</p>
    </article>

    <div className="user-table"><h3>Konten und Limits</h3>{users.map((account)=>{
      const usage = usageById[account.id]?.usage || {};
      const draft = drafts[account.id] || normalizeLimitUser(usageById[account.id]);
      return <div className="user-limit-card" key={account.id}>
        <div className="user-limit-head"><div><b>{account.username}</b><span>{account.role==='admin'?'Admin':'Mitarbeiter'} · {account.active?'aktiv':'deaktiviert'} · {account.mustChangePassword?'Startpasswort noch aktiv':'eigenes Passwort gesetzt'}</span></div><button onClick={()=>toggle(account)} disabled={account.id===user.id}>{account.active?'Deaktivieren':'Aktivieren'}</button></div>
        <div className="usage-mini-row">
          <span><Image size={15}/>Heute: {usage.dailyImages || 0} Bilder</span>
          <span><Video size={15}/>Heute: {usage.dailyVideoSeconds || 0} s Video</span>
          <span><BarChart3 size={15}/>Monat: {money(usage.monthlyCostUsd)}</span>
        </div>
        <div className="limit-editor-grid">
          <label>Bilder pro Tag<input type="number" min="-1" value={draft.dailyImageLimit} onChange={(event)=>patchDraft(account.id,{dailyImageLimit:Number(event.target.value)})}/><small>-1 = unbegrenzt</small></label>
          <label>Videosekunden pro Tag<input type="number" min="-1" value={draft.dailyVideoSecondsLimit} onChange={(event)=>patchDraft(account.id,{dailyVideoSecondsLimit:Number(event.target.value)})}/><small>-1 = unbegrenzt</small></label>
          <label>Monatsbudget in US-Dollar<input type="number" min="-1" step="0.01" value={draft.monthlyBudgetUsd} onChange={(event)=>patchDraft(account.id,{monthlyBudgetUsd:Number(event.target.value)})}/><small>-1 = unbegrenzt</small></label>
          <label className="checkbox-row"><input type="checkbox" checked={draft.allowImages} onChange={(event)=>patchDraft(account.id,{allowImages:event.target.checked})}/>Bilder erlauben</label>
          <label className="checkbox-row"><input type="checkbox" checked={draft.allowVideos} onChange={(event)=>patchDraft(account.id,{allowVideos:event.target.checked})}/>Videos erlauben</label>
          <button className="primary-btn" onClick={()=>saveLimits(account)}><Save size={16}/>Limits speichern</button>
        </div>
      </div>})}</div>
  </section>;
}
