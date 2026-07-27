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

export const DEFAULT_SUBSCRIPTION = {
  planId: 'free',
  status: 'active',
  beta: true,
  startedAt: null,
  canceledAt: null
};

export function getPlan(planId) {
  return PLAN_CATALOG.find((plan) => plan.id === planId) || PLAN_CATALOG[0];
}

export function normalizeSubscription(value) {
  const planId = getPlan(value?.planId || value?.plan_id || 'free').id;
  return {
    ...DEFAULT_SUBSCRIPTION,
    ...value,
    planId,
    status: value?.status || 'active',
    beta: value?.beta !== false
  };
}

export function canUseFeature(subscription, feature, role = 'user') {
  if (role === 'admin') return true;
  return Boolean(getPlan(normalizeSubscription(subscription).planId)?.access?.[feature]);
}

export function formatPlanPrice(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}
