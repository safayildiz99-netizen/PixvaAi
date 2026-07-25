import { send } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });
  return send(res, 200, {
    mode: 'browser-renderer',
    message: 'Das Video wird kostenlos im Browser aus Bildern, Clips, Übergängen und Hintergrundmusik gerendert. Dafür ist kein Video-Guthaben nötig.'
  });
}
