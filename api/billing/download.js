import { createSignedUrl, handleApiError, requireUser, send, serviceClient } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Nur GET ist erlaubt.' });
  try {
    const { user, profile } = await requireUser(req);
    const productId = String(req.query?.productId || '');
    const db = serviceClient();
    const { data: product } = await db.from('products').select('id,name,kind,delivery_asset_id').eq('id', productId).single();
    if (!product || product.kind !== 'update') return send(res, 404, { error: 'Update nicht gefunden.' });
    if (!product.delivery_asset_id) return send(res, 409, { error: 'Für dieses Update wurde noch keine Auslieferungsdatei hinterlegt.' });
    if (profile.role !== 'admin') {
      const { data: purchase } = await db.from('purchases').select('id').eq('user_id', user.id).eq('product_id', productId).eq('status', 'paid').maybeSingle();
      if (!purchase) throw Object.assign(new Error('Dieses Update wurde von diesem Konto noch nicht gekauft.'), { status: 403 });
    }
    const { data: asset } = await db.from('media_assets').select('*').eq('id', product.delivery_asset_id).single();
    if (!asset || asset.size_bytes <= 0) return send(res, 404, { error: 'Auslieferungsdatei fehlt oder ist leer.' });
    return send(res, 200, { product: { id: product.id, name: product.name }, asset, signedUrl: await createSignedUrl(asset, 900) });
  } catch (error) {
    return handleApiError(res, error, 'Update konnte nicht heruntergeladen werden.');
  }
}
