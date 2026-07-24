import { readJson, send } from '../_lib.js';

const SYSTEM_PROMPT = `Du bist Yildiz AI, ein freundlicher, präziser und vielseitiger KI-Assistent. Du hilfst bei Alltag, Lernen, Schreiben, Übersetzen, Programmieren, Unternehmen, Kreativität und Planung. Zusätzlich kennst du dich mit Werbetechnik, Angeboten, Flyern, Druckdaten, Social Media und Webseiten aus. Antworte in der Sprache des Nutzers, klar, ehrlich und praktisch. Wenn Bilder angehängt sind, beschreibe sie hilfreich. Wenn nur eine Videodatei als Anhang vorhanden ist und keine Frames übertragen wurden, erkläre ehrlich, dass nur die Datei vorliegt und keine Bildanalyse der Videoinhalte möglich ist.`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && ['user', 'assistant', 'model'].includes(item.role))
    .slice(-12)
    .map((item) => ({
      role: item.role === 'assistant' ? 'model' : item.role,
      parts: [{ text: String(item.content || '').slice(0, 9000) }]
    }))
    .filter((item) => item.parts[0].text.trim());
}

function extractText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part?.text || '')
    .join('')
    .trim();
}

function normalizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 4)
    .map((item) => ({
      kind: item?.kind === 'video' ? 'video' : 'image',
      name: String(item?.name || '').slice(0, 120),
      mimeType: String(item?.mimeType || '').slice(0, 80),
      data: String(item?.data || ''),
      size: Number(item?.size || 0)
    }))
    .filter((item) => item.name || item.data);
}

function createUserParts(message, attachments) {
  const parts = [];
  const videoAttachments = attachments.filter((item) => item.kind === 'video');
  const imageAttachments = attachments.filter((item) => item.kind === 'image');

  let intro = String(message || '').trim();
  if (videoAttachments.length) {
    const videoInfo = videoAttachments.map((item) => {
      const sizeMb = item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : 'unbekannte Größe';
      return `- ${item.name || 'Video'} (${item.mimeType || 'video/*'}, ${sizeMb})`;
    }).join('\n');
    intro += `\n\nZusätzliche Datei-Anhänge (kein direkter Frame-Zugriff in dieser Version):\n${videoInfo}`;
  }
  parts.push({ text: intro || 'Bitte hilf mir mit diesem Anhang.' });

  for (const image of imageAttachments) {
    const match = image.data.match(/^data:(.+?);base64,(.+)$/);
    if (!match) continue;
    parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
  }
  return parts;
}

async function callGemini({ apiKey, model, message, history, attachments }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            ...cleanHistory(history),
            { role: 'user', parts: createUserParts(message, attachments) }
          ],
          generationConfig: { maxOutputTokens: 2048 }
        })
      }
    );
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function shouldTryAnotherModel(status, message = '') {
  return [400, 404, 408, 429, 500, 502, 503, 504].includes(status) ||
    /high demand|overload|temporar|resource exhausted|unavailable/i.test(message);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });

  try {
    const body = await readJson(req);
    const message = String(body?.message || '').trim().slice(0, 16000);
    const history = body?.history || [];
    const attachments = normalizeAttachments(body?.attachments);
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

    if (!message && !attachments.length) return send(res, 400, { error: 'Bitte gib eine Nachricht oder einen Anhang ein.' });
    if (!apiKey) return send(res, 500, { error: 'Der Gemini API-Key fehlt in Vercel.' });

    const configured = String(process.env.GEMINI_MODEL || '').trim();
    const models = [...new Set([
      configured,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash'
    ].filter(Boolean))];

    let lastStatus = 503;
    let lastMessage = '';

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt) await sleep(700 + Math.floor(Math.random() * 500));
        try {
          const { response, data } = await callGemini({ apiKey, model, message, history, attachments });
          const apiMessage = data?.error?.message || '';
          lastStatus = response.status;
          lastMessage = apiMessage;

          if (response.ok) {
            const answer = extractText(data);
            if (answer) return send(res, 200, { answer, model });
            lastMessage = 'Gemini hat keine Textantwort geliefert.';
            break;
          }

          if (response.status === 401 || response.status === 403) {
            return send(res, response.status, { error: 'Der Gemini API-Key ist ungültig oder nicht freigegeben.' });
          }
          if (!shouldTryAnotherModel(response.status, apiMessage)) break;
        } catch (error) {
          lastStatus = error?.name === 'AbortError' ? 504 : 503;
          lastMessage = error?.name === 'AbortError' ? 'Zeitüberschreitung beim KI-Dienst.' : String(error?.message || 'Verbindungsfehler');
        }
      }
    }

    if (lastStatus === 429) {
      return send(res, 429, { error: 'Das kostenlose Gemini-Limit ist gerade erreicht. Bitte warte kurz und versuche es erneut.' });
    }
    return send(res, 503, {
      error: 'Gemini ist gerade stark ausgelastet. Bitte versuche es gleich noch einmal.',
      technical: lastMessage || undefined
    });
  } catch (error) {
    console.error('Yildiz AI Gemini error:', error);
    return send(res, 500, { error: error?.message || 'Die Verbindung zu Gemini ist fehlgeschlagen.' });
  }
}
