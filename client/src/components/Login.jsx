import { useState } from 'react';
import { KeyRound, LogIn, ShieldCheck, UserRound } from 'lucide-react';
import { api, setToken } from '../api.js';

export default function Login({onLogin,onGuest,allowGuest=true}){
  const [username,setUsername]=useState('admin');
  const [password,setPassword]=useState('');
  const [totp,setTotp]=useState('');
  const [requires2fa,setRequires2fa]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  async function submit(event){
    event.preventDefault();setLoading(true);setError('');
    try{
      const result=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username,password,totp})});
      if(result?.requires2fa&&!result?.token){setRequires2fa(true);return}
      if(!result?.token||!result?.user)throw new Error('Anmeldung konnte nicht abgeschlossen werden.');
      setToken(result.token);onLogin(result.user);
    }catch(err){setError(err.message||'Anmeldung fehlgeschlagen.')}finally{setLoading(false)}
  }
  return <main className="login-page"><section className="login-card">
    <div className="brand-badge"><img src="/pixva-logo.png" alt="PIXVA"/></div>
    <h1>Deine KI für alles.</h1><p>Chat, Wissen, Produkte, Designs, Agenten und Medien – sicher in PIXVA.</p>
    {allowGuest&&!requires2fa&&<button className="guest-btn" type="button" onClick={onGuest}><UserRound size={18}/>Ohne Anmeldung starten</button>}
    {allowGuest&&!requires2fa&&<div className="login-divider"><span>oder mit Konto</span></div>}
    <form onSubmit={submit}>
      <label>Benutzername<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" disabled={requires2fa}/></label>
      <label>Passwort<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" disabled={requires2fa}/></label>
      {requires2fa&&<label>2FA-Code oder Wiederherstellungscode<input autoFocus value={totp} onChange={e=>setTotp(e.target.value)} autoComplete="one-time-code" placeholder="123456"/></label>}
      {error&&<div className="error-box">{error}</div>}
      <button className="primary-btn wide" disabled={loading}>{requires2fa?<KeyRound size={17}/>:<LogIn size={17}/>} {loading?'Anmeldung läuft …':requires2fa?'2FA bestätigen':'Anmelden'}</button>
    </form>
    {requires2fa&&<button type="button" onClick={()=>{setRequires2fa(false);setTotp('');setError('')}}>Zurück</button>}
    <div className="login-hint"><ShieldCheck size={16}/><a href="/pixva-recovery.html">Passwort oder Zugang wiederherstellen</a></div>
  </section></main>;
}
