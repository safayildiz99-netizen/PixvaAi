function cleanStoreName(value=''){
  return String(value||'')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[İIı]/g,'i')
    .replace(/ä/g,'ae')
    .replace(/ö/g,'oe')
    .replace(/ü/g,'ue')
    .replace(/ß/g,'ss')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const STORE_RULES=[
  {
    key:'stuttgart-eriyes',
    aliases:['stuttgart eriyes','stuttgart erjiyes','eriyes stuttgart','erjiyes stuttgart','eriyes','erjiyes'],
    searchName:'Eriyes Süpermarket Stuttgart',
    fallback:'/store-logos/stuttgart-eriyes.png'
  },
  {
    key:'hakverdi',
    aliases:['hakverdi','hak verdi','hakverdi supermarkt','hak verdi supermarkt'],
    searchName:'Hak Verdi Supermarkt',
    fallback:'/store-logos/hakverdi.png'
  },
  {
    key:'yaz-city',
    aliases:['yaz city','yaz city supermarkt','yaz supermarkt'],
    searchName:'Yaz City Supermarkt',
    fallback:'/store-logos/yaz-city-latest.jpg'
  },
  {
    key:'yaz-mega-center',
    aliases:['yaz mega center','yaz mega','yaz megacenter'],
    searchName:'Yaz Mega Center',
    fallback:'/store-logos/yaz-mega-center.png'
  },
  {
    key:'istanbul-bazar',
    aliases:['istanbul bazar','istanbulbazar','istanbul bazaar'],
    searchName:'Istanbul Bazar',
    fallback:'/store-logos/istanbul-bazar.jpg'
  },
  {
    key:'merkez-market-esslingen',
    aliases:['merkez market esslingen','merkez supermarkt esslingen','merkez super market esslingen','merkez esslingen'],
    searchName:'Merkez Supermarkt Esslingen',
    fallback:'/store-logos/merkez-market-esslingen.jpg'
  },
  {
    key:'edeka',
    aliases:['edeka','edeka supermarkt','edeka market'],
    searchName:'EDEKA Deutschland',
    fallback:''
  },
  {
    key:'aldi',
    aliases:['aldi','aldi süd','aldi sued','aldi nord','aldi supermarkt'],
    searchName:'ALDI Deutschland',
    fallback:''
  },
  {
    key:'lidl',
    aliases:['lidl','lidl supermarkt'],
    searchName:'Lidl Deutschland',
    fallback:''
  }
];

function findRule(storeName=''){
  const normalized=cleanStoreName(storeName);
  if(!normalized)return null;
  return STORE_RULES.find(entry=>entry.aliases.some(alias=>cleanStoreName(alias)===normalized))||null;
}

export function getStoreLogoFallback(storeName=''){
  return findRule(storeName)?.fallback||'';
}

// Backwards compatibility: nur noch als Fallback benutzen, nicht als Such-Priorität.
export function getFixedStoreLogo(storeName=''){
  return getStoreLogoFallback(storeName);
}

export function getCanonicalStoreSearchName(storeName=''){
  const raw=String(storeName||'').trim();
  return findRule(raw)?.searchName||raw;
}

export function getStoreLogoSearchQueries(storeName=''){
  const raw=String(storeName||'').trim();
  const canonical=getCanonicalStoreSearchName(raw);
  const names=[canonical];
  if(cleanStoreName(canonical)!==cleanStoreName(raw))names.push(raw);

  const queries=[];
  for(const name of names){
    if(!name)continue;
    queries.push(`"${name}" offizielles Logo`);
    queries.push(`"${name}" Logo PNG`);
    queries.push(`"${name}" Supermarkt Logo`);
  }
  return [...new Set(queries)].slice(0,6);
}

export function hasFixedStoreLogo(storeName=''){
  return Boolean(getStoreLogoFallback(storeName));
}

export {STORE_RULES,cleanStoreName};
