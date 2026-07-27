import React,{useEffect,useState} from 'react';
import { supabase } from './supabase';
import AuthPage from './pages/AuthPage';
import PasswordChange from './pages/PasswordChange';
import Layout from './Layout';
import ChatPage from './pages/ChatPage';
import SearchPage from './pages/SearchPage';
import ImagesPage from './pages/ImagesPage';
import EditorPage from './pages/EditorPage';
import VideosPage from './pages/VideosPage';
import FilesPage from './pages/FilesPage';
import PricingPage from './pages/PricingPage';
import AccountPage from './pages/AccountPage';
import AdminPage from './pages/AdminPage';

export default function App(){const [session,setSession]=useState(null);const [profile,setProfile]=useState(null);const [page,setPage]=useState('chat');const [editorAsset,setEditorAsset]=useState(null);const [loading,setLoading]=useState(true);async function loadProfile(s){if(!s){setProfile(null);return}const {data,error}=await supabase.from('profiles').select('*').eq('id',s.user.id).single();if(!error)setProfile(data)}useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);loadProfile(data.session).finally(()=>setLoading(false))});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);loadProfile(s);setLoading(false)});return()=>subscription.unsubscribe()},[]);useEffect(()=>{const q=new URLSearchParams(location.search);if(q.get('paypal')==='capture'&&q.get('token')&&session){import('./api').then(async({api})=>{try{await api(`/api/billing/paypal-capture?orderId=${encodeURIComponent(q.get('token'))}`,{method:'POST',body:'{}'});alert('PayPal-Zahlung erfolgreich.')}catch(e){alert(e.message)}history.replaceState({},'',location.pathname)})}},[session]);if(loading)return <div className="splash">Yildiz AI wird geladen…</div>;if(!session)return <AuthPage/>;const props={profile,setPage};let content;if(page==='chat')content=<ChatPage/>;else if(page==='search')content=<SearchPage onEdit={a=>{setEditorAsset(a);setPage('editor')}}/>;else if(page==='images')content=<ImagesPage onEdit={a=>{setEditorAsset(a);setPage('editor')}}/>;else if(page==='editor')content=<EditorPage initialAsset={editorAsset}/>;else if(page==='videos')content=<VideosPage/>;else if(page==='files')content=<FilesPage/>;else if(page==='pricing')content=<PricingPage/>;else if(page==='account')content=<AccountPage profile={profile} refresh={()=>loadProfile(session)}/>;else if(page==='admin'&&profile?.role==='admin')content=<AdminPage/>;else content=<ChatPage/>;return <><Layout page={page} setPage={setPage} profile={profile}>{content}</Layout><PasswordChange open={Boolean(profile?.must_change_password)} onDone={()=>loadProfile(session)}/></>}
