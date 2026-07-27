import { randomUUID } from 'node:crypto';
import { env, finishJob, handleApiError, logError, readJson, requireUser, reserveJob, send, serviceClient } from '../_lib.js';
import { moderate } from '../_moderation.js';

const SYSTEM = `Du bist Yildiz AI. Antworte in der Sprache des Nutzers, klar und praktisch. Bei aktuellen Fakten, Produkten, Beliebtheit, Preisen oder externen Behauptungen darfst du nicht raten: Nutze die aktivierte Websuche und gib Quellen aus. Erfundene Quellen sind verboten. Bei Dateiwünschen weist du die Oberfläche an, eine echte Datei zu erzeugen. Behaupte nicht, dass du nur textbasiert bist.`;

function extractInteraction(data) {
  let text = '';
  const sources = [];
  for (const step of data?.steps || []) {
    if (step?.type !== 'model_output') continue;
    for (const block of step?.content || []) {
      if (block?.type === 'text') {
        text += block.text || '';
        for (const annotation of block.annotations || []) {
          if (annotation?.type === 'url_citation' && annotation.url) {
            sources.push({ url: annotation.url, title: annotation.title || annotation.url, startIndex: annotation.start_index, endIndex: annotation.end_index });
          }
        }
      }
    }
  }
  if (!text) text = data?.output_text || '';
  const unique = [...new Map(sources.map((s) => [s.url, s])).values()];
  return { text: text.trim(), sources: unique };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST ist erlaubt.' });
  let auth; let jobId = null; let model = '';
  try {
    auth = await requireUser(req);
    const body = await readJson(req);
    const message = String(body.message || '').trim().slice(0, 16000);
    if (!message) return send(res, 400, { error: 'Bitte gib eine Nachricht ein.' });
    const requestId = String(body.requestId || randomUUID());
    model = env('GEMINI_MODEL','gemini-3.6-flash');
    const estimated = Math.max(0, Number(env('CHAT_COST_USD_PER_REQUEST','0')) || 0);
    const reservation = await reserveJob(req, {
      requestId, kind: 'chat', model, prompt: message, units: 1, format: 'text', quality: '', estimatedCostUsd: estimated,
      costConfirmed: body.costConfirmed, metadata: { webSearch: Boolean(body.webSearch), chatId: body.chatId || null }
    });
    jobId = reservation.job.id;
    if (reservation.duplicate && ['completed','in_progress','queued'].includes(reservation.job.status)) {
      return send(res, 200, { duplicate: true, job: reservation.job });
    }
    await moderate({ text: message });
    await finishJob({ jobId, status: 'in_progress', progress: 10 });

    const apiKey = env('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY fehlt in Vercel.');
    const history = Array.isArray(body.history) ? body.history.slice(-12).map((m) => `${m.role === 'assistant' ? 'ASSISTENT' : 'NUTZER'}: ${String(m.content || '').slice(0,5000)}`).join('\n') : '';
    const input = `${SYSTEM}\n\n${history ? `Bisheriger Verlauf:\n${history}\n\n` : ''}Nutzer: ${message}`;
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input, tools: body.webSearch ? [{ type: 'google_search' }] : undefined, store: false })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data?.error?.message || `Gemini HTTP ${response.status}`), { status: response.status });
    const result = extractInteraction(data);
    if (!result.text) throw new Error('Gemini hat keine Antwort geliefert.');

    const db = serviceClient();
    let chatId = String(body.chatId || '');
    if (!chatId) {
      const { data: chat, error } = await db.from('chats').insert({ user_id: auth.user.id, title: message.slice(0,70) }).select('*').single();
      if (error) throw error;
      chatId = chat.id;
    } else {
      const { data: chat } = await db.from('chats').select('id').eq('id', chatId).eq('user_id', auth.user.id).single();
      if (!chat) throw Object.assign(new Error('Chat gehört nicht zu diesem Konto.'), { status: 403 });
    }
    await db.from('chat_messages').insert([
      { user_id: auth.user.id, chat_id: chatId, role: 'user', content: message },
      { user_id: auth.user.id, chat_id: chatId, role: 'assistant', content: result.text, sources: result.sources, model }
    ]);
    await db.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
    await finishJob({ jobId, status: 'completed', progress: 100, actualCostUsd: estimated, metadataPatch: { chatId, sourceCount: result.sources.length } });
    return send(res, 200, { answer: result.text, sources: result.sources, model, chatId, jobId, estimatedCostUsd: estimated });
  } catch (error) {
    if (jobId) await finishJob({ jobId, status: 'failed', progress: 100, actualCostUsd: 0, errorMessage: error.message }).catch(() => {});
    await logError({ userId: auth?.user?.id, jobId, functionName: 'ai/chat', model, publicMessage: error.message || 'Chat fehlgeschlagen.', technicalMessage: error.stack || error.message, retryable: true });
    return handleApiError(res, error, 'Chat fehlgeschlagen.');
  }
}
