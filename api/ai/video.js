import { send, validateUser } from '../_lib.js';

export default async function handler(req, res) {
  try {
    await validateUser(req);
    return send(res, 410, { error: 'Die externe Video-API wurde entfernt. Verwende den kostenlosen lokalen Timeline-Editor mit eigenen Clips.' });
  } catch (error) {
    return send(res, 401, { error: error.message });
  }
}
