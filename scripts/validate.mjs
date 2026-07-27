import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const failures = [];
const files = [];
function walk(dir){for(const name of readdirSync(dir)){const path=join(dir,name);const stat=statSync(path);if(stat.isDirectory())walk(path);else files.push(path)}}
walk(join(root,'api'));walk(join(root,'client','src'));

for(const file of files.filter(f=>f.endsWith('.js'))){
  try{execFileSync(process.execPath,['--check',file],{stdio:'pipe'})}
  catch(error){failures.push(`${relative(root,file)}: ${String(error.stderr||error.message)}`)}
}

try{
  const require=createRequire(import.meta.url);
  let ts;
  try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')}
  for(const file of files.filter(f=>/\.(jsx|js)$/.test(f)&&f.includes('/client/src/'))){
    const source=readFileSync(file,'utf8');
    const result=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true,fileName:file});
    for(const d of result.diagnostics||[]){
      const msg=ts.flattenDiagnosticMessageText(d.messageText,' ');
      failures.push(`${relative(root,file)}: ${msg}`);
    }
  }
}catch(error){failures.push(`JSX-Prüfung konnte nicht ausgeführt werden: ${error.message}`)}

const sql=readFileSync(join(root,'supabase','V10-COMPLETE.sql'),'utf8');
const required=[
  'auth.users','enable row level security','storage.buckets','reserve_ai_job',
  'public.ai_jobs','public.usage_events','public.media_assets','public.design_versions',
  'public.payment_events','public.audit_logs','public.system_errors'
];
for(const token of required)if(!sql.toLowerCase().includes(token.toLowerCase()))failures.push(`SQL-Baustein fehlt: ${token}`);

const secretPatterns=[
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
  /sb_secret_[A-Za-z0-9_-]{10,}/g,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g
];
for(const file of files.concat([join(root,'.env.example'),join(root,'README.md')])){
  const text=readFileSync(file,'utf8');
  for(const pattern of secretPatterns)if(pattern.test(text))failures.push(`Möglicher echter Geheimschlüssel in ${relative(root,file)}`);
}

if(failures.length){console.error(`V10-Prüfung fehlgeschlagen (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log(`V10-Prüfung erfolgreich: ${files.length} Code-Dateien, SQL-Struktur und Geheimnis-Scan geprüft.`);
