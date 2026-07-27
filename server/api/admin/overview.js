import { handleApiError, requireUser, send, serviceClient } from '../_lib.js';
export default async function handler(req,res){if(req.method!=='GET')return send(res,405,{error:'Nur GET ist erlaubt.'});try{await requireUser(req,{admin:true});const db=serviceClient();const [users,jobs,errors,purchases,subs,audit]=await Promise.all([
 db.from('profiles').select('id,username,display_name,role,blocked,created_at',{count:'exact'}),
 db.from('ai_jobs').select('*').order('created_at',{ascending:false}).limit(100),
 db.from('system_errors').select('*').eq('resolved',false).order('created_at',{ascending:false}).limit(50),
 db.from('purchases').select('*').order('created_at',{ascending:false}).limit(50),
 db.from('subscriptions').select('*,profiles(username),products(name,price_cents)').order('updated_at',{ascending:false}),
 db.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(100)
 ]);return send(res,200,{users:users.data||[],userCount:users.count||0,jobs:jobs.data||[],openErrors:errors.data||[],purchases:purchases.data||[],subscriptions:subs.data||[],audit:audit.data||[]});}catch(e){return handleApiError(res,e,'Adminübersicht konnte nicht geladen werden.')}}
