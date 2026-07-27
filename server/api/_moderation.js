import { env } from './_lib.js';

export async function moderate({ text = '', imageDataUrl = '' }) {
  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) return { skipped: true };
  const input = [];
  if (String(text).trim()) input.push({ type: 'text', text: String(text).slice(0, 12000) });
  if (String(imageDataUrl).startsWith('data:image/')) input.push({ type: 'image_url', image_url: { url: imageDataUrl } });
  if (!input.length) return { skipped: true };
  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input })
  });
  if (!response.ok) return { skipped: true, warning: `Moderation HTTP ${response.status}` };
  const data = await response.json();
  const flagged = data?.results?.some((item) => item?.flagged);
  if (flagged) throw Object.assign(new Error('Diese Anfrage wurde aus Sicherheitsgründen blockiert.'), { status: 400 });
  return { flagged: false };
}
