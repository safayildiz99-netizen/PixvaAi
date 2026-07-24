import { readJson, send } from '../_lib.js';

const SYSTEM_PROMPT = `Du bist Yildiz AI, ein freundlicher, präziser und vielseitiger KI-Assistent. Du hilfst bei Alltag, Lernen, Schreiben, Übersetzen, Programmieren, Unternehmen, Kreativität und Planung. Zusätzlich kennst du dich mit Werbetechnik, Angeboten, Flyern, Druckdaten, Social Media und Webseiten aus. Antworte in der Sprache des Nutzers, klar, ehrlich und praktisch. Erfinde keine Fakten und sage offen, wenn du etwas nicht sicher weißt.`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && ['user', 'assistant', 'model'].includes(item.role))
    .slice(-14)
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

async function callGemini({ apiKey, model, message, history }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
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
            { role: 'user', parts: [{ text: message }] }
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
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

    if (!message) return send(res, 400, { error: 'Bitte gib eine Nachricht ein.' });
    if (!apiKey) return send(res, 500, { error: 'Der Gemini API-Key fehlt in Vercel.' });

    // Neuester stabiler Stand zuerst, danach sparsame Modelle als automatische Ausweichlösung.
    const configured = String(process.env.GEMINI_MODEL || '').trim();
    const models = [...new Set([
      configured,
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash'
    ].filter(Boolean))];

    let lastStatus = 503;
    let lastMessage = '';

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt) await sleep(700 + Math.floor(Math.random() * 500));
        try {
          const { response, data } = await callGemini({ apiKey, model, message, history });
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
      error: 'Gemini ist gerade stark ausgelastet. Yildiz AI hat mehrere aktuelle Modelle versucht. Bitte probiere es in ein bis zwei Minuten erneut.',
      technical: lastMessage || undefined
    });
  } catch (error) {
    console.error('Yildiz AI Gemini error:', error);
    return send(res, 500, { error: error?.message || 'Die Verbindung zu Gemini ist fehlgeschlagen.' });
  }
}
