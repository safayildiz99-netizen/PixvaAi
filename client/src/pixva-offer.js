export function normalizeOfferText(text='') {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findOfferPrices(text='') {
  const clean = String(text || '');
  const found = [];
  for (const m of clean.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:o)?)/gi)) {
    found.push({raw:m[0],value:m[1],index:m.index ?? -1});
  }
  for (const m of clean.matchAll(/(?:von|statt|auf|zu|zur|nur|preis(?:\s+von)?)\s*(\d{1,4}(?:[.,]\d{1,2})?)(?![\d.,a-zA-Z])/gi)) {
    const full=String(m[0]||'');
    const offset=full.toLowerCase().lastIndexOf(String(m[1]||'').toLowerCase());
    const index=(m.index ?? 0)+Math.max(0,offset);
    if (!found.some(item=>Math.abs(item.index-index)<2)) found.push({raw:m[1],value:m[1],index});
  }
  return found.sort((a,b)=>a.index-b.index);
}

export function looksLikeOfferFlyerPrompt(text='') {
  const value = normalizeOfferText(text);
  const prices = findOfferPrices(text);
  const flyerWord = /(flyer|flayer|flyar|angebot|aktion|wochenangebot|werbung|werbebild|poster|prospekt)/.test(value);
  const actionWord = /(erstell|erstel|erstelle|erzeuge|mach|mache|generier|generiere|baue|bau|design|gestalt)/.test(value);
  const productWord = /(produkt|produft|artikel|ware|packung|sucuk|cola|käse|kaese|fleisch|getrank|getraenk|markt|supermarkt)/.test(value);
  const priceSignal = prices.length >= 1 || /\b(preis|statt|nur|jetzt|euro)\b/.test(value);
  return (flyerWord && (actionWord || priceSignal)) || (actionWord && productWord && prices.length >= 2);
}

export function isOfferImageFollowup(text='') {
  const value = normalizeOfferText(text).replace(/[.!?]+$/g,'');
  return /^(als )?(bild|flyer|poster|grafik|werbebild)$/.test(value)
    || /^(mach|mache|erstell|erstelle|zeig|zeige) (es|das|den|ihn)? ?(als )?(bild|flyer|poster|grafik|werbebild)$/.test(value)
    || /^(jetzt )?(als )?bild bitte$/.test(value);
}

export function resolveOfferFlyerPrompt(text='', history=[]) {
  const clean = String(text || '').trim();
  if (looksLikeOfferFlyerPrompt(clean)) return clean;
  if (!isOfferImageFollowup(clean)) return '';
  for (let i=(Array.isArray(history)?history.length:0)-1; i>=0; i--) {
    const message = history[i];
    if (message?.role !== 'user') continue;
    const content = String(message?.content || '').trim();
    if (looksLikeOfferFlyerPrompt(content)) return content;
  }
  return '';
}

function cleanCaptured(value='') {
  return String(value || '')
    .replace(/^[\s:,-]+|[\s:,-]+$/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

export function extractOfferDraft(text='') {
  const original = String(text || '').replace(/\s+/g,' ').trim();
  const prices = findOfferPrices(original);
  const formattedPrices = prices.map(item => item.value.replace('.', ',') + ' €');
  const oldPrice = formattedPrices.length > 1 ? formattedPrices[0] : '';
  const newPrice = formattedPrices.length ? formattedPrices[formattedPrices.length - 1] : '';

  let companyName = '';
  const companyPatterns = [
    /(?:fur|für)\s+(?:(?:meinen|mein|den|die|das)\s+)?(?:supermarkt|markt|market|firma|unternehmen|geschaft|geschäft)\s+(.+?)(?=\s+(?:und|mit|das\s+prod(?:ukt|uft)|dem\s+prod(?:ukt|uft)|prod(?:ukt|uft)|angebot)\b|[,.;]|$)/i,
    /(?:supermarkt|markt|market)\s+(.+?)(?=\s+(?:mit|und|prod(?:ukt|uft))\b|[,.;]|$)/i,
    /(?:fur|für)\s+(?:(?:meinen|mein|den|die|das)\s+)?(.+?\b(?:bazar|bazaar|center))(?=\s+(?:mit|und|das\s+prod(?:ukt|uft)|dem\s+prod(?:ukt|uft)|prod(?:ukt|uft)|angebot)\b|[,.;]|$)/i
  ];


  for (const pattern of companyPatterns) {
    const m = original.match(pattern);
    if (m?.[1]) { companyName = cleanCaptured(m[1]); break; }
  }

  let productName = '';
  const productPatterns = [
    /(?:mit\s+(?:dem|dem\s+)?|das\s+)?prod(?:ukt|uft)\s+(.+?)(?=\s+(?:mit\s+(?:dem\s+)?preis\s+(?:von\s+)?|preis\s+(?:von\s+)?|von|statt|fur|für|zum|zu|zur)\s*\d|[,.;]|$)/i,
    /(?:artikel|ware)\s+(.+?)(?=\s+(?:mit\s+(?:dem\s+)?preis\s+(?:von\s+)?|preis\s+(?:von\s+)?|von|statt|fur|für|zum|zu|zur)\s*\d|[,.;]|$)/i
  ];

  for (const pattern of productPatterns) {
    const m = original.match(pattern);
    if (m?.[1]) { productName = cleanCaptured(m[1]); break; }
  }

  if (!productName) {
    const firstPriceIndex = prices[0]?.index ?? original.length;
    let beforePrice = original.slice(0, firstPriceIndex);
    beforePrice = beforePrice
      .replace(/\b(erstell\w*|mach\w*|generier\w*|bau\w*|design\w*|gestalt\w*)\b/gi,' ')
      .replace(/\b(mir|einen|eine|ein|den|die|das|fur|für|meinen|mein|supermarkt|markt|firma|unternehmen|flyer|flayer|flyar|als|angebot|aktion|werbung|poster|prospekt|mit|dem|produkt|produft|artikel|ware)\b/gi,' ')
      .replace(companyName, ' ')
      .replace(/\s+/g,' ')
      .trim();
    productName = cleanCaptured(beforePrice);
  }

  if (!productName || productName.length < 2) productName = 'Produkt';
  productName = productName.slice(0, 90);
  companyName = companyName.slice(0, 90);

  const normalized = normalizeOfferText(original);
  const companyType = /\b(supermarkt|markt|market|bazar|bazaar|lebensmittel|mega center|food market)\b/.test(normalized) ? 'supermarkt' : '';
  const toNumber = (value='') => Number(String(value).replace(/[^0-9,.-]/g,'').replace(',','.')) || 0;
  const oldNumber = toNumber(oldPrice);
  const newNumber = toNumber(newPrice);
  const discountPercent = oldNumber > 0 && newNumber >= 0 && newNumber < oldNumber
    ? Math.max(1, Math.round(((oldNumber - newNumber) / oldNumber) * 100))
    : 0;

  return {
    companyName,
    companyType,
    productName,
    newPrice,
    oldPrice,
    headline: companyType === 'supermarkt' ? 'WOCHENANGEBOT' : 'ANGEBOT',
    badge: discountPercent ? `${discountPercent}% RABATT` : 'JETZT',
    discountPercent,
    sourcePrompt: original
  };
}
