import { Suspense, lazy, startTransition, useEffect, useMemo, useState } from 'react';
import {
  BadgeEuro, Bot, BrainCircuit, FileImage, Film, FolderOpen, Globe2, LayoutTemplate, LockKeyhole, LogIn, LogOut,
  KeyRound, Menu, PanelLeftClose, PanelLeftOpen, Settings, Sparkles
} from 'lucide-react';
import { api, getToken, setToken } from './api.js';
import Login from './components/Login.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';

// Große PIXVA-Bereiche werden erst geladen, wenn sie wirklich geöffnet werden.
// Das reduziert den Start-Bundle und verhindert lange schwarze/leere Frames.
const Chat = lazy(()=>import('./components/Chat.jsx'));
const DesignEditor = lazy(()=>import('./components/DesignEditor.jsx'));
const VideoStudio = lazy(()=>import('./components/VideoStudio.jsx'));
const WebsiteBuilder = lazy(()=>import('./components/WebsiteBuilder.jsx'));
const Projects = lazy(()=>import('./components/Projects.jsx'));
const Admin = lazy(()=>import('./components/Admin.jsx'));
const AccountSettings = lazy(()=>import('./components/AccountSettings.jsx'));
const Subscriptions = lazy(()=>import('./components/Subscriptions.jsx'));
const PixvaCenter = lazy(()=>import('./components/PixvaCenter.jsx'));
import { DEFAULT_SUBSCRIPTION, canUseFeature, getPlan, normalizeSubscription } from './plans.js';

const NAV_DEFINITIONS = {
  chat:{ id:'chat', label:'Chat', icon:Bot },
  flyer:{ id:'flyer', label:'Angebote & Flyer', icon:LayoutTemplate },
  image:{ id:'image', label:'Motive & Editor', icon:FileImage },
  video:{ id:'video', label:'Video-Studio', icon:Film },
  website:{ id:'website', label:'Website-Builder', icon:Globe2 },
  projects:{ id:'projects', label:'Projekte', icon:FolderOpen },
  pixva:{ id:'pixva', label:'PIXVA Hub', icon:BrainCircuit },
  plans:{ id:'plans', label:'Abos & Preise', icon:BadgeEuro }
};

const DEFAULT_NAV_ITEMS = Object.values(NAV_DEFINITIONS).map(({id,label})=>({id,label,visible:true}));

const titles = {
  chat:'PIXVA Chat', flyer:'Angebote & Flyer', image:'Motive & Editor',
  video:'Video-Studio', website:'Website-Builder', projects:'Projekte', pixva:'PIXVA KI-Zentrale', plans:'Abos & Preise', account:'Mein Konto', admin:'Admin & Einstellungen'
};

const DEFAULT_UI_SETTINGS = {
  defaultView: 'chat',
  workView: 'projects',
  allowGuest: true,
  showFlyer: true,
  showImage: true,
  showVideo: true,
  showWebsite: true,
  showProjects: true,
  showPlans: true,
  announcement: '',
  maintenanceMode: false,
  compactSidebar: false,
  mobileHistoryDrawer: true,
  costPromptMode: 'all',
  costPromptOverrides: {},
  customPlans: [],
  navItems: DEFAULT_NAV_ITEMS,
  texts: {
    appTitle:'PIXVA Chat', newDesign:'Neues Design', chatTab:'Chat', workTab:'Work',
    statusTitle:'PIXVA · Gemini + OpenAI + Sora',
    welcome:'Hallo! Ich bin PIXVA. Du kannst mir Fragen stellen, Bilder und Videos direkt erzeugen sowie Dateien erstellen und hochladen.',
    composer:'Frag PIXVA …',
    flyerTitle:'Angebote & Flyer', flyerSubtitle:'Bearbeitbare Vorlagen für Angebote, Produkte und Preise.',
    imageTitle:'Motive & Editor', imageSubtitle:'Bilder, Motive, Texte und Ebenen direkt bearbeiten.',
    videoTitle:'Video-Studio', videoSubtitle:'Szenen, Texte, Musik und Videos in einem Projekt.',
    websiteTitle:'Website-Builder', websiteSubtitle:'Webseiten gestalten und als HTML oder ZIP exportieren.',
    projectsTitle:'Projekte', projectsSubtitle:'Deine gespeicherten Designs, Videos und Webseiten.',
    plansTitle:'Abos & Preise', plansSubtitle:'Free, Creator und Studio Pro – während der Beta ohne Zahlung.'
  },
  theme: { sidebarWidth:255, accentBlue:'#63c7ff', accentYellow:'#ffd400' },
  planPrices: { free:0, creator:9.99, studio:24.99 },
  betaPlanPrices: { free:0, creator:0, studio:0 },
  paymentsEnabled: false,
  paymentProvider: 'paypal',
  paymentMerchantLabel: '',
  planPurchasable: { free:false, creator:true, studio:true },
  paidAccessDays: 30
};

const guestUser = { id:'guest', username:'Gast', role:'guest', active:true, mustChangePassword:false };
const VIEW_FEATURES = { flyer:'flyer', image:'image', video:'video', website:'website', projects:'projects' };

function configuredNav(settings) {
  const source = Array.isArray(settings?.navItems) && settings.navItems.length ? settings.navItems : DEFAULT_NAV_ITEMS;
  const known = source.filter((item)=>NAV_DEFINITIONS[item?.id]).map((item)=>({ ...NAV_DEFINITIONS[item.id], label:String(item.label || NAV_DEFINITIONS[item.id].label), visible:item.visible !== false }));
  for (const item of DEFAULT_NAV_ITEMS) if (!known.some((entry)=>entry.id===item.id)) known.push({ ...NAV_DEFINITIONS[item.id], visible:true });
  return known;
}

function enabledBySettings(id, settings) {
  const configured = configuredNav(settings).find((item)=>item.id===id);
  if (configured) return configured.visible !== false;
  if (id === 'flyer') return settings.showFlyer !== false;
  if (id === 'image') return settings.showImage !== false;
  if (id === 'video') return settings.showVideo !== false;
  if (id === 'website') return settings.showWebsite !== false;
  if (id === 'projects') return settings.showProjects !== false;
  if (id === 'plans') return settings.showPlans !== false;
  return true;
}

export default function App(){
  const [user,setUser]=useState(null);
  const [guest,setGuest]=useState(()=>localStorage.getItem('yildiz_ai_guest')==='1');
  const [loading,setLoading]=useState(Boolean(getToken()));
  const [view,setView]=useState('chat');
  const [sidebar,setSidebar]=useState(()=>typeof window==='undefined' ? true : window.innerWidth>760);
  const [isMobile,setIsMobile]=useState(()=>typeof window!=='undefined' && window.innerWidth<=760);
  const [selectedProject,setSelectedProject]=useState(null);
  const [refreshKey,setRefreshKey]=useState(0);
  const [uiSettings,setUiSettings]=useState(DEFAULT_UI_SETTINGS);
  const [subscription,setSubscription]=useState(DEFAULT_SUBSCRIPTION);
  const [requestedView,setRequestedView]=useState('');
  const [viewPending,setViewPending]=useState(false);
  const [viewRetryKey,setViewRetryKey]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    api('/api/ui-settings').then((result)=>{
      if(cancelled) return;
      setUiSettings({
        ...DEFAULT_UI_SETTINGS,
        ...(result?.settings||{}),
        texts:{...DEFAULT_UI_SETTINGS.texts,...(result?.settings?.texts||{})},
        theme:{...DEFAULT_UI_SETTINGS.theme,...(result?.settings?.theme||{})},
        planPrices:{...DEFAULT_UI_SETTINGS.planPrices,...(result?.settings?.planPrices||{})},
        betaPlanPrices:{...DEFAULT_UI_SETTINGS.betaPlanPrices,...(result?.settings?.betaPlanPrices||{})},
        costPromptOverrides:{...(result?.settings?.costPromptOverrides||{})},
        customPlans:Array.isArray(result?.settings?.customPlans)?result.settings.customPlans:[],
        planPurchasable:{...DEFAULT_UI_SETTINGS.planPurchasable,...(result?.settings?.planPurchasable||{})}
      });
    }).catch(()=>{});
    return ()=>{cancelled=true};
  },[]);

  useEffect(()=>{
    const updateMobile=()=>{const mobile=window.innerWidth<=760;setIsMobile(mobile);if(mobile)setSidebar(false)};
    updateMobile();window.addEventListener('resize',updateMobile);return()=>window.removeEventListener('resize',updateMobile);
  },[]);

  useEffect(()=>{
    if(!getToken()){setLoading(false);return}
    api('/api/me').then((r)=>{setUser(r.user);setGuest(false);localStorage.removeItem('yildiz_ai_guest')})
      .catch(()=>setToken('')).finally(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    let cancelled=false;
    if(!user || guest){setSubscription(DEFAULT_SUBSCRIPTION);return()=>{cancelled=true}}
    api('/api/subscription').then((result)=>{
      if(!cancelled)setSubscription(normalizeSubscription(result.subscription, uiSettings.customPlans));
    }).catch(()=>{
      if(!cancelled)setSubscription(DEFAULT_SUBSCRIPTION);
    });
    return()=>{cancelled=true};
  },[user?.id,guest,uiSettings.customPlans]);

  useEffect(()=>{
    if(view==='admin'||view==='account'||view==='chat'||view==='plans') return;
    if(!enabledBySettings(view,uiSettings)) setView('chat');
  },[uiSettings,view]);

  const activeUser=user || (guest ? guestUser : null);
  const nav=useMemo(()=>configuredNav(uiSettings).filter((item)=>item.visible !== false && enabledBySettings(item.id,uiSettings) && (!guest || item.id!=='pixva')),[uiSettings,guest]);

  const workTarget=useMemo(()=>{
    const preferred=uiSettings.workView;
    if(preferred&&enabledBySettings(preferred,uiSettings)&&canUseFeature(subscription,VIEW_FEATURES[preferred]||preferred,activeUser?.role,uiSettings.customPlans)) return preferred;
    return nav.find((item)=>item.id!=='chat'&&item.id!=='plans'&&canUseFeature(subscription,VIEW_FEATURES[item.id]||item.id,activeUser?.role,uiSettings.customPlans))?.id||'plans';
  },[activeUser?.role,nav,subscription,uiSettings]);

  function enterGuest(){
    if(uiSettings.allowGuest===false) return;
    setToken('');localStorage.setItem('yildiz_ai_guest','1');setGuest(true);setUser(null);setSubscription(DEFAULT_SUBSCRIPTION);setView('chat');
  }
  function loggedIn(nextUser){
    localStorage.removeItem('yildiz_ai_guest');setGuest(false);setUser(nextUser);
    const next=enabledBySettings(uiSettings.defaultView,uiSettings)?uiSettings.defaultView:'chat';
    setView(next==='chat'||next==='plans'||nextUser?.role==='admin'?next:'chat');
  }
  function exit(){setToken('');localStorage.removeItem('yildiz_ai_guest');setGuest(false);setUser(null);setSubscription(DEFAULT_SUBSCRIPTION);setView('chat')}
  function featureAllowed(id){
    const feature=VIEW_FEATURES[id];
    return !feature||canUseFeature(subscription,feature,activeUser?.role,uiSettings.customPlans);
  }
  function navigateTo(id){
    setViewPending(true);
    startTransition(()=>setView(id));
  }
  useEffect(()=>{
    if(!viewPending) return;
    const timer=window.setTimeout(()=>setViewPending(false),120);
    return()=>window.clearTimeout(timer);
  },[view,viewPending]);
  function changeView(id){
    setSelectedProject(null);
    if(id==='pixva'&&guest){exit();return;}
    if(id!=='admin'&&id!=='account'&&!enabledBySettings(id,uiSettings)) return navigateTo('chat');
    if(!featureAllowed(id)){
      setRequestedView(id);
      navigateTo('plans');
    }else{
      setRequestedView('');
      navigateTo(id);
    }
    if(isMobile)setSidebar(false);
  }
  function handleSubscriptionChanged(next){
    const normalized=normalizeSubscription(next,uiSettings.customPlans);
    setSubscription(normalized);
    if(requestedView&&canUseFeature(normalized,VIEW_FEATURES[requestedView],activeUser?.role,uiSettings.customPlans)){
      navigateTo(requestedView);setRequestedView('');
    }
  }
  function openProject(project){
    const feature=VIEW_FEATURES[project.type];
    if(feature&&!canUseFeature(subscription,feature,activeUser?.role,uiSettings.customPlans)){setRequestedView(project.type);navigateTo('plans');return}
    setSelectedProject(project);navigateTo(project.type);
  }
  function saved(){setRefreshKey((n)=>n+1)}
  function openGeneratedImageProject(imageProject){
    if(!imageProject?.data?.initialImage) return;
    if(!canUseFeature(subscription,'image',activeUser?.role,uiSettings.customPlans)){setRequestedView('image');navigateTo('plans');return}
    setSelectedProject({id:`generated-image-${Date.now()}`,type:'image',name:imageProject.name||'KI-Bild bearbeiten',data:imageProject.data});
    navigateTo('image');
  }

  function openGeneratedVideoProject(videoProject){
    if(!videoProject?.data?.scenes?.length) return;
    if(!canUseFeature(subscription,'video',activeUser?.role,uiSettings.customPlans)){setRequestedView('video');navigateTo('plans');return}
    setSelectedProject({id:`generated-${Date.now()}`,type:'video',name:videoProject.name||'Generiertes Video',data:videoProject.data});
    navigateTo('video');
  }

  if(loading) return <div className="app-loader"><Sparkles/>PIXVA Studio lädt …</div>;
  if(!activeUser) return <Login onLogin={loggedIn} onGuest={enterGuest} allowGuest={uiSettings.allowGuest!==false}/>;

  const uiText={...DEFAULT_UI_SETTINGS.texts,...(uiSettings.texts||{})};
  const uiTheme={...DEFAULT_UI_SETTINGS.theme,...(uiSettings.theme||{})};
  const currentTitle=view==='chat'?uiText.appTitle:(nav.find((item)=>item.id===view)?.label||titles[view]);
  const currentPlan=getPlan(subscription.planId,uiSettings.customPlans);
  const accountCostPromptMode=guest?'all':(uiSettings.costPromptOverrides?.[activeUser.id] || uiSettings.costPromptMode || 'all');

  return <div className={`app-shell ${sidebar?'':'sidebar-collapsed'} ${uiSettings.compactSidebar?'compact-sidebar':''}`} style={{'--sidebar-width':`${Math.max(210,Math.min(360,Number(uiTheme.sidebarWidth||255)))}px`,'--y-blue':uiTheme.accentBlue,'--y-yellow':uiTheme.accentYellow}}>
    <aside className="sidebar">
      <div className="sidebar-brand"><img className="sidebar-logo" src="/pixva-logo.png" alt="PIXVA"/><span className="sr-only">PIXVA</span><button onClick={()=>setSidebar(false)}><PanelLeftClose size={18}/></button></div>
      {uiSettings.showFlyer!==false&&<button className="new-project" onClick={()=>changeView('flyer')}><LayoutTemplate size={18}/>{uiText.newDesign}{!featureAllowed('flyer')&&<LockKeyhole className="nav-lock" size={14}/>}</button>}
      <nav>{nav.map((item)=>{const Icon=item.icon;const locked=!featureAllowed(item.id);return <button key={item.id} className={`${view===item.id?'active':''} ${locked?'locked':''}`} onClick={()=>changeView(item.id)}><Icon size={19}/><span>{item.label}</span>{locked&&<LockKeyhole className="nav-lock" size={14}/>}</button>})}</nav>
      <div className="sidebar-bottom">
        {!guest&&<button className={view==='account'?'active':''} onClick={()=>changeView('account')}><KeyRound size={19}/><span>Mein Konto</span></button>}
        {activeUser.role==='admin'&&<button className={view==='admin'?'active':''} onClick={()=>changeView('admin')}><Settings size={19}/><span>Admin</span></button>}
        <div className="user-box"><div className="user-avatar">{String(activeUser?.username||'PX').slice(0,2).toUpperCase()}</div><div><b>{activeUser?.username||'PIXVA Nutzer'}</b><span>{guest?'Free · Gast':`${currentPlan.name}${activeUser.role==='admin'?' · Admin':''}`}</span></div><button onClick={exit} title={guest?'Anmelden':'Abmelden'}>{guest?<LogIn size={17}/>:<LogOut size={17}/>}</button></div>
      </div>
    </aside>
    {sidebar&&isMobile&&<button className="sidebar-backdrop" aria-label="Menü schließen" onClick={()=>setSidebar(false)}/>} 
    {!sidebar&&<button className="sidebar-open" onClick={()=>setSidebar(true)}><PanelLeftOpen size={20}/></button>}
    <main className="workspace">
      <header className="topbar"><div><button className="mobile-menu" onClick={()=>setSidebar(!sidebar)}><Menu size={19}/></button><h1>{currentTitle}</h1>{selectedProject&&<span className="project-pill">{selectedProject.name}</span>}</div><div className="mode-toggle"><button className={view==='chat'?'active':''} onClick={()=>changeView('chat')}>{uiText.chatTab}</button><button className={view!=='chat'?'active':''} onClick={()=>changeView(workTarget)}>{uiText.workTab}</button></div></header>
      {uiSettings.announcement&&<div className="global-announcement">{uiSettings.announcement}</div>}
      {uiSettings.maintenanceMode&&activeUser.role!=='admin'&&<div className="warning-banner">Wartungshinweis: Einige Funktionen können vorübergehend eingeschränkt sein.</div>}
      {guest&&<div className="guest-banner"><span>Gastmodus: Free-Funktionen funktionieren ohne Anmeldung. Für Cloud-Speicherung und Beta-Abos bitte anmelden.</span><button onClick={exit}>Anmelden</button></div>}
      {activeUser.mustChangePassword&&!guest&&<div className="warning-banner">Das Startpasswort ist noch aktiv. Öffne links „Mein Konto“ und lege dein eigenes Passwort fest.</div>}
      {requestedView&&view==='plans'&&<div className="plan-unlock-banner"><LockKeyhole size={17}/><span>Der Bereich „{titles[requestedView]||requestedView}“ ist in deinem aktuellen Zugang nicht enthalten. Während der Beta kannst du den passenden Zugang kostenlos aktivieren.</span></div>}
      <div className="workspace-content">
        {viewPending&&<div className="view-transition-indicator"><Sparkles size={16}/> Bereich wird geladen …</div>}
        <AppErrorBoundary
          resetKey={`${view}-${selectedProject?.id||'none'}-${viewRetryKey}`}
          onRetry={()=>setViewRetryKey((n)=>n+1)}
          onBackToChat={()=>{setSelectedProject(null);setRequestedView('');navigateTo('chat')}}
        >
          <Suspense fallback={<div className="workspace-loader"><Sparkles/><b>{titles[view]||'PIXVA'} wird geladen …</b><span>Die Oberfläche bleibt aktiv.</span></div>}>
        {view==='chat'&&<Chat key={`chat-${activeUser.id || activeUser.username}`} accountId={activeUser.id || activeUser.username} isGuest={guest} onOpenImageProject={openGeneratedImageProject} onOpenVideoProject={openGeneratedVideoProject} uiText={uiText} subscription={subscription} userRole={activeUser.role} onOpenPlans={()=>changeView('plans')} costPromptMode={accountCostPromptMode} customPlans={uiSettings.customPlans}/>} 
        {view==='flyer'&&featureAllowed('flyer')&&<DesignEditor key={selectedProject?.id||'new-flyer'} mode="flyer" project={selectedProject?.type==='flyer'?selectedProject:null} onSaved={saved} canSave={!guest} subscription={subscription} userRole={activeUser.role} onOpenPlans={()=>changeView('plans')} uiText={uiText} costPromptMode={accountCostPromptMode} customPlans={uiSettings.customPlans}/>} 
        {view==='image'&&featureAllowed('image')&&<DesignEditor key={selectedProject?.id||'new-image'} mode="image" project={selectedProject?.type==='image'?selectedProject:null} onSaved={saved} canSave={!guest} subscription={subscription} userRole={activeUser.role} onOpenPlans={()=>changeView('plans')} uiText={uiText} costPromptMode={accountCostPromptMode} customPlans={uiSettings.customPlans}/>} 
        {view==='video'&&featureAllowed('video')&&<VideoStudio key={selectedProject?.id||'new-video'} project={selectedProject?.type==='video'?selectedProject:null} onSaved={saved} canSave={!guest} subscription={subscription} userRole={activeUser.role} onOpenPlans={()=>changeView('plans')} uiText={uiText} costPromptMode={accountCostPromptMode} customPlans={uiSettings.customPlans}/>} 
        {view==='website'&&featureAllowed('website')&&<WebsiteBuilder key={selectedProject?.id||'new-site'} project={selectedProject?.type==='website'?selectedProject:null} onSaved={saved} canSave={!guest} uiText={uiText}/>} 
        {view==='projects'&&featureAllowed('projects')&&!guest&&<Projects onOpen={openProject} refreshKey={refreshKey} uiText={uiText}/>} 
        {view==='pixva'&&!guest&&<PixvaCenter user={activeUser} onOpenImageProject={openGeneratedImageProject} onOpenVideoProject={openGeneratedVideoProject}/>}
        {view==='plans'&&<Subscriptions user={activeUser} isGuest={guest} subscription={subscription} onSubscriptionChanged={handleSubscriptionChanged} onRequireLogin={exit} uiText={uiText} planPrices={uiSettings.planPrices} betaPlanPrices={uiSettings.betaPlanPrices} customPlans={uiSettings.customPlans} billingSettings={uiSettings}/>} 
        {view==='account'&&!guest&&<AccountSettings user={activeUser} onUserChanged={setUser} subscription={subscription} onSubscriptionChanged={handleSubscriptionChanged} onOpenPlans={()=>changeView('plans')} customPlans={uiSettings.customPlans} planPrices={uiSettings.planPrices} betaPlanPrices={uiSettings.betaPlanPrices}/>} 
        {view==='admin'&&activeUser.role==='admin'&&<Admin user={activeUser} uiSettings={uiSettings} onSettingsChanged={setUiSettings} onOpenView={changeView}/>} 
          </Suspense>
        </AppErrorBoundary>
      </div>
    </main>
  </div>;
}
