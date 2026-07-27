import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
const required=[
  'supabase/V10-COMPLETE.sql','api/index.js','server/api/auth/signup.js','server/api/ai/image.js','server/api/ai/video.js',
  'server/api/webhooks/openai.js','server/api/webhooks/stripe.js','server/api/webhooks/paypal.js',
  'server/api/files/create.js','server/api/files/upload-ticket.js','server/api/files/register-upload.js',
  'server/api/billing/checkout.js','server/api/billing/download.js','client/src/pages/EditorPage.jsx'
];
function walk(dir,out=[]){for(const name of readdirSync(dir)){const p=resolve(dir,name);const s=statSync(p);if(s.isDirectory())walk(p,out);else out.push(p)}return out}
test('alle produktionskritischen Dateien sind vorhanden',()=>{for(const file of required)assert.ok(existsSync(resolve(root,file)),file)});
test('Vercel Hobby verwendet genau eine öffentliche Serverless Function',()=>{
  const files=walk(resolve(root,'api')).filter(f=>f.endsWith('.js'));
  assert.deepEqual(files.map(f=>f.replace(root+'/','')),['api/index.js']);
  const config=JSON.parse(readFileSync(resolve(root,'vercel.json'),'utf8'));
  assert.deepEqual(Object.keys(config.functions||{}),['api/index.js']);
  assert.ok(config.routes.some(route=>route.src==='/api/(.*)'&&route.dest==='/api?path=$1'));
});
test('API-Router enthält alle ausgelagerten Handler',()=>{
  const router=readFileSync(resolve(root,'api/index.js'),'utf8');
  const handlers=walk(resolve(root,'server/api')).filter(f=>f.endsWith('.js')&&!f.split('/').pop().startsWith('_'));
  const routes=[...router.matchAll(/\['([^']+)',\s*[A-Za-z0-9_]+\]/g)].map(m=>m[1]);
  assert.equal(routes.length,handlers.length);
  for(const route of ['ai/chat','ai/image','ai/video','billing/checkout','files/create','webhooks/stripe'])assert.ok(routes.includes(route),route);
});
test('OpenAI- und Zahlungsgeheimnisse bleiben serverseitig',()=>{
  const client=readFileSync(resolve(root,'client/src/pages/PricingPage.jsx'),'utf8')+readFileSync(resolve(root,'client/src/api.js'),'utf8');
  assert.doesNotMatch(client,/STRIPE_SECRET_KEY|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|PAYPAL_CLIENT_SECRET/);
});
test('Bildeditor enthält echte Text- und Versionierungsfunktionen',()=>{
  const editor=readFileSync(resolve(root,'client/src/pages/EditorPage.jsx'),'utf8');
  assert.match(editor,/IText/);assert.match(editor,/fontFamily/);assert.match(editor,/design_versions/);assert.match(editor,/exportType/);
});
