import adminErrors from '../server/api/admin/errors.js';
import adminOverview from '../server/api/admin/overview.js';
import adminSettings from '../server/api/admin/settings.js';
import adminSystem from '../server/api/admin/system.js';
import adminUsers from '../server/api/admin/users.js';
import aiChat from '../server/api/ai/chat.js';
import aiImage from '../server/api/ai/image.js';
import aiVideo from '../server/api/ai/video.js';
import authSignup from '../server/api/auth/signup.js';
import billingCancel from '../server/api/billing/cancel.js';
import billingCheckout from '../server/api/billing/checkout.js';
import billingDownload from '../server/api/billing/download.js';
import billingPaypalCapture from '../server/api/billing/paypal-capture.js';
import billingPortal from '../server/api/billing/portal.js';
import filesCreate from '../server/api/files/create.js';
import filesRegisterUpload from '../server/api/files/register-upload.js';
import filesSignedUrl from '../server/api/files/signed-url.js';
import filesStore from '../server/api/files/store.js';
import filesUploadTicket from '../server/api/files/upload-ticket.js';
import health from '../server/api/health.js';
import imageProxy from '../server/api/image-proxy.js';
import reports from '../server/api/reports.js';
import searchImage from '../server/api/search/image.js';
import searchWeb from '../server/api/search/web.js';
import usage from '../server/api/usage.js';
import webhookOpenAI from '../server/api/webhooks/openai.js';
import webhookPayPal from '../server/api/webhooks/paypal.js';
import webhookStripe from '../server/api/webhooks/stripe.js';

// Raw body access is required for signed Stripe/OpenAI webhooks.
// JSON endpoints parse their request body themselves through server/api/_lib.js.
export const config = { api: { bodyParser: false } };

const ROUTES = new Map([
  ['admin/errors', adminErrors],
  ['admin/overview', adminOverview],
  ['admin/settings', adminSettings],
  ['admin/system', adminSystem],
  ['admin/users', adminUsers],
  ['ai/chat', aiChat],
  ['ai/image', aiImage],
  ['ai/video', aiVideo],
  ['auth/signup', authSignup],
  ['billing/cancel', billingCancel],
  ['billing/checkout', billingCheckout],
  ['billing/download', billingDownload],
  ['billing/paypal-capture', billingPaypalCapture],
  ['billing/portal', billingPortal],
  ['files/create', filesCreate],
  ['files/register-upload', filesRegisterUpload],
  ['files/signed-url', filesSignedUrl],
  ['files/store', filesStore],
  ['files/upload-ticket', filesUploadTicket],
  ['health', health],
  ['image-proxy', imageProxy],
  ['reports', reports],
  ['search/image', searchImage],
  ['search/web', searchWeb],
  ['usage', usage],
  ['webhooks/openai', webhookOpenAI],
  ['webhooks/paypal', webhookPayPal],
  ['webhooks/stripe', webhookStripe]
]);

function normalizeQuery(req) {
  let parsed;
  try {
    parsed = new URL(req.url || '/', 'http://localhost');
  } catch {
    parsed = new URL('http://localhost/');
  }

  const existing = req.query && typeof req.query === 'object' ? req.query : {};
  const fromUrl = Object.fromEntries(parsed.searchParams.entries());
  req.query = { ...fromUrl, ...existing };

  const queryPath = Array.isArray(req.query.path)
    ? req.query.path.join('/')
    : String(req.query.path || '');
  const pathFromUrl = parsed.pathname.replace(/^\/+api\/?/, '');
  const route = (queryPath || pathFromUrl)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.js$/i, '')
    .toLowerCase();

  delete req.query.path;
  return route;
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  const route = normalizeQuery(req);
  const target = ROUTES.get(route);

  if (!target) {
    return json(res, 404, {
      error: 'API-Endpunkt nicht gefunden.',
      route: route || 'api'
    });
  }

  try {
    return await target(req, res);
  } catch (error) {
    console.error(`Unhandled API router error for ${route}:`, error?.message || error);
    if (!res.headersSent) {
      return json(res, Number(error?.status || 500), {
        error: error?.message || 'Interner Serverfehler.'
      });
    }
    return undefined;
  }
}
