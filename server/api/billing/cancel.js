import Stripe from 'stripe';
import { env, handleApiError, requireUser, send, serviceClient } from '../_lib.js';
import { paypalFetch } from '../_paypal.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST ist erlaubt.' });
  try {
    const { user } = await requireUser(req);
    const db = serviceClient();
    const { data: sub } = await db.from('subscriptions').select('*').eq('user_id', user.id).single();
    if (!sub || !sub.provider_subscription_id || !['active','trialing','past_due','paused'].includes(sub.status)) return send(res, 400, { error: 'Kein kündbares Abo gefunden.' });
    if (sub.provider === 'stripe') {
      const stripe = new Stripe(env('STRIPE_SECRET_KEY'));
      const options = env('STRIPE_CONNECTED_ACCOUNT_ID') ? { stripeAccount: env('STRIPE_CONNECTED_ACCOUNT_ID') } : {};
      await stripe.subscriptions.update(sub.provider_subscription_id, { cancel_at_period_end: true }, options);
      await db.from('subscriptions').update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('user_id', user.id);
      return send(res, 200, { ok: true, provider: 'stripe', message: 'Das Abo wird zum Ende des bezahlten Zeitraums beendet.' });
    }
    if (sub.provider === 'paypal') {
      await paypalFetch(`/v1/billing/subscriptions/${encodeURIComponent(sub.provider_subscription_id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Vom Nutzer in Yildiz AI gekündigt.' }) });
      await db.from('subscriptions').update({ status: 'canceled', cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('user_id', user.id);
      return send(res, 200, { ok: true, provider: 'paypal', message: 'Das PayPal-Abo wurde gekündigt.' });
    }
    return send(res, 400, { error: 'Dieses Abo kann nicht automatisch gekündigt werden.' });
  } catch (error) {
    return handleApiError(res, error, 'Abo konnte nicht gekündigt werden.');
  }
}
