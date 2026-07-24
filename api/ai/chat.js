import { readJson, send, validateUser } from '../_lib.js';

const SYSTEM_PROMPT = `Du bist Yildiz AI, ein freundlicher, präziser und vielseitiger KI-Assistent. Du hilfst bei Alltag, Lernen, Schreiben, Übersetzen, Programmieren, Unternehmen, Kreativität und Planung. Zusätzlich kennst du dich mit Werbetechnik, Angeboten, Flyern, Druckdaten, Social Media und Webseiten aus. Antworte in der Sprache des Nutzers, klar, ehrlich und praktisch. Erfinde keine Fakten und sage offen, wenn du etwas nicht sicher weißt.`;

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && ['user', 'assistant', 'model'].includes(item.role))
    .slice(-16)
    .map((item) => ({
      role: item.role === 'assistant' ? 'model' : item.role,
      parts: [{ text: String(item.content || '').slice(0, 12000) }]
    }));
}

function extractText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part?.text || '')
    .join('')
    .trim();
}

async function callGemini({ apiKey, model, message, history }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
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
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });
  }

  try {
    await validateUser(req);
    const body = await readJson(req);
    const message = String(body?.message || '').trim();
    const history = body?.history || [];
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

    if (!message) return send(res, 400, { error: 'Bitte gib eine Nachricht ein.' });
    if (!apiKey) {
      return send(res, 500, {
        error: 'Der Gemini API-Key fehlt. Trage GEMINI_API_KEY in Vercel ein und starte danach ein Redeploy.'
      });
    }

    const configuredModel = String(process.env.GEMINI_MODEL || 'gemini-3.5-flash').trim();
    const models = [...new Set([configuredModel, 'gemini-3.5-flash', 'gemini-3.6-flash'])];
    let lastResult = null;

    for (const model of models) {
      const result = await callGemini({ apiKey, model, message, history });
      lastResult = result;

      if (result.response.ok) {
        const answer = extractText(result.data);
        if (!answer) return send(res, 502, { error: 'Gemini hat keine Textantwort geliefert.' });
        return send(res, 200, { answer, model });
      }

      // Nur bei einem nicht vorhandenen Modell das nächste Modell versuchen.
      if (result.response.status !== 404) break;
    }

    const status = lastResult?.response?.status || 500;
    const apiMessage = lastResult?.data?.error?.message || '';

    if (status === 429) {
      return send(res, 429, {
        error: 'Das kostenlose Gemini-Limit ist momentan erreicht. Bitte versuche es später erneut.'
      });
    }
    if (status === 401 || status === 403) {
      return send(res, status, {
        error: 'Der Gemini API-Key ist ungültig oder für die Gemini API nicht freigegeben.'
      });
    }

    return send(res, status, {
      error: apiMessage || 'Die Gemini-Anfrage konnte nicht ausgeführt werden.'
    });
  } catch (error) {
    console.error('Yildiz AI Gemini error:', error);
    return send(res, 500, { error: error?.message || 'Die Verbindung zu Gemini ist fehlgeschlagen.' });
  }
}
