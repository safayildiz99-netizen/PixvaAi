import { useEffect, useRef, useState } from 'react';
import {
  Bell, BookOpen, Bot, Boxes, BrainCircuit, CheckCircle2, Cloud, Database, Download,
  FileCheck2, FileUp, Instagram, KeyRound, Languages, LoaderCircle, MemoryStick, Mic, PackagePlus, Play,
  RefreshCw, RotateCcw, Save, Search, ShieldCheck, Sparkles, SquareStack, Trash2, UsersRound,
  Upload, Volume2, WandSparkles
} from 'lucide-react';
import { api } from '../api.js';
import { supabase } from '../supabase.js';
import './PixvaCenter.css';

const TABS=[
  ['agent','Agent',BrainCircuit],['products','Produkte',Boxes],['knowledge','Wissen',BookOpen],
  ['brand','Brand & Memory',MemoryStick],['tools','Prüfen & Übersetzen',FileCheck2],
  ['security','Sicherheit & Daten',ShieldCheck],['team','Team & Freigaben',UsersRound],['integrations','Integrationen',Instagram],['status','Status',Database]
];
const emptyBrand={company_name:'',logo_path:'',primary_color:'#7258ff',secondary_color:'#39d6d0',font_family:'Inter',address:'',opening_hours:'',instagram:'',language:'de',design_style:'modern-premium',notes:''};
const emptyProduct={ean:'',name:'',brand:'',weight:'',category:'',normal_price:'',offer_price:'',image_url:'',notes:''};
const fmtDate=v=>{try{return new Date(v).toLocaleString('de-DE')}catch{return''}};
const money=v=>v===null||v===undefined||v===''?'—':`${Number(v).toFixed(2).replace('.',',')} €`;

export default function PixvaCenter({user,onOpenImageProject,onOpenVideoProject}){
  const [tab,setTab]=useState('agent'),[data,setData]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState('');
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const [agentPrompt,setAgentPrompt]=useState(''),[agentWeb,setAgentWeb]=useState(false),[agentRun,setAgentRun]=useState(null),[agentResults,setAgentResults]=useState({});
  const [product,setProduct]=useState(emptyProduct),[brand,setBrand]=useState(emptyBrand),[memory,setMemory]=useState({category:'company',title:'',content:''});
  const [knowledgeQuestion,setKnowledgeQuestion]=useState(''),[knowledgeAnswer,setKnowledgeAnswer]=useState(null);
  const [webQuery,setWebQuery]=useState(''),[webAnswer,setWebAnswer]=useState(null);
  const [translate,setTranslate]=useState({text:'',target:'Türkisch'}),[translation,setTranslation]=useState('');
  const [flyerCheck,setFlyerCheck]=useState(null),[recoveryCodes,setRecoveryCodes]=useState([]),[deleteForm,setDeleteForm]=useState({password:'',confirmation:''}),[status,setStatus]=useState(null);
  const [securityState,setSecurityState]=useState(null),[twofaSetup,setTwofaSetup]=useState(null),[twofaCode,setTwofaCode]=useState('');
  const [email,setEmail]=useState(''),[team,setTeam]=useState(null),[instagram,setInstagram]=useState(null);
  const emptyAccount={username:'',password:'',firstName:'',lastName:'',email:'',phone:'',birthDate:'',role:'user',teamRole:'member'};
  const [newAccount,setNewAccount]=useState(emptyAccount);
  const [instagramForm,setInstagramForm]=useState({accountId:'',displayName:'',accessToken:'',caption:''}),[approvalForm,setApprovalForm]=useState({projectId:'',title:'',note:''});
  const productPhoto=useRef(null),instagramFile=useRef(null);
  const prevUnread=useRef(new Set()),productFile=useRef(null),knowledgeFile=useRef(null),flyerFile=useRef(null),brandLogoFile=useRef(null);

  async function load(silent=false){
    if(!silent)setLoading(true);
    try{
      const result=await api('/api/pixva?action=overview');setData(result);setBrand({...emptyBrand,...(result.brand||{})});
      setAgentRun(prev=>{if(!prev?.run?.id)return prev;const fresh=(result.runs||[]).find(r=>r.id===prev.run.id);return fresh?{...prev,run:fresh,plan:fresh.plan||prev.plan}:prev});
      const unread=(result.notifications||[]).filter(n=>!n.read_at);
      if('Notification'in window&&Notification.permission==='granted'){
        for(const n of unread)if(!prevUnread.current.has(n.id))new Notification(`PIXVA · ${n.title}`,{body:n.message||''});
      }
      prevUnread.current=new Set(unread.map(n=>n.id));
    }catch(e){setError(e.message)}finally{if(!silent)setLoading(false)}
  }
  useEffect(()=>{load();const timer=setInterval(()=>load(true),30000);return()=>clearInterval(timer)},[]);

  const products=data?.products||[],files=data?.files||[],memories=data?.memories||[],notifications=data?.notifications||[];
  const versions=data?.versions||[],snapshots=data?.snapshots||[],jobs=data?.jobs||[],runs=data?.runs||[];

  function resetFeedback(){setMessage('');setError('')}
  async function call(action,body={}){
    resetFeedback();setBusy(action);
    try{return await api(`/api/pixva?action=${encodeURIComponent(action)}`,{method:'POST',body:JSON.stringify(body)})}
    catch(e){setError(e.message);throw e}finally{setBusy('')}
  }
  async function privateUpload(file,purpose='knowledge'){
    if(!file)throw new Error('Datei fehlt.');
    const ticket=await call('upload-ticket',{name:file.name,type:file.type||'application/octet-stream',size:file.size,purpose});
    if(!supabase)throw new Error('Supabase ist im Browser nicht verbunden.');
    const {error:uploadError}=await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path,ticket.token,file,{contentType:file.type||'application/octet-stream'});
    if(uploadError)throw new Error(uploadError.message||'Upload fehlgeschlagen.');
    return ticket;
  }

  async function saveBrand(){try{const r=await call('brand-save',brand);setBrand({...emptyBrand,...r.brand});setMessage('Brand Kit gespeichert.');await load(true)}catch{}}
  async function uploadBrandLogo(){const file=brandLogoFile.current?.files?.[0];if(!file)return;try{const ticket=await privateUpload(file,'brand-logo');const next={...brand,logo_path:ticket.path};setBrand(next);await call('brand-save',next);setMessage('Kundenlogo privat gespeichert.');await load(true)}catch{}finally{if(brandLogoFile.current)brandLogoFile.current.value=''}}
  async function saveMemory(){try{await call('memory-save',memory);setMemory({category:'company',title:'',content:''});setMessage('Memory gespeichert.');await load(true)}catch{}}
  async function deleteMemory(id){if(!confirm('Memory wirklich löschen?'))return;try{await call('memory-delete',{id});await load(true)}catch{}}
  async function saveProduct(){try{await call('product-save',product);setProduct(emptyProduct);setMessage('Produkt gespeichert.');await load(true)}catch{}}
  async function deleteProduct(id){if(!confirm('Produkt wirklich löschen?'))return;try{await call('product-delete',{id});await load(true)}catch{}}
  async function importProducts(){const file=productFile.current?.files?.[0];if(!file)return;try{const t=await privateUpload(file,'product-import');const r=await call('products-import',{storagePath:t.path,replace:false});setMessage(`${r.imported} Produkte importiert.`);await load(true)}catch{}finally{if(productFile.current)productFile.current.value=''}}
  async function lookupEan(){if(!product.ean.trim())return setError('EAN eingeben.');try{const r=await call('product-ean-lookup',{ean:product.ean});setProduct({...emptyProduct,...r.product});setMessage('Produktdaten zur EAN gefunden. Bitte vor dem Speichern prüfen.')}catch{}}
  async function recognizeProductPhoto(){const file=productPhoto.current?.files?.[0];if(!file)return;try{const t=await privateUpload(file,'product-photo');const r=await call('product-photo-recognize',{storagePath:t.path,mimeType:file.type||'image/jpeg'});setProduct(v=>({...v,...r.product}));setMessage('Produkt aus Foto erkannt. Bitte Daten prüfen.')}catch{}finally{if(productPhoto.current)productPhoto.current.value=''}}
  async function addKnowledge(){const file=knowledgeFile.current?.files?.[0];if(!file)return;try{const t=await privateUpload(file,'knowledge');const r=await call('knowledge-finalize',{storagePath:t.path,originalName:file.name,mimeType:file.type||'text/plain'});setMessage(`${file.name}: ${r.chunks} Wissensabschnitte gespeichert.`);await load(true)}catch{}finally{if(knowledgeFile.current)knowledgeFile.current.value=''}}
  async function deleteKnowledge(id){if(!confirm('Datei aus der Wissensbasis löschen?'))return;try{await call('knowledge-delete',{id});await load(true)}catch{}}
  async function askKnowledge(){if(!knowledgeQuestion.trim())return;try{setKnowledgeAnswer(await call('knowledge-ask',{question:knowledgeQuestion}))}catch{}}
  async function searchWeb(){if(!webQuery.trim())return;try{setWebAnswer(await call('web-search',{query:webQuery}))}catch{}}
  async function doTranslate(){if(!translate.text.trim())return;try{const r=await call('translate',translate);setTranslation(r.translation)}catch{}}
  async function checkFlyer(){const file=flyerFile.current?.files?.[0];if(!file)return;try{const t=await privateUpload(file,'flyer-check');const r=await call('flyer-check',{storagePath:t.path,mimeType:file.type||'image/png'});setFlyerCheck(r.check)}catch{}finally{if(flyerFile.current)flyerFile.current.value=''}}

  function startVoice(setter){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){setError('Spracheingabe wird von diesem Browser nicht unterstützt.');return}
    const rec=new SR();rec.lang='de-DE';rec.interimResults=false;rec.maxAlternatives=1;rec.onresult=e=>setter(e.results?.[0]?.[0]?.transcript||'');rec.onerror=e=>setError(`Spracheingabe: ${e.error||'Fehler'}`);rec.start();
  }
  function speak(text){
    if(!('speechSynthesis'in window)){setError('Vorlesen wird von diesem Browser nicht unterstützt.');return}
    speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text||''));u.lang='de-DE';speechSynthesis.speak(u);
  }

  async function planAgent(){if(!agentPrompt.trim())return;try{const r=await call('agent-plan',{prompt:agentPrompt,webSearch:agentWeb});setAgentRun(r);setAgentResults({});const paidMedia=(r.plan?.tasks||[]).some(t=>t.type==='image'||t.type==='video');if(paidMedia&&!window.confirm('Kostenhinweis: Dieser Agent-Auftrag enthält echte Bild- oder Video-KI und kann API-Guthaben verbrauchen. Automatisch starten?')){setMessage('Plan erstellt. Kostenpflichtige Medien wurden nicht automatisch gestartet.');return}await call('agent-start',{runId:r.run.id,allowPaidMedia:paidMedia});setMessage('PIXVA Agent arbeitet automatisch im Hintergrund weiter.')}catch{}}
  async function recordAgentResult(runId,result){try{await api('/api/pixva?action=agent-result',{method:'POST',body:JSON.stringify({runId,result})})}catch{}}
  async function executeTask(task){
    if(!agentRun?.run?.id)return;const id=task.id||`task-${Date.now()}`;setAgentResults(o=>({...o,[id]:{status:'running'}}));
    try{
      let result;
      if(task.type==='image'){
        const r=await api('/api/ai/image',{method:'POST',body:JSON.stringify({prompt:task.prompt,aspect:task.aspect||'post',style:'poster'})});
        result={type:'image',taskId:id,title:task.title,image:r.imageDataUrl||r.imageUrl||r.url,provider:r.provider||''};
      }else if(task.type==='video'){
        const r=await api('/api/ai/video?action=create',{method:'POST',body:JSON.stringify({prompt:task.prompt,aspect:task.aspect||'portrait',seconds:String(task.seconds||4),requestId:crypto.randomUUID()})});
        result={type:'video',taskId:id,title:task.title,videoId:r.id||'',requestId:r.requestId||'',status:r.status||'queued'};
      }else if(task.type==='translation'){
        const r=await api('/api/pixva?action=translate',{method:'POST',body:JSON.stringify({text:task.prompt,target:task.target||'Deutsch'})});
        result={type:'text',taskId:id,title:task.title,text:r.translation};
      }else{
        const r=await api('/api/pixva?action=text-generate',{method:'POST',body:JSON.stringify({prompt:task.prompt})});
        result={type:'text',taskId:id,title:task.title,text:r.text};
      }
      setAgentResults(o=>({...o,[id]:{status:'done',...result}}));await recordAgentResult(agentRun.run.id,result);
    }catch(e){const result={type:task.type,taskId:id,title:task.title,error:e.message};setAgentResults(o=>({...o,[id]:{status:'failed',...result}}));await recordAgentResult(agentRun.run.id,result)}
  }
  async function executeAll(){for(const task of agentRun?.plan?.tasks||[])await executeTask(task);await load(true)}
  function openAgentImage(r){if(r?.image)onOpenImageProject?.({name:r.title||'PIXVA Agent Bild',data:{initialImage:r.image,format:'post'}})}
  function openAgentVideo(r){onOpenVideoProject?.({name:r.title||'PIXVA Agent Video',data:{scenes:[{id:crypto.randomUUID(),title:r.title||'PIXVA Video',prompt:'',duration:4,url:'',status:r.status||''}]}})}

  async function generateRecovery(){try{const r=await call('recovery-generate');setRecoveryCodes(r.codes||[]);setMessage(r.message)}catch{}}
  async function endSessions(){try{const r=await call('sessions-end');setMessage(`${r.ended||0} andere Sitzung(en) beendet.`)}catch{}}
  async function snapshotCreate(){try{await call('snapshot-create',{});setMessage('Sicherung erstellt.');await load(true)}catch{}}
  async function snapshotRestore(id){if(!confirm('Brand Kit, Memory, Produkte, Projekte und Chats auf diese Sicherung zurücksetzen?'))return;try{await call('snapshot-restore',{id,confirm:'WIEDERHERSTELLEN'});setMessage('Sicherung wiederhergestellt.');await load(true)}catch{}}
  async function exportData(){resetFeedback();setBusy('export');try{const r=await api('/api/pixva?action=export-data');const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`PIXVA-Daten-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url)}catch(e){setError(e.message)}finally{setBusy('')}}
  async function deleteAccount(){if(!confirm('Konto und alle damit verknüpften PIXVA-Daten wirklich dauerhaft löschen?'))return;try{await call('delete-account',deleteForm);localStorage.removeItem('yildiz_ai_token');location.reload()}catch{}}
  async function restoreVersion(id){if(!confirm('Projekt auf diese Version zurücksetzen?'))return;try{await call('project-version-restore',{id});setMessage('Projektversion wiederhergestellt.');await load(true)}catch{}}
  async function readNotifications(){try{await call('notification-read',{});await load(true)}catch{}}
  async function loadStatus(deep=false){resetFeedback();setBusy('status');try{setStatus(await api(`/api/pixva?action=status${deep?'&deep=1':''}`))}catch(e){setError(e.message)}finally{setBusy('')}}
  async function allowNotifications(){if(!('Notification'in window))return setError('Browser-Benachrichtigungen werden hier nicht unterstützt.');const r=await Notification.requestPermission();setMessage(r==='granted'?'Browser-Benachrichtigungen aktiviert.':'Benachrichtigungen wurden nicht freigegeben.')}

  async function loadSecurity(){try{const r=await api('/api/pixva?action=security-state');setSecurityState(r);setEmail(r.email||'')}catch(e){setError(e.message)}}
  async function setup2fa(){try{const r=await call('2fa-setup');setTwofaSetup(r);setMessage('QR-Code scannen und 6-stelligen Code bestätigen.')}catch{}}
  async function confirm2fa(){try{await call('2fa-confirm',{code:twofaCode});setTwofaSetup(null);setTwofaCode('');setMessage('2FA ist aktiviert.');await loadSecurity()}catch{}}
  async function disable2fa(){if(!twofaCode)return setError('Aktuellen 2FA-Code eingeben.');try{await call('2fa-disable',{code:twofaCode});setTwofaCode('');setMessage('2FA deaktiviert.');await loadSecurity()}catch{}}
  async function saveEmail(){try{await call('profile-email-save',{email});setMessage('E-Mail gespeichert.');await loadSecurity()}catch{}}
  async function loadTeam(){if(user.role!=='admin')return;try{setTeam(await api('/api/pixva?action=team-list'))}catch(e){setError(e.message)}}
  async function createAccount(){
    if(!newAccount.username.trim())return setError('Benutzername fehlt.');
    if(newAccount.password.length<8)return setError('Passwort braucht mindestens 8 Zeichen.');
    try{
      await call('team-create',newAccount);
      setNewAccount(emptyAccount);
      setMessage('Konto erfolgreich erstellt.');
      await loadTeam();
    }catch{}
  }
  async function changeTeamRole(target,teamRole){try{await call('team-update',{userId:target.id,teamRole,email:target.email||''});setMessage('Team-Rolle gespeichert.');await loadTeam()}catch{}}
  async function reviewApproval(id,status){try{await call('approval-update',{id,status});setMessage(status==='approved'?'Freigegeben.':'Abgelehnt.');await loadTeam()}catch{}}
  async function requestApproval(){if(!approvalForm.projectId)return setError('Projekt-ID fehlt.');try{await call('approval-create',approvalForm);setApprovalForm({projectId:'',title:'',note:''});setMessage('Freigabe angefordert.')}catch{}}
  async function loadInstagram(){try{setInstagram(await api('/api/pixva?action=instagram-status'))}catch(e){setError(e.message)}}
  async function connectInstagram(){try{await call('instagram-save',instagramForm);setInstagramForm(v=>({...v,accessToken:''}));setMessage('Instagram-Verbindung gespeichert.');await loadInstagram()}catch{}}
  async function disconnectInstagram(){if(!confirm('Instagram-Verbindung trennen?'))return;try{await call('instagram-disconnect',{});setMessage('Instagram getrennt.');await loadInstagram()}catch{}}
  async function publishInstagram(){const file=instagramFile.current?.files?.[0];if(!file)return setError('Bitte zuerst ein Bild auswählen.');try{const t=await privateUpload(file,'instagram');const r=await call('instagram-publish',{storagePath:t.path,caption:instagramForm.caption});setMessage(`Instagram veröffentlicht · Media ID ${r.mediaId}`)}catch{}finally{if(instagramFile.current)instagramFile.current.value=''}}
  useEffect(()=>{if(tab==='security')loadSecurity();if(tab==='team')loadTeam();if(tab==='integrations')loadInstagram()},[tab]);

  if(loading)return <div className="pixva-center-loading"><LoaderCircle className="spin"/>PIXVA Hub wird geladen …</div>;

  return <section className="pixva-center">
    <div className="pixva-hub-head"><div><span className="pixva-kicker">PIXVA INTELLIGENCE</span><h2>PIXVA KI-Zentrale</h2><p>Agent, Produktdaten, Wissen, Brand Memory, Prüfung, Übersetzung, Sicherheit und Systemstatus.</p></div><button onClick={()=>load()}><RefreshCw size={16}/>Aktualisieren</button></div>
    {(message||error)&&<div className={`pixva-feedback ${error?'error':''}`}>{error||message}</div>}
    <div className="pixva-tabs">{TABS.map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={17}/>{label}</button>)}</div>

    {tab==='agent'&&<div className="pixva-grid two">
      <article className="pixva-card">
        <div className="pixva-card-title"><Bot/><div><h3>PIXVA Agent</h3><p>Ein Auftrag → mehrere Arbeitsschritte.</p></div></div>
        <textarea rows={8} value={agentPrompt} onChange={e=>setAgentPrompt(e.target.value)} placeholder="z. B. Erstelle aus meinen Angebotsprodukten einen 4:5 Post, eine Story und einen Flyer …"/>
        <div className="pixva-inline"><button onClick={()=>startVoice(setAgentPrompt)}><Mic size={16}/>Diktieren</button><label className="pixva-check"><input type="checkbox" checked={agentWeb} onChange={e=>setAgentWeb(e.target.checked)}/>Aktuelle Websuche</label></div>
        <button className="pixva-primary" onClick={planAgent} disabled={busy==='agent-plan'||!agentPrompt.trim()}>{busy==='agent-plan'?<LoaderCircle className="spin"/>:<Sparkles/>}Auftrag planen</button>
        {runs.length>0&&<div className="pixva-mini-list"><b>Letzte Agent-Aufträge</b>{runs.slice(0,5).map(r=><span key={r.id}>{r.status} · {String(r.prompt).slice(0,80)}</span>)}</div>}
      </article>
      <article className="pixva-card">
        <div className="pixva-card-title"><Play/><div><h3>Ausführung</h3><p>{agentRun?.plan?.summary||'Noch kein Auftrag geplant.'}</p></div></div>
        {agentRun?.plan?.tasks?.length>0&&<div className="pixva-background-note">Automatische Ausführung: <b>{agentRun?.run?.status||'running'}</b> · Du kannst PIXVA weiter benutzen.</div>}
        <div className="pixva-task-list">{(agentRun?.plan?.tasks||[]).map(task=>{const r=agentResults[task.id]||(agentRun?.run?.results||[]).find(x=>x.taskId===task.id);return <div className="pixva-task" key={task.id}><div><b>{task.title}</b><span>{task.type} · {task.aspect||''}</span></div><button onClick={()=>executeTask(task)} disabled={r?.status==='running'}>{r?.status==='running'?<LoaderCircle className="spin"/>:<Play size={15}/>}</button>
          {r?.image&&<div className="pixva-result"><img src={r.image}/><button onClick={()=>openAgentImage(r)}>Im Editor öffnen</button></div>}
          {r?.videoId&&<div className="pixva-result"><small>Videoauftrag: {r.videoId} · {r.status}</small><button onClick={()=>openAgentVideo(r)}>Video-Studio öffnen</button></div>}
          {r?.text&&<div className="pixva-result"><p>{r.text}</p><button onClick={()=>speak(r.text)}><Volume2 size={14}/>Vorlesen</button></div>}
          {r?.error&&<small className="bad">{r.error}</small>}
        </div>})}</div>
      </article>
    </div>}

    {tab==='products'&&<div className="pixva-grid two">
      <article className="pixva-card"><div className="pixva-card-title"><PackagePlus/><div><h3>Produktdatenbank</h3><p>EAN, Name, Marke, Gewicht und Preise.</p></div></div>
        <div className="pixva-form-grid">
          <label>EAN<input value={product.ean} onChange={e=>setProduct({...product,ean:e.target.value})}/><button type="button" onClick={lookupEan}>EAN online abrufen</button></label><label>Produktname<input value={product.name} onChange={e=>setProduct({...product,name:e.target.value})}/></label>
          <label>Marke<input value={product.brand} onChange={e=>setProduct({...product,brand:e.target.value})}/></label><label>Gewicht/Inhalt<input value={product.weight} onChange={e=>setProduct({...product,weight:e.target.value})}/></label>
          <label>Kategorie<input value={product.category} onChange={e=>setProduct({...product,category:e.target.value})}/></label><label>Normalpreis<input value={product.normal_price} onChange={e=>setProduct({...product,normal_price:e.target.value})}/></label>
          <label>Angebotspreis<input value={product.offer_price} onChange={e=>setProduct({...product,offer_price:e.target.value})}/></label><label>Bild-URL<input value={product.image_url} onChange={e=>setProduct({...product,image_url:e.target.value})}/></label>
        </div><label>Notiz<textarea rows={2} value={product.notes} onChange={e=>setProduct({...product,notes:e.target.value})}/></label>
        <button className="pixva-primary" onClick={saveProduct}><Save size={16}/>Produkt speichern</button><hr/>
        <label className="pixva-upload"><Upload/>Excel/CSV importieren<input ref={productFile} type="file" accept=".xlsx,.xls,.csv" onChange={importProducts}/></label><label className="pixva-upload"><Upload/>Produktfoto erkennen<input ref={productPhoto} type="file" accept="image/png,image/jpeg,image/webp" onChange={recognizeProductPhoto}/></label>
      </article>
      <article className="pixva-card"><h3>{products.length} Produkte</h3><div className="pixva-table">{products.map(p=><div className="pixva-row" key={p.id}><div><b>{p.name}</b><span>{[p.brand,p.weight,p.ean].filter(Boolean).join(' · ')}</span><small>{money(p.normal_price)} → <strong>{money(p.offer_price)}</strong></small></div><button onClick={()=>deleteProduct(p.id)}><Trash2 size={15}/></button></div>)}</div></article>
    </div>}

    {tab==='knowledge'&&<div className="pixva-grid two">
      <article className="pixva-card"><div className="pixva-card-title"><Cloud/><div><h3>Private Wissensbasis</h3><p>PDF, Word, Excel, CSV, Text oder Bilder.</p></div></div>
        <label className="pixva-upload"><FileUp/>Datei hochladen & analysieren<input ref={knowledgeFile} type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json,.html,.png,.jpg,.jpeg,.webp" onChange={addKnowledge}/></label>
        <div className="pixva-table">{files.map(f=><div className="pixva-row" key={f.id}><div><b>{f.original_name}</b><span>{f.status} · {(Number(f.size_bytes||0)/1024).toFixed(1)} KB</span></div><button onClick={()=>deleteKnowledge(f.id)}><Trash2 size={15}/></button></div>)}</div>
      </article>
      <article className="pixva-card"><h3>Mit eigenen Dateien sprechen</h3><textarea rows={5} value={knowledgeQuestion} onChange={e=>setKnowledgeQuestion(e.target.value)} placeholder="Was steht in meiner Preisliste? Welche Produkte fehlen? …"/>
        <button className="pixva-primary" onClick={askKnowledge}><Search size={16}/>Wissen durchsuchen</button>
        {knowledgeAnswer&&<div className="pixva-answer"><button onClick={()=>speak(knowledgeAnswer.answer)}><Volume2 size={14}/>Vorlesen</button><p>{knowledgeAnswer.answer}</p><small>{knowledgeAnswer.sources?.map(s=>`[${s.index}] ${s.file}`).join(' · ')}</small></div>}
      </article>
    </div>}

    {tab==='brand'&&<div className="pixva-grid two">
      <article className="pixva-card"><div className="pixva-card-title"><WandSparkles/><div><h3>Brand Kit</h3><p>PIXVA nutzt diese Daten für deine Designs.</p></div></div>
        <div className="pixva-form-grid"><label>Firmenname<input value={brand.company_name} onChange={e=>setBrand({...brand,company_name:e.target.value})}/></label>
          <label>Sprache<select value={brand.language} onChange={e=>setBrand({...brand,language:e.target.value})}><option value="de">Deutsch</option><option value="tr">Türkisch</option><option value="en">Englisch</option><option value="ar">Arabisch</option></select></label>
          <label>Primärfarbe<input type="color" value={brand.primary_color} onChange={e=>setBrand({...brand,primary_color:e.target.value})}/></label><label>Sekundärfarbe<input type="color" value={brand.secondary_color} onChange={e=>setBrand({...brand,secondary_color:e.target.value})}/></label>
          <label>Schrift<input value={brand.font_family} onChange={e=>setBrand({...brand,font_family:e.target.value})}/></label><label>Designstil<input value={brand.design_style} onChange={e=>setBrand({...brand,design_style:e.target.value})}/></label>
          <label>Instagram<input value={brand.instagram} onChange={e=>setBrand({...brand,instagram:e.target.value})}/></label><label>Adresse<input value={brand.address} onChange={e=>setBrand({...brand,address:e.target.value})}/></label>
        </div><label>Öffnungszeiten<textarea rows={2} value={brand.opening_hours} onChange={e=>setBrand({...brand,opening_hours:e.target.value})}/></label><label>Brand-Notizen<textarea rows={3} value={brand.notes} onChange={e=>setBrand({...brand,notes:e.target.value})}/></label>
        <div className="pixva-inline"><button className="pixva-primary" onClick={saveBrand}><Save size={16}/>Brand Kit speichern</button><label className="pixva-upload compact"><Upload size={15}/>Kundenlogo<input ref={brandLogoFile} type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadBrandLogo}/></label></div>
      </article>
      <article className="pixva-card"><h3>PIXVA Memory</h3><div className="pixva-form-grid"><label>Kategorie<select value={memory.category} onChange={e=>setMemory({...memory,category:e.target.value})}><option value="company">Firma</option><option value="design">Designstil</option><option value="product">Produkte</option><option value="language">Sprache</option><option value="workflow">Arbeitsweise</option><option value="general">Allgemein</option></select></label><label>Titel<input value={memory.title} onChange={e=>setMemory({...memory,title:e.target.value})}/></label></div>
        <label>Was soll PIXVA dauerhaft wissen?<textarea rows={4} value={memory.content} onChange={e=>setMemory({...memory,content:e.target.value})}/></label><button className="pixva-primary" onClick={saveMemory}><MemoryStick size={16}/>Merken</button>
        <div className="pixva-table">{memories.map(m=><div className="pixva-row" key={m.id}><div><b>{m.title}</b><span>{m.category}</span><small>{m.content}</small></div><button onClick={()=>deleteMemory(m.id)}><Trash2 size={15}/></button></div>)}</div>
      </article>
    </div>}

    {tab==='tools'&&<div className="pixva-grid two">
      <article className="pixva-card"><h3>Flyer-Prüfer</h3><p>Prüft Preise, Namen, Gewichte, Logo, Lesbarkeit und Tippfehler gegen deine Produktdaten.</p><label className="pixva-upload"><FileCheck2/>Flyer/Bild prüfen<input ref={flyerFile} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={checkFlyer}/></label>
        {flyerCheck&&<div className={`pixva-score ${flyerCheck.passed?'good':'warn'}`}><strong>{flyerCheck.score}/100</strong><p>{flyerCheck.summary}</p>{(flyerCheck.issues||[]).map((i,n)=><div className="pixva-issue" key={n}><b>{i.severity} · {i.field}</b><span>{i.message}</span>{i.expected&&<small>Erwartet: {i.expected}</small>}</div>)}</div>}
      </article>
      <article className="pixva-card"><h3>Übersetzen</h3><textarea rows={5} value={translate.text} onChange={e=>setTranslate({...translate,text:e.target.value})}/><div className="pixva-inline"><select value={translate.target} onChange={e=>setTranslate({...translate,target:e.target.value})}><option>Deutsch</option><option>Türkisch</option><option>Englisch</option><option>Arabisch</option><option>Italienisch</option><option>Französisch</option></select><button onClick={()=>startVoice(v=>setTranslate({...translate,text:v}))}><Mic size={15}/></button></div><button className="pixva-primary" onClick={doTranslate}><Languages size={16}/>Übersetzen</button>
        {translation&&<div className="pixva-answer"><button onClick={()=>speak(translation)}><Volume2 size={14}/>Vorlesen</button><p>{translation}</p></div>}
        <hr/><h3>Aktuelle Websuche mit Quellen</h3><textarea rows={3} value={webQuery} onChange={e=>setWebQuery(e.target.value)}/><button className="pixva-primary" onClick={searchWeb}><Search size={16}/>Web durchsuchen</button>
        {webAnswer&&<div className="pixva-answer"><button onClick={()=>speak(webAnswer.answer)}><Volume2 size={14}/>Vorlesen</button><p>{webAnswer.answer}</p><div className="pixva-sources">{(webAnswer.sources||[]).map((s,i)=><a href={s.url} target="_blank" rel="noreferrer" key={i}>{s.title}</a>)}</div></div>}
      </article>
    </div>}

    {tab==='security'&&<div className="pixva-grid two">
      <article className="pixva-card"><h3>Konto-Sicherheit</h3>
        <div className="pixva-status-grid"><div><span>2FA</span><b className={securityState?.twoFactorEnabled?'ok':'warn'}>{securityState?.twoFactorEnabled?'AKTIV':'AUS'}</b></div><div><span>E-Mail</span><b className={securityState?.emailConfigured?'ok':'warn'}>{securityState?.emailConfigured?'BEREIT':'OPTIONAL'}</b></div></div>
        <label>Recovery-E-Mail<input value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@firma.de"/></label><button onClick={saveEmail}><Save size={15}/>E-Mail speichern</button>
        {!securityState?.twoFactorEnabled&&<button className="pixva-primary" onClick={setup2fa}><KeyRound size={16}/>2FA aktivieren</button>}
        {twofaSetup&&<div className="pixva-answer"><img src={twofaSetup.qrDataUrl} alt="PIXVA 2FA QR" style={{width:220,maxWidth:'100%',background:'white',padding:8,borderRadius:12}}/><p>Secret: <code>{twofaSetup.secret}</code></p><input value={twofaCode} onChange={e=>setTwofaCode(e.target.value)} placeholder="6-stelliger Code"/><button className="pixva-primary" onClick={confirm2fa}>2FA bestätigen</button></div>}
        {securityState?.twoFactorEnabled&&<div className="pixva-inline"><input value={twofaCode} onChange={e=>setTwofaCode(e.target.value)} placeholder="Aktueller 2FA-Code"/><button onClick={disable2fa}>2FA deaktivieren</button></div>}
        <button className="pixva-primary" onClick={generateRecovery}><ShieldCheck size={16}/>Neue Wiederherstellungscodes erzeugen</button>
        {recoveryCodes.length>0&&<div className="pixva-codes">{recoveryCodes.map(c=><code key={c}>{c}</code>)}</div>}
        <a className="pixva-link" href="/pixva-recovery.html" target="_blank" rel="noreferrer">Wiederherstellungsseite öffnen</a>
        <button onClick={endSessions}><ShieldCheck size={16}/>Alle anderen Sitzungen beenden</button><button onClick={allowNotifications}><Bell size={16}/>Browser-Benachrichtigungen aktivieren</button>
        <div className="pixva-notices"><b>{notifications.filter(n=>!n.read_at).length} ungelesene Benachrichtigungen</b><button onClick={readNotifications}>Alle gelesen</button>{notifications.slice(0,8).map(n=><span key={n.id}>{n.title} · {fmtDate(n.created_at)}</span>)}</div>
      </article>
      <article className="pixva-card"><h3>Sicherungen & Daten</h3><div className="pixva-inline"><button className="pixva-primary" onClick={snapshotCreate}><SquareStack size={16}/>Sicherung erstellen</button><button onClick={exportData}><Download size={16}/>Daten exportieren</button></div>
        <div className="pixva-table">{snapshots.map(s=><div className="pixva-row" key={s.id}><div><b>{s.label}</b><span>{fmtDate(s.created_at)}</span></div><button onClick={()=>snapshotRestore(s.id)}><RotateCcw size={15}/></button></div>)}</div>
        <hr/><h3>Projektversionen</h3><div className="pixva-table compact-table">{versions.slice(0,20).map(v=><div className="pixva-row" key={v.id}><div><b>{v.name}</b><span>Version {v.version_no} · {fmtDate(v.created_at)}</span></div><button onClick={()=>restoreVersion(v.id)}><RotateCcw size={15}/></button></div>)}</div>
        <hr/><details className="pixva-danger"><summary>Konto dauerhaft löschen</summary><p>Alle mit dem Konto verknüpften Daten werden gelöscht. Das letzte Admin-Konto ist geschützt.</p><input type="password" placeholder="Passwort" value={deleteForm.password} onChange={e=>setDeleteForm({...deleteForm,password:e.target.value})}/><input placeholder={`Benutzername exakt: ${user.username}`} value={deleteForm.confirmation} onChange={e=>setDeleteForm({...deleteForm,confirmation:e.target.value})}/><button onClick={deleteAccount}><Trash2 size={15}/>Konto endgültig löschen</button></details>
      </article>
    </div>}

    {tab==='team'&&<div className="pixva-grid two">
      <article className="pixva-card">
        <h3>Neues Konto erstellen</h3>
        {user.role!=='admin'?<p>Nur Admins können neue Konten erstellen.</p>:<>
          <p>Nur Benutzername und Passwort sind Pflicht. E-Mail, Telefon und Geburtsdatum sind optional.</p>
          <div className="pixva-form-grid">
            <label>Benutzername *<input value={newAccount.username} onChange={e=>setNewAccount({...newAccount,username:e.target.value})} placeholder="z. B. max.mustermann"/></label>
            <label>Passwort *<input type="password" value={newAccount.password} onChange={e=>setNewAccount({...newAccount,password:e.target.value})} placeholder="mindestens 8 Zeichen"/></label>
            <label>Vorname<input value={newAccount.firstName} onChange={e=>setNewAccount({...newAccount,firstName:e.target.value})}/></label>
            <label>Nachname<input value={newAccount.lastName} onChange={e=>setNewAccount({...newAccount,lastName:e.target.value})}/></label>
            <label>E-Mail <small>optional</small><input type="email" value={newAccount.email} onChange={e=>setNewAccount({...newAccount,email:e.target.value})} placeholder="optional"/></label>
            <label>Telefon <small>optional</small><input type="tel" value={newAccount.phone} onChange={e=>setNewAccount({...newAccount,phone:e.target.value})} placeholder="optional"/></label>
            <label>Geburtsdatum <small>optional</small><input type="date" value={newAccount.birthDate} onChange={e=>setNewAccount({...newAccount,birthDate:e.target.value})}/></label>
            <label>Systemrolle<select value={newAccount.role} onChange={e=>setNewAccount({...newAccount,role:e.target.value})}><option value="user">Benutzer</option><option value="admin">Admin</option></select></label>
            <label>Team-Rolle<select value={newAccount.teamRole} onChange={e=>setNewAccount({...newAccount,teamRole:e.target.value})}><option value="owner">Owner</option><option value="manager">Manager</option><option value="designer">Designer</option><option value="member">Mitarbeiter</option><option value="viewer">Nur ansehen</option></select></label>
          </div>
          <button className="pixva-primary" onClick={createAccount}>Konto erstellen</button>
        </>}
        <hr/>
        <h3>Freigabe anfordern</h3>
        <input placeholder="Projekt-ID" value={approvalForm.projectId} onChange={e=>setApprovalForm({...approvalForm,projectId:e.target.value})}/>
        <input placeholder="Titel" value={approvalForm.title} onChange={e=>setApprovalForm({...approvalForm,title:e.target.value})}/>
        <textarea rows={3} placeholder="Notiz" value={approvalForm.note} onChange={e=>setApprovalForm({...approvalForm,note:e.target.value})}/>
        <button onClick={requestApproval}>Freigabe anfordern</button>
      </article>

      <article className="pixva-card">
        <h3>Konten & Team-Rollen</h3>
        {user.role!=='admin'?<p>Nur Admins können Konten und Rollen verwalten.</p>:<div className="pixva-table">
          {(team?.users||[]).map(u=><div className="pixva-row" key={u.id}>
            <div>
              <b>{[u.first_name,u.last_name].filter(Boolean).join(' ')||u.username}</b>
              <span>@{u.username} · {u.email||'keine E-Mail'} · {u.phone||'kein Telefon'}</span>
              <small>{u.birth_date?`Geb.: ${u.birth_date} · `:''}{u.role}</small>
            </div>
            <select value={u.team_role||'member'} onChange={e=>changeTeamRole(u,e.target.value)}>
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="designer">Designer</option>
              <option value="member">Mitarbeiter</option>
              <option value="viewer">Nur ansehen</option>
            </select>
          </div>)}
        </div>}
        <hr/>
        <h3>Freigaben & Audit-Log</h3>
        {user.role==='admin'&&<>
          <div className="pixva-table">{(team?.approvals||[]).map(a=><div className="pixva-row" key={a.id}><div><b>{a.title||'Freigabe'}</b><span>{a.status} · {fmtDate(a.created_at)}</span></div>{a.status==='pending'&&<div className="pixva-inline"><button onClick={()=>reviewApproval(a.id,'approved')}>Freigeben</button><button onClick={()=>reviewApproval(a.id,'rejected')}>Ablehnen</button></div>}</div>)}</div>
          <hr/>
          <div className="pixva-table compact-table">{(team?.audit||[]).map(a=><div className="pixva-row" key={a.id}><div><b>{a.action}</b><span>{fmtDate(a.created_at)}</span><small>{JSON.stringify(a.details||{})}</small></div></div>)}</div>
        </>}
      </article>
    </div>}

    {tab==='integrations'&&<div className="pixva-grid two">
      <article className="pixva-card"><div className="pixva-card-title"><Instagram/><div><h3>Instagram Publishing</h3><p>Direkte Veröffentlichung über die Meta Instagram API.</p></div></div><div className="pixva-status-grid"><div><span>Status</span><b className={instagram?.connected?'ok':'warn'}>{instagram?.connected?'VERBUNDEN':'NICHT VERBUNDEN'}</b></div><div><span>Graph API</span><b>{instagram?.graphVersion||'v26.0'}</b></div></div>{!instagram?.connected?<><label>Instagram User ID<input value={instagramForm.accountId} onChange={e=>setInstagramForm({...instagramForm,accountId:e.target.value})}/></label><label>Anzeigename<input value={instagramForm.displayName} onChange={e=>setInstagramForm({...instagramForm,displayName:e.target.value})}/></label><label>Access Token<input type="password" value={instagramForm.accessToken} onChange={e=>setInstagramForm({...instagramForm,accessToken:e.target.value})}/></label><button className="pixva-primary" onClick={connectInstagram}>Instagram verbinden</button><small>Benötigt ein Instagram Business-/Creator-Konto und einen gültigen Meta Access Token mit Publishing-Rechten.</small></>:<><p>Verbunden: <b>{instagram.account?.display_name||instagram.account?.account_id}</b></p><button onClick={disconnectInstagram}>Verbindung trennen</button></>}</article>
      <article className="pixva-card"><h3>Direkt veröffentlichen</h3><label className="pixva-upload"><Upload/>Bild auswählen<input ref={instagramFile} type="file" accept="image/jpeg,image/png,image/webp"/></label><label>Caption<textarea rows={6} value={instagramForm.caption} onChange={e=>setInstagramForm({...instagramForm,caption:e.target.value})}/></label><button className="pixva-primary" onClick={publishInstagram} disabled={!instagram?.connected}><Instagram size={16}/>Auf Instagram veröffentlichen</button><hr/><h3>E-Mail</h3><p>Passwort-Recovery per E-Mail wird automatisch aktiv, sobald die optionalen SMTP-Variablen in Vercel gesetzt sind.</p></article>
    </div>}

    {tab==='status'&&<div className="pixva-grid two">
      <article className="pixva-card"><div className="pixva-inline"><h3>Systemstatus</h3><button onClick={()=>loadStatus(user.role==='admin')}><RefreshCw size={15}/>Prüfen</button></div>
        {(()=>{
          const current=status||data?.system||{};
          const labels={
            database:'Datenbank',
            privateStorage:'Privater Speicher',
            storagePrivacy:'Speicher-Schutz',
            geminiConfigured:'Gemini',
            openaiConfigured:'OpenAI',
            soraConfigured:'Sora',
            serviceRoleConfigured:'Supabase Service Role',
            supabaseServiceConfigured:'Supabase Service Role',
            geminiDeepTest:'Gemini Live-Test',
            paypalUntouched:'PayPal geschützt',
            semanticSearch:'Semantische Suche',
            backgroundJobs:'Hintergrundaufträge',
            emailConfigured:'E-Mail-Wiederherstellung',
            twoFactor:'2FA',
            instagramPublishing:'Instagram Publishing'
          };
          const hidden=new Set(['adminUserCount','adminOpenErrors','bucketPublic']);
          return <div className="pixva-status-grid">{Object.entries(current).filter(([k])=>!hidden.has(k)).map(([k,v])=>{
            const text=typeof v==='boolean'?(v?'OK':'FEHLT'):String(v??'—');
            const positive=v===true||['OK','PIXVA_OK','PRIVAT','BEREIT'].includes(text);
            const neutral=['OPTIONAL','—'].includes(text);
            return <div key={k}><span>{labels[k]||k}</span><b className={positive?'ok':neutral?'':v===false?'bad':''}>{text}</b></div>
          })}</div>
        })()}
        {user.role==='admin'&&<><hr/><h3>Admin-System</h3><p>{status?.adminUserCount??data?.admin?.users?.length??'—'} Konten · {status?.adminOpenErrors??data?.admin?.errors?.filter(e=>!e.resolved_at).length??'—'} offene Fehler</p><div className="pixva-table compact-table">{(data?.admin?.errors||[]).slice(0,10).map(e=><div className="pixva-row" key={e.id}><div><b>{e.area}</b><span>{e.public_message}</span><small>{fmtDate(e.created_at)}</small></div></div>)}</div></>}
      </article>
      <article className="pixva-card"><h3>KI-Auftragszentrum</h3><div className="pixva-table">{jobs.map(j=><div className="pixva-row" key={j.id}><div><b>{j.kind} · {j.model}</b><span>{j.status} · {fmtDate(j.created_at)}</span></div>{j.status==='completed'?<CheckCircle2 className="ok"/>:j.status==='failed'?<span className="bad">Fehler</span>:<LoaderCircle className="spin"/>}</div>)}</div></article>
    </div>}
  </section>;
}
