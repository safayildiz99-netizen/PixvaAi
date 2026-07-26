import { send, validateUser } from './_lib.js';

export default async function handler(req, res) {
  try {
    const user = await validateUser(req);
    if (user.role !== 'admin') return send(res, 403, { error: 'Nur für Admins.' });
    return send(res, 200, {
      aiMode: 'gemini-chat-openai-media',
      imageGeneration: 'openai-gpt-image',
      videoGeneration: 'openai-sora',
      usageLimits: true,
      accountPrivateMediaJobs: true,
      guestPaidMedia: false,
      guestAccess: true
    });
  } catch (error) {
    return send(res, 401, { error: error.message });
  }
}
