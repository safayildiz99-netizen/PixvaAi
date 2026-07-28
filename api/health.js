function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Nur GET-Anfragen sind erlaubt.' });

  const services = {
    supabase: {
      configured: Boolean(String(process.env.VITE_SUPABASE_URL || '').trim() && String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()),
      checkedWithoutRequest: true
    },
    gemini: {
      configured: Boolean(String(process.env.GEMINI_API_KEY || '').trim()),
      model: String(process.env.GEMINI_MODEL || 'automatische Ausweichmodelle'),
      checkedWithoutRequest: true
    },
    openai: {
      configured: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
      model: String(process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'),
      checkedWithoutRequest: true
    },
    sora: {
      configured: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
      model: String(process.env.OPENAI_VIDEO_MODEL || 'sora-2'),
      checkedWithoutRequest: true
    }
  };

  return send(res, 200, {
    ok: Object.values(services).every((service) => service.configured),
    checkedAt: new Date().toISOString(),
    costUsd: 0,
    services
  });
}
