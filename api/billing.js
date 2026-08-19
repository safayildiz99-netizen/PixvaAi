import { randomUUID } from 'node:crypto';
import { readJson, send, validateUser } from './_lib.js';

function query(req) {
  if (req.query) return req.query;
  try { return Object.fromEntries(new URL(req.url, 'http://localhost').searchParams.entries()); }
  catch { return {}; }
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
}

function publishableKey() {
  return String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
}

function serviceKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
}

function paypalBase() {
  return String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function safeMessage(data, fallback) {
  const value = data?.message || data?.error_description || data?.details?.[0]?.description || fallback;
  return String(value || fallback).replace(/(client_secret|authorization|bearer|api[_-]?key)[^,;\n]*/gi, '$1 [geschützt]').slice(0, 500);
}

async function getUiSettings() {
  const url = supabaseUrl();
  const key = publishableKey();
  if (!url || !key) throw new Error('Supabase-Variablen fehlen in Vercel.');
  const response = await fetch(`${url}/rest/v1/rpc/app_get_ui_settings`, {
    method:'POST',
    headers:{
      apikey:key,
      ...(key.startsWith('sb_') ? {} : { Authorization:`Bearer ${key}` }),
      'Content-Type':'application/json'
    },
    body:'{}'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(safeMessage(data, 'Zahlungseinstellungen konnten nicht geladen werden.'));
  return data?.settings || {};
}

async function serviceFetch(path, options = {}) {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY fehlt in Vercel.');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers:{
      apikey:key,
      ...(key.startsWith('sb_') ? {} : { Authorization:`Bearer ${key}` }),
      'Content-Type':'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(safeMessage(data, `Supabase-Zahlungsfehler (${response.status}).`));
  return data;
}


async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('PayPal hat zu lange nicht geantwortet.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function paypalAccessToken() {
  const clientId = String(process.env.PAYPAL_CLIENT_ID || '');
  const secret = String(process.env.PAYPAL_CLIENT_SECRET || '');
  if (!clientId || !secret) throw new Error('PayPal ist noch nicht verbunden. PAYPAL_CLIENT_ID oder PAYPAL_CLIENT_SECRET fehlt.');
  const response = await fetchWithTimeout(`${paypalBase()}/v1/oauth2/token`, {
    method:'POST',
    headers:{
      Authorization:`Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type':'application/x-www-form-urlencoded',
      Accept:'application/json'
    },
    body:'grant_type=client_credentials'
  }, 10000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) throw new Error(safeMessage(data, 'PayPal-Anmeldung fehlgeschlagen.'));
  return data.access_token;
}

async function paypalRequest(path, options = {}) {
  const accessToken = await paypalAccessToken();
  const response = await fetchWithTimeout(`${paypalBase()}${path}`, {
    ...options,
    headers:{
      Authorization:`Bearer ${accessToken}`,
      'Content-Type':'application/json',
      Accept:'application/json',
      ...(options.headers || {})
    }
  }, 12000);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function planInfo(settings, planId) {
  const builtIn = {
    free:{ id:'free', name:'Free' },
    creator:{ id:'creator', name:'Creator' },
    studio:{ id:'studio', name:'Studio Pro' }
  };
  const custom = Array.isArray(settings?.customPlans)
    ? settings.customPlans.find((item) => String(item?.id || '') === planId)
    : null;
  return custom ? { id:planId, name:String(custom.name || planId).slice(0, 80) } : builtIn[planId] || null;
}

function amountCents(settings, planId) {
  const raw = Number(settings?.planPrices?.[planId] ?? 0);
  return Number.isFinite(raw) ? Math.max(0, Math.round(raw * 100)) : 0;
}

function appUrl(req) {
  const configured = String(process.env.APP_URL || '').replace(/\/$/, '');
  if (configured) return configured;
  const protocol = String(req.headers['x-forwarded-proto'] || 'https');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  return host ? `${protocol}://${host}` : '';
}

async function insertOrder(row) {
  return serviceFetch('app_payment_orders', {
    method:'POST',
    headers:{ Prefer:'return=representation' },
    body:JSON.stringify(row)
  });
}

async function loadOrder(orderId) {
  const data = await serviceFetch(`app_payment_orders?provider_order_id=eq.${encodeURIComponent(orderId)}&select=*`, { method:'GET' });
  return Array.isArray(data) ? data[0] || null : null;
}

async function loadSubscription(userId) {
  const data = await serviceFetch(`app_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method:'GET' });
  return Array.isArray(data) ? data[0] || null : null;
}

async function updateOrder(orderId, patch) {
  return serviceFetch(`app_payment_orders?provider_order_id=eq.${encodeURIComponent(orderId)}`, {
    method:'PATCH',
    headers:{ Prefer:'return=representation' },
    body:JSON.stringify({ ...patch, updated_at:new Date().toISOString() })
  });
}

async function activateSubscription(order, captureId = '') {
  const existing = await loadSubscription(order.user_id);
  const now = Date.now();
  const existingUntil = existing?.plan_id === order.plan_id && existing?.paid_until
    ? new Date(existing.paid_until).getTime()
    : 0;
  const start = Math.max(now, Number.isFinite(existingUntil) ? existingUntil : 0);
  const paidUntil = new Date(start + Number(order.access_days || 30) * 86400000).toISOString();
  const rows = await serviceFetch('app_subscriptions?on_conflict=user_id', {
    method:'POST',
    headers:{ Prefer:'resolution=merge-duplicates,return=representation' },
    body:JSON.stringify({
      user_id:order.user_id,
      plan_id:order.plan_id,
      status:'active',
      beta:false,
      started_at:existing?.started_at || new Date().toISOString(),
      canceled_at:null,
      updated_at:new Date().toISOString(),
      paid_until:paidUntil,
      provider:'paypal',
      provider_reference:order.provider_order_id
    })
  });
  const subscription = Array.isArray(rows) ? rows[0] : null;
  return {
    planId:subscription?.plan_id || order.plan_id,
    status:subscription?.status || 'active',
    beta:false,
    startedAt:subscription?.started_at || new Date().toISOString(),
    canceledAt:null,
    updatedAt:subscription?.updated_at || new Date().toISOString(),
    paidUntil:subscription?.paid_until || paidUntil,
    provider:'paypal',
    providerReference:subscription?.provider_reference || order.provider_order_id,
    captureId
  };
}

function captureDetails(data) {
  const capture = data?.purchase_units?.flatMap((unit) => unit?.payments?.captures || [])[0] || null;
  return {
    capture,
    status:String(data?.status || capture?.status || ''),
    amountValue:String(capture?.amount?.value || data?.purchase_units?.[0]?.amount?.value || ''),
    currency:String(capture?.amount?.currency_code || data?.purchase_units?.[0]?.amount?.currency_code || ''),
    captureId:String(capture?.id || '')
  };
}

async function createOrder(req, res) {
  const user = await validateUser(req);
  const body = await readJson(req);
  const settings = await getUiSettings();
  const planId = String(body?.planId || '').trim().toLowerCase();
  const plan = planInfo(settings, planId);
  const cents = amountCents(settings, planId);
  const enabled = settings?.paymentsEnabled === true && settings?.paymentProvider === 'paypal';
  const purchasable = settings?.planPurchasable?.[planId] === true;
  const days = Math.max(1, Math.min(365, Number(settings?.paidAccessDays || 30)));

  if (!enabled) return send(res, 400, { error:'Echte Zahlungen sind vom Admin ausgeschaltet.' });
  if (!plan || planId === 'free') return send(res, 400, { error:'Dieses Abo kann nicht bezahlt werden.' });
  if (!purchasable) return send(res, 400, { error:'Dieses Abo ist derzeit nicht kaufbar.' });
  if (cents < 50) return send(res, 400, { error:'Der serverseitig gespeicherte Preis ist ungültig oder zu niedrig.' });

  const requestId = String(body?.requestId || randomUUID()).slice(0, 120);
  const previous = await serviceFetch(`app_payment_orders?request_id=eq.${encodeURIComponent(requestId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*`, { method:'GET' });
  const previousOrder = Array.isArray(previous) ? previous[0] : null;
  if (previousOrder?.provider_order_id && previousOrder.status === 'completed') {
    return send(res, 200, { ok:true, alreadyCompleted:true, orderId:previousOrder.provider_order_id });
  }
  const invoiceId = `pixva-${user.id.slice(0, 8)}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const baseUrl = appUrl(req);
  if (!baseUrl) return send(res, 500, { error:'APP_URL fehlt in Vercel.' });

  const { response, data } = await paypalRequest('/v2/checkout/orders', {
    method:'POST',
    headers:{ 'PayPal-Request-Id':requestId },
    body:JSON.stringify({
      intent:'CAPTURE',
      purchase_units:[{
        reference_id:requestId,
        custom_id:user.id,
        invoice_id:invoiceId,
        description:`PIXVA ${plan.name} – ${days} Tage`,
        amount:{ currency_code:'EUR', value:(cents / 100).toFixed(2) }
      }],
      payment_source:{
        paypal:{
          experience_context:{
            brand_name:'PIXVA',
            locale:'de-DE',
            landing_page:'LOGIN',
            user_action:'PAY_NOW',
            return_url:`${baseUrl}/api/billing?action=paypal-return`,
            cancel_url:`${baseUrl}/?paypal=cancelled`
          }
        }
      }
    })
  });

  if (!response.ok || !data?.id) return send(res, response.status || 502, { error:safeMessage(data, 'PayPal-Auftrag konnte nicht erstellt werden.') });
  const approveUrl = (data.links || []).find((link) => link.rel === 'payer-action' || link.rel === 'approve')?.href;
  if (!approveUrl) return send(res, 502, { error:'PayPal hat keinen Freigabelink geliefert.' });

  await insertOrder({
    user_id:user.id,
    plan_id:planId,
    provider:'paypal',
    provider_order_id:data.id,
    request_id:requestId,
    amount_cents:cents,
    currency:'EUR',
    access_days:days,
    status:'created',
    raw_response:{ id:data.id, status:data.status }
  });

  return send(res, 200, {
    ok:true,
    orderId:data.id,
    approveUrl,
    amount:(cents / 100).toFixed(2),
    currency:'EUR',
    planId,
    accessDays:days
  });
}

async function captureApprovedOrder(orderId) {
  if (!orderId) throw new Error('PayPal-Auftragsnummer fehlt.');

  const order = await loadOrder(orderId);
  if (!order) throw new Error('PayPal-Zahlungsauftrag wurde nicht gefunden.');

  if (order.status === 'completed') {
    const subscription = await activateSubscription(order, order.capture_id || '');
    return {
      ok:true,
      alreadyCompleted:true,
      subscription,
      message:'Diese PayPal-Zahlung war bereits bestätigt.'
    };
  }

  let { response, data } = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method:'POST',
    headers:{ 'PayPal-Request-Id':`capture-${orderId}` },
    body:'{}'
  });

  if (!response.ok && response.status === 422) {
    const lookup = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method:'GET' });
    response = lookup.response;
    data = lookup.data;
  }
  if (!response.ok) throw new Error(safeMessage(data, 'PayPal-Zahlung konnte nicht bestätigt werden.'));

  const details = captureDetails(data);
  const expected = (Number(order.amount_cents || 0) / 100).toFixed(2);

  if (details.status !== 'COMPLETED') {
    throw new Error(`PayPal-Status ist ${details.status || 'unbekannt'} statt COMPLETED.`);
  }

  if (details.currency !== order.currency || Number(details.amountValue).toFixed(2) !== expected) {
    await updateOrder(orderId, {
      status:'amount_mismatch',
      raw_response:{
        status:details.status,
        amount:details.amountValue,
        currency:details.currency
      }
    });
    throw new Error('Der von PayPal bestätigte Betrag stimmt nicht mit dem serverseitigen Preis überein.');
  }

  await updateOrder(orderId, {
    status:'completed',
    capture_id:details.captureId,
    completed_at:new Date().toISOString(),
    raw_response:{
      status:details.status,
      captureId:details.captureId,
      amount:details.amountValue,
      currency:details.currency
    }
  });

  const subscription = await activateSubscription(order, details.captureId);
  return {
    ok:true,
    subscription,
    message:`PayPal-Zahlung erfolgreich. ${planInfo(await getUiSettings(), order.plan_id)?.name || order.plan_id} ist jetzt aktiviert.`
  };
}

async function captureOrder(req, res) {
  const user = await validateUser(req);
  const body = await readJson(req);
  const orderId = String(body?.orderId || '').trim();

  const order = await loadOrder(orderId);
  if (!order || order.user_id !== user.id) {
    return send(res, 404, { error:'Dieser Zahlungsauftrag gehört nicht zu deinem Konto.' });
  }

  return send(res, 200, await captureApprovedOrder(orderId));
}

async function paypalReturn(req, res) {
  const params = query(req);
  const orderId = String(params.token || params.order_id || '').trim();
  const baseUrl = appUrl(req);

  try {
    await captureApprovedOrder(orderId);
    return redirect(res, `${baseUrl}/?paypal=success`);
  } catch (error) {
    console.error(
      'PayPal return error:',
      String(error?.message || 'Unbekannter Fehler')
        .replace(/(secret|token|authorization)[^,;\n]*/gi, '$1 [geschützt]')
    );
    return redirect(res, `${baseUrl}/?paypal=error`);
  }
}

async function verifyWebhook(body, req) {
  const webhookId = String(process.env.PAYPAL_WEBHOOK_ID || '');
  if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID fehlt in Vercel.');
  const transmissionId = String(req.headers['paypal-transmission-id'] || '');
  const transmissionTime = String(req.headers['paypal-transmission-time'] || '');
  const certUrl = String(req.headers['paypal-cert-url'] || '');
  const authAlgo = String(req.headers['paypal-auth-algo'] || '');
  const transmissionSig = String(req.headers['paypal-transmission-sig'] || '');
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) return false;

  const { response, data } = await paypalRequest('/v1/notifications/verify-webhook-signature', {
    method:'POST',
    body:JSON.stringify({
      transmission_id:transmissionId,
      transmission_time:transmissionTime,
      cert_url:certUrl,
      auth_algo:authAlgo,
      transmission_sig:transmissionSig,
      webhook_id:webhookId,
      webhook_event:body
    })
  });
  return response.ok && data?.verification_status === 'SUCCESS';
}

async function webhook(req, res) {
  const body = await readJson(req);
  const verified = await verifyWebhook(body, req);
  if (!verified) return send(res, 400, { error:'Ungültige PayPal-Webhook-Signatur.' });

  const eventType = String(body?.event_type || '');
  const resource = body?.resource || {};
  const orderId = String(resource?.supplementary_data?.related_ids?.order_id || resource?.id || '');
  const captureId = String(resource?.id || '');

  if (eventType === 'PAYMENT.CAPTURE.COMPLETED' && orderId) {
    const order = await loadOrder(orderId);
    if (order && order.status !== 'completed') {
      const amount = String(resource?.amount?.value || '');
      const currency = String(resource?.amount?.currency_code || '');
      const expected = (Number(order.amount_cents || 0) / 100).toFixed(2);
      if (currency === order.currency && Number(amount).toFixed(2) === expected) {
        await updateOrder(orderId, {
          status:'completed',
          capture_id:captureId,
          completed_at:new Date().toISOString(),
          raw_response:{ webhook:eventType, amount, currency }
        });
        await activateSubscription(order, captureId);
      }
    }
  }

  if (['PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED'].includes(eventType)) {
    const matches = await serviceFetch(`app_payment_orders?capture_id=eq.${encodeURIComponent(captureId)}&select=*`, { method:'GET' });
    const order = Array.isArray(matches) ? matches[0] : null;
    if (order) {
      await updateOrder(order.provider_order_id, { status:'refunded', raw_response:{ webhook:eventType } });
      await serviceFetch(`app_subscriptions?user_id=eq.${encodeURIComponent(order.user_id)}&provider_reference=eq.${encodeURIComponent(order.provider_order_id)}`, {
        method:'PATCH',
        headers:{ Prefer:'return=minimal' },
        body:JSON.stringify({
          plan_id:'free',
          status:'active',
          beta:true,
          paid_until:null,
          provider:'',
          provider_reference:'',
          updated_at:new Date().toISOString()
        })
      });
    }
  }

  return send(res, 200, { ok:true });
}

async function paymentDatabaseHealth() {
  const key = serviceKey();
  if (!key) return { ready:false, error:'SUPABASE_SERVICE_ROLE_KEY fehlt.' };

  try {
    await serviceFetch('app_payment_orders?select=id&limit=1', { method:'GET' });
    await serviceFetch('app_subscriptions?select=user_id,paid_until,provider,provider_reference&limit=1', { method:'GET' });
    return { ready:true, error:'' };
  } catch (error) {
    return {
      ready:false,
      error:String(error?.message || 'Zahlungstabellen fehlen oder sind nicht erreichbar.').slice(0, 240)
    };
  }
}

async function config(req, res) {
  const settings = await getUiSettings();
  const environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
  const credentialsPresent = Boolean(
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const webhookConfigured = Boolean(process.env.PAYPAL_WEBHOOK_ID);

  let paypalConnected = false;
  let paypalError = '';
  if (credentialsPresent) {
    try {
      await paypalAccessToken();
      paypalConnected = true;
    } catch (error) {
      paypalError = String(error?.message || 'PayPal-Verbindung fehlgeschlagen.').slice(0, 240);
    }
  } else {
    paypalError = 'PayPal- oder Supabase-Zugangsdaten fehlen in Vercel.';
  }

  const database = await paymentDatabaseHealth();
  const checkoutReady = credentialsPresent && paypalConnected && database.ready;
  const liveReady = checkoutReady && (environment !== 'live' || webhookConfigured);

  return send(res, 200, {
    provider:String(settings?.paymentProvider || 'paypal'),
    paymentsEnabled:settings?.paymentsEnabled === true,
    configured:environment === 'live' ? liveReady : checkoutReady,
    checkoutReady,
    liveReady,
    paypalConnected,
    paypalError,
    databaseReady:database.ready,
    databaseError:database.error,
    webhookConfigured,
    environment,
    merchantLabel:String(settings?.paymentMerchantLabel || process.env.PAYPAL_MERCHANT_LABEL || ''),
    accessDays:Math.max(1, Number(settings?.paidAccessDays || 30)),
    appUrl:String(process.env.APP_URL || '')
  });
}

export default async function handler(req, res) {
  try {
    const action = String(query(req).action || (req.method === 'GET' ? 'config' : ''));
    if (req.method === 'GET' && action === 'config') return config(req, res);
    if (req.method === 'GET' && action === 'paypal-return') return paypalReturn(req, res);
    if (req.method === 'POST' && action === 'create-order') return createOrder(req, res);
    if (req.method === 'POST' && action === 'capture-order') return captureOrder(req, res);
    if (req.method === 'POST' && action === 'webhook') return webhook(req, res);
    return send(res, 405, { error:'Nicht unterstützte Zahlungsaktion.' });
  } catch (error) {
    console.error('Billing error:', String(error?.message || 'Unbekannter Fehler').replace(/(secret|token|authorization)[^,;\n]*/gi, '$1 [geschützt]'));
    const message = String(error?.message || 'Die Zahlung ist fehlgeschlagen.');
    const status = /nicht angemeldet|sitzung/i.test(message) ? 401 : /gehört nicht/i.test(message) ? 403 : 500;
    return send(res, status, { error:message });
  }
}
