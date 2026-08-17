import { readJson, send, validateUser } from '../_lib.js';
import { buildPixvaContext } from '../../lib/pixva-context.js';
import { getProviderRouting } from '../../lib/pixva-provider-routing.js';
import { logServerError, logServerEvent } from '../../lib/pixva-observability.js';

const SYSTEM_PROMPT = `Du bist PIXVA, ein freundlicher, präziser und vielseitiger KI-Assistent. Du hilfst bei Alltag, Lernen, Schreiben, Übersetzen, Programmieren, Unternehmen, Kreativität und Planung. Zusätzlich kennst du dich mit Werbetechnik, Angeboten, Flyern, Druckdaten, Social Media und Webseiten aus. Antworte immer in der Sprache des Nutzers, klar, direkt und praktisch. Die PIXVA-Oberfläche besitzt Werkzeuge für Bildgenerierung, kostenlose Produktbildsuche, Videoerstellung und herunterladbare Dateien wie PDF, Word/DOCX, Excel/XLSX, TXT, CSV, JSON, HTML und Markdown. Behaupte deshalb niemals, du seist nur textbasiert oder könntest grundsätzlich keine Bilder, Videos oder Dateien liefern. Wenn der Nutzer eine Datei verlangt, erstelle den vollständigen verwendbaren Inhalt ohne Anleitungen zum manuellen Speichern; die Oberfläche übernimmt die Dateierstellung. Behaupte niemals, dass keine PDF-, Word-, Excel- oder andere Datei erstellt werden könne. Wenn ein Nutzer ein vorhandenes Marken- oder Produktbild sucht, erfinde kein Produkt und behaupte nicht ungeprüft, welches das beliebteste ist. Die Oberfläche übernimmt die kostenlose Bildsuche und zeigt Quellenlinks. Vor jeder kostenpflichtigen OpenAI-Bild- oder Sora-Videoanfrage zeigt die Oberfläche immer eine Kostenwarnung und startet erst nach ausdrücklicher Bestätigung; erwähne keine angeblich bereits entstandenen Kosten, solange kein Ergebnis vorliegt. Nutze übersichtliche Absätze und kurze Listen statt unnötiger Sternchen. Wenn Bilder angehängt sind, beschreibe sie hilfreich. Wenn nur eine Videodatei als Anhang vorhanden ist und keine Frames übertragen wurden, erkläre ehrlich, dass nur die Datei vorliegt und keine Bildanalyse der Videoinhalte möglich ist.`;

const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

function cleanHistory(history){
  if(!Array.isArray(history))return[];
  return history.filter(item=>item&&['user','assistant','model'].includes(item.role)).slice(-12).map(item=>({role:item.role==='assistant'?'model':item.role,parts:[{text:String(item.content||'').slice(0,9000)}]})).filter(item=>item.parts[0].text.trim());
}
function openAIHistory(history){
  if(!Array.isArray(history))return[];
  return history.filter(item=>item&&['user','assistant','model'].includes(item.role)).slice(-12).map(item=>({role:item.role==='model'?'assistant':item.role,content:String(item.content||'').slice(0,9000)})).filter(item=>item.content.trim());
}
function extractGeminiText(data){return(data?.candidates?.[0]?.content?.parts||[]).map(part=>part?.text||'').join('').trim()}
function extractOpenAIText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  return(data?.output||[]).flatMap(item=>item?.content||[]).filter(part=>part?.type==='output_text'||part?.text).map(part=>part?.text||'').join('').trim();
}
function normalizeAttachments(input){
  if(!Array.isArray(input))return[];
  return input.slice(0,4).map(item=>({kind:item?.kind==='video'?'video':item?.kind==='file'?'file':'image',name:String(item?.name||'').slice(0,120),mimeType:String(item?.mimeType||'').slice(0,80),data:String(item?.data||''),size:Number(item?.size||0),frames:Array.isArray(item?.frames)?item.frames.slice(0,4).map(frame=>String(frame||'')):[],text:String(item?.text||'').slice(0,30000)})).filter(item=>item.name||item.data);
}
function createUserParts(message,attachments){
  const parts=[],videoAttachments=attachments.filter(item=>item.kind==='video'),imageAttachments=attachments.filter(item=>item.kind==='image'),fileAttachments=attachments.filter(item=>item.kind==='file');
  let intro=String(message||'').trim();
  if(videoAttachments.length){
    const videoInfo=videoAttachments.map(item=>{const sizeMb=item.size?`${(item.size/1024/1024).toFixed(1)} MB`:'unbekannte Größe',frameInfo=item.frames?.length?`${item.frames.length} Vorschaubilder wurden angehängt`:'keine Vorschaubilder verfügbar';return`- ${item.name||'Video'} (${item.mimeType||'video/*'}, ${sizeMb}; ${frameInfo})`}).join('\n');
    intro+=`\n\nVideo-Anhänge:\n${videoInfo}\nAnalysiere die angehängten Vorschaubilder als Stichprobe und erwähne, dass sie nicht jeden Moment des Videos zeigen.`;
  }
  if(fileAttachments.length){
    const fileInfo=fileAttachments.map(item=>`- ${item.name||'Datei'} (${item.mimeType||'unbekannter Typ'}, ${item.size||0} Bytes)`).join('\n');
    const textContents=fileAttachments.filter(item=>item.text).map(item=>`\n--- Inhalt von ${item.name} ---\n${item.text}`).join('');
    intro+=`\n\nDatei-Anhänge:\n${fileInfo}${textContents}`;
  }
  parts.push({text:intro||'Bitte hilf mir mit diesem Anhang.'});
  for(const image of imageAttachments){const match=image.data.match(/^data:(.+?);base64,(.+)$/);if(match)parts.push({inlineData:{mimeType:match[1],data:match[2]}})}
  for(const file of fileAttachments){if(file.mimeType!=='application/pdf')continue;const match=file.data.match(/^data:(.+?);base64,(.+)$/);if(match)parts.push({inlineData:{mimeType:match[1],data:match[2]}})}
  for(const video of videoAttachments)for(const frame of video.frames||[]){const match=frame.match(/^data:(.+?);base64,(.+)$/);if(match)parts.push({inlineData:{mimeType:match[1],data:match[2]}})}
  return parts;
}
async function callGemini({apiKey,model,message,history,attachments}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),22000);
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM_PROMPT}]},contents:[...cleanHistory(history),{role:'user',parts:createUserParts(message,attachments)}],generationConfig:{maxOutputTokens:4096}})});
    const data=await response.json().catch(()=>({}));return{response,data};
  }finally{clearTimeout(timeout)}
}
async function callOpenAI({apiKey,model,message,history}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const input=[...openAIHistory(history),{role:'user',content:String(message||'').slice(0,50000)}];
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,input,instructions:SYSTEM_PROMPT,store:false})});
    const data=await response.json().catch(()=>({}));return{response,data};
  }finally{clearTimeout(timeout)}
}
function shouldRetry(status,message=''){return[400,404,408,429,500,502,503,504].includes(status)||/high demand|overload|temporar|resource exhausted|unavailable/i.test(message)}
async function runGemini({message,history,attachments,retries=2}){
  const apiKey=String(process.env.GEMINI_API_KEY||'').trim();if(!apiKey)throw Object.assign(new Error('Der Gemini API-Key fehlt in Vercel.'),{status:503,provider:'gemini'});
  const configured=String(process.env.GEMINI_MODEL||'').trim(),models=[...new Set([configured,'gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash'].filter(Boolean))];
  let lastStatus=503,lastMessage='';
  for(const model of models){
    for(let attempt=0;attempt<retries;attempt+=1){
      if(attempt)await sleep(650+Math.floor(Math.random()*450));
      try{
        const{response,data}=await callGemini({apiKey,model,message,history,attachments}),apiMessage=data?.error?.message||'';lastStatus=response.status;lastMessage=apiMessage;
        if(response.ok){const answer=extractGeminiText(data);if(answer)return{answer,model,provider:'gemini',usage:{inputTokens:Number(data?.usageMetadata?.promptTokenCount||0),outputTokens:Number(data?.usageMetadata?.candidatesTokenCount||0),totalTokens:Number(data?.usageMetadata?.totalTokenCount||0)}};lastMessage='Gemini hat keine Textantwort geliefert.';break}
        if([401,403].includes(response.status))throw Object.assign(new Error('Der Gemini API-Key ist ungültig oder nicht freigegeben.'),{status:response.status,provider:'gemini'});
        if(!shouldRetry(response.status,apiMessage))break;
      }catch(error){if(error?.provider)throw error;lastStatus=error?.name==='AbortError'?504:503;lastMessage=error?.name==='AbortError'?'Zeitüberschreitung beim KI-Dienst.':String(error?.message||'Verbindungsfehler')}
    }
  }
  throw Object.assign(new Error(lastStatus===429?'Das Gemini-Limit ist gerade erreicht. Bitte warte kurz und versuche es erneut.':`Gemini ist gerade nicht verfügbar. ${lastMessage}`.slice(0,500)),{status:lastStatus,provider:'gemini'});
}
async function runOpenAI({message,history,retries=2}){
  const apiKey=String(process.env.OPENAI_API_KEY||'').trim();if(!apiKey)throw Object.assign(new Error('Der OpenAI API-Key fehlt in Vercel.'),{status:503,provider:'openai'});
  const model=String(process.env.OPENAI_TEXT_MODEL||'gpt-5.6').trim();let lastStatus=503,lastMessage='';
  for(let attempt=0;attempt<retries;attempt+=1){
    if(attempt)await sleep(700+Math.floor(Math.random()*450));
    try{
      const{response,data}=await callOpenAI({apiKey,model,message,history});lastStatus=response.status;lastMessage=String(data?.error?.message||'');
      if(response.ok){const answer=extractOpenAIText(data);if(answer)return{answer,model:data?.model||model,provider:'openai',usage:{inputTokens:Number(data?.usage?.input_tokens||0),outputTokens:Number(data?.usage?.output_tokens||0),totalTokens:Number(data?.usage?.total_tokens||0)}};lastMessage='OpenAI hat keine Textantwort geliefert.'}
      if([401,403].includes(response.status))throw Object.assign(new Error('Der OpenAI API-Key ist ungültig oder nicht freigegeben.'),{status:response.status,provider:'openai'});
      if(!shouldRetry(response.status,lastMessage))break;
    }catch(error){if(error?.provider)throw error;lastStatus=error?.name==='AbortError'?504:503;lastMessage=error?.name==='AbortError'?'Zeitüberschreitung beim OpenAI-Dienst.':String(error?.message||'Verbindungsfehler')}
  }
  throw Object.assign(new Error(`OpenAI ist gerade nicht verfügbar. ${lastMessage}`.slice(0,500)),{status:lastStatus,provider:'openai'});
}

export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'Nur POST-Anfragen sind erlaubt.'});
  let privateUser=null;
  try{
    const body=await readJson(req),message=String(body?.message||'').trim().slice(0,16000),history=body?.history||[],attachments=normalizeAttachments(body?.attachments);
    privateUser=await validateUser(req).catch(()=>null);
    const pixvaPrivateContext=privateUser?await buildPixvaContext(privateUser,message).catch(()=>''):'';
    const effectiveMessage=pixvaPrivateContext?`${pixvaPrivateContext}\n\nAKTUELLE NUTZERANFRAGE:\n${message}`:message;
    if(!message&&!attachments.length)return send(res,400,{error:'Bitte gib eine Nachricht oder einen Anhang ein.'});

    const routing=await getProviderRouting(),providers=[routing.chatPrimary];
    if(routing.chatFallbackEnabled&&routing.chatFallback!==routing.chatPrimary)providers.push(routing.chatFallback);
    let lastError=null;
    for(const provider of providers){
      try{
        if(provider==='openai'&&attachments.length)throw Object.assign(new Error('OpenAI-Fallback wird für Anhänge nicht automatisch verwendet; PIXVA bleibt dafür bei Gemini.'),{status:503,provider:'openai'});
        const result=provider==='openai'?await runOpenAI({message:effectiveMessage,history,retries:routing.maxRetries}):await runGemini({message:effectiveMessage,history,attachments,retries:routing.maxRetries});
        if(privateUser)logServerEvent({userId:privateUser.id,action:'chat_provider_used',details:{provider:result.provider,model:result.model,fallback:provider!==routing.chatPrimary,inputTokens:Number(result.usage?.inputTokens||0),outputTokens:Number(result.usage?.outputTokens||0),totalTokens:Number(result.usage?.totalTokens||0)}}).catch(()=>{});
        return send(res,200,result);
      }catch(error){lastError=error;await logServerError({userId:privateUser?.id||null,area:`chat:${provider}`,error,publicMessage:`PIXVA Chat ${provider} fehlgeschlagen.`})}
    }
    throw lastError||new Error('Kein Chat-Anbieter verfügbar.');
  }catch(error){
    console.error('PIXVA chat error:',error);
    await logServerError({userId:privateUser?.id||null,area:'chat',error});
    return send(res,Number(error?.status)||500,{error:error?.message||'Die Verbindung zur KI ist fehlgeschlagen.'});
  }
}
