import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
const required=[
  'supabase/V10-COMPLETE.sql','api/auth/signup.js','api/ai/image.js','api/ai/video.js',
  'api/webhooks/openai.js','api/webhooks/stripe.js','api/webhooks/paypal.js',
  'api/files/create.js','api/files/upload-ticket.js','api/files/register-upload.js',
  'api/billing/checkout.js','api/billing/download.js','client/src/pages/EditorPage.jsx'
];
test('alle produktionskritischen Dateien sind vorhanden',()=>{for(const file of required)assert.ok(existsSync(resolve(root,file)),file)});
test('OpenAI- und Zahlungsgeheimnisse bleiben serverseitig',()=>{
  const client=readFileSync(resolve(root,'client/src/pages/PricingPage.jsx'),'utf8')+readFileSync(resolve(root,'client/src/api.js'),'utf8');
  assert.doesNotMatch(client,/STRIPE_SECRET_KEY|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|PAYPAL_CLIENT_SECRET/);
});
test('Bildeditor enthält echte Text- und Versionierungsfunktionen',()=>{
  const editor=readFileSync(resolve(root,'client/src/pages/EditorPage.jsx'),'utf8');
  assert.match(editor,/IText/);assert.match(editor,/fontFamily/);assert.match(editor,/design_versions/);assert.match(editor,/exportType/);
});
