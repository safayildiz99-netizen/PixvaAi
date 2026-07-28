import React,{useState} from 'react';
import { supabase } from '../supabase';
import { api } from '../api';
import { Button,Card,Field,Notice,Spinner } from '../components';

export default function AuthPage(){
  const [mode,setMode]=useState('login');
  const [identifier,setIdentifier]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [username,setUsername]=useState('');
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState(null);

  async function submit(event){
    event.preventDefault();
    setLoading(true);
    setMsg(null);
    try{
      if(mode==='login'){
        const result=await api('/api/auth/login',{
          method:'POST',
          body:JSON.stringify({identifier,password})
        });
        const {error}=await supabase.auth.setSession({
          access_token:result.session.access_token,
          refresh_token:result.session.refresh_token
        });
        if(error)throw error;
      }else{
        await api('/api/auth/signup',{
          method:'POST',
          body:JSON.stringify({email,password,username})
        });
        setMsg({type:'success',text:'Konto erstellt. Du kannst dich jetzt anmelden.'});
        setIdentifier(email);
        setMode('login');
      }
    }catch(error){
      setMsg({type:'error',text:error.message});
    }finally{
      setLoading(false);
    }
  }

  return <main className="auth-shell">
    <Card className="auth-card">
      <div className="brand-mark">Y</div>
      <h1>Yildiz AI <span>V10.0.4</span></h1>
      <p className="muted">Anmeldung mit Benutzername oder E-Mail</p>

      {msg&&<Notice type={msg.type}>{msg.text}</Notice>}

      <form onSubmit={submit}>
        {mode==='signup'&&<>
          <Field label="Benutzername">
            <input value={username} onChange={event=>setUsername(event.target.value)} minLength={3} required/>
          </Field>
          <Field label="E-Mail">
            <input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" required/>
          </Field>
        </>}

        {mode==='login'&&<Field label="Benutzername oder E-Mail">
          <input
            value={identifier}
            onChange={event=>setIdentifier(event.target.value)}
            autoComplete="username"
            placeholder="z. B. admin"
            required
          />
        </Field>}

        <Field label="Passwort">
          <input
            type="password"
            value={password}
            onChange={event=>setPassword(event.target.value)}
            minLength={10}
            autoComplete={mode==='login'?'current-password':'new-password'}
            required
          />
        </Field>

        <Button disabled={loading}>
          {loading?<><Spinner/> Lädt…</>:mode==='login'?'Anmelden':'Konto erstellen'}
        </Button>
      </form>

      <button className="link-btn" onClick={()=>setMode(mode==='login'?'signup':'login')}>
        {mode==='login'?'Noch kein Konto? Registrieren':'Bereits registriert? Anmelden'}
      </button>

      {mode==='login'&&<Notice>
        Admin-Anmeldung: Benutzername <strong>admin</strong>. Der Admin muss einmal über
        <strong> /admin-login-einrichten.html</strong> eingerichtet werden.
      </Notice>}
    </Card>
  </main>;
}
