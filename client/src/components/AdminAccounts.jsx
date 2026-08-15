import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, KeyRound, RefreshCw, Shield, UserRound } from 'lucide-react';
import { api } from '../api.js';

const fmt=v=>v?new Date(v).toLocaleString('de-DE'):'—';
const show=v=>v===null||v===undefined||String(v)===''?'—':String(v);
const Field=({label,value})=><div className="pixva-registry-field"><small>{label}</small><b>{show(value)}</b></div>;

function groups(accounts){
  const normal=accounts.filter(a=>a.role!=='admin');
  return [
    ['1 · Admin-Konten',accounts.filter(a=>a.role==='admin')],
    ['2 · Firmenkonten · vom Admin erstellt',normal.filter(a=>a.account_type==='company'&&a.created_source==='admin')],
    ['3 · Firmenkonten · selbst registriert',normal.filter(a=>a.account_type==='company'&&a.created_source==='self')],
    ['4 · Firmenkonten · Bestand/System',normal.filter(a=>a.account_type==='company'&&!['admin','self'].includes(a.created_source))],
    ['5 · Privatkonten · vom Admin erstellt',normal.filter(a=>a.account_type!=='company'&&a.created_source==='admin')],
    ['6 · Privatkonten · selbst registriert',normal.filter(a=>a.account_type!=='company'&&a.created_source==='self')],
    ['7 · Privatkonten · Bestand/System',normal.filter(a=>a.account_type!=='company'&&!['admin','self'].includes(a.created_source))]
  ];
}
function List({title,items,render}){
  return <div className="pixva-registry-list"><h5>{title} · {items.length}</h5>{items.length?items.map(render):<span className="pixva-muted">Nichts vorhanden.</span>}</div>;
}

export default function AdminAccounts(){
  const [accounts,setAccounts]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [message,setMessage]=useState(''),[open,setOpen]=useState({}),[passwords,setPasswords]=useState({});

  async function load(){
    setLoading(true);setError('');
    try{const r=await api('/api/ai/admin-accounts?action=overview');setAccounts(r.accounts||[])}
    catch(e){setError(e.message)}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  const grouped=useMemo(()=>groups(accounts),[accounts]);

  async function resetPassword(a){
    const value=String(passwords[a.id]||'');
    if(value.length<10)return setMessage('Neues Passwort braucht mindestens 10 Zeichen.');
    try{
      await api('/api/ai/admin-accounts?action=reset-password',{method:'POST',body:JSON.stringify({userId:a.id,newPassword:value})});
      setPasswords(o=>({...o,[a.id]:''}));setMessage(`Neues Passwort für @${a.username} wurde gesetzt.`);await load();
    }catch(e){setMessage(e.message)}
  }
  async function updateMeta(a,key,value){
    const accountType=key==='account_type'?value:(a.stored_account_type||a.account_type||'private');
    const createdSource=key==='created_source'?value:(a.created_source||'legacy');
    try{
      await api('/api/ai/admin-accounts?action=update-meta',{method:'POST',body:JSON.stringify({userId:a.id,accountType,createdSource})});
      setMessage('Kontenzuordnung gespeichert.');await load();
    }catch(e){setMessage(e.message)}
  }

  return <section className="pixva-admin-registry">
    <div className="pixva-registry-head"><div><h2><Shield size={22}/> Konten & Firmen</h2><p>Admin-, Firmen- und Privatkonten sauber getrennt. Firmenprofil, Login-Daten und erstellte Inhalte sind direkt zugeordnet.</p></div><button onClick={load} disabled={loading}><RefreshCw size={16}/>{loading?'Lädt …':'Aktualisieren'}</button></div>
    <div className="info-box"><b>Passwort:</b> Das aktuelle Passwort kann nicht angezeigt werden, weil nur der verschlüsselte Hash gespeichert wird. Du kannst bei jedem Konto direkt ein neues Passwort setzen.</div>
    {message&&<div className="status-line">{message}</div>}{error&&<div className="error-box">{error}</div>}

    {grouped.map(([title,items])=><section className="pixva-registry-group" key={title}>
      <div className="pixva-registry-group-title"><h3>{title}</h3><span>{items.length}</span></div>
      {!items.length&&<div className="pixva-registry-empty">Keine Konten in dieser Gruppe.</div>}
      {items.map(a=>{const expanded=Boolean(open[a.id]),b=a.company||{},c=a.contents||{};return <article className="pixva-registry-account" key={a.id}>
        <button className="pixva-registry-account-head" onClick={()=>setOpen(o=>({...o,[a.id]:!expanded}))}>
          <div className="pixva-registry-logo">{b.logo?<img src={b.logo} alt="Firmenlogo"/>:a.account_type==='company'?<Building2/>:<UserRound/>}</div>
          <div className="pixva-registry-account-name"><b>{b.company_name||[a.first_name,a.last_name].filter(Boolean).join(' ')||a.username}</b><span>@{a.username} · {a.role==='admin'?'Admin':a.account_type==='company'?'Firma':'Privat'} · {a.active?'aktiv':'deaktiviert'}</span></div>
          <div className="pixva-registry-counts"><span>{c.projects?.length||0} Projekte</span><span>{c.products?.length||0} Produkte</span><span>{c.knowledge?.length||0} Wissen</span><span>{c.agents?.length||0} KI</span></div>
          {expanded?<ChevronDown/>:<ChevronRight/>}
        </button>
        {expanded&&<div className="pixva-registry-body">
          <h4>Login & Konto</h4><div className="pixva-registry-fields">
            <Field label="Benutzername" value={a.username}/><Field label="Passwort" value="geschützt · nicht auslesbar"/>
            <Field label="Normale E-Mail" value={a.email}/><Field label="Private Telefonnummer" value={a.phone}/>
            <Field label="Vorname" value={a.first_name}/><Field label="Nachname" value={a.last_name}/><Field label="Geburtsdatum" value={a.birth_date}/>
            <Field label="Systemrolle" value={a.role}/><Field label="Team-Rolle" value={a.team_role}/><Field label="Kontotyp" value={a.account_type}/>
            <Field label="Erstellt durch" value={a.created_source}/><Field label="2FA" value={a.twoFactor?'aktiv':'nicht aktiv'}/>
            <Field label="Aktive Sitzungen" value={a.sessionCount}/><Field label="Letzte Sitzung" value={fmt(a.lastSessionAt)}/>
            <Field label="Passwortwechsel nötig" value={a.must_change_password?'ja':'nein'}/><Field label="Konto erstellt" value={fmt(a.created_at)}/>
          </div>

          <div className="pixva-registry-controls">
            <label>Kontotyp<select value={a.stored_account_type||a.account_type} onChange={e=>updateMeta(a,'account_type',e.target.value)}><option value="company">Firma</option><option value="private">Privat</option></select></label>
            <label>Herkunft<select value={a.created_source||'legacy'} onChange={e=>updateMeta(a,'created_source',e.target.value)}><option value="admin">Vom Admin erstellt</option><option value="self">Selbst registriert</option><option value="system">System</option><option value="legacy">Bestand</option></select></label>
          </div>

          <h4>Firma</h4><div className="pixva-registry-firm">
            <div className="pixva-registry-large-logo">{b.logo?<img src={b.logo} alt="Logo"/>:<div>Kein Firmenlogo gespeichert</div>}</div>
            <div className="pixva-registry-fields">
              <Field label="Firmenname" value={b.company_name}/><Field label="Branche" value={b.company_type==='sonstiges'?(b.company_type_other||'Sonstiges'):b.company_type}/>
              <Field label="Inhaber / Ansprechpartner" value={b.owner_name}/><Field label="Firmen-E-Mail" value={b.company_email}/>
              <Field label="Firmen-Telefon" value={b.company_phone}/><Field label="Zusätzliche private Tel." value={b.private_phone}/>
              <Field label="Website" value={b.website}/><Field label="Instagram" value={b.instagram}/><Field label="Adresse" value={b.address}/>
              <Field label="Öffnungszeiten" value={b.opening_hours}/><Field label="Design-Stil" value={b.design_style}/>
            </div>
          </div>

          <h4>Alles, was dieses Konto erstellt hat</h4>
          <List title="Projekte" items={c.projects||[]} render={p=><div className="pixva-registry-item" key={p.id}><b>{p.name||'Projekt'}</b><span>{p.type||'—'} · {fmt(p.updated_at||p.created_at)}</span></div>}/>
          <List title="Produkte" items={c.products||[]} render={p=><div className="pixva-registry-item" key={p.id}><b>{p.name||'Produkt'}</b><span>{[p.brand,p.ean,p.category,p.offer_price!=null?`${p.offer_price} €`:null].filter(Boolean).join(' · ')||'—'}</span></div>}/>
          <List title="Wissensdateien" items={c.knowledge||[]} render={p=><div className="pixva-registry-item" key={p.id}><b>{p.name||'Datei'}</b><span>{p.status||'—'} · {fmt(p.updated_at||p.created_at)}</span></div>}/>
          <List title="KI-Agent-Aufträge" items={c.agents||[]} render={p=><div className="pixva-registry-item" key={p.id}><b>{p.task||'KI-Auftrag'}</b><span>{p.status||'—'} · {fmt(p.updated_at||p.created_at)}</span></div>}/>
          <List title="Letzte KI-Nutzungen" items={c.usage||[]} render={p=><div className="pixva-registry-item" key={p.id}><b>{p.kind||'KI'} · {p.model||'—'}</b><span>{p.status||'—'} · {fmt(p.created_at)}</span></div>}/>

          <div className="pixva-registry-chat"><h5>Gespeicherte Chat-Daten</h5><span>Zuletzt geändert: {fmt(c.chatUpdatedAt)}</span>{c.chatData?<details><summary>Chat-Daten anzeigen</summary><pre>{JSON.stringify(c.chatData,null,2).slice(0,12000)}</pre></details>:<div className="pixva-muted">Keine gespeicherten Chat-Daten.</div>}</div>

          <h4>Login verwalten</h4><div className="pixva-registry-password"><KeyRound size={18}/><input type="password" value={passwords[a.id]||''} onChange={e=>setPasswords(o=>({...o,[a.id]:e.target.value}))} placeholder="Neues Passwort (mind. 10 Zeichen)"/><button onClick={()=>resetPassword(a)}>Neues Passwort setzen</button></div>
        </div>}
      </article>})}
    </section>)}
  </section>;
}
