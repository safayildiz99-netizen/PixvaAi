/* PIXVA V14.5 SUPERMARKT STYLE FAMILY
   Referenz: die acht vom Nutzer bereitgestellten Supermarkt-Vorlagen.
   Text und UI-Elemente bleiben immer gerade und gut lesbar. */
export const pixvaMarketStyles = [
  {
    "id": "red-cream",
    "name": "Rot & Creme",
    "background": "#F1EFE5",
    "primary": "#E7132A",
    "secondary": "#FFFFFF",
    "accent": "#E7132A",
    "text": "#161B20",
    "surface": "#FFFFFF",
    "dark": "#161B20",
    "preview": "/templates/pixva-market-v14/red-cream-single.svg"
  },
  {
    "id": "mustard-green",
    "name": "Senfgelb & Grün",
    "background": "#F3F1E7",
    "primary": "#F0BD18",
    "secondary": "#0E6B3C",
    "accent": "#0E6B3C",
    "text": "#173228",
    "surface": "#FFFFFF",
    "dark": "#173228",
    "preview": "/templates/pixva-market-v14/mustard-green-single.svg"
  },
  {
    "id": "forest-lime",
    "name": "Waldgrün & Limette",
    "background": "#F7F8FA",
    "primary": "#3D6E30",
    "secondary": "#93B233",
    "accent": "#93B233",
    "text": "#173228",
    "surface": "#FFFFFF",
    "dark": "#173228",
    "preview": "/templates/pixva-market-v14/forest-lime-single.svg"
  },
  {
    "id": "blue-lime",
    "name": "Blau & Limette",
    "background": "#F7F8FA",
    "primary": "#2895CF",
    "secondary": "#92B332",
    "accent": "#92B332",
    "text": "#172739",
    "surface": "#FFFFFF",
    "dark": "#172739",
    "preview": "/templates/pixva-market-v14/blue-lime-single.svg"
  },
  {
    "id": "burgundy-gold",
    "name": "Bordeaux & Gold",
    "background": "#F5EFE6",
    "primary": "#7C1730",
    "secondary": "#D5A935",
    "accent": "#D5A935",
    "text": "#261A1D",
    "surface": "#FFFFFF",
    "dark": "#261A1D",
    "preview": "/templates/pixva-market-v14/burgundy-gold-single.svg"
  },
  {
    "id": "charcoal-green",
    "name": "Anthrazit & Grün",
    "background": "#2D2D2B",
    "primary": "#137B43",
    "secondary": "#E4232D",
    "accent": "#E4232D",
    "text": "#F8F8F4",
    "surface": "#FFFFFF",
    "dark": "#1F1F1E",
    "preview": "/templates/pixva-market-v14/charcoal-green-single.svg"
  },
  {
    "id": "red-blue",
    "name": "Rot & Blau",
    "background": "#F7F8FA",
    "primary": "#E31B23",
    "secondary": "#3563AA",
    "accent": "#3563AA",
    "text": "#172739",
    "surface": "#FFFFFF",
    "dark": "#172739",
    "preview": "/templates/pixva-market-v14/red-blue-single.svg"
  },
  {
    "id": "teal-orange",
    "name": "Türkis & Orange",
    "background": "#F4F5F1",
    "primary": "#0B7E79",
    "secondary": "#EE8C22",
    "accent": "#EE8C22",
    "text": "#173238",
    "surface": "#FFFFFF",
    "dark": "#173238",
    "preview": "/templates/pixva-market-v14/teal-orange-single.svg"
  }
];

export function resolvePixvaMarketStyle(text='', seed='') {
  const value=String(text||'').toLowerCase();
  const hints=[
    [/bordeaux|weinrot|gold/, 'burgundy-gold'],
    [/anthrazit|charcoal|schwarz.*grün|schwarz.*gruen/, 'charcoal-green'],
    [/türkis|tuerkis|orange/, 'teal-orange'],
    [/blau.*lime|blau.*grün|blau.*gruen/, 'blue-lime'],
    [/rot.*blau|blau.*rot/, 'red-blue'],
    [/senf|gelb.*grün|gelb.*gruen/, 'mustard-green'],
    [/waldgrün|waldgruen|lime|dunkelgrün|dunkelgruen/, 'forest-lime'],
    [/rot|creme/, 'red-cream']
  ];
  for(const [pattern,id] of hints){if(pattern.test(value))return id;}
  const key=String(seed||text||'pixva-supermarkt');
  let hash=0;
  for(let i=0;i<key.length;i++)hash=(hash*31+key.charCodeAt(i))>>>0;
  return pixvaMarketStyles[hash%pixvaMarketStyles.length]?.id||'red-cream';
}

export function getPixvaMarketStyle(id='') {
  return pixvaMarketStyles.find(style=>style.id===id)||pixvaMarketStyles[0];
}
