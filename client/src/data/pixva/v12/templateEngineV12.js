/* PIXVA V12 REAL TEMPLATE ENGINE */
import { FabricImage, IText, Rect, Textbox, Circle } from 'fabric';
import { pixvaV12Templates } from './catalog.js';
import { getPixvaMarketStyle, resolvePixvaMarketStyle } from './marketStyles.js';

export { pixvaV12Templates };

const first=(obj,keys,fallback='')=>{
  for(const key of keys){
    const value=obj?.[key];
    if(value!==undefined&&value!==null&&String(value).trim()!=='')return value;
  }
  return fallback;
};

const industryKey=(raw='')=>{
  const value=String(raw||'').toLowerCase();
  if(/programm|software|webentwick|entwickler|developer|\bit\b/.test(value))return'programmierer';
  if(/supermarkt|market|lebensmittel/.test(value))return'supermarkt';
  if(/werbetechnik|werbung|druck|folierung|schild/.test(value))return'werbetechnik';
  if(/elektrik|elektro|smart home/.test(value))return'elektriker';
  return'sonstiges';
};

export function normalizePixvaV12Brand(source={}){
  const c=source?.company?source.company:source;
  const exampleMode=source?.pixva_example_mode??c?.pixva_example_mode??!source?.isCompany;
  return{
    companyName:first(c,['company_name','companyName','name'],exampleMode?'BEISPIEL FIRMA':''),
    companyType:industryKey(`${first(c,['company_type','companyType','industry'],'')} ${first(c,['company_type_other','companyTypeOther','industryOther'],'')}`),
    ownerName:first(c,['owner_name','ownerName'],''),
    companyEmail:first(c,['company_email','companyEmail','email'],''),
    companyPhone:first(c,['company_phone','companyPhone','phone'],''),
    website:first(c,['website'],''),
    instagram:first(c,['instagram'],''),
    address:first(c,['address'],''),
    openingHours:first(c,['opening_hours','openingHours'],''),
    logo:first(c,['logo_data_url','logoDataUrl','logo_url','logoUrl','logo','logo_path','logoPath'],''),
    primary:first(c,['primary_color','primaryColor'],''),
    secondary:first(c,['secondary_color','secondaryColor'],''),
    marketStyle:first(source,['marketStyle','market_style'],first(c,['marketStyle','market_style'],'')),
    marketSeed:first(source,['marketSeed','market_seed'],first(c,['company_name','companyName','name'],'pixva-supermarkt'))
  };
}

export function recommendPixvaV12Template(source={},mode='flyer'){
  const b=normalizePixvaV12Brand(source);
  const ids={
    programmierer:'v12-programmierer-software',
    supermarkt:'v12-supermarkt-einzel',
    werbetechnik:'v12-werbetechnik-dibond',
    elektriker:'v12-elektriker-check',
    sonstiges:mode==='image'?'v12-universal-social':'v12-universal-service'
  };
  return ids[b.companyType]||ids.sonstiges;
}

export const getPixvaV12Template=id=>pixvaV12Templates.find(t=>t.id===id)||null;

const rect=o=>new Rect({originX:'left',originY:'top',angle:0,...o});
const text=(value,o={})=>new IText(String(value||''),{fontFamily:'Arial',fontWeight:700,originX:'left',originY:'top',angle:0,...o});
const box=(value,o={})=>new Textbox(String(value||''),{fontFamily:'Arial',fontWeight:700,originX:'left',originY:'top',angle:0,splitByGrapheme:false,...o});
const circle=o=>new Circle({originX:'left',originY:'top',angle:0,...o});

function scaler(width,height){
  const sx=width/600,sy=height/750,s=Math.min(sx,sy);
  return{X:n=>n*sx,Y:n=>n*sy,S:n=>n*s};
}
function colors(t,b){
  return{...t.style,primary:b.primary||t.style.primary,secondary:b.secondary||t.style.secondary};
}
function clearCanvas(canvas,bg){
  canvas.clear();
  canvas.backgroundColor=bg||'#ffffff';
  try{canvas.setViewportTransform([1,0,0,1,0,0])}catch{}
}
function contactText(b){
  return[b.companyPhone,b.companyEmail,b.website,b.instagram].filter(Boolean).join(' · ');
}
function addFooter(canvas,b,c,X,Y,S){
  canvas.add(
    box(b.companyName,{left:X(28),top:Y(674),width:X(320),fontSize:S(18),fontWeight:900,fill:c.text,dataRole:'company-name',displayName:'Firmenname'}),
    box(contactText(b),{left:X(28),top:Y(704),width:X(544),fontSize:S(8.5),fill:c.text,opacity:.78,dataRole:'company-contact',displayName:'Firmenkontakt'}),
    box(b.address,{left:X(28),top:Y(725),width:X(544),fontSize:S(8),fill:c.text,opacity:.68,dataRole:'address',displayName:'Adresse'})
  );
}
async function addLogo(canvas,b,x,y,w,h,c,S){
  if(b.logo){
    try{
      const img=await FabricImage.fromURL(b.logo,{crossOrigin:'anonymous'});
      const factor=Math.min(w/Math.max(1,img.width),h/Math.max(1,img.height),1);
      img.scale(factor);
      img.set({left:x+w/2,top:y+h/2,originX:'center',originY:'center',angle:0,dataRole:'logo-image:1',displayName:'Firmenlogo'});
      canvas.add(img);
      return;
    }catch{}
  }
  canvas.add(
    rect({left:x,top:y,width:w,height:h,rx:S(8),ry:S(8),fill:'#ffffff',stroke:c.secondary,strokeWidth:S(1.5),dataRole:'logo-slot:1',displayName:'Logo-Platzhalter'}),
    text('LOGO',{left:x+w/2,top:y+h/2,originX:'center',originY:'center',fontSize:S(13),fill:c.primary,dataRole:'logo-slot-label:1'})
  );
}
function addSlot(canvas,x,y,w,h,label,c,S,index=1){
  canvas.add(
    rect({left:x,top:y,width:w,height:h,rx:S(12),ry:S(12),fill:c.surface||'#ffffff',stroke:c.secondary,strokeWidth:S(2),strokeDashArray:[S(7),S(5)],dataRole:`product-slot:${index}`,displayName:`Bild ${index}`}),
    box(label||`BILD ${index}`,{left:x+S(8),top:y+h/2-S(9),width:w-S(16),fontSize:S(12),textAlign:'center',fill:c.text,opacity:.55,dataRole:`product-slot-label:${index}`})
  );
}
function addPrice(canvas,t,c,x,y,w,h,S){
  canvas.add(
    rect({left:x,top:y,width:w,height:h,rx:S(17),ry:S(17),fill:c.primary,dataRole:'price-panel'}),
    text(t.content.oldPrice?`STATT ${t.content.oldPrice}`:'',{left:x+w/2,top:y+S(21),originX:'center',fontSize:S(11),fill:'#ffffff',opacity:.7,linethrough:true,dataRole:'old-price'}),
    box(t.content.newPrice,{left:x+S(9),top:y+S(49),width:w-S(18),fontSize:S(28),fontWeight:900,fill:'#ffffff',textAlign:'center',dataRole:'price:1'}),
    rect({left:x+S(15),top:y+h-S(55),width:w-S(30),height:S(32),rx:S(16),ry:S(16),fill:c.secondary,dataRole:'badge-bg'}),
    text(t.content.badge,{left:x+w/2,top:y+h-S(39),originX:'center',originY:'center',fontSize:S(10),fontWeight:900,fill:c.primary,dataRole:'badge'})
  );
}
function addTop(canvas,t,c,X,Y,S){
  canvas.add(
    text(t.content.eyebrow,{left:X(28),top:Y(28),fontSize:S(10),fill:c.secondary,charSpacing:45,dataRole:'eyebrow'}),
    box(t.content.headline,{left:X(28),top:Y(70),width:X(544),fontSize:S(34),fontWeight:900,lineHeight:.96,fill:c.text,dataRole:'headline'}),
    box(t.content.subtitle,{left:X(28),top:Y(170),width:X(544),fontSize:S(12),fill:c.text,opacity:.7,dataRole:'subtitle'})
  );
}
function gridCards(canvas,t,c,X,Y,S,cols,rows,startY=115,endY=660){
  const margin=22,gap=9,cw=(600-margin*2-gap*(cols-1))/cols,ch=(endY-startY-gap*(rows-1))/rows;
  let i=1;
  for(let r=0;r<rows;r++){
    for(let col=0;col<cols;col++){
      const x=margin+col*(cw+gap),y=startY+r*(ch+gap);
      canvas.add(rect({left:X(x),top:Y(y),width:X(cw),height:Y(ch),rx:S(9),ry:S(9),fill:c.surface,stroke:'#d9dfdc',strokeWidth:S(1),dataRole:`card:${i}`,displayName:`Produktkarte ${i}`}));
      addSlot(canvas,X(x+6),Y(y+6),X(cw-12),Y(ch*.55),`PRODUKT ${i}`,c,S,i);
      canvas.add(
        box(`PRODUKT ${i}`,{left:X(x+7),top:Y(y+ch*.64),width:X(cw-14),fontSize:S(cols===3?8.5:11),fill:c.text,fontWeight:900,dataRole:`product-title:${i}`}),
        rect({left:X(x+cw*.53),top:Y(y+ch*.80),width:X(cw*.40),height:Y(ch*.14),rx:S(5),ry:S(5),fill:c.secondary,dataRole:`price-bg:${i}`}),
        text(t.content.newPrice,{left:X(x+cw*.73),top:Y(y+ch*.87),originX:'center',originY:'center',fontSize:S(cols===3?9:12),fill:'#ffffff',fontWeight:900,dataRole:`price:${i}`})
      );
      i++;
    }
  }
}

/* 12 distinct layout builders */
async function techSplit(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=colors(t,b);clearCanvas(canvas,c.background);
  canvas.add(rect({left:0,top:0,width:X(220),height:h,fill:c.surface}),rect({left:X(220),top:0,width:X(8),height:h,fill:c.secondary}));
  addTop(canvas,t,c,X,Y,S); await addLogo(canvas,b,X(32),Y(550),X(150),Y(65),c,S);
  addSlot(canvas,X(255),Y(245),X(315),Y(205),'SOFTWARE / SCREEN',c,S); addPrice(canvas,t,c,X(300),Y(485),X(230),Y(140),S); addFooter(canvas,b,c,X,Y,S);
}
async function techBrowser(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=colors(t,b);clearCanvas(canvas,c.background);addTop(canvas,t,c,X,Y,S);
  canvas.add(rect({left:X(28),top:Y(230),width:X(544),height:Y(285),rx:S(15),ry:S(15),fill:c.surface,stroke:c.secondary,strokeWidth:S(2)}),rect({left:X(28),top:Y(230),width:X(544),height:Y(32),rx:S(15),ry:S(15),fill:c.primary}),circle({left:X(45),top:Y(241),radius:S(5),fill:'#ff6b6b'}),circle({left:X(63),top:Y(241),radius:S(5),fill:'#ffd166'}),circle({left:X(81),top:Y(241),radius:S(5),fill:'#4dd599'}));
  addSlot(canvas,X(48),Y(280),X(504),Y(210),'WEBSITE VORSCHAU',c,S);await addLogo(canvas,b,X(32),Y(540),X(150),Y(62),c,S);addPrice(canvas,t,c,X(355),Y(535),X(205),Y(112),S);addFooter(canvas,b,c,X,Y,S);
}
async function techFlow(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=colors(t,b);clearCanvas(canvas,c.background);addTop(canvas,t,c,X,Y,S);
  [['ANFRAGE',35,300,c.primary],['PIXVA KI',245,390,c.secondary],['AUTOMATION',455,300,c.primary]].forEach(([label,x,y,color])=>canvas.add(rect({left:X(x),top:Y(y),width:X(110),height:Y(68),rx:S(14),ry:S(14),fill:color}),text(label,{left:X(x+55),top:Y(y+34),originX:'center',originY:'center',fontSize:S(11),fill:'#ffffff'})));
  canvas.add(rect({left:X(145),top:Y(330),width:X(100),height:Y(5),fill:c.text}),rect({left:X(355),top:Y(330),width:X(100),height:Y(5),fill:c.text}));
  await addLogo(canvas,b,X(32),Y(530),X(150),Y(65),c,S);addPrice(canvas,t,c,X(360),Y(515),X(205),Y(130),S);addFooter(canvas,b,c,X,Y,S);
}

function marketPalette(t,b){
  const picked=getPixvaMarketStyle(b.marketStyle||resolvePixvaMarketStyle('',b.marketSeed||b.companyName));
  return{
    ...t.style,
    ...picked,
    /* Supermarkt-Stile dürfen NICHT von allgemeinen Firmenfarben überschrieben werden.
       Sonst sehen alle Supermarktvorlagen wieder lila/türkis aus und die neuen Vorlagen wirken nicht geladen. */
    primary:picked.primary,
    secondary:picked.secondary,
    accent:picked.accent,
    background:picked.background,
    text:picked.text,
    surface:picked.surface,
    dark:picked.dark,
    styleId:picked.id,
    styleName:picked.name
  };
}
function addMarketHeader(canvas,t,b,c,X,Y,S,compact=false){
  canvas.add(
    rect({left:0,top:0,width:X(600),height:Y(compact?112:128),fill:c.primary,dataRole:'market-bg'}),
    rect({left:0,top:Y(compact?112:128),width:X(600),height:Y(13),fill:c.secondary,dataRole:'market-bg'}),
    box(t.content.eyebrow||'ANGEBOT DER WOCHE',{left:X(210),top:Y(compact?22:24),width:X(350),fontSize:S(compact?11:12),fill:'#ffffff',fontWeight:900,charSpacing:40,dataRole:'eyebrow',displayName:'Angebotszeile'}),
    box(t.content.headline||'ANGEBOT DER WOCHE',{left:X(210),top:Y(compact?54:61),width:X(350),fontSize:S(compact?21:25),fill:'#ffffff',fontWeight:900,lineHeight:1,dataRole:'headline',displayName:'Überschrift'})
  );
  return addLogo(canvas,b,X(28),Y(22),X(150),Y(compact?70:82),c,S);
}
function addMarketFooter(canvas,b,c,X,Y,S){
  canvas.add(
    rect({left:0,top:Y(650),width:X(600),height:Y(100),fill:c.primary,dataRole:'market-bg'}),
    rect({left:0,top:Y(650),width:X(600),height:Y(10),fill:c.secondary,dataRole:'market-bg'}),
    box(b.companyName||'DEIN MARKT',{left:X(28),top:Y(678),width:X(280),fontSize:S(18),fontWeight:900,fill:'#ffffff',dataRole:'company-name',displayName:'Firmenname'}),
    box(contactText(b),{left:X(28),top:Y(710),width:X(530),fontSize:S(8.5),fill:'#ffffff',opacity:.92,dataRole:'company-contact',displayName:'Firmenkontakt'}),
    box(b.address,{left:X(330),top:Y(680),width:X(240),fontSize:S(8.5),fill:'#ffffff',opacity:.90,textAlign:'right',dataRole:'address',displayName:'Adresse'})
  );
}

async function marketSingle(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=marketPalette(t,b);clearCanvas(canvas,c.background);
  await addMarketHeader(canvas,t,b,c,X,Y,S,false);
  canvas.add(
    box('PRODUKTNAME',{left:X(34),top:Y(164),width:X(530),fontSize:S(24),lineHeight:1.02,fill:c.dark||c.text,fontWeight:900,dataRole:'product-title:1',displayName:'Produktname',lockRotation:true}),
    rect({left:X(32),top:Y(213),width:X(340),height:Y(318),rx:S(20),ry:S(20),fill:c.surface,dataRole:'product-card:1',displayName:'Produktfläche'})
  );
  addSlot(canvas,X(50),Y(231),X(304),Y(282),'PRODUKTBILD',c,S,1);
  canvas.add(
    rect({left:X(392),top:Y(230),width:X(174),height:Y(230),rx:S(22),ry:S(22),fill:c.primary,dataRole:'price-panel'}),
    text(t.content.oldPrice?`STATT ${t.content.oldPrice}`:'',{left:X(479),top:Y(266),originX:'center',fontSize:S(11),fill:'#ffffff',opacity:.85,linethrough:true,dataRole:'old-price',lockRotation:true}),
    box(t.content.newPrice,{left:X(404),top:Y(313),width:X(150),fontSize:S(31),fontWeight:900,fill:'#ffffff',textAlign:'center',dataRole:'price:1',lockRotation:true}),
    rect({left:X(414),top:Y(390),width:X(130),height:Y(38),rx:S(19),ry:S(19),fill:c.secondary,dataRole:'badge-bg'}),
    text(t.content.badge||'ANGEBOT',{left:X(479),top:Y(409),originX:'center',originY:'center',fontSize:S(10),fontWeight:900,fill:c.secondary==='#FFFFFF'?c.primary:'#ffffff',dataRole:'badge',lockRotation:true}),
    box(t.content.subtitle||'Nur solange der Vorrat reicht.',{left:X(392),top:Y(485),width:X(174),fontSize:S(10),fill:c.dark||c.text,fontWeight:700,lineHeight:1.15,dataRole:'market-note',displayName:'Hinweis',lockRotation:true})
  );
  addMarketFooter(canvas,b,c,X,Y,S);
}
async function marketGrid6(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=marketPalette(t,b);clearCanvas(canvas,c.background);
  await addMarketHeader(canvas,t,b,c,X,Y,S,true);
  gridCards(canvas,t,c,X,Y,S,2,3,145,635);
  addMarketFooter(canvas,b,c,X,Y,S);
}
async function marketGrid9(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=marketPalette(t,b);clearCanvas(canvas,c.background);
  await addMarketHeader(canvas,t,b,c,X,Y,S,true);
  gridCards(canvas,t,c,X,Y,S,3,3,145,635);
  addMarketFooter(canvas,b,c,X,Y,S);
}
async function signageDibond(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=colors(t,b);clearCanvas(canvas,c.background);canvas.add(rect({left:0,top:0,width:w,height:Y(88),fill:c.primary}),text(t.content.eyebrow,{left:X(28),top:Y(32),fontSize:S(10),fill:'#111111'}),box(t.content.headline,{left:X(28),top:Y(130),width:X(310),fontSize:S(36),lineHeight:.94,fill:c.text,fontWeight:900}),box(t.content.subtitle,{left:X(28),top:Y(250),width:X(300),fontSize:S(12),fill:c.text,opacity:.7}));addSlot(canvas,X(350),Y(125),X(215),Y(300),'DIBOND / PRODUKTFOTO',c,S);addPrice(canvas,t,c,X(28),Y(365),X(270),Y(180),S);await addLogo(canvas,b,X(375),Y(470),X(170),Y(75),c,S);addFooter(canvas,b,c,X,Y,S);
}
async function signageVehicle(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=colors(t,b);clearCanvas(canvas,c.background);addTop(canvas,t,c,X,Y,S);addSlot(canvas,X(30),Y(245),X(540),Y(285),'FAHRZEUGFOTO',c,S);canvas.add(rect({left:X(30),top:Y(550),width:X(540),height:Y(70),rx:S(12),ry:S(12),fill:c.primary}),box('DESIGN · DRUCK · MONTAGE',{left:X(50),top:Y(572),width:X(315),fontSize:S(14),fill:'#ffffff'}),box(t.content.badge,{left:X(415),top:Y(572),width:X(125),fontSize:S(14),fill:c.secondary,textAlign:'right'}));await addLogo(canvas,b,X(390),Y(25),X(170),Y(62),c,S);addFooter(canvas,b,c,X,Y,S);
}
async function electricCheck(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=colors(t,b);clearCanvas(canvas,c.background);canvas.add(rect({left:0,top:0,width:X(210),height:h,fill:c.primary}),rect({left:X(210),top:0,width:X(18),height:h,fill:c.secondary}),text('✓',{left:X(53),top:Y(72),fontSize:S(72),fill:c.secondary}),box(t.content.headline,{left:X(28),top:Y(190),width:X(155),fontSize:S(31),fill:'#ffffff',fontWeight:900}),box(t.content.subtitle,{left:X(28),top:Y(310),width:X(155),fontSize:S(11),fill:'#ffffff',opacity:.72}));addSlot(canvas,X(260),Y(68),X(305),Y(307),'PROJEKTFOTO',c,S);addPrice(canvas,t,c,X(300),Y(415),X(230),Y(170),S);await addLogo(canvas,b,X(35),Y(505),X(145),Y(65),c,S);addFooter(canvas,b,c,X,Y,S);
}
async function electricSmart(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=colors(t,b);clearCanvas(canvas,c.background);addTop(canvas,t,c,X,Y,S);addSlot(canvas,X(28),Y(245),X(348),Y(295),'SMART-HOME FOTO',c,S);['LICHT','SICHERHEIT','STEUERUNG'].forEach((label,i)=>canvas.add(rect({left:X(400),top:Y(245+i*90),width:X(165),height:Y(65),rx:S(12),ry:S(12),fill:i===1?c.primary:c.surface,stroke:c.secondary,strokeWidth:S(1.5)}),text(label,{left:X(482),top:Y(278+i*90),originX:'center',originY:'center',fontSize:S(11),fill:i===1?'#ffffff':c.text})));await addLogo(canvas,b,X(410),Y(550),X(145),Y(60),c,S);addFooter(canvas,b,c,X,Y,S);
}
async function businessClean(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=colors(t,b);clearCanvas(canvas,c.background);canvas.add(rect({left:0,top:0,width:w,height:Y(102),fill:c.primary}),text(t.content.eyebrow,{left:X(28),top:Y(24),fontSize:S(10),fill:c.secondary}),box(t.content.headline,{left:X(28),top:Y(145),width:X(320),fontSize:S(37),lineHeight:.94,fill:c.text,fontWeight:900}),box(t.content.subtitle,{left:X(28),top:Y(275),width:X(320),fontSize:S(12),fill:c.text,opacity:.7}));addSlot(canvas,X(375),Y(140),X(190),Y(270),'BILD / LEISTUNG',c,S);addPrice(canvas,t,c,X(28),Y(375),X(285),Y(175),S);await addLogo(canvas,b,X(385),Y(455),X(170),Y(80),c,S);addFooter(canvas,b,c,X,Y,S);
}
async function businessSocial(canvas,t,w,h,b){
  const{X,Y,S}=scaler(w,h),c=colors(t,b);clearCanvas(canvas,c.background);canvas.add(rect({left:X(28),top:Y(28),width:X(544),height:Y(75),rx:S(18),ry:S(18),fill:c.surface}),text(t.content.eyebrow,{left:X(53),top:Y(55),fontSize:S(10),fill:c.secondary}),box(t.content.headline,{left:X(28),top:Y(140),width:X(544),fontSize:S(37),lineHeight:.95,fill:c.text,fontWeight:900}));addSlot(canvas,X(28),Y(270),X(544),Y(275),'MOTIV / FOTO',c,S);canvas.add(rect({left:X(28),top:Y(570),width:X(170),height:Y(52),rx:S(26),ry:S(26),fill:c.primary}),text(t.content.badge,{left:X(113),top:Y(596),originX:'center',originY:'center',fontSize:S(12),fill:'#ffffff'}),box(t.content.subtitle,{left:X(220),top:Y(578),width:X(330),fontSize:S(11.5),fill:c.text,opacity:.72}));await addLogo(canvas,b,X(430),Y(35),X(120),Y(55),c,S);addFooter(canvas,b,c,X,Y,S);
}

const renderers={
  tech_split:techSplit,tech_browser:techBrowser,tech_flow:techFlow,
  market_single:marketSingle,market_grid6:marketGrid6,market_grid9:marketGrid9,
  signage_dibond:signageDibond,signage_vehicle:signageVehicle,
  electric_check:electricCheck,electric_smart:electricSmart,
  business_clean:businessClean,business_social:businessSocial
};

export async function applyPixvaV12Template(canvas,templateId,width,height,source={}){
  const template=getPixvaV12Template(templateId);
  if(!template)throw new Error(`PIXVA V12 Vorlage nicht gefunden: ${templateId}`);
  const brand=normalizePixvaV12Brand(source);
  const render=renderers[template.layout];
  if(!render)throw new Error(`PIXVA V12 Layout nicht gefunden: ${template.layout}`);
  await render(canvas,template,width,height,brand);
  try{canvas.setViewportTransform([1,0,0,1,0,0])}catch{}
  canvas.discardActiveObject();
  canvas.getObjects().forEach(object=>{
    object.angle=0;
    if(template.industry==='supermarkt'){
      object.lockRotation=true;
      if('fontStyle' in object)object.fontStyle='normal';
    }
    object.setCoords?.();
  });
  canvas.requestRenderAll();
  return{template,brand};
}

export function auditPixvaV12Canvas(canvas){
  if(!canvas)return{passed:false,score:0,issues:['Arbeitsfläche fehlt.']};
  const objects=canvas.getObjects?.()||[];
  const issues=[];
  if(!objects.some(o=>o.dataRole==='company-name'))issues.push('Firmenname fehlt.');
  if(!objects.some(o=>o.dataRole==='company-contact'))issues.push('Firmenkontakt fehlt.');
  if(!objects.some(o=>/^logo-(image|slot)/.test(String(o.dataRole||''))))issues.push('Firmenlogo/Logo-Platzhalter fehlt.');
  for(const object of objects){
    if(object.visible===false)continue;
    try{
      object.setCoords?.();
      const bounds=object.getBoundingRect?.();
      if(bounds&&(bounds.left<-3||bounds.top<-3||bounds.left+bounds.width>canvas.width+3||bounds.top+bounds.height>canvas.height+3)){
        issues.push(`Element außerhalb: ${object.displayName||object.dataRole||object.type||'Element'}`);
      }
      if(Math.abs(Number(object.angle||0))>.01)issues.push(`Schräges Element: ${object.displayName||object.type||'Element'}`);
    }catch{}
  }
  const unique=[...new Set(issues)];
  return{passed:unique.length===0,score:Math.max(0,100-unique.length*12),issues:unique};
}
