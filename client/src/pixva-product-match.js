import { normalizeOfferText } from './pixva-offer.js';

const PRODUCT_VARIANTS = [
  /\b(vegan|veggie|vegetarisch|pflanzlich|plant based|plantbased)\b/,
  /\b(light|leicht|fettreduziert|reduced fat)\b/,
  /\b(scharf|pikant|hot|acili|aci|extra hot)\b/,
  /\b(mild|sanft)\b/,
  /\b(bio|organic|oekologisch|okologisch)\b/,
  /\b(gefluegel|huhn|chicken|tavuk)\b/,
  /\b(rind|beef|dana)\b/,
  /\b(knoblauch|garlic|sarimsak)\b/,
  /\b(egem)\b/
];

export function productVariantMismatch(result, requestedText='') {
  const requested=normalizeOfferText(requestedText);
  const candidate=normalizeOfferText(`${result?.title||''} ${result?.brand||''}`);
  return PRODUCT_VARIANTS.some(pattern=>pattern.test(candidate)&&!pattern.test(requested));
}

export function productMatchStrength(result, requestedText='') {
  const requested=normalizeOfferText(requestedText).replace(/[^a-z0-9äöüß ]/gi,' ');
  const candidate=normalizeOfferText(`${result?.title||''} ${result?.brand||''}`).replace(/[^a-z0-9äöüß ]/gi,' ');
  const stop=new Set(['produkt','produktbild','packung','bild','foto','photo','original','classic','klassik']);
  const tokens=[...new Set(requested.split(/\s+/).filter(token=>token.length>=3&&!stop.has(token)))];
  if(!tokens.length)return 0;
  const matched=tokens.filter(token=>candidate.includes(token));
  const brandOk=!tokens[0]||candidate.includes(tokens[0]);
  return brandOk?matched.length/tokens.length:0;
}

export function isExactProductCandidate(result, requestedText='', threshold=.66) {
  return !productVariantMismatch(result,requestedText) && productMatchStrength(result,requestedText)>=threshold;
}
