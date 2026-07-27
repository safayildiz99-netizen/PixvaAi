export const PLAN_CATALOG = [
  {
    id: 'free',
    name: 'Free',
    eyebrow: 'Kostenlos starten',
    examplePrice: 0,
    betaPrice: 0,
    description: 'Für Chat, kostenlose Produktsuche und einfache Dateien.',
    features: [
      'Allgemeiner KI-Chat',
      'Kostenlose Produktbildsuche mit Quellenlink',
      'PDF, TXT, CSV, JSON, HTML und Markdown',
      'Uploads und Bild-/Dateianalyse',
      'Lokale Entwürfe und kostenlose Browser-Alternativen'
    ],
    limits: { projects: 0 },
    access: {
      chat: true,
      freeImageSearch: true,
      files: true,
      flyer: false,
      image: false,
      paidImages: false,
      video: false,
      paidVideos: false,
      website: false,
      projects: false
    }
  },
  {
    id: 'creator',
    name: 'Creator',
    eyebrow: 'Für Designs & Werbung',
    examplePrice: 9.99,
    betaPrice: 0,
    description: 'Für Flyer, Motive, Produktwerbung und Cloud-Projekte.',
    recommended: true,
    features: [
      'Alles aus Free',
      'Angebote- und Flyer-Editor',
      'Motive- und Bildeditor',
      'OpenAI-Bildgenerierung nach Kostenbestätigung',
      'Hintergrund entfernen und Ebenen bearbeiten',
      'Cloud-Projekte auf allen Geräten'
    ],
    limits: { projects: 30 },
    access: {
      chat: true,
      freeImageSearch: true,
      files: true,
      flyer: true,
      image: true,
      paidImages: true,
      video: false,
      paidVideos: false,
      website: false,
      projects: true
    }
  },
  {
    id: 'studio',
    name: 'Studio Pro',
    eyebrow: 'Komplettes Kreativstudio',
    examplePrice: 24.99,
    betaPrice: 0,
    description: 'Für Bilder, Videos, Webseiten und den vollständigen Workflow.',
    features: [
      'Alles aus Creator',
      'Sora-Videoerstellung nach Kostenbestätigung',
      'Video-Studio mit Szenen, Text und Musik',
      'Website-Builder mit ZIP-Export',
      'Erweiterte Medienprojekte',
      'Alle kreativen Bereiche freigeschaltet'
    ],
    limits: { projects: -1 },
    access: {
      chat: true,
      freeImageSearch: true,
      files: true,
      flyer: true,
      image: true,
      paidImages: true,
      video: true,
      paidVideos: true,
      website: true,
      projects: true
    }
  }
];

const DEFAULT_ACCESS = {
  chat: true,
  freeImageSearch: true,
  files: true,
  flyer: false,
  image: false,
  paidImages: false,
  video: false,
  paidVideos: false,
  website: false,
  projects: false
};

function safeId(value, fallback) {
  const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return id || fallback;
}

export function normalizeCustomPlan(value = {}, index = 0) {
  const id = safeId(value.id || value.name, `plan-${index + 1}`);
  return {
    id,
    name: String(value.name || `Neues Abo ${index + 1}`).slice(0, 50),
    eyebrow: String(value.eyebrow || 'Individueller Zugang').slice(0, 80),
    examplePrice: Math.max(0, Number(value.examplePrice ?? 0) || 0),
    betaPrice: Math.max(0, Number(value.betaPrice ?? 0) || 0),
    description: String(value.description || 'Individuell vom Admin konfiguriertes Beta-Abo.').slice(0, 240),
    recommended: Boolean(value.recommended),
    features: Array.isArray(value.features) ? value.features.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 16) : [],
    limits: { projects: Number(value?.limits?.projects ?? -1) },
    access: { ...DEFAULT_ACCESS, ...(value.access || {}) },
    custom: true
  };
}

export function getPlanCatalog(customPlans = []) {
  const used = new Set(PLAN_CATALOG.map((plan) => plan.id));
  const extras = (Array.isArray(customPlans) ? customPlans : [])
    .map(normalizeCustomPlan)
    .filter((plan) => {
      if (used.has(plan.id)) return false;
      used.add(plan.id);
      return true;
    });
  return [...PLAN_CATALOG, ...extras];
}

export const DEFAULT_SUBSCRIPTION = {
  planId: 'free',
  status: 'active',
  beta: true,
  startedAt: null,
  canceledAt: null
};

export function getPlan(planId, customPlans = []) {
  const catalog = getPlanCatalog(customPlans);
  return catalog.find((plan) => plan.id === planId) || catalog[0];
}

export function normalizeSubscription(value, customPlans = []) {
  const planId = getPlan(value?.planId || value?.plan_id || 'free', customPlans).id;
  return {
    ...DEFAULT_SUBSCRIPTION,
    ...value,
    planId,
    status: value?.status || 'active',
    beta: value?.beta !== false
  };
}

export function canUseFeature(subscription, feature, role = 'user', customPlans = []) {
  if (role === 'admin') return true;
  return Boolean(getPlan(normalizeSubscription(subscription, customPlans).planId, customPlans)?.access?.[feature]);
}

export function formatPlanPrice(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}
