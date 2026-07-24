import { pollinationsKey, readJson, send, validateUser } from '../_lib.js';
export const config = { maxDuration: 60 };
const system = 'Du bist Yildiz AI, ein freundlicher, präziser allgemeiner KI-Assistent ähnlich einem modernen Chat-Assistenten. Du hilfst bei Alltag, Lernen, Schreiben, Übersetzen, Programmieren, Unternehmen, Kreativität und Planung. Zusätzlich bist du Spezialist für Werbetechnik, Angebote, Flyer, Druckdaten, Social Media und Webseiten. Antworte in der Sprache des Nutzers, klar, ehrlich und praktisch.';
async function freeChat(prompt){
  const r=await fetch('https://text.pollinations.ai/openai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'openai',messages:[{role:'system',content:system},{role:'user',content:prompt}],stream:false})});
  if(!r.ok) throw new Error('Der kostenlose KI-Zugang ist gerade ausgelastet oder nicht verfügbar.');
  const d=await r.json(); return d.choices?.[0]?.message?.content || 'Keine Antwort erhalten.';
}
export default async function handler(req,res){
 if(req.method!=='POST') return send(res,405,{error:'Methode nicht erlaubt.'});
 try{await validateUser(req); const body=await readJson(req); const prompt=String(body.prompt||'').trim(); if(!prompt)return send(res,400,{error:'Bitte eine Nachricht eingeben.'});
  const key=pollinationsKey();
  if(key){
   const r=await fetch('https://gen.pollinations.ai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:body.model||'openai',messages:[{role:'system',content:system},{role:'user',content:prompt}]})});
   if(r.ok){const d=await r.json();return send(res,200,{answer:d.choices?.[0]?.message?.content||'Keine Antwort erhalten.',mode:'key'});}
   if(![402,429].includes(r.status)) throw new Error(`KI-Dienst meldet ${r.status}: ${await r.text()}`);
  }
  return send(res,200,{answer:await freeChat(prompt),mode:'free'});
 }catch(e){return send(res,502,{error:`KI-Anfrage fehlgeschlagen: ${e.message}`});}
}
