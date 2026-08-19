import { normalizeOfferText } from './pixva-offer.js';

function money(value='') {
  const raw=String(value||'').replace('.',',').replace(/[^0-9,]/g,'');
  return raw ? `${raw} €` : '';
}

function clean(value='') {
  return String(value||'')
    .replace(/^\s*(?:und\s+)?/i,'')
    .replace(/\s+/g,' ')
    .replace(/^[\s:;,-]+|[\s:;,-]+$/g,'')
    .trim();
}

function requestedGridCount(text='') {
  const value=normalizeOfferText(text);
  const direct=value.match(/\b([2-9])\s*(?:er|x)\s*(?:angebot|flyer|poster)\b/);
  if(direct)return Number(direct[1]);
  const products=value.match(/\b([2-9])\s*produkte?n?\b/);
  if(products)return Number(products[1]);
  return 0;
}

function extractCompanyName(original='') {
  const patterns=[
    /(?:für|fur)\s+(?:(?:den|die|das|meinen|mein)\s+)?(?:supermarkt|markt|market)\s+(.+?)\s*[.!?]?$/i,
    /(?:für|fur)\s+(?:(?:den|die|das|meinen|mein)\s+)?(.+?\b(?:bazar|bazaar|center|city))\s*[.!?]?$/i
  ];
  for(const pattern of patterns){
    const m=original.match(pattern);
    if(m?.[1])return clean(m[1]);
  }
  return '';
}

function stripCompanyTail(original='') {
  return String(original||'').replace(/\s*,?\s*(?:für|fur)\s+(?:(?:den|die|das|meinen|mein)\s+)?(?:supermarkt|markt|market)?\s*[^,;.!?]+\s*[.!?]?$/i,'').trim();
}

function extractProductSection(original='') {
  const withoutCompany=stripCompanyTail(original);
  const marker=withoutCompany.match(/(?:mit\s+den\s+produkten|mit\s+produkte?n?|produkte?n?)\s*[:\-]?\s*/i);
  if(!marker)return '';
  return withoutCompany.slice((marker.index||0)+marker[0].length).trim();
}

function splitItems(section='') {
  // Kommas in Dezimalpreisen (7,99) dürfen nicht als Produkttrenner gelten.
  return String(section||'')
    .split(/,(?!\d)/)
    .map(clean)
    .filter(Boolean);
}

function parseItemsByPrices(section='') {
  const source=String(section||'');
  const priceMatches=[...source.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/gi)];
  if(!priceMatches.length)return [];

  const items=[];
  let cursor=0;

  for(const match of priceMatches){
    const start=match.index??0;
    const end=start+String(match[0]||'').length;
    let productName=clean(source.slice(cursor,start))
      .replace(/^(?:en|produkt|artikel)\s*:\s*/i,'')
      .trim();

    let priceSuffix='';
    let consumed=end;
    const tail=source.slice(end);
    const suffixMatch=tail.match(/^\s*(?:(?:pro\s+)?kg\b|\/\s*kg\b|(?:pro\s+)?100\s*g\b)/i);
    if(suffixMatch){
      const suffixText=String(suffixMatch[0]||'');
      priceSuffix=/100\s*g/i.test(suffixText)?' / 100 g':' / kg';
      consumed=end+suffixText.length;
    }

    // Der nächste Produktname beginnt erst nach optionalen Trennern.
    const separator=source.slice(consumed).match(/^\s*[,;|]\s*(?:und\s+)?/i);
    if(separator)consumed+=separator[0].length;
    else{
      const spaces=source.slice(consumed).match(/^\s+/);
      if(spaces)consumed+=spaces[0].length;
    }

    if(productName){
      const price=money(match[1]);
      items.push({
        index:items.length+1,
        productName:productName.slice(0,100),
        newPrice:`${price}${priceSuffix}`,
        rawPrice:price,
        priceSuffix,
        sourceSegment:clean(source.slice(cursor,consumed))
      });
    }
    cursor=consumed;
  }
  return items;
}

function parseItem(segment='',index=0) {
  const text=clean(segment);
  const priceMatch=text.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i);
  if(!priceMatch)return null;
  const price=money(priceMatch[1]);
  const start=priceMatch.index||0;
  const end=start+priceMatch[0].length;
  let before=clean(text.slice(0,start));
  let after=clean(text.slice(end));
  let priceSuffix='';

  if(/^(?:pro\s+)?kg\b/i.test(after)){
    priceSuffix=' / kg';
    after=clean(after.replace(/^(?:pro\s+)?kg\b/i,''));
  }else if(/^\/\s*kg\b/i.test(after)){
    priceSuffix=' / kg';
    after=clean(after.replace(/^\/\s*kg\b/i,''));
  }else if(/^(?:pro\s+)?100\s*g\b/i.test(after)){
    priceSuffix=' / 100 g';
    after=clean(after.replace(/^(?:pro\s+)?100\s*g\b/i,''));
  }

  let productName=clean(`${before}${after?` ${after}`:''}`)
    .replace(/^(?:en|produkt|artikel)\s*:\s*/i,'')
    .replace(/\s+/g,' ')
    .trim();

  if(!productName)return null;
  return {
    index:index+1,
    productName:productName.slice(0,100),
    newPrice:`${price}${priceSuffix}`,
    rawPrice:price,
    priceSuffix,
    sourceSegment:text
  };
}

export function looksLikeMultiOfferPrompt(text='') {
  const count=requestedGridCount(text);
  const value=normalizeOfferText(text);
  return count>1 && /\b(angebot|flyer|poster)\b/.test(value) && /produkt/.test(value);
}

export function extractMultiOfferDraft(text='') {
  const original=String(text||'').replace(/\s+/g,' ').trim();
  const requestedCount=requestedGridCount(original);
  if(requestedCount<2)return null;
  const section=extractProductSection(original);
  if(!section)return null;
  const commaItems=splitItems(section).map(parseItem).filter(Boolean);
  const priceItems=parseItemsByPrices(section);
  // Preisgrenzen sind robuster als Kommas: auch fehlende/uneinheitliche Kommas
  // dürfen ein ausdrücklich verlangtes 9er-Angebot nicht auf 8 Produkte reduzieren.
  const items=priceItems.length>=commaItems.length?priceItems:commaItems;
  const products=items.slice(0,requestedCount);
  const companyName=extractCompanyName(original);

  return {
    isMulti:true,
    requestedCount,
    layoutCount:requestedCount>=9?9:requestedCount>=6?6:products.length,
    templateId:requestedCount>=9?'v12-supermarkt-9er':requestedCount>=6?'v12-supermarkt-6er':'v12-supermarkt-einzel',
    companyName:companyName.slice(0,90),
    companyType:'supermarkt',
    headline:'WOCHENANGEBOT',
    products,
    sourcePrompt:original
  };
}
