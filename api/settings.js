import { pollinationsKey, send, validateUser } from './_lib.js';

export default async function handler(req, res) {
  try {
    const user = await validateUser(req);
    if (user.role !== 'admin') return send(res, 403, { error: 'Nur für Admins.' });
    if (req.method === 'GET') {
      return send(res, 200, {
        hasPollinationsKey: Boolean(pollinationsKey()),
        keySource: pollinationsKey() ? 'env' : 'none',
        chatModel: 'openai',
        imageModel: 'flux',
        videoModel: 'wan'
      });
    }
    if (req.method === 'PUT') {
      return send(res, 400, {
        error: 'Den Pollinations-Key bitte in Vercel unter Settings → Environment Variables als POLLINATIONS_KEY eintragen.'
      });
    }
    return send(res, 405, { error: 'Methode nicht erlaubt.' });
  } catch (error) {
    return send(res, 401, { error: error.message });
  }
}
