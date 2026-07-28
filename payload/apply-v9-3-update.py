from pathlib import Path

def read(path): return Path(path).read_text(encoding="utf-8").replace("\r\n","\n").replace("\r","\n")
def write(path,value):
    Path(path).parent.mkdir(parents=True,exist_ok=True)
    Path(path).write_text(value,encoding="utf-8")
def replace_once(path,old,new,label):
    source=read(path)
    if new in source: print(f"OK bereits vorhanden: {label}"); return
    if old not in source: raise RuntimeError(f"{label} konnte in {path} nicht gefunden werden.")
    write(path,source.replace(old,new,1)); print(f"OK: {label}")
def append_once(path,marker,content):
    source=read(path)
    if marker in source: print(f"OK bereits vorhanden: {marker}"); return
    write(path,source.rstrip()+"\n\n"+content.strip()+"\n"); print(f"OK angehängt: {marker}")

replace_once("client/src/App.jsx","""  KeyRound, Menu, PanelLeftClose, PanelLeftOpen, Settings, Sparkles
""","""  KeyRound, Menu, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Sparkles
""","Shield-Icon")
replace_once("client/src/App.jsx","""import AccountSettings from './components/AccountSettings.jsx';
import Subscriptions from './components/Subscriptions.jsx';
""","""import AccountSettings from './components/AccountSettings.jsx';
import SafetyCenter from './components/SafetyCenter.jsx';
import Subscriptions from './components/Subscriptions.jsx';
""","SafetyCenter-Import")
replace_once("client/src/App.jsx","""  projects:{ id:'projects', label:'Projekte', icon:FolderOpen },
  plans:{ id:'plans', label:'Abos & Preise', icon:BadgeEuro }
""","""  projects:{ id:'projects', label:'Projekte', icon:FolderOpen },
  safety:{ id:'safety', label:'Sicherheit & Daten', icon:ShieldCheck },
  plans:{ id:'plans', label:'Abos & Preise', icon:BadgeEuro }
""","Navigation")
replace_once("client/src/App.jsx","""  video:'Video-Studio', website:'Website-Builder', projects:'Projekte', plans:'Abos & Preise', account:'Mein Konto', admin:'Admin & Einstellungen'
""","""  video:'Video-Studio', website:'Website-Builder', projects:'Projekte', safety:'Sicherheit & Daten', plans:'Abos & Preise', account:'Mein Konto', admin:'Admin & Einstellungen'
""","Seitentitel")
replace_once("client/src/App.jsx","""  const nav=useMemo(()=>configuredNav(uiSettings).filter((item)=>item.visible !== false && enabledBySettings(item.id,uiSettings)),[uiSettings]);
""","""  const nav=useMemo(()=>configuredNav(uiSettings).filter((item)=>item.visible !== false && enabledBySettings(item.id,uiSettings) && (item.id!=='safety'||!guest)),[uiSettings,guest]);
""","Gastschutz")
replace_once("client/src/App.jsx","""        {view==='account'&&!guest&&<AccountSettings user={activeUser} onUserChanged={setUser} subscription={subscription} onSubscriptionChanged={handleSubscriptionChanged} onOpenPlans={()=>changeView('plans')} customPlans={uiSettings.customPlans} planPrices={uiSettings.planPrices} betaPlanPrices={uiSettings.betaPlanPrices}/>}
""","""        {view==='safety'&&!guest&&<SafetyCenter user={activeUser} onLogout={exit}/>}
        {view==='account'&&!guest&&<AccountSettings user={activeUser} onUserChanged={setUser} subscription={subscription} onSubscriptionChanged={handleSubscriptionChanged} onOpenPlans={()=>changeView('plans')} customPlans={uiSettings.customPlans} planPrices={uiSettings.planPrices} betaPlanPrices={uiSettings.betaPlanPrices}/>}
""","SafetyCenter rendern")

replace_once("client/src/api.js","""  if (path === '/api/health' || path === '/api/video/merge' || path.startsWith('/api/ai/') || path.startsWith('/api/billing')) {
""","""  if (path === '/api/health' || path === '/api/video/merge' || path.startsWith('/api/ai/') || path.startsWith('/api/billing') || path.startsWith('/api/platform')) {
""","Platform-Route")
replace_once("client/src/api.js","""  if (projectMatch && method === 'DELETE') {
    return rpc('app_delete_project', {
      p_token: token,
      p_project_id: projectMatch[1]
    });
  }
  throw new Error(`Unbekannte Funktion: ${method} ${path}`);
""","""  if (projectMatch && method === 'DELETE') {
    return rpc('app_delete_project', {
      p_token: token,
      p_project_id: projectMatch[1]
    });
  }
  const versionsMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/versions$/i);
  if (versionsMatch && method === 'GET') {
    return rpc('app_list_project_versions', { p_token: token, p_project_id: versionsMatch[1] });
  }
  const restoreMatch = path.match(/^\/api\/project-versions\/([0-9a-f-]+)\/restore$/i);
  if (restoreMatch && method === 'POST') {
    return rpc('app_restore_project_version', { p_token: token, p_version_id: restoreMatch[1] });
  }
  throw new Error(`Unbekannte Funktion: ${method} ${path}`);
""","Versions-RPCs")

append_once("api/_lib.js","YILDIZ AI V9.3 RATE LIMIT",r"""
// YILDIZ AI V9.3 RATE LIMIT
const guestBuckets=globalThis.__yildizGuestRateBuckets||(globalThis.__yildizGuestRateBuckets=new Map());
function requestIp(req){return String(req.headers?.['x-forwarded-for']||req.headers?.['x-real-ip']||'unknown').split(',')[0].trim()}
export async function enforceRateLimit(req,scope,limit=20,windowSeconds=60){
  const token=readToken(req);
  if(!token){
    const key=`${requestIp(req)}:${scope}`,now=Date.now(),bucket=guestBuckets.get(key)||{started:now,count:0};
    if(now-bucket.started>windowSeconds*1000){bucket.started=now;bucket.count=0} bucket.count+=1;guestBuckets.set(key,bucket);
    if(bucket.count>limit){const e=new Error('Zu viele Anfragen. Bitte kurz warten und erneut versuchen.');e.status=429;throw e} return;
  }
  const url=supabaseUrl(),key=supabaseKey();
  const response=await fetch(`${url}/rest/v1/rpc/app_take_rate_limit`,{method:'POST',headers:{apikey:key,...(key.startsWith('sb_')?{}:{Authorization:`Bearer ${key}`}),'Content-Type':'application/json'},body:JSON.stringify({p_token:token,p_scope:scope,p_limit:limit,p_window_seconds:windowSeconds})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.error)throw new Error(data?.error||'Rate-Limit konnte nicht geprüft werden.');
  if(data?.allowed===false){const e=new Error(`Zu viele Anfragen. Bitte in ${data.retryAfterSeconds||windowSeconds} Sekunden erneut versuchen.`);e.status=429;throw e}
}
""")

replace_once("api/ai/chat.js","""import { readJson, send } from '../_lib.js';
""","""import { enforceRateLimit, readJson, send } from '../_lib.js';
""","Chat Rate-Limit Import")
replace_once("api/ai/chat.js","""function createUserParts(message, attachments) {
""",r"""function validateAttachments(items) {
  const allowed=/^(image\/(png|jpeg|webp)|video\/(mp4|webm|quicktime)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|text\/(plain|csv|markdown|html)|application\/json)$/i;
  for(const item of items){const max=item.kind==='video'?80*1024*1024:item.kind==='image'?12*1024*1024:10*1024*1024;if(item.size>max)throw new Error(`${item.name||'Datei'} ist zu groß.`);if(item.mimeType&&!allowed.test(item.mimeType))throw new Error(`Dateityp nicht erlaubt: ${item.mimeType}`);if(item.data.length>24000000)throw new Error(`${item.name||'Datei'} ist für die Übertragung zu groß.`)}
}
function createUserParts(message, attachments) {
""","Anhangprüfung")
replace_once("api/ai/chat.js","""  try {
    const body = await readJson(req);
""","""  try {
    await enforceRateLimit(req,'chat',30,60);
    const body = await readJson(req);
""","Chat Rate-Limit")
replace_once("api/ai/chat.js","""    const attachments = normalizeAttachments(body?.attachments);
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
""","""    const attachments = normalizeAttachments(body?.attachments);
    validateAttachments(attachments);
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
""","Chat Anhänge prüfen")

replace_once("api/ai/image.js","""import { readJson, send } from '../_lib.js';
""","""import { enforceRateLimit, readJson, send } from '../_lib.js';
""","Bild Rate-Limit Import")
replace_once("api/ai/image.js","""  try {
    const body = await readJson(req);
""","""  try {
    await enforceRateLimit(req,'image',10,60);
    const body = await readJson(req);
""","Bild Rate-Limit")
replace_once("api/ai/image.js","""    const referenceImage = String(body?.referenceImage || '');
    requestId = String(body?.requestId || randomUUID());
""","""    const referenceImage = String(body?.referenceImage || '');
    if(referenceImage.length>24000000)return send(res,413,{error:'Das Referenzbild ist zu groß. Bitte maximal etwa 12 MB verwenden.'});
    requestId = String(body?.requestId || randomUUID());
""","Bildgrößenlimit")

replace_once("api/ai/video.js","""import { readJson, send } from '../_lib.js';
""","""import { enforceRateLimit, readJson, send } from '../_lib.js';
""","Video Rate-Limit Import")
replace_once("api/ai/video.js","""async function createVideo(req, res, apiKey) {
  const body = await readJson(req);
""","""async function createVideo(req, res, apiKey) {
  await enforceRateLimit(req,'video',5,60);
  const body = await readJson(req);
  if(String(body?.referenceImage||'').length>24000000)return send(res,413,{error:'Das Referenzbild ist zu groß. Bitte maximal etwa 12 MB verwenden.'});
""","Video Rate-Limit und Uploadlimit")

replace_once("client/src/components/Chat.jsx","""  const previewUrl = URL.createObjectURL(blob);
""","""  if(!blob||blob.size<=0)throw new Error('Die erzeugte Datei ist leer und wird nicht zum Download angeboten.');
  const previewUrl = URL.createObjectURL(blob);
""","Dateiexistenz prüfen")
replace_once("client/src/components/Chat.jsx","""  async function addGenericFile(file) {
    const mimeType = file.type || 'application/octet-stream';
""","""  async function addGenericFile(file) {
    const mimeType = file.type || 'application/octet-stream';
    const allowed=/^(application\/pdf|application\/json|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|text\/(plain|csv|markdown|html|xml))$/i;
    if(!allowed.test(mimeType)&&!/\.(pdf|docx|xlsx|txt|csv|json|md|html?|xml)$/i.test(file.name))throw new Error(`Dateityp nicht erlaubt: ${mimeType}`);
    if(file.size>10*1024*1024)throw new Error('Datei ist zu groß. Bitte maximal 10 MB wählen.');
""","Allgemeine Uploadprüfung")
replace_once("client/src/components/Chat.jsx","""  async function addVideoFile(file) {
    const previewUrl = URL.createObjectURL(file);
""","""  async function addVideoFile(file) {
    if(file.size>80*1024*1024)throw new Error('Video ist zu groß. Bitte maximal 80 MB wählen.');
    if(!/^video\/(mp4|webm|quicktime)$/i.test(file.type||'video/mp4'))throw new Error('Erlaubt sind MP4, WebM und MOV.');
    const previewUrl = URL.createObjectURL(file);
""","Video-Uploadprüfung")

replace_once("client/src/components/DesignEditor.jsx","""  const baseTemplateRef = useRef(null);
""","""  const baseTemplateRef = useRef(null);
  const lastAutoSaveRef = useRef('');
""","Design Auto-Save Ref")
replace_once("client/src/components/DesignEditor.jsx","""  async function generateAiImage() {
""","""  useEffect(()=>{if(!canSave||!projectId)return;const timer=setInterval(async()=>{const canvas=fabricRef.current;if(!canvas)return;const payload={name:projectName,type:mode==='image'?'image':'flyer',data:{format:formatKey,canvas:canvas.toJSON(customProps)}},signature=JSON.stringify(payload);if(signature===lastAutoSaveRef.current)return;try{await api(`/api/projects/${projectId}`,{method:'PUT',body:JSON.stringify(payload)});lastAutoSaveRef.current=signature;setStatus('Automatisch gespeichert.')}catch{}},60000);return()=>clearInterval(timer)},[canSave,projectId,projectName,formatKey,mode]);
  async function generateAiImage() {
""","Design Auto-Save")
replace_once("client/src/components/VideoStudio.jsx","""  const textDragRef = useRef(null);
""","""  const textDragRef = useRef(null);
  const lastAutoSaveRef = useRef('');
""","Video Auto-Save Ref")
replace_once("client/src/components/VideoStudio.jsx","""  async function renderVideo() {
""","""  useEffect(()=>{if(!canSave||!projectId)return;const timer=setTimeout(async()=>{const safeScenes=scenes.map(scene=>({...scene,imageUrl:scene.imageUrl?.startsWith('blob:')?'':scene.imageUrl,videoUrl:scene.videoUrl?.startsWith('blob:')?'':scene.videoUrl})),payload={name:projectName,type:'video',data:{scenes:safeScenes,format:formatKey,musicStyle,musicVolume}},signature=JSON.stringify(payload);if(signature===lastAutoSaveRef.current)return;try{await api(`/api/projects/${projectId}`,{method:'PUT',body:JSON.stringify(payload)});lastAutoSaveRef.current=signature;setStatus('Automatisch gespeichert.')}catch{}},45000);return()=>clearTimeout(timer)},[canSave,projectId,projectName,scenes,formatKey,musicStyle,musicVolume]);
  async function renderVideo() {
""","Video Auto-Save")
replace_once("client/src/components/WebsiteBuilder.jsx","""  async function exportZip(){
""","""  useEffect(()=>{if(!canSave||!projectId)return;const timer=setTimeout(async()=>{const payload={name:projectName,type:'website',data:{site:data}};try{await api(`/api/projects/${projectId}`,{method:'PUT',body:JSON.stringify(payload)});setStatus('Automatisch gespeichert.')}catch{}},30000);return()=>clearTimeout(timer)},[canSave,projectId,projectName,data]);
  async function exportZip(){
""","Website Auto-Save")

print("Yildiz AI V9.3 Patches erfolgreich eingesetzt.")
