import { send } from '../_lib.js';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 YildizAI/1.0';

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

async function searchDuckDuckGo(query) {
  const homepage = await fetchText(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`);
  const token = homepage.match(/vqd=["']?([\d-]+)["']?/i)?.[1]
    || homepage.match(/"vqd"\s*:\s*"([^"]+)"/i)?.[1]
    || homepage.match(/vqd%3D([\d-]+)/i)?.[1];
  if (!token) throw new Error('Bildsuch-Token konnte nicht geladen werden.');

  const endpoint = `https://duckduckgo.com/i.js?l=de-de&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(token)}&f=,,,`;
  const raw = await fetchText(endpoint, { Referer: 'https://duckduckgo.com/' });
  const data = JSON.parse(raw);
  return (Array.isArray(data?.results) ? data.results : [])
    .map((item, index) => ({
      id: `ddg-${index}-${Date.now()}`,
      title: String(item?.title || query).replace(/<[^>]+>/g, '').slice(0, 180),
      imageUrl: safeHttpUrl(item?.image),
      thumbnailUrl: safeHttpUrl(item?.thumbnail),
      sourceUrl: safeHttpUrl(item?.url),
      source: String(item?.source || '').slice(0, 100),
      width: Number(item?.width || 0),
      height: Number(item?.height || 0)
    }))
    .filter((item) => item.imageUrl || item.thumbnailUrl)
    .slice(0, 8);
}

async function searchWikimedia(query) {
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('generator', 'search');
  endpoint.searchParams.set('gsrsearch', query);
  endpoint.searchParams.set('gsrnamespace', '6');
  endpoint.searchParams.set('gsrlimit', '8');
  endpoint.searchParams.set('prop', 'imageinfo|info');
  endpoint.searchParams.set('iiprop', 'url|mime|size');
  endpoint.searchParams.set('iiurlwidth', '600');
  endpoint.searchParams.set('inprop', 'url');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('origin', '*');
  const raw = await fetchText(endpoint.toString());
  const data = JSON.parse(raw);
  return Object.values(data?.query?.pages || {})
    .map((page, index) => {
      const info = page?.imageinfo?.[0] || {};
      return {
        id: `commons-${page?.pageid || index}`,
        title: String(page?.title || query).replace(/^File:/i, '').slice(0, 180),
        imageUrl: safeHttpUrl(info?.url),
        thumbnailUrl: safeHttpUrl(info?.thumburl || info?.url),
        sourceUrl: safeHttpUrl(page?.canonicalurl || page?.fullurl),
        source: 'Wikimedia Commons',
        width: Number(info?.width || 0),
        height: Number(info?.height || 0)
      };
    })
    .filter((item) => item.imageUrl || item.thumbnailUrl)
    .slice(0, 8);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Nur GET oder POST ist erlaubt.' });
  try {
    const query = cleanQuery(req.method === 'GET' ? req.query?.q : req.body?.query);
    if (!query) return send(res, 400, { error: 'Bitte gib einen Suchbegriff ein.' });

    let results = [];
    const warnings = [];
    try {
      results = await searchDuckDuckGo(query);
    } catch (error) {
      warnings.push(`DuckDuckGo: ${error.message}`);
    }
    if (results.length < 3) {
      try {
        const commons = await searchWikimedia(query);
        const known = new Set(results.map((item) => item.imageUrl));
        results.push(...commons.filter((item) => !known.has(item.imageUrl)));
      } catch (error) {
        warnings.push(`Wikimedia: ${error.message}`);
      }
    }

    return send(res, 200, {
      query,
      free: true,
      results: results.slice(0, 8),
      searchLinks: {
        googleImages: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`,
        bingImages: `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`
      },
      warning: results.length ? undefined : 'Direkte Bilder konnten gerade nicht geladen werden. Öffne einen der kostenlosen Suchlinks.',
      technical: warnings.length ? warnings : undefined
    });
  } catch (error) {
    return send(res, 500, { error: error?.message || 'Die kostenlose Bildsuche ist fehlgeschlagen.' });
  }
}
