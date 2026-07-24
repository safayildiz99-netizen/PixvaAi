import { send, validateUser } from '../_lib.js';

export default async function handler(req, res) {
  try {
    await validateUser(req);
    return send(res, 410, { error: 'Die externe Bild-API wurde entfernt. Verwende im Editor „Lokales Motiv“ oder lade ein eigenes Bild hoch.' });
  } catch (error) {
    return send(res, 401, { error: error.message });
  }
}
