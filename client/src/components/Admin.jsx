import { useEffect, useState } from 'react';
import { Cpu, Plus, Shield, UserRoundCog } from 'lucide-react';
import { api } from '../api.js';

export default function Admin({ user }) {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });

  async function load() {
    try { const response = await api('/api/users'); setUsers(response.users); }
    catch (error) { setStatus(error.message); }
  }
  useEffect(() => { load(); }, []);

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

  return <section className="admin-page">
    <div className="page-heading"><div><h2><Shield size={22}/> Admin & Einstellungen</h2><p>Konten ohne sichtbare E-Mail und Gemini-Verbindung verwalten.</p></div></div>
    {status&&<div className="status-line">{status}</div>}
    <div className="admin-grid admin-grid-two">
      <article className="admin-card"><h3><Cpu size={19}/> Gemini über Vercel</h3><p>Status: <b>Keine lokale GPU erforderlich</b></p><div className="info-box">Der Chat läuft über eine geschützte Vercel-Funktion mit Gemini und funktioniert in Opera, Chrome, Safari und Edge.</div><small>Gastzugang ist aktiv. Anmeldung wird nur zum Speichern und für Kontofunktionen benötigt.</small></article>
      <article className="admin-card"><h3><UserRoundCog size={19}/> Neues Konto ohne E-Mail</h3><form onSubmit={createUser}><label>Benutzername<input value={newUser.username} onChange={(event)=>setNewUser({...newUser,username:event.target.value})} required/></label><label>Startpasswort<input type="password" minLength={8} value={newUser.password} onChange={(event)=>setNewUser({...newUser,password:event.target.value})} required/></label><label>Rolle<select value={newUser.role} onChange={(event)=>setNewUser({...newUser,role:event.target.value})}><option value="user">Mitarbeiter</option><option value="admin">Admin</option></select></label><button className="primary-btn"><Plus size={17}/>Konto erstellen</button></form></article>
    </div>
    <div className="user-table"><h3>Konten</h3>{users.map((account)=><div className="user-row" key={account.id}><div><b>{account.username}</b><span>{account.role==='admin'?'Admin':'Mitarbeiter'} · {account.active?'aktiv':'deaktiviert'} · {account.mustChangePassword?'Startpasswort noch aktiv':'eigenes Passwort gesetzt'}</span></div><button onClick={()=>toggle(account)} disabled={account.id===user.id}>{account.active?'Deaktivieren':'Aktivieren'}</button></div>)}</div>
  </section>;
}
