import { useEffect, useState } from 'react';
import {
  Bot, FileImage, Film, FolderOpen, Globe2, LayoutTemplate, LogOut,
  Menu, PanelLeftClose, PanelLeftOpen, Settings, Sparkles
} from 'lucide-react';
import { api, getToken, setToken } from './api.js';
import Login from './components/Login.jsx';
import Chat from './components/Chat.jsx';
import DesignEditor from './components/DesignEditor.jsx';
import VideoStudio from './components/VideoStudio.jsx';
import WebsiteBuilder from './components/WebsiteBuilder.jsx';
import Projects from './components/Projects.jsx';
import Admin from './components/Admin.jsx';

const nav = [
  { id:'chat', label:'Chat', icon:Bot },
  { id:'flyer', label:'Angebote & Flyer', icon:LayoutTemplate },
  { id:'image', label:'Lokale Motive & Editor', icon:FileImage },
  { id:'video', label:'Video-Studio', icon:Film },
  { id:'website', label:'Website-Builder', icon:Globe2 },
  { id:'projects', label:'Projekte', icon:FolderOpen }
];

const titles = {
  chat:'Yildiz AI Chat', flyer:'Angebote & Flyer', image:'Lokale Motive & Editor',
  video:'Video-Studio', website:'Website-Builder', projects:'Projekte', admin:'Admin & Einstellungen'
};

export default function App(){
  const [user,setUser]=useState(null); const [loading,setLoading]=useState(Boolean(getToken()));
  const [view,setView]=useState('chat'); const [sidebar,setSidebar]=useState(true);
  const [selectedProject,setSelectedProject]=useState(null); const [refreshKey,setRefreshKey]=useState(0);

  useEffect(()=>{ if(!getToken()){setLoading(false);return} api('/api/me').then((r)=>setUser(r.user)).catch(()=>setToken('')).finally(()=>setLoading(false)); },[]);
  function logout(){setToken('');setUser(null)}
  function changeView(id){setSelectedProject(null);setView(id)}
  function openProject(project){setSelectedProject(project);setView(project.type)}
  function saved(){setRefreshKey((n)=>n+1)}

  if(loading) return <div className="app-loader"><Sparkles/>Yildiz AI Studio lädt …</div>;
  if(!user) return <Login onLogin={setUser}/>;

  return <div className={`app-shell ${sidebar?'':'sidebar-collapsed'}`}>
    <aside className="sidebar">
      <div className="sidebar-brand"><img className="sidebar-logo" src="/yildiz-ai-logo.png" alt="Yildiz AI"/><span className="sr-only">Yildiz AI</span><button onClick={()=>setSidebar(false)}><PanelLeftClose size={18}/></button></div>
      <button className="new-project" onClick={()=>changeView('flyer')}><LayoutTemplate size={18}/>Neues Design</button>
      <nav>{nav.map((item)=>{const Icon=item.icon;return <button key={item.id} className={view===item.id?'active':''} onClick={()=>changeView(item.id)}><Icon size={19}/><span>{item.label}</span></button>})}</nav>
      <div className="sidebar-bottom">{user.role==='admin'&&<button className={view==='admin'?'active':''} onClick={()=>changeView('admin')}><Settings size={19}/><span>Admin</span></button>}<div className="user-box"><div className="user-avatar">{user.username.slice(0,2).toUpperCase()}</div><div><b>{user.username}</b><span>{user.role==='admin'?'Admin':'Mitarbeiter'}</span></div><button onClick={logout} title="Abmelden"><LogOut size={17}/></button></div></div>
    </aside>
    {!sidebar&&<button className="sidebar-open" onClick={()=>setSidebar(true)}><PanelLeftOpen size={20}/></button>}
    <main className="workspace">
      <header className="topbar"><div><button className="mobile-menu" onClick={()=>setSidebar(!sidebar)}><Menu size={19}/></button><h1>{titles[view]}</h1>{selectedProject&&<span className="project-pill">{selectedProject.name}</span>}</div><div className="mode-toggle"><button className={view==='chat'?'active':''} onClick={()=>changeView('chat')}>Chat</button><button className={view!=='chat'?'active':''} onClick={()=>changeView('projects')}>Work</button></div></header>
      {user.mustChangePassword&&<div className="warning-banner">Das Startpasswort ist noch aktiv. Bitte im Admin-Bereich ändern.</div>}
      <div className="workspace-content">
        {view==='chat'&&<Chat/>}
        {view==='flyer'&&<DesignEditor key={selectedProject?.id||'new-flyer'} mode="flyer" project={selectedProject?.type==='flyer'?selectedProject:null} onSaved={saved}/>} 
        {view==='image'&&<DesignEditor key={selectedProject?.id||'new-image'} mode="image" project={selectedProject?.type==='image'?selectedProject:null} onSaved={saved}/>} 
        {view==='video'&&<VideoStudio key={selectedProject?.id||'new-video'} project={selectedProject?.type==='video'?selectedProject:null} onSaved={saved}/>} 
        {view==='website'&&<WebsiteBuilder key={selectedProject?.id||'new-site'} project={selectedProject?.type==='website'?selectedProject:null} onSaved={saved}/>} 
        {view==='projects'&&<Projects onOpen={openProject} refreshKey={refreshKey}/>} 
        {view==='admin'&&user.role==='admin'&&<Admin user={user} onUserChanged={setUser}/>} 
      </div>
    </main>
  </div>;
}
