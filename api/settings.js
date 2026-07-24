import { send, validateUser } from './_lib.js';

export default async function handler(req, res) {
  try {
    const user = await validateUser(req);
    if (user.role !== 'admin') return send(res, 403, { error: 'Nur für Admins.' });
    return send(res, 200, {
      aiMode: 'local-browser',
      externalProvider: false,
      paymentSystem: false,
      messageLimit: null
    });
  } catch (error) {
    return send(res, 401, { error: error.message });
  }
}
