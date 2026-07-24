import { send, validateUser } from '../_lib.js';

export default async function handler(req, res) {
  try {
    await validateUser(req);
    return send(res, 400, {
      error: 'Das Zusammenfügen mehrerer MP4-Dateien ist im kostenlosen Vercel-Betrieb noch nicht aktiviert. Die einzelnen Clips können bereits erzeugt und heruntergeladen werden.'
    });
  } catch (error) {
    return send(res, 401, { error: error.message });
  }
}
