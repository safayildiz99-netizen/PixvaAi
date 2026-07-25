import { send, validateUser } from './_lib.js';

export default async function handler(req, res) {
  try {
    const user = await validateUser(req);
    if (user.role !== 'admin') return send(res, 403, { error: 'Nur für Admins.' });
    return send(res, 200, {
      aiMode: 'gemini-vercel',
      imageGeneration: 'gemini-with-free-fallback',
      videoGeneration: 'browser-renderer-with-images-and-music',
      paymentSystem: false,
      messageLimit: null,
      guestAccess: true
    });
  } catch (error) {
    return send(res, 401, { error: error.message });
  }
}
