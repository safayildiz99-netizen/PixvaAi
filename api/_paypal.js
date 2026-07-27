import { env } from './_lib.js';

export function paypalBase() {
  return env('PAYPAL_ENV','sandbox') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

export async function paypalAccessToken() {
  const client = env('PAYPAL_CLIENT_ID');
  const secret = env('PAYPAL_CLIENT_SECRET');
  if (!client || !secret) throw new Error('PayPal-Zugangsdaten fehlen.');
  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${client}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error_description || 'PayPal-Anmeldung fehlgeschlagen.');
  return data.access_token;
}

export async function paypalFetch(path, options = {}) {
  const token = await paypalAccessToken();
  const response = await fetch(`${paypalBase()}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.message || `PayPal HTTP ${response.status}`), { status: response.status, data });
  return data;
}

export async function verifyPayPalWebhook(reqHeaders, body) {
  const webhookId = env('PAYPAL_WEBHOOK_ID');
  if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID fehlt.');
  const verification = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: reqHeaders['paypal-auth-algo'],
      cert_url: reqHeaders['paypal-cert-url'],
      transmission_id: reqHeaders['paypal-transmission-id'],
      transmission_sig: reqHeaders['paypal-transmission-sig'],
      transmission_time: reqHeaders['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: body
    })
  });
  return verification.verification_status === 'SUCCESS';
}
