import { useRef, useState } from 'react';
import { Building2, KeyRound, LogIn, ShieldCheck, UserPlus, UserRound, X } from 'lucide-react';
import { api, setToken } from '../api.js';

const emptyRegister={
  accountType:'company',username:'',password:'',firstName:'',lastName:'',email:'',phone:'',birthDate:'',
  companyName:'',companyType:'supermarkt',companyTypeOther:'',ownerName:'',companyEmail:'',
  companyPhone:'',privatePhone:'',website:'',instagram:'',address:'',logoDataUrl:''
};

export default function Login({onLogin,onGuest,allowGuest=true}){
  const [username,setUsername]=useState('admin');
  const [password,setPassword]=useState('');
  const [totp,setTotp]=useState('');
  const [requires2fa,setRequires2fa]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [registerOpen,setRegisterOpen]=useState(false);
  const [register,setRegister]=useState(emptyRegister);
  const logoRef=useRef(null);

  async function submit(event){
    event.preventDefault();setLoading(true);setError('');
    try{
      const result=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username,password,totp})});
      if(result?.requires2fa&&!result?.token){setRequires2fa(true);return}
      if(!result?.token||!result?.user)throw new Error('Anmeldung konnte nicht abgeschlossen werden.');
      setToken(result.token);onLogin(result.user);
    }catch(err){setError(err.message||'Anmeldung fehlgeschlagen.')}finally{setLoading(false)}
  }

  async function readLogo(file){
    if(!file)return;
    if(file.size>1800000){setError('Das Firmenlogo ist zu groß. Bitte maximal ca. 1,8 MB verwenden.');return}
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('Logo bitte als PNG, JPG oder WEBP hochladen.');return}
    const value=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>reject(new Error('Logo konnte nicht gelesen werden.'));
      reader.readAsDataURL(file);
    });
    setRegister(v=>({...v,logoDataUrl:value}));
  }

  async function createAccount(event){
    event.preventDefault();setLoading(true);setError('');
    try{
      const isCompany=register.accountType==='company';
      if(!register.username.trim())throw new Error('Benutzername fehlt.');
      if(register.password.length<8)throw new Error('Passwort braucht mindestens 8 Zeichen.');
      if(isCompany&&!register.companyName.trim())throw new Error('Firmenname fehlt.');
      if(isCompany&&!register.logoDataUrl)throw new Error('Bitte ein Firmenlogo hochladen.');
      if(isCompany&&register.companyType==='sonstiges'&&!register.companyTypeOther.trim())throw new Error('Bitte deine Branche genauer angeben.');

      const result=await api('/api/pixva?action=register-public',{
        method:'POST',
        body:JSON.stringify({...register,isCompany})
      });
      if(!result?.token||!result?.user)throw new Error('Konto konnte nicht erstellt werden.');
      setToken(result.token);onLogin(result.user);
    }catch(err){setError(err.message||'Konto konnte nicht erstellt werden.')}
    finally{setLoading(false)}
  }

  if(registerOpen){
    const isCompany=register.accountType==='company';
    return <main className="login-page"><section className="login-card pixva-register-card">
      <div className="brand-badge"><img src="/pixva-logo.png" alt="PIXVA"/></div>
      <div className="pixva-register-head"><div><h1>Konto erstellen</h1><p>Privat starten oder direkt dein Firmenprofil für PIXVA einrichten.</p></div><button type="button" className="pixva-close-register" onClick={()=>{setRegisterOpen(false);setError('')}}><X size={18}/></button></div>

      <div className="pixva-register-switch">
        <button type="button" className={!isCompany?'active':''} onClick={()=>setRegister(v=>({...v,accountType:'private'}))}><UserRound size={17}/>Privat</button>
        <button type="button" className={isCompany?'active':''} onClick={()=>setRegister(v=>({...v,accountType:'company'}))}><Building2 size={17}/>Firma</button>
      </div>

      <form onSubmit={createAccount}>
        <div className="pixva-register-grid">
          <label>Benutzername *<input value={register.username} onChange={e=>setRegister({...register,username:e.target.value})}/></label>
          <label>Passwort *<input type="password" value={register.password} onChange={e=>setRegister({...register,password:e.target.value})} placeholder="mindestens 8 Zeichen"/></label>
          <label>Vorname<input value={register.firstName} onChange={e=>setRegister({...register,firstName:e.target.value})}/></label>
          <label>Nachname<input value={register.lastName} onChange={e=>setRegister({...register,lastName:e.target.value})}/></label>
          <label>Normale E-Mail <small>optional</small><input type="email" value={register.email} onChange={e=>setRegister({...register,email:e.target.value})}/></label>
          <label>Private Telefonnummer <small>optional</small><input type="tel" value={register.phone} onChange={e=>setRegister({...register,phone:e.target.value})}/></label>
          <label>Geburtsdatum <small>optional</small><input type="date" value={register.birthDate} onChange={e=>setRegister({...register,birthDate:e.target.value})}/></label>
        </div>

        {isCompany&&<>
          <div className="login-divider"><span>Firmenprofil</span></div>
          <div className="pixva-register-grid">
            <label>Firmenname *<input value={register.companyName} onChange={e=>setRegister({...register,companyName:e.target.value})}/></label>
            <label>Branche *<select value={register.companyType} onChange={e=>setRegister({...register,companyType:e.target.value})}>
              <option value="supermarkt">Supermarkt</option><option value="werbetechnik">Werbetechnik</option><option value="elektriker">Elektriker</option><option value="sonstiges">Sonstiges</option>
            </select></label>
            {register.companyType==='sonstiges'&&<label>Welche Branche? *<input value={register.companyTypeOther} onChange={e=>setRegister({...register,companyTypeOther:e.target.value})} placeholder="z. B. Friseur, Restaurant, Dachdecker"/></label>}
            <label>Firmeninhaber / Ansprechpartner<input value={register.ownerName} onChange={e=>setRegister({...register,ownerName:e.target.value})}/></label>
            <label>Firmen-E-Mail<input type="email" value={register.companyEmail} onChange={e=>setRegister({...register,companyEmail:e.target.value})}/></label>
            <label>Firmen-Telefon<input type="tel" value={register.companyPhone} onChange={e=>setRegister({...register,companyPhone:e.target.value})}/></label>
            <label>Zusätzliche private Tel.<input type="tel" value={register.privatePhone} onChange={e=>setRegister({...register,privatePhone:e.target.value})}/></label>
            <label>Bestehende Website<input value={register.website} onChange={e=>setRegister({...register,website:e.target.value})} placeholder="https://..."/></label>
            <label>Instagram<input value={register.instagram} onChange={e=>setRegister({...register,instagram:e.target.value})} placeholder="@firma"/></label>
            <label>Adresse<input value={register.address} onChange={e=>setRegister({...register,address:e.target.value})} placeholder="Straße, PLZ Ort"/></label>
          </div>
          <label className="pixva-login-logo-upload"><span>Firmenlogo * <b>WICHTIG</b></span><input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>readLogo(e.target.files?.[0])}/></label>
          {register.logoDataUrl&&<div className="pixva-login-logo-preview"><img src={register.logoDataUrl} alt="Firmenlogo Vorschau"/><span>Logo wird als Firmenlogo gespeichert.</span></div>}
          <div className="pixva-register-info">PIXVA erstellt automatisch dein Firmenprofil, Branchenregeln für Flyer/Bilder und eine Demo-Website im passenden Theme.</div>
        </>}

        {error&&<div className="error-box">{error}</div>}
        <button className="primary-btn wide" disabled={loading}><UserPlus size={18}/>{loading?'Konto wird erstellt …':'Konto erstellen & starten'}</button>
      </form>
      <button type="button" className="guest-btn" onClick={()=>{setRegisterOpen(false);setError('')}}>Ich habe bereits ein Konto</button>
    </section></main>;
  }

  return <main className="login-page"><section className="login-card">
    <div className="brand-badge"><img src="/pixva-logo.png" alt="PIXVA"/></div>
    <h1>Deine KI für alles.</h1><p>Chat, Wissen, Produkte, Designs, Agenten und Medien – sicher in PIXVA.</p>
    {allowGuest&&!requires2fa&&<button className="guest-btn" type="button" onClick={onGuest}><UserRound size={18}/>Ohne Anmeldung starten</button>}
    {allowGuest&&!requires2fa&&<div className="login-divider"><span>oder mit Konto</span></div>}
    <form onSubmit={submit}>
      <label>Benutzername<input value={username} onChange={e=>setUsername(e.target.value)} disabled={requires2fa}/></label>
      <label>Passwort<input type="password" value={password} onChange={e=>setPassword(e.target.value)} disabled={requires2fa}/></label>
      {requires2fa&&<label>2FA-Code oder Wiederherstellungscode<input autoFocus value={totp} onChange={e=>setTotp(e.target.value)} placeholder="123456"/></label>}
      {error&&<div className="error-box">{error}</div>}
      <button className="primary-btn wide" disabled={loading}>{requires2fa?<KeyRound size={17}/>:<LogIn size={17}/>} {loading?'Anmeldung läuft …':requires2fa?'2FA bestätigen':'Anmelden'}</button>
    </form>
    {!requires2fa&&<button type="button" className="pixva-create-account-btn" onClick={()=>{setRegisterOpen(true);setError('')}}><UserPlus size={18}/>Konto erstellen</button>}
    {requires2fa&&<button type="button" onClick={()=>{setRequires2fa(false);setTotp('');setError('')}}>Zurück</button>}
    <div className="login-hint"><ShieldCheck size={16}/><a href="/pixva-recovery.html">Passwort oder Zugang wiederherstellen</a></div>
  </section></main>;
}
