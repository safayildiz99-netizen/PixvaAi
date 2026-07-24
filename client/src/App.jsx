import { useEffect, useMemo, useState } from 'react';
import {
  Bot, FileImage, Film, FolderOpen, Globe2, LayoutTemplate, LogIn, LogOut,
  KeyRound, Menu, PanelLeftClose, PanelLeftOpen, Settings, Sparkles
} from 'lucide-react';
import { api, getToken, setToken } from './api.js';
import Login from './components/Login.jsx';
import Chat from './components/Chat.jsx';
import DesignEditor from './components/DesignEditor.jsx';
import VideoStudio from './components/VideoStudio.jsx';
import WebsiteBuilder from './components/WebsiteBuilder.jsx';
import Projects from './components/Projects.jsx';
import Admin from './components/Admin.jsx';
import AccountSettings from './components/AccountSettings.jsx';

const fullNav = [
  { id:'chat', label:'Chat', icon:Bot },
  { id:'flyer', label:'Angebote & Flyer', icon:LayoutTemplate },
  { id:'image', label:'Motive & Editor', icon:FileImage },
  { id:'video', label:'Video-Studio', icon:Film },
  { id:'website', label:'Website-Builder', icon:Globe2 },
  { id:'projects', label:'Projekte', icon:FolderOpen }
];

const titles = {
  chat:'Yildiz AI Chat', flyer:'Angebote & Flyer', image:'Motive & Editor',
  video:'Video-Studio', website:'Website-Builder', projects:'Projekte', account:'Mein Konto', admin:'Admin & Einstellungen'
};

const guestUser = { id:'guest', username:'Gast', role:'guest', active:true, mustChangePassword:false };

export default function App(){
  const [user,setUser]=useState(null);
  const [guest,setGuest]=useState(()=>localStorage.getItem('yildiz_ai_guest')==='1');
  const [loading,setLoading]=useState(Boolean(getToken()));
  const [view,setView]=useState('chat');
  const [sidebar,setSidebar]=useState(true);
  const [selectedProject,setSelectedProject]=useState(null);
  const [refreshKey,setRefreshKey]=useState(0);

  useEffect(()=>{
    if(!getToken()){setLoading(false);return}
    api('/api/me').then((r)=>{setUser(r.user);setGuest(false);localStorage.removeItem('yildiz_ai_guest')})
      .catch(()=>setToken('')).finally(()=>setLoading(false));
  },[]);

  const activeUser=user || (guest ? guestUser : null);
  const nav=useMemo(()=>guest ? fullNav.filter((item)=>item.id!=='projects') : fullNav,[guest]);

  function enterGuest(){setToken('');localStorage.setItem('yildiz_ai_guest','1');setGuest(true);setUser(null);setView('chat')}
  function loggedIn(nextUser){localStorage.removeItem('yildiz_ai_guest');setGuest(false);setUser(nextUser)}
  function exit(){setToken('');localStorage.removeItem('yildiz_ai_guest');setGuest(false);setUser(null);setView('chat')}
  function changeView(id){setSelectedProject(null);setView(guest&&id==='projects'?'flyer':id)}
  function openProject(project){setSelectedProject(project);setView(project.type)}
  function saved(){setRefreshKey((n)=>n+1)}

  if(loading) return <div className="app-loader"><Sparkles/>Yildiz AI Studio lädt …</div>;
  if(!activeUser) return <Login onLogin={loggedIn} onGuest={enterGuest}/>;

  return <div className={`app-shell ${sidebar?'':'sidebar-collapsed'}`}>
    <aside className="sidebar">
      <div className="sidebar-brand"><img className="sidebar-logo" src="/yildiz-ai-logo.png" alt="Yildiz AI"/><span className="sr-only">Yildiz AI</span><button onClick={()=>setSidebar(false)}><PanelLeftClose size={18}/></button></div>
      <button className="new-project" onClick={()=>changeView('flyer')}><LayoutTemplate size={18}/>Neues Design</button>
      <nav>{nav.map((item)=>{const Icon=item.icon;return <button key={item.id} className={view===item.id?'active':''} onClick={()=>changeView(item.id)}><Icon size={19}/><span>{item.label}</span></button>})}</nav>
      <div className="sidebar-bottom">
        {!guest&&<button className={view==='account'?'active':''} onClick={()=>changeView('account')}><KeyRound size={19}/><span>Mein Konto</span></button>}
        {activeUser.role==='admin'&&<button className={view==='admin'?'active':''} onClick={()=>changeView('admin')}><Settings size={19}/><span>Admin</span></button>}
        <div className="user-box"><div className="user-avatar">{activeUser.username.slice(0,2).toUpperCase()}</div><div><b>{activeUser.username}</b><span>{guest?'Ohne Anmeldung':activeUser.role==='admin'?'Admin':'Mitarbeiter'}</span></div><button onClick={exit} title={guest?'Anmelden':'Abmelden'}>{guest?<LogIn size={17}/>:<LogOut size={17}/>}</button></div>
      </div>
    </aside>
    {!sidebar&&<button className="sidebar-open" onClick={()=>setSidebar(true)}><PanelLeftOpen size={20}/></button>}
    <main className="workspace">
      <header className="topbar"><div><button className="mobile-menu" onClick={()=>setSidebar(!sidebar)}><Menu size={19}/></button><h1>{titles[view]}</h1>{selectedProject&&<span className="project-pill">{selectedProject.name}</span>}</div><div className="mode-toggle"><button className={view==='chat'?'active':''} onClick={()=>changeView('chat')}>Chat</button><button className={view!=='chat'?'active':''} onClick={()=>changeView(guest?'flyer':'projects')}>Work</button></div></header>
      {guest&&<div className="guest-banner"><span>Gastmodus: Chat und Editoren funktionieren ohne Anmeldung. Zum dauerhaften Speichern bitte anmelden.</span><button onClick={exit}>Anmelden</button></div>}
      {activeUser.mustChangePassword&&!guest&&<div className="warning-banner">Das Startpasswort ist noch aktiv. Öffne links „Mein Konto“ und lege dein eigenes Passwort fest.</div>}
      <div className="workspace-content">
        {view==='chat'&&<Chat/>}
        {view==='flyer'&&<DesignEditor key={selectedProject?.id||'new-flyer'} mode="flyer" project={selectedProject?.type==='flyer'?selectedProject:null} onSaved={saved} canSave={!guest}/>} 
        {view==='image'&&<DesignEditor key={selectedProject?.id||'new-image'} mode="image" project={selectedProject?.type==='image'?selectedProject:null} onSaved={saved} canSave={!guest}/>} 
        {view==='video'&&<VideoStudio key={selectedProject?.id||'new-video'} project={selectedProject?.type==='video'?selectedProject:null} onSaved={saved} canSave={!guest}/>} 
        {view==='website'&&<WebsiteBuilder key={selectedProject?.id||'new-site'} project={selectedProject?.type==='website'?selectedProject:null} onSaved={saved} canSave={!guest}/>} 
        {view==='projects'&&!guest&&<Projects onOpen={openProject} refreshKey={refreshKey}/>} 
        {view==='account'&&!guest&&<AccountSettings user={activeUser} onUserChanged={setUser}/>}
        {view==='admin'&&activeUser.role==='admin'&&<Admin user={activeUser} onUserChanged={setUser}/>} 
      </div>
    </main>
  </div>;
}
