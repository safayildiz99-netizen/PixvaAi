import React,{useEffect,useState} from 'react';
import { api,usd } from '../api';
import { supabase } from '../supabase';
import { Button,Card,Field,Notice } from '../components';

export default function AccountPage({profile,refresh}){
  const [name,setName]=useState(profile?.display_name||'');
  const [username,setUsername]=useState(profile?.username||'');
  const [password,setPassword]=useState('');
  const [usage,setUsage]=useState(null);
  const [msg,setMsg]=useState('');
  const [report,setReport]=useState({category:'technical',description:''});
  const [reports,setReports]=useState([]);
  useEffect(()=>{api('/api/usage').then(setUsage).catch(()=>{});api('/api/reports').then(r=>setReports(r.reports||[])).catch(()=>{})},[]);
  async function saveProfile(){const {error}=await supabase.rpc('update_my_profile',{p_username:username,p_display_name:name});setMsg(error?error.message:'Profil gespeichert.');if(!error)refresh()}
  async function changePassword(){if(password.length<10)return setMsg('Mindestens 10 Zeichen.');const {error}=await supabase.auth.updateUser({password});if(error)return setMsg(error.message);await supabase.rpc('mark_password_changed');setPassword('');setMsg('Passwort geändert.')}
  async function sendReport(){try{const result=await api('/api/reports',{method:'POST',body:JSON.stringify(report)});setReports([result.report,...reports]);setReport({...report,description:''});setMsg('Meldung wurde sicher an den Admin gesendet.')}catch(e){setMsg(e.message)}}
  return <div className="two-col">
    <div className="stack">
      <Card><h1>Konto</h1>{msg&&<Notice>{msg}</Notice>}<Field label="Anzeigename"><input value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Benutzername"><input value={username} onChange={e=>setUsername(e.target.value)}/></Field><Button onClick={saveProfile}>Profil speichern</Button><hr/><h2>Passwort ändern</h2><Field label="Neues Passwort"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={10}/></Field><Button className="secondary" onClick={changePassword}>Passwort ändern</Button><Notice>Admins können dein Passwort niemals lesen. Sie können nur ein neues temporäres Passwort setzen.</Notice></Card>
      <Card><h2>Problem melden</h2><Field label="Kategorie"><select value={report.category} onChange={e=>setReport({...report,category:e.target.value})}><option value="technical">Technischer Fehler</option><option value="billing">Zahlung und Abo</option><option value="content">Inhalt melden</option><option value="privacy">Datenschutz</option><option value="other">Sonstiges</option></select></Field><Field label="Beschreibung"><textarea rows={6} value={report.description} onChange={e=>setReport({...report,description:e.target.value})} placeholder="Was ist passiert?"/></Field><Button onClick={sendReport} disabled={!report.description.trim()}>Meldung senden</Button><div className="usage-list">{reports.slice(0,10).map(item=><div key={item.id}><span>{item.category}</span><small>{item.status} · {new Date(item.created_at).toLocaleString('de-DE')}</small></div>)}</div></Card>
    </div>
    <Card><h2>Kostenübersicht</h2>{usage&&<><div className="cost-grid"><div><small>Heute Chat</small><strong>{usd(usage.summary.today.chat)}</strong></div><div><small>Heute Bilder</small><strong>{usd(usage.summary.today.image)}</strong></div><div><small>Heute Videos</small><strong>{usd(usage.summary.today.video)}</strong></div><div><small>Heute Gesamt</small><strong>{usd(usage.summary.today.total)}</strong></div><div><small>Monat Chat</small><strong>{usd(usage.summary.month.chat)}</strong></div><div><small>Monat Bilder</small><strong>{usd(usage.summary.month.image)}</strong></div><div><small>Monat Videos</small><strong>{usd(usage.summary.month.video)}</strong></div><div><small>Monat Gesamt</small><strong>{usd(usage.summary.month.total)}</strong></div></div><div className="usage-list">{usage.events.slice(0,30).map(event=><div key={event.id}><span>{event.kind} · {event.model} · {event.units}</span><small>{event.request_status}/{event.billing_status} · {usd(event.actual_cost_usd??event.estimated_cost_usd)}</small></div>)}</div></>}</Card>
  </div>
}
