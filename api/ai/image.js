import sharp from 'sharp';
import { brainInstructions, getPixvaBrainContext } from '../../lib/pixva-brain.js';
import { randomUUID } from 'node:crypto';
import { readJson, send, validateUser } from '../_lib.js';
import { authorizeUsage, finishUsage } from '../_usage.js';
import { logServerError } from '../../lib/pixva-observability.js';

const sizeMap = {
  square: '1024x1024',
  post: '1024x1536',
  story: '1024x1536',
  landscape: '1536x1024'
};

function isAdvertisingPrompt(value) {
  return /(werbebild|werbung|anzeige|kampagne|flyer|poster|social.?media|instagram.?post|banner|angebot|promotion|advertis)/i.test(value);
}

function isPixvaPrompt(value) {
  return /(?:pixva|yildiz\s*ai)/i.test(value);
}

function buildPrompt(prompt, style, hasReference) {
  const clean = String(prompt || '').trim();
  const common = [
    'photorealistic',
    'realistic photography',
    'natural believable lighting',
    'high detail',
    'premium commercial quality',
    'professional art direction',
    'clean visual hierarchy',
    'sharp coherent details',
    'not a painting',
    'not an illustration',
    'not cartoon'
  ].join(', ');

  const stylePrompts = {
    realistic: `${common}, natural editorial composition, one clear focal point`,
    product: `${common}, professional product photography, clean studio setup, controlled realistic shadows, accurate packaging and materials`,
    poster: `${common}, finished premium advertising poster rather than a plain source photo, cinematic commercial composition, intentional layout, useful negative space, strong headline area, balanced typography, clear call-to-action area`,
    studio: `${common}, premium studio lighting, elegant backdrop, realistic reflections and shadows`
  };

  const instructions = [stylePrompts[style] || stylePrompts.realistic];

  if (hasReference) {
    instructions.push('Edit the supplied reference image according to the user request while preserving important identity, logos, product details and proportions unless the user explicitly asks to change them');
  }

  if (isAdvertisingPrompt(clean)) {
    instructions.push(
      'Create a complete ready-to-use advertising visual, not merely a generic photograph',
      'Use a polished agency-quality layout with clear hierarchy, generous margins, readable large text, and no tiny gibberish text',
      'Do not show error messages, broken interfaces, random code, watermarks, or placeholder text',
      'Keep the design modern, minimal, premium, and immediately understandable as an advertisement'
    );
  } else {
    instructions.push('Do not add text unless the user explicitly requests it');
  }

  if (isPixvaPrompt(clean) && isAdvertisingPrompt(clean)) {
    instructions.push(
      'Brand: PIXVA, spelled exactly "PIXVA"',
      'Use a premium deep navy background with PIXVA violet, blue, cyan and teal accents matching the PIXVA logo',
      'Include the exact main headline "PIXVA"',
      'Include the exact subheadline "Die moderne KI für Bilder, Videos und kreative Projekte"',
      'Include the exact call to action "Jetzt entdecken"',
      'Show an elegant modern workspace and a believable futuristic AI interface, without copying an existing company interface',
      'All German text must be correctly spelled and clearly readable'
    );
  }

  instructions.push(`User request: ${clean}`);
  return instructions.join('. ');
}

function openAIErrorMessage(status, data) {
  const raw = data?.error?.message || data?.message || '';
  if (status === 401) return 'Der OpenAI API-Key ist ungültig.';
  if (status === 403) return 'OpenAI hat die Bildanfrage nicht freigegeben. Prüfe Projekt, Verifizierung und Modellzugriff.';
  if (status === 429) return 'Das OpenAI-Limit oder Guthaben ist erreicht. Prüfe Billing und Limits.';
  return raw || `OpenAI-Bildgenerierung fehlgeschlagen (${status}).`;
}

function dataUrlToImage(value) {
  const match = String(value || '').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return null;
  return { buffer: Buffer.from(match[2], 'base64'), type: match[1] };
}

function extensionFor(type) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

function estimateImageCost(model, quality, size) {
  const envKey = `OPENAI_IMAGE_COST_${String(quality || 'medium').toUpperCase()}`;
  const configured = Number(process.env[envKey]);
  if (Number.isFinite(configured) && configured >= 0) return configured;

  const portrait = size !== '1024x1024';
  const known = {
    'gpt-image-1.5': {
      low: portrait ? 0.013 : 0.009,
      medium: portrait ? 0.05 : 0.034,
      high: portrait ? 0.20 : 0.133,
      auto: portrait ? 0.05 : 0.034
    },
    'gpt-image-1': {
      low: portrait ? 0.016 : 0.011,
      medium: portrait ? 0.063 : 0.042,
      high: portrait ? 0.25 : 0.167,
      auto: portrait ? 0.063 : 0.042
    }
  };
  if (known[model]) return known[model][quality] ?? known[model].medium;

  // GPT Image 2 wird tokenbasiert abgerechnet. Diese konservative Schätzung
  // kann in Vercel mit OPENAI_IMAGE_COST_LOW/MEDIUM/HIGH überschrieben werden.
  const approximate = {
    low: portrait ? 0.02 : 0.015,
    medium: portrait ? 0.07 : 0.05,
    high: portrait ? 0.24 : 0.18,
    auto: portrait ? 0.07 : 0.05
  };
  return approximate[quality] ?? approximate.medium;
}

async function moderatePrompt(apiKey, prompt, referenceImage) {
  const input = [{ type: 'text', text: prompt }];
  if (referenceImage) input.push({ type: 'image_url', image_url: { url: referenceImage } });
  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input })
  });
  if (!response.ok) return;
  const data = await response.json().catch(() => ({}));
  if (data?.results?.some((item) => item?.flagged)) {
    const error = new Error('Diese Bildanfrage wurde aus Sicherheitsgründen blockiert.');
    error.status = 400;
    throw error;
  }
}

async function generateWithModel({ apiKey, model, prompt, size, quality, background, referenceImage, outputFormat }) {
  let response;
  if (referenceImage) {
    const image = dataUrlToImage(referenceImage);
    if (!image) return { ok: false, response: { status: 400 }, data: { error: { message: 'Das Referenzbild ist ungültig.' } } };
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('quality', quality);
    form.append('background', background);
    form.append('output_format', outputFormat);
    if (outputFormat !== 'png') form.append('output_compression', '88');
    form.append('n', '1');
    form.append('image', new Blob([image.buffer], { type: image.type }), `reference.${extensionFor(image.type)}`);
    response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    });
  } else {
    response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size, quality, background, output_format: outputFormat, output_compression: outputFormat === 'png' ? undefined : 88, n: 1 })
    });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, response, data };
  const item = data?.data?.[0] || {};
  if (item.b64_json) {
    return {
      ok: true,
      result: {
        imageDataUrl: `data:image/${outputFormat};base64,${item.b64_json}`,
        provider: model,
        revisedPrompt: item.revised_prompt || '',
        usage: data?.usage || item?.usage || null,
        mimeType: `image/${outputFormat}`
      }
    };
  }
  if (item.url) return { ok: true, result: { imageUrl: item.url, provider: model, revisedPrompt: item.revised_prompt || '', usage: data?.usage || null, mimeType: `image/${outputFormat}` } };
  return { ok: false, response: { status: 502 }, data: { error: { message: 'OpenAI hat keine Bilddatei geliefert.' } } };
}


function pixvaXml(value){return String(value||'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))}
function pixvaDataUrl(value){
  const m=String(value||'').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  return m?{type:m[1],buffer:Buffer.from(m[2],'base64')}:null;
}
async function pixvaResultBuffer(result){
  const data=pixvaDataUrl(result?.imageDataUrl);
  if(data)return data.buffer;
  if(result?.imageUrl){
    const r=await fetch(result.imageUrl);
    if(r.ok)return Buffer.from(await r.arrayBuffer());
  }
  return null;
}
async function pixvaLogoBuffer(company){
  const data=pixvaDataUrl(company?.logoDataUrl);
  if(data)return data.buffer;
  if(company?.logoUrl){
    const r=await fetch(company.logoUrl);
    if(r.ok)return Buffer.from(await r.arrayBuffer());
  }
  return null;
}
async function pixvaBrandImageResult(result,brain,advertising){
  if(!brain?.isCompany)return result;
  const source=await pixvaResultBuffer(result),logo=await pixvaLogoBuffer(brain.company);
  if(!source||!logo)return result;
  const meta=await sharp(source).metadata();
  const width=meta.width||1024,height=meta.height||1024;
  const margin=Math.max(18,Math.round(width*.025));
  const logoW=Math.min(Math.round(width*(advertising?.20:.14)),300);
  const logoPrepared=await sharp(logo).resize({width:logoW,height:Math.round(height*.12),fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const lm=await sharp(logoPrepared).metadata();
  const boxW=(lm.width||logoW)+margin*2,boxH=(lm.height||80)+margin;
  const left=width-boxW-margin,top=height-boxH-margin;

  const c=brain.company||{};
  const contact=[c.companyPhone,c.companyEmail,c.website,c.instagram].filter(Boolean).join(' · ').slice(0,135);
  const company=String(c.companyName||'').slice(0,55);
  const footerH=advertising?Math.max(86,Math.round(height*.09)):0;
  const layers=[];
  if(advertising){
    const svg=`<svg width="${width}" height="${footerH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="rgba(6,23,34,.90)"/><text x="${margin}" y="${Math.round(footerH*.40)}" fill="white" font-family="Arial,sans-serif" font-size="${Math.max(18,Math.round(width*.023))}" font-weight="700">${pixvaXml(company)}</text><text x="${margin}" y="${Math.round(footerH*.72)}" fill="#b9d1dc" font-family="Arial,sans-serif" font-size="${Math.max(12,Math.round(width*.014))}">${pixvaXml(contact)}</text></svg>`;
    layers.push({input:Buffer.from(svg),left:0,top:height-footerH});
  }
  const logoTop=advertising?Math.max(margin,height-footerH+Math.round((footerH-(lm.height||70))/2)):top;
  const logoLeft=width-(lm.width||logoW)-margin;
  layers.push({input:logoPrepared,left:Math.max(0,logoLeft),top:Math.max(0,logoTop)});
  const output=await sharp(source).composite(layers).webp({quality:92}).toBuffer();
  return{...result,imageDataUrl:`data:image/webp;base64,${output.toString('base64')}`,imageUrl:undefined,mimeType:'image/webp',pixvaBrandApplied:true};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });

  let requestId = '';
  let pixvaUser = null;
  try {
    const body = await readJson(req);
    pixvaUser=await validateUser(req);
    const pixvaBrain=await getPixvaBrainContext(pixvaUser).catch(()=>null);
    const prompt = String(body?.prompt || '').trim().slice(0, 3000);
    const aspect = Object.hasOwn(sizeMap, body?.aspect) ? String(body.aspect) : 'post';
    const style = String(body?.style || (isAdvertisingPrompt(prompt) ? 'poster' : 'realistic'));
    const requestedQuality = String(body?.quality || process.env.OPENAI_IMAGE_QUALITY || 'medium');
    const quality = ['low', 'medium', 'high', 'auto'].includes(requestedQuality) ? requestedQuality : 'medium';
    const requestedBackground = String(body?.background || 'auto');
    const background = ['auto', 'opaque', 'transparent'].includes(requestedBackground) ? requestedBackground : 'auto';
    const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
    const referenceImage = String(body?.referenceImage || '');
    requestId = String(body?.requestId || randomUUID());

    if (!prompt) return send(res, 400, { error: 'Bitte gib einen Bild-Prompt ein.' });
    if (!apiKey) return send(res, 500, { error: 'OPENAI_API_KEY fehlt in Vercel.' });

    const requestedModel = String(body?.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2').trim();
    const allowedModels = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1'];
    const primaryModel = allowedModels.includes(requestedModel) ? requestedModel : 'gpt-image-2';
    const models = [...new Set([primaryModel, process.env.OPENAI_IMAGE_FALLBACK_MODEL, 'gpt-image-2'].filter((model) => allowedModels.includes(model)))];
    const size = sizeMap[aspect];
    const outputFormat = background === 'transparent' ? 'png' : 'webp';
    const estimatedCostUsd = estimateImageCost(primaryModel, quality, size);

    await authorizeUsage(req, { requestId, kind: 'image', model: primaryModel, units: 1, estimatedCostUsd });
    await moderatePrompt(apiKey, prompt, referenceImage);

    const finalPrompt = buildPrompt(brainInstructions(pixvaBrain,'image',prompt), style, Boolean(referenceImage));
    let lastStatus = 500;
    let lastData = {};

    for (const model of models) {
      const attempt = await generateWithModel({ apiKey, model, prompt: finalPrompt, size, quality, background, referenceImage, outputFormat });
      if (attempt.ok) {
        await finishUsage(req, { requestId, status: 'completed', actualCostUsd: estimatedCostUsd });
        const pixvaResult=await pixvaBrandImageResult(attempt.result,pixvaBrain,isAdvertisingPrompt(prompt)).catch(()=>attempt.result);
        return send(res, 200, {
          ...pixvaResult,
          requestId,
          estimatedCostUsd,
          quality,
          style,
          aspect,
          background,
          edited: Boolean(referenceImage)
        });
      }
      lastStatus = attempt.response?.status || 500;
      lastData = attempt.data || {};
      if ([401, 403, 429].includes(lastStatus)) break;
      if (![400, 404].includes(lastStatus)) break;
    }

    const message = openAIErrorMessage(lastStatus, lastData);
    await finishUsage(req, { requestId, status: 'failed', actualCostUsd: 0, error: message });
    return send(res, lastStatus, { error: message });
  } catch (error) {
    console.error('OpenAI image generation failed', error);
    await logServerError({userId:pixvaUser?.id||null,area:'image',error,publicMessage:error?.message||'Bildgenerierung fehlgeschlagen.'});
    if (requestId) await finishUsage(req, { requestId, status: 'failed', actualCostUsd: 0, error: error?.message });
    return send(res, error?.status || (/anmelden/i.test(error?.message || '') ? 401 : 500), { error: error?.message || 'Die OpenAI-Bildgenerierung ist fehlgeschlagen.' });
  }
}
