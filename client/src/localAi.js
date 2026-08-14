const SYSTEM_PROMPT = `Du bist PIXVA, ein freundlicher, präziser und vielseitiger KI-Assistent. Du hilfst bei Alltag, Lernen, Schreiben, Übersetzen, Programmieren, Unternehmen, Kreativität und Planung. Zusätzlich kennst du dich mit Werbetechnik, Angeboten, Flyern, Druckdaten, Social Media und Webseiten aus. Antworte in der Sprache des Nutzers, klar, ehrlich und praktisch. Erfinde keine Fakten.`;

let engine = null;
let enginePromise = null;
let activeModel = '';
let webllmPromise = null;

export function localAiSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
}

async function loadWebLLM() {
  if (!webllmPromise) {
    const moduleUrl = 'https://esm.run/@mlc-ai/web-llm';
    webllmPromise = import(/* @vite-ignore */ moduleUrl);
  }
  return webllmPromise;
}

function chooseModel(prebuiltAppConfig) {
  const ids = (prebuiltAppConfig?.model_list || []).map((item) => item.model_id).filter(Boolean);
  const patterns = [
    /Qwen.*0\.5B.*Instruct.*q4f16/i,
    /Qwen.*0\.5B.*Instruct/i,
    /Llama-3\.2-1B.*Instruct.*q4f16/i,
    /Llama.*1B.*Instruct/i,
    /Phi.*mini.*Instruct/i,
    /Instruct/i
  ];
  for (const pattern of patterns) {
    const found = ids.find((id) => pattern.test(id));
    if (found) return found;
  }
  throw new Error('Kein lokales KI-Modell wurde in der verfügbaren WebLLM-Version gefunden.');
}

function progressText(progress) {
  const raw = Number(progress?.progress || 0);
  const percent = Math.max(0, Math.min(100, Math.round(raw * 100)));
  const label = String(progress?.text || '').trim();
  return label ? `${label} ${percent}%` : `Lokales KI-Modell wird geladen: ${percent}%`;
}

export async function ensureLocalAi(onProgress = () => {}) {
  if (!localAiSupported()) {
    throw new Error('Die kostenlose lokale KI benötigt WebGPU. Öffne PIXVA in einer aktuellen Chrome- oder Edge-Version auf einem geeigneten Computer.');
  }
  if (engine) return engine;
  if (!enginePromise) {
    onProgress('Lokale KI-Bibliothek wird geladen …');
    enginePromise = loadWebLLM().then(async ({ CreateMLCEngine, prebuiltAppConfig }) => {
      activeModel = chooseModel(prebuiltAppConfig);
      return CreateMLCEngine(activeModel, {
        initProgressCallback: (progress) => onProgress(progressText(progress))
      });
    }).then((created) => {
      engine = created;
      onProgress('Lokale KI ist bereit.');
      return created;
    }).catch((error) => {
      enginePromise = null;
      activeModel = '';
      throw error;
    });
  }
  return enginePromise;
}

export function getLocalModelName() {
  return activeModel || 'wird beim ersten Start automatisch gewählt';
}

export async function localChat(prompt, previousMessages = [], onProgress = () => {}) {
  const clean = String(prompt || '').trim();
  if (!clean) throw new Error('Bitte eine Nachricht eingeben.');
  const localEngine = await ensureLocalAi(onProgress);
  onProgress('PIXVA denkt lokal …');

  const history = previousMessages
    .filter((message) => ['user', 'assistant'].includes(message.role))
    .slice(-10)
    .map((message) => ({ role: message.role, content: String(message.content || '') }));

  const completion = await localEngine.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: clean }
    ],
    temperature: 0.7,
    max_tokens: 700
  });

  const answer = completion?.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error('Die lokale KI hat keine Antwort erzeugt.');
  onProgress('Lokale KI ist bereit.');
  return answer;
}
