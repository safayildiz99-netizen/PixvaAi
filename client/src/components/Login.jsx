/* PIXVA V12 LOGIN ACCOUNT TYPES */
import { useEffect, useRef, useState } from 'react';
import { Building2, KeyRound, LogIn, ShieldCheck, UserPlus, UserRound, X } from 'lucide-react';
import { api, setToken } from '../api.js';

const emptyRegister={
  accountType:'company',username:'',password:'',firstName:'',lastName:'',email:'',phone:'',birthDate:'',
  companyName:'',companyType:'supermarkt',companyTypeOther:'',ownerName:'',companyEmail:'',
  companyPhone:'',privatePhone:'',website:'',instagram:'',address:'',logoDataUrl:''
};

const FALLBACK_INDUSTRIES=[
  {id:'supermarkt',label:'Supermarkt',enabled:true},{id:'werbetechnik',label:'Werbetechnik',enabled:true},
  {id:'elektriker',label:'Elektriker',enabled:true},{id:'programmierer',label:'Programmierer / Software & KI',enabled:true},
  {id:'friseur',label:'Friseur',enabled:true},{id:'sonstiges',label:'Sonstiges',enabled:true}
];
const FALLBACK_FIELDS=[
  ['username','Benutzername','all','text',true],['password','Passwort','all','password',true],['firstName','Vorname','all','text',false],
  ['lastName','Nachname','all','text',false],['email','Normale E-Mail','all','email',false],['phone','Private Telefonnummer','all','tel',false],
  ['birthDate','Geburtsdatum','all','date',false],['companyName','Firmenname','company','text',true],['companyType','Branche','company','industry',true],
  ['companyTypeOther','Welche Branche?','company','text',false],['ownerName','Firmeninhaber / Ansprechpartner','company','text',false],
  ['companyEmail','Firmen-E-Mail','company','email',false],['companyPhone','Firmen-Telefon','company','tel',false],['privatePhone','Zusätzliche private Tel.','company','tel',false],
  ['website','Bestehende Website','company','url',false],['instagram','Instagram','company','text',false],['address','Adresse','company','text',false],['logoDataUrl','Firmenlogo','company','logo',true]
].map(([id,label,scope,type,required])=>({id,label,scope,type,required,enabled:true}));
function normalizeSignupConfig(value){
  const industries=(Array.isArray(value?.industries)&&value.industries.length?value.industries:FALLBACK_INDUSTRIES).filter(x=>x?.enabled!==false&&x?.id&&x?.label);
  const fields=(Array.isArray(value?.fields)&&value.fields.length?value.fields:FALLBACK_FIELDS).filter(x=>x?.enabled!==false&&x?.id);
  return{industries:industries.length?industries:FALLBACK_INDUSTRIES,fields};
}


export default function Login({onLogin,onGuest,allowGuest=true,signupConfig}){
  const [username,setUsername]=useState('admin');
  const [password,setPassword]=useState('');
  const [totp,setTotp]=useState('');
  const [requires2fa,setRequires2fa]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [registerOpen,setRegisterOpen]=useState(false);
  const [register,setRegister]=useState(emptyRegister);
  const logoRef=useRef(null);
  const registrationConfig=normalizeSignupConfig(signupConfig);
  const customFieldValues=register.customFields||{};
  useEffect(()=>{
    if(!registrationConfig.industries.some(item=>item.id===register.companyType)){
      const firstIndustry=registrationConfig.industries[0]?.id||'sonstiges';
      setRegister(prev=>({...prev,companyType:firstIndustry}));
    }
  },[signupConfig]);

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
      const visibleFields=registrationConfig.fields.filter(field=>field.scope==='all'||(field.scope==='company'&&isCompany)||(field.scope==='private'&&!isCompany)).filter(field=>{
        if(!field.showWhen)return true;
        return String(register[field.showWhen.field]??customFieldValues[field.showWhen.field]??'')===String(field.showWhen.equals??'');
      });
      for(const field of visibleFields){
        if(!field.required)continue;
        const value=field.id in register?register[field.id]:customFieldValues[field.id];
        if(field.type==='logo'&&!register.logoDataUrl)throw new Error(`${field.label||'Logo'} fehlt.`);
        if(field.type!=='logo'&&!String(value??'').trim())throw new Error(`${field.label||field.id} fehlt.`);
      }
      if(register.password&&register.password.length<8)throw new Error('Passwort braucht mindestens 8 Zeichen.');

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
          {registrationConfig.fields.filter(field=>field.scope==='all'||(field.scope==='private'&&!isCompany)).map(field=>{
            if(field.showWhen&&String(register[field.showWhen.field]??customFieldValues[field.showWhen.field]??'')!==String(field.showWhen.equals??''))return null;
            const value=field.id in register?register[field.id]:(customFieldValues[field.id]||'');
            const setValue=(next)=>setRegister(prev=>field.id in prev?{...prev,[field.id]:next}:{...prev,customFields:{...(prev.customFields||{}),[field.id]:next}});
            if(field.type==='logo'||field.type==='industry')return null;
            return <label key={field.id}>{field.label||field.id}{field.required?' *':''}<input type={field.type||'text'} value={value} onChange={e=>setValue(e.target.value)} placeholder={field.placeholder||''}/></label>;
          })}
        </div>

        {isCompany&&<>
          <div className="login-divider"><span>Firmenprofil</span></div>
          <div className="pixva-register-grid">
            {registrationConfig.fields.filter(field=>field.scope==='company').map(field=>{
              if(field.showWhen&&String(register[field.showWhen.field]??customFieldValues[field.showWhen.field]??'')!==String(field.showWhen.equals??''))return null;
              const value=field.id in register?register[field.id]:(customFieldValues[field.id]||'');
              const setValue=(next)=>setRegister(prev=>field.id in prev?{...prev,[field.id]:next}:{...prev,customFields:{...(prev.customFields||{}),[field.id]:next}});
              if(field.type==='industry')return <label key={field.id}>{field.label||'Branche'}{field.required?' *':''}<select value={register.companyType} onChange={e=>setRegister(prev=>({...prev,companyType:e.target.value}))}>{registrationConfig.industries.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>;
              if(field.type==='logo')return <label key={field.id} className="pixva-login-logo-upload"><span>{field.label||'Firmenlogo'}{field.required?' *':''}</span><input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>readLogo(e.target.files?.[0])}/></label>;
              return <label key={field.id}>{field.label||field.id}{field.required?' *':''}<input type={field.type||'text'} value={value} onChange={e=>setValue(e.target.value)} placeholder={field.placeholder||''}/></label>;
            })}
          </div>
          {register.logoDataUrl&&<div className="pixva-login-logo-preview"><img src={register.logoDataUrl} alt="Firmenlogo Vorschau"/><span>Logo wird als Firmenlogo gespeichert.</span></div>}
          <div className="pixva-register-info">Die Felder und Branchen dieser Anmeldung werden vom PIXVA-Admin zentral gesteuert.</div>
        </>}

        {error&&<div className="error-box">{error}</div>}
        <button className="primary-btn wide" disabled={loading}><UserPlus size={18}/>{loading?'Konto wird erstellt …':'Konto erstellen & starten'}</button>
      </form>
      <button type="button" className="guest-btn" onClick={()=>{setRegisterOpen(false);setError('')}}>Ich habe bereits ein Konto</button>
    </section></main>;
  }

  return <main className="login-page"><section className="login-card">
    <div className="brand-badge"><img src="/pixva-logo.png" alt="PIXVA"/></div>
    <h1>Deine KI für alles.</h1><p>Chat, Wissen, Designs, Agenten und Medien – sicher in PIXVA.</p>
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
