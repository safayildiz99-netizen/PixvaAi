import { send } from '../_lib.js';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 PIXVA/14.5';

function cleanQuery(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function decodeHtml(value='') {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchText(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.7', ...headers }
    });
    if (!response.ok) throw new Error(`Bildsuche HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, headers = {}) {
  const raw = await fetchText(url, { Accept: 'application/json', ...headers });
  return JSON.parse(raw);
}

async function searchGoogle(query, mode='product') {
  const key = String(process.env.GOOGLE_CSE_API_KEY || '').trim();
  const cx = String(process.env.GOOGLE_CSE_CX || '').trim();
  if (!key || !cx) throw new Error('Google Bildsuche ist noch nicht mit GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX verbunden.');
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);
  url.searchParams.set('searchType', 'image');
  url.searchParams.set('num', '8');
  url.searchParams.set('safe', 'active');
  if(mode==='logo'){
    url.searchParams.set('imgSize','medium');
  }
  const data = await fetchJson(url.toString());
  return (Array.isArray(data?.items) ? data.items : []).map((item, index) => ({
    id: `google-${index}-${Date.now()}`,
    title: String(item?.title || query).replace(/<[^>]+>/g, '').slice(0, 180),
    imageUrl: safeHttpUrl(item?.link),
    thumbnailUrl: safeHttpUrl(item?.image?.thumbnailLink || item?.link),
    sourceUrl: safeHttpUrl(item?.image?.contextLink),
    source: 'Google Images',
    width: Number(item?.image?.width || 0),
    height: Number(item?.image?.height || 0)
  })).filter(item => item.imageUrl || item.thumbnailUrl).slice(0, 8);
}

async function searchDuckDuckGo(query) {
  const homepage = await fetchText(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`);
  const token = homepage.match(/vqd=["']?([\d-]+)["']?/i)?.[1]
    || homepage.match(/"vqd"\s*:\s*"([^"]+)"/i)?.[1]
    || homepage.match(/vqd%3D([\d-]+)/i)?.[1];
  if (!token) throw new Error('Bildsuch-Token konnte nicht geladen werden.');
  const endpoint = `https://duckduckgo.com/i.js?l=de-de&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(token)}&f=,,,`;
  const data = JSON.parse(await fetchText(endpoint, { Referer: 'https://duckduckgo.com/' }));
  return (Array.isArray(data?.results) ? data.results : []).map((item, index) => ({
    id: `ddg-${index}-${Date.now()}`,
    title: String(item?.title || query).replace(/<[^>]+>/g, '').slice(0, 180),
    imageUrl: safeHttpUrl(item?.image),
    thumbnailUrl: safeHttpUrl(item?.thumbnail),
    sourceUrl: safeHttpUrl(item?.url),
    source: String(item?.source || 'Web').slice(0, 100),
    width: Number(item?.width || 0),
    height: Number(item?.height || 0)
  })).filter(item => item.imageUrl || item.thumbnailUrl).slice(0, 8);
}

async function searchBing(query) {
  const html = await fetchText(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC3&first=1&tsc=ImageBasicHover`);
  const matches = [...html.matchAll(/<a[^>]+class="iusc"[^>]+m="([^"]+)"/gi)];
  const results = [];
  for (const [_, metaRaw] of matches) {
    try {
      const meta = JSON.parse(decodeHtml(metaRaw));
      const imageUrl = safeHttpUrl(meta?.murl || meta?.imgurl || meta?.turl || '');
      const thumbnailUrl = safeHttpUrl(meta?.turl || meta?.imgurl || meta?.murl || '');
      const title = String(meta?.t || meta?.title || query).replace(/<[^>]+>/g, '').slice(0, 180);
      const sourceUrl = safeHttpUrl(meta?.purl || meta?.surl || meta?.ru || '');
      if (!imageUrl && !thumbnailUrl) continue;
      results.push({
        id: `bing-${results.length}-${Date.now()}`,
        title,
        imageUrl,
        thumbnailUrl,
        sourceUrl,
        source: 'Bing Images',
        width: Number(meta?.w || 0),
        height: Number(meta?.h || 0)
      });
      if (results.length >= 8) break;
    } catch {
    }
  }
  if (!results.length) throw new Error('Bing lieferte keine Bildtreffer.');
  return results;
}

async function searchWikimedia(query) {
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query'); endpoint.searchParams.set('generator', 'search'); endpoint.searchParams.set('gsrsearch', query);
  endpoint.searchParams.set('gsrnamespace', '6'); endpoint.searchParams.set('gsrlimit', '8'); endpoint.searchParams.set('prop', 'imageinfo|info');
  endpoint.searchParams.set('iiprop', 'url|mime|size'); endpoint.searchParams.set('iiurlwidth', '600'); endpoint.searchParams.set('inprop', 'url');
  endpoint.searchParams.set('format', 'json'); endpoint.searchParams.set('origin', '*');
  const data = await fetchJson(endpoint.toString());
  return Object.values(data?.query?.pages || {}).map((page, index) => {
    const info = page?.imageinfo?.[0] || {};
    return {
      id:`commons-${page?.pageid || index}`,
      title:String(page?.title || query).replace(/^File:/i,'').slice(0,180),
      imageUrl:safeHttpUrl(info?.url),
      thumbnailUrl:safeHttpUrl(info?.thumburl||info?.url),
      sourceUrl:safeHttpUrl(page?.canonicalurl||page?.fullurl),
      source:'Wikimedia Commons',
      width:Number(info?.width||0),
      height:Number(info?.height||0)
    };
  }).filter(item => item.imageUrl || item.thumbnailUrl).slice(0,8);
}

function normalizeOpenFoodFacts(product, index, query) {
  const imageUrl = safeHttpUrl(product?.image_front_url || product?.image_url || product?.selected_images?.front?.display?.de || product?.selected_images?.front?.display?.fr || product?.selected_images?.front?.display?.en || '');
  const thumbnailUrl = safeHttpUrl(product?.image_front_small_url || product?.image_small_url || imageUrl);
  const sourceUrl = safeHttpUrl(product?.url || `https://world.openfoodfacts.org/product/${encodeURIComponent(product?.code || '')}`);
  return {
    id: String(product?.code || `off-${index}-${Date.now()}`),
    title: String(product?.product_name || product?.generic_name || query).slice(0, 180),
    imageUrl,
    thumbnailUrl,
    sourceUrl,
    source: 'Open Food Facts',
    width: 0,
    height: 0,
    ean: String(product?.code || ''),
    brand: String(product?.brands || ''),
    weight: String(product?.quantity || '')
  };
}

async function searchOpenFoodFacts(query) {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query.replace(/produktbild|packung|freigestellt/gi, '').trim());
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '8');
  url.searchParams.set('fields', 'code,product_name,generic_name,brands,quantity,image_front_url,image_front_small_url,image_url,image_small_url,url,selected_images');
  const data = await fetchJson(url.toString());
  return (Array.isArray(data?.products) ? data.products : [])
    .map((item, index) => normalizeOpenFoodFacts(item, index, query))
    .filter(item => item.imageUrl || item.thumbnailUrl)
    .slice(0, 8);
}

function normalizeDatabaseItem(item, index, query) {
  const image = item?.imageUrl || item?.image_url || item?.image || item?.photo || item?.photoUrl || item?.thumbnail || item?.url || '';
  return {
    id: String(item?.id || item?.ean || item?.gtin || `pixvadb-${index}-${Date.now()}`),
    title: String(item?.name || item?.productName || item?.product_name || item?.title || query).slice(0, 180),
    imageUrl: safeHttpUrl(image), thumbnailUrl: safeHttpUrl(item?.thumbnailUrl || item?.thumbnail_url || image),
    sourceUrl: safeHttpUrl(item?.sourceUrl || item?.source_url || item?.productUrl || item?.product_url || ''),
    source: 'PIXVA Produktdatenbank', width:Number(item?.width || 0), height:Number(item?.height || 0),
    ean:String(item?.ean || item?.gtin || ''), brand:String(item?.brand || item?.manufacturer || ''), weight:String(item?.weight || item?.quantity || '')
  };
}

async function searchPixvaDatabase(query) {
  const base = String(process.env.PIXVA_PRODUCT_DB_URL || '').trim();
  const key = String(process.env.PIXVA_PRODUCT_DB_API_KEY || '').trim();
  if (!base || !key) throw new Error('PIXVA Produktdatenbank ist noch nicht verbunden. Später PIXVA_PRODUCT_DB_URL und PIXVA_PRODUCT_DB_API_KEY in Vercel hinterlegen.');
  const url = new URL(base);
  url.searchParams.set('q', query);
  const data = await fetchJson(url.toString(), { Authorization:`Bearer ${key}` });
  const items = Array.isArray(data) ? data : (data?.results || data?.products || data?.items || data?.data || []);
  return (Array.isArray(items) ? items : []).map((item,index)=>normalizeDatabaseItem(item,index,query)).filter(item=>item.imageUrl||item.thumbnailUrl).slice(0,8);
}

function normalizeSearchText(value='') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PRODUCT_SEARCH_STOPWORDS = new Set([
  'produktbild','produkt','packung','freigestellt','bild','photo','foto','kaufen','shop','online'
]);

const PRODUCT_VARIANTS = [
  ['vegan', /\b(vegan|veggie|vegetarisch|pflanzlich|plant based|plantbased)\b/],
  ['light', /\b(light|leicht|fettreduziert|reduced fat)\b/],
  ['scharf', /\b(scharf|pikant|hot|acili|acı|extra hot)\b/],
  ['mild', /\b(mild|sanft)\b/],
  ['bio', /\b(bio|organic|oekologisch|ökologisch)\b/],
  ['gefluegel', /\b(gefluegel|geflügel|huhn|chicken|tavuk)\b/],
  ['rind', /\b(rind|beef|dana)\b/],
  ['knoblauch', /\b(knoblauch|garlic|sarimsak|sarımsak)\b/]
];

export function scoreProductResult(item, query='') {
  const q = normalizeSearchText(query);
  const title = normalizeSearchText(`${item?.title || ''} ${item?.brand || ''} ${item?.weight || ''}`);
  const queryTokens = q.split(' ').filter(token => token.length > 1 && !PRODUCT_SEARCH_STOPWORDS.has(token));
  let score = 0;

  for (const token of queryTokens) {
    if (title.includes(token)) score += token.length >= 5 ? 12 : 7;
    else score -= token.length >= 5 ? 5 : 2;
  }

  for (const [name, pattern] of PRODUCT_VARIANTS) {
    const requested = pattern.test(q);
    pattern.lastIndex = 0;
    const present = pattern.test(title);
    pattern.lastIndex = 0;
    if (present && !requested) score -= 80;
    if (present && requested) score += 28;
  }

  const variantRequested = PRODUCT_VARIANTS.some(([,pattern]) => {
    pattern.lastIndex = 0;
    const yes = pattern.test(q);
    pattern.lastIndex = 0;
    return yes;
  });
  if (!variantRequested && /\b(classic|klassik|original|originale|klasik)\b/.test(title)) score += 14;
  if (item?.source === 'PIXVA Produktdatenbank') score += 20;
  if (item?.source === 'Open Food Facts') score += 5;
  if (Number(item?.width || 0) >= 500 || Number(item?.height || 0) >= 500) score += 3;
  return score;
}

export function rankProductResults(items=[], query='') {
  return [...items]
    .map((item,index)=>({item,index,score:scoreProductResult(item,query)}))
    .sort((a,b)=>b.score-a.score || a.index-b.index)
    .map(entry=>({...entry.item,relevanceScore:entry.score}));
}


function rankLogoResults(items=[], companyName='') {
  const wanted=normalizeSearchText(companyName);
  const wantedTokens=wanted.split(' ').filter(token=>token.length>1&&!['supermarkt','markt','market'].includes(token));
  return [...items]
    .map((item,index)=>{
      const title=normalizeSearchText(`${item?.title||''} ${item?.source||''}`);
      let score=0;
      for(const token of wantedTokens){
        if(title.includes(token))score+=18;
        else score-=8;
      }
      if(/\blogo\b/.test(title))score+=24;
      if(/instagram|facebook|pinterest|tiktok/.test(title))score-=8;
      if(String(item?.source||'').toLowerCase().includes('google'))score+=5;
      const w=Number(item?.width||0),h=Number(item?.height||0);
      if(w>0&&h>0){
        const ratio=Math.max(w,h)/Math.max(1,Math.min(w,h));
        if(ratio<=3.5)score+=4;
      }
      return {item,index,score};
    })
    .sort((a,b)=>b.score-a.score||a.index-b.index)
    .map(entry=>({...entry.item,relevanceScore:entry.score}));
}

function dedupeResults(items=[]) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = safeHttpUrl(item?.imageUrl || item?.thumbnailUrl || item?.sourceUrl || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 8) break;
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Nur GET oder POST ist erlaubt.' });
  try {
    const input = req.method === 'GET' ? req.query : req.body || {};
    const query = cleanQuery(req.method === 'GET' ? req.query?.q : req.body?.query);
    const requestedSource = String(input?.source || 'web').toLowerCase() === 'database' ? 'database' : 'web';
    const mode = String(input?.mode || 'product').toLowerCase() === 'logo' ? 'logo' : 'product';
    if (!query) return send(res, 400, { error: 'Bitte gib einen Suchbegriff ein.' });

    let results = [];
    const warnings = [];
    let provider = requestedSource;

    if (requestedSource === 'database' && mode!=='logo') {
      try { results = await searchPixvaDatabase(query); provider = 'pixva-database'; }
      catch (error) { warnings.push(error.message); }
    } else {
      try {
        const google = await searchGoogle(query, mode);
        results.push(...google);
        if (google.length) provider = 'google';
      } catch (error) { warnings.push(`Google: ${error.message}`); }

      if (results.length < 4) {
        try {
          const ddg = await searchDuckDuckGo(query);
          results.push(...ddg);
          if (ddg.length && provider === 'web') provider = 'duckduckgo';
        } catch (error) { warnings.push(`DuckDuckGo: ${error.message}`); }
      }

      if (results.length < 4) {
        try {
          const bing = await searchBing(query);
          results.push(...bing);
          if (bing.length && provider === 'web') provider = 'bing';
        } catch (error) { warnings.push(`Bing: ${error.message}`); }
      }

      if (mode!=='logo' && results.length < 4) {
        try {
          const foods = await searchOpenFoodFacts(query);
          results.push(...foods);
          if (foods.length && provider === 'web') provider = 'openfoodfacts';
        } catch (error) { warnings.push(`OpenFoodFacts: ${error.message}`); }
      }

      if (results.length < 3) {
        try {
          const commons = await searchWikimedia(query);
          results.push(...commons);
        } catch (error) { warnings.push(`Wikimedia: ${error.message}`); }
      }
    }

    const finalResults = dedupeResults(mode==='logo' ? rankLogoResults(results, query.replace(/\b(?:offizielles?|official|logo|png|transparent)\b/gi,' ').trim()) : rankProductResults(results, query));

    return send(res, 200, {
      query,
      free: true,
      requestedSource,
      mode,
      provider,
      results: finalResults,
      searchLinks: {
        googleImages:`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`,
        bingImages:`https://www.bing.com/images/search?q=${encodeURIComponent(query)}`
      },
      warning: finalResults.length ? undefined : (warnings[0] || 'Direkte Bilder konnten gerade nicht geladen werden.'),
      technical: warnings.length ? warnings : undefined
    });
  } catch (error) {
    return send(res, 500, { error: error?.message || 'Die kostenlose Bildsuche ist fehlgeschlagen.' });
  }
}
