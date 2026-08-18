function cleanStoreName(value=''){
  return String(value||'')
    .toLowerCase()
    .replace(/[İIı]/g,'i')
    .replace(/ä/g,'ae')
    .replace(/ö/g,'oe')
    .replace(/ü/g,'ue')
    .replace(/ß/g,'ss')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const FIXED_STORE_LOGOS=[
  {
    key:'yaz-city',
    aliases:['yaz city','yaz city supermarkt'],
    logo:'/store-logos/yaz-city.png'
  },
  {
    key:'yaz-mega-center',
    aliases:['yaz mega center','yaz mega','yaz megacenter'],
    logo:'/store-logos/yaz-mega-center.png'
  },
  {
    key:'istanbul-bazar',
    aliases:['istanbul bazar','istanbulbazar','istanbul bazaar'],
    logo:'/store-logos/istanbul-bazar.jpg'
  }
];

export function getFixedStoreLogo(storeName=''){
  const normalized=cleanStoreName(storeName);
  if(!normalized)return'';
  for(const entry of FIXED_STORE_LOGOS){
    if(entry.aliases.some(alias=>cleanStoreName(alias)===normalized))return entry.logo;
  }
  return'';
}

export function hasFixedStoreLogo(storeName=''){
  return Boolean(getFixedStoreLogo(storeName));
}

export {FIXED_STORE_LOGOS};
