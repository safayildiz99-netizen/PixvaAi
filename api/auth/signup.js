import { createHash } from 'node:crypto';
import { handleApiError, readJson, send, serviceClient } from '../_lib.js';

function hash(value){return createHash('sha256').update(String(value||'')).digest('hex')}
function remoteIp(req){return String(req.headers['x-forwarded-for']||req.headers['x-real-ip']||'unknown').split(',')[0].trim()}

export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'Nur POST ist erlaubt.'});
  try{
    const body=await readJson(req);
    const email=String(body.email||'').trim().toLowerCase();
    const password=String(body.password||'');
    const username=String(body.username||'').trim();
    if(!email.includes('@'))return send(res,400,{error:'Gültige E-Mail fehlt.'});
    if(password.length<10)return send(res,400,{error:'Passwort braucht mindestens 10 Zeichen.'});
    if(username&&!/^[A-Za-z0-9._-]{3,32}$/.test(username))return send(res,400,{error:'Benutzername: 3–32 Zeichen, nur Buchstaben, Zahlen, Punkt, Minus oder Unterstrich.'});
    const db=serviceClient();
    const {data:settings}=await db.from('app_settings').select('allow_signup').eq('id',1).single();
    if(!settings?.allow_signup)return send(res,403,{error:'Neue Registrierungen sind derzeit ausgeschaltet.'});
    const since=new Date(Date.now()-60*60*1000).toISOString();
    const ipHash=hash(`${remoteIp(req)}|yildiz-signup-v10`);
    const emailHash=hash(email);
    const [{count:ipCount},{count:emailCount}]=await Promise.all([
      db.from('signup_attempts').select('*',{count:'exact',head:true}).eq('ip_hash',ipHash).gte('created_at',since),
      db.from('signup_attempts').select('*',{count:'exact',head:true}).eq('email_hash',emailHash).gte('created_at',since)
    ]);
    if((ipCount||0)>=5||(emailCount||0)>=3)return send(res,429,{error:'Zu viele Registrierungsversuche. Bitte später erneut versuchen.'});
    const {data:attempt,error:attemptError}=await db.from('signup_attempts').insert({ip_hash:ipHash,email_hash:emailHash,successful:false}).select('id').single();
    if(attemptError)throw attemptError;
    const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username}});
    if(error)throw error;
    await db.from('signup_attempts').update({successful:true}).eq('id',attempt.id);
    return send(res,201,{ok:true,userId:data.user.id,message:'Konto wurde sicher in Supabase Auth angelegt.'});
  }catch(e){return handleApiError(res,e,'Registrierung fehlgeschlagen.')}
}
