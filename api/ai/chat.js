import { send, validateUser } from '../_lib.js';

export default async function handler(req, res) {
  try {
    await validateUser(req);
    return send(res, 410, { error: 'Der Server-KI-Dienst wurde entfernt. Der Chat verwendet jetzt die kostenlose lokale Browser-KI.' });
  } catch (error) {
    return send(res, 401, { error: error.message });
  }
}
