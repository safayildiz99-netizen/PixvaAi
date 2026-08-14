import dns from 'node:dns/promises';
import net from 'node:net';

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return true;
  if (ip.includes(':')) {
    const value = ip.toLowerCase();
    return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:');
  }
  const parts = ip.split('.').map(Number);
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

async function validateRemoteUrl(value) {
  const parsed = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Nur HTTP- und HTTPS-Bilder sind erlaubt.');
  if (!parsed.hostname || parsed.username || parsed.password) throw new Error('Ungültige Bildadresse.');
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) throw new Error('Private oder lokale Adressen sind nicht erlaubt.');
  return parsed;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Nur GET ist erlaubt.' });
    return;
  }
  try {
    const remote = await validateRemoteUrl(req.query?.url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    let response;
    try {
      response = await fetch(remote, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36 PIXVA/1.0',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`Bildserver HTTP ${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error('Die Adresse liefert kein Bild.');
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > 12 * 1024 * 1024) throw new Error('Das Bild ist größer als 12 MB.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 12 * 1024 * 1024) throw new Error('Das Bild ist größer als 12 MB.');
    res.status(200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(bytes);
  } catch (error) {
    res.status(400).json({ error: error?.message || 'Bild konnte nicht geladen werden.' });
  }
}
