/* PIXVA V11.9.3 FILE TEMPLATE ENGINE – ORIGIN SAFE */
import { FabricImage, IText, Rect, Textbox } from 'fabric';
import flyerTemplates from './flyer_vorlagen.json';

export const pixvaTemplateList = flyerTemplates.templates || [];

const first=(obj,keys,fallback='')=>{
  for(const key of keys){
    const value=obj?.[key];
    if(value!==undefined&&value!==null&&String(value).trim()!=='') return value;
  }
  return fallback;
};

export function normalizePixvaBrand(source={},example={}){
  const brand=source?.company?source.company:source;
  return{
    type:String(first(brand,['company_type','companyType','industry'],'sonstiges')).toLowerCase(),
    companyName:first(brand,['company_name','companyName','name'],example.companyName||'BEISPIEL FIRMA'),
    ownerName:first(brand,['owner_name','ownerName'],example.ownerName||''),
    companyPhone:first(brand,['company_phone','companyPhone','phone'],example.companyPhone||''),
    companyEmail:first(brand,['company_email','companyEmail','email'],example.companyEmail||''),
    website:first(brand,['website'],example.website||''),
    instagram:first(brand,['instagram'],example.instagram||''),
    address:first(brand,['address'],example.address||''),
    logo:first(brand,['logo_data_url','logoDataUrl','logo_url','logoUrl','logo_path','logoPath','logo'],example.logo||'/pixva-logo.png'),
    primary:first(brand,['primary_color','primaryColor'],''),
    secondary:first(brand,['secondary_color','secondaryColor'],'')
  };
}

function industryKey(raw=''){
  const value=String(raw||'').toLowerCase();
  if(/programm|software|webentwick|entwickler|developer|\bit\b/.test(value)) return 'programmierer';
  if(/supermarkt|market|lebensmittel/.test(value)) return 'supermarkt';
  if(/werbetechnik|werbung|druck|folierung/.test(value)) return 'werbetechnik';
  if(/elektrik|elektro/.test(value)) return 'elektriker';
  return 'sonstiges';
}

export function getPixvaTemplate(id){
  return pixvaTemplateList.find(t=>t.id===id)||pixvaTemplateList[0];
}

export function pixvaTemplateIdForBrand(source={},mode='flyer'){
  if(mode==='image') return 'pixva-firma';
  const brand=normalizePixvaBrand(source,{});
  const other=source?.company_type_other||source?.companyTypeOther||source?.industryOther||'';
  const kind=industryKey(`${brand.type} ${other}`);
  return pixvaTemplateList.find(t=>t.industry===kind&&t.layout==='single')?.id||'pixva-firma';
}

/*
  Fabric 7: Every template object gets an explicit origin.
  This prevents full-width rectangles and left-aligned text from being
  interpreted around their center and clipped at the canvas boundary.
*/
const R=(options={})=>new Rect({
  originX:'left',
  originY:'top',
  angle:0,
  ...options
});
const T=(value,options={})=>new IText(String(value||''),{
  fontFamily:'Arial',
  fontWeight:700,
  originX:'left',
  originY:'top',
  angle:0,
  ...options
});
const B=(value,options={})=>new Textbox(String(value||''),{
  fontFamily:'Arial',
  fontWeight:700,
  originX:'left',
  originY:'top',
  angle:0,
  splitByGrapheme:false,
  ...options
});

function resetCanvasView(canvas){
  try{
    if(typeof canvas.setViewportTransform==='function'){
      canvas.setViewportTransform([1,0,0,1,0,0]);
    }
  }catch{}
}

function addSlot(canvas,x,y,w,h,index,label,style,s){
  canvas.add(
    R({
      left:x,top:y,width:w,height:h,
      rx:14*s,ry:14*s,
      fill:style.surface||'#fff',
      stroke:style.secondary,
      strokeWidth:2*s,
      strokeDashArray:[8*s,6*s],
      dataRole:`product-slot:${index}`,
      displayName:`Produktbild ${index}`
    }),
    B(label||'PRODUKTBILD',{
      left:x+12*s,
      top:y+h/2-10*s,
      width:w-24*s,
      fontSize:15*s,
      textAlign:'center',
      fill:style.text,
      opacity:.60,
      dataRole:`product-slot-label:${index}`,
      displayName:`Bildhinweis ${index}`
    })
  );
}

async function addLogo(canvas,url,x,y,w,h,style,s){
  if(url){
    try{
      const image=await FabricImage.fromURL(url,{crossOrigin:'anonymous'});
      image.scale(Math.min(w/Math.max(1,image.width),h/Math.max(1,image.height),1));
      image.set({
        left:x+w/2,
        top:y+h/2,
        originX:'center',
        originY:'center',
        angle:0,
        dataRole:'logo-image:1',
        displayName:'Firmenlogo'
      });
      canvas.add(image);
      return;
    }catch{}
  }

  canvas.add(
    R({
      left:x,top:y,width:w,height:h,
      rx:8*s,ry:8*s,
      fill:'#fff',
      stroke:style.secondary,
      strokeWidth:1.5*s,
      dataRole:'logo-slot:1',
      displayName:'Logo'
    }),
    T('LOGO',{
      left:x+w/2,
      top:y+h/2,
      originX:'center',
      originY:'center',
      fontSize:14*s,
      fill:style.primary,
      dataRole:'logo-slot-label:1'
    })
  );
}

async function renderSingle(canvas,t,width,height,brand){
  resetCanvasView(canvas);

  const sx=width/600;
  const sy=height/750;
  const scale=Math.min(sx,sy);
  const X=n=>n*sx;
  const Y=n=>n*sy;
  const S=n=>n*scale;

  const style={
    ...t.style,
    primary:brand.primary||t.style.primary,
    secondary:brand.secondary||t.style.secondary
  };

  canvas.clear();
  resetCanvasView(canvas);
  canvas.backgroundColor=style.background;

  canvas.add(
    R({
      left:0,top:0,width:width,height:Y(118),
      fill:style.primary,
      selectable:false,
      evented:false,
      dataRole:'template-bg'
    }),
    R({
      left:0,top:Y(118),width:X(318),height:Y(14),
      fill:style.secondary,
      selectable:false,
      evented:false,
      dataRole:'template-accent'
    }),
    T(t.content.eyebrow,{
      left:X(36),top:Y(28),
      fontSize:S(14),
      fill:'#fff',
      charSpacing:80,
      dataRole:'eyebrow',
      displayName:'Kategorie'
    }),
    B(t.content.headline,{
      left:X(36),top:Y(150),width:X(528),
      fontSize:S(34),
      lineHeight:.98,
      fill:style.text,
      fontWeight:900,
      dataRole:'headline',
      displayName:'Überschrift'
    }),
    B(t.content.subtitle,{
      left:X(36),top:Y(232),width:X(528),
      fontSize:S(14),
      fill:style.text,
      opacity:.72,
      dataRole:'subtitle',
      displayName:'Unterzeile'
    })
  );

  addSlot(canvas,X(36),Y(298),X(315),Y(245),1,t.content.productLabel,style,scale);

  canvas.add(
    R({
      left:X(378),top:Y(298),width:X(186),height:Y(245),
      rx:S(18),ry:S(18),
      fill:style.primary,
      dataRole:'price-panel',
      displayName:'Preisbereich'
    }),
    T(t.content.oldPrice?`STATT ${t.content.oldPrice}`:'',{
      left:X(471),top:Y(333),
      originX:'center',
      fontSize:S(13),
      fill:'#fff',
      opacity:.72,
      linethrough:true,
      dataRole:'old-price',
      displayName:'Alter Preis'
    }),
    B(t.content.newPrice,{
      left:X(395),top:Y(372),width:X(152),
      fontSize:S(34),
      fontWeight:900,
      fill:'#fff',
      textAlign:'center',
      dataRole:'price:1',
      displayName:'Preis'
    }),
    R({
      left:X(401),top:Y(439),width:X(140),height:Y(40),
      rx:S(20),ry:S(20),
      fill:style.secondary,
      dataRole:'discount-bg',
      displayName:'Rabattfläche'
    }),
    T(t.content.badge,{
      left:X(471),top:Y(459),
      originX:'center',
      originY:'center',
      fontSize:S(13),
      fontWeight:900,
      fill:style.primary,
      dataRole:'discount',
      displayName:'Rabatt'
    }),
    B(t.content.note,{
      left:X(397),top:Y(492),width:X(148),
      fontSize:S(10),
      fill:'#fff',
      textAlign:'center',
      opacity:.78,
      dataRole:'price-note',
      displayName:'Preis-Hinweis'
    }),
    B(brand.companyName,{
      left:X(36),top:Y(574),width:X(360),
      fontSize:S(27),
      fontWeight:900,
      fill:style.text,
      dataRole:'company-name',
      displayName:'Firmenname'
    }),
    B([brand.companyPhone,brand.companyEmail].filter(Boolean).join(' · '),{
      left:X(36),top:Y(620),width:X(360),
      fontSize:S(10),
      fill:style.text,
      opacity:.78,
      dataRole:'company-contact',
      displayName:'Telefon & E-Mail'
    }),
    B([brand.website,brand.instagram].filter(Boolean).join(' · '),{
      left:X(36),top:Y(644),width:X(360),
      fontSize:S(10),
      fill:style.text,
      opacity:.78,
      dataRole:'company-web',
      displayName:'Website & Instagram'
    }),
    B(brand.address,{
      left:X(36),top:Y(668),width:X(360),
      fontSize:S(10),
      fill:style.text,
      opacity:.78,
      dataRole:'address',
      displayName:'Adresse'
    })
  );

  await addLogo(canvas,brand.logo,X(430),Y(574),X(134),Y(76),style,scale);

  canvas.add(
    R({
      left:X(36),top:Y(710),width:X(528),height:Y(2),
      fill:style.secondary,
      selectable:false,
      evented:false,
      dataRole:'footer-line'
    })
  );

  canvas.getObjects().forEach(obj=>{
    obj.setCoords?.();
  });
}

async function renderGrid6(canvas,t,width,height,brand){
  resetCanvasView(canvas);

  const sx=width/600;
  const sy=height/750;
  const scale=Math.min(sx,sy);
  const X=n=>n*sx;
  const Y=n=>n*sy;
  const S=n=>n*scale;

  const style={
    ...t.style,
    primary:brand.primary||t.style.primary,
    secondary:brand.secondary||t.style.secondary
  };

  canvas.clear();
  resetCanvasView(canvas);
  canvas.backgroundColor=style.background;

  canvas.add(
    R({
      left:0,top:0,width:width,height:Y(105),
      fill:style.primary,
      selectable:false,
      evented:false,
      dataRole:'template-bg'
    }),
    T(t.content.eyebrow,{
      left:X(30),top:Y(26),
      fontSize:S(12),
      fill:'#fff',
      charSpacing:70,
      dataRole:'eyebrow'
    }),
    T(t.content.headline,{
      left:X(30),top:Y(55),
      fontSize:S(27),
      fontWeight:900,
      fill:'#fff',
      dataRole:'headline'
    })
  );

  await addLogo(canvas,brand.logo,X(462),Y(24),X(102),Y(55),style,scale);

  const margin=30;
  const gap=14;
  const startY=128;
  const cardW=(600-margin*2-gap)/2;
  const cardH=166;
  let index=1;

  for(let row=0;row<3;row+=1){
    for(let col=0;col<2;col+=1){
      const x=margin+col*(cardW+gap);
      const y=startY+row*(cardH+gap);

      canvas.add(
        R({
          left:X(x),top:Y(y),width:X(cardW),height:Y(cardH),
          rx:S(13),ry:S(13),
          fill:style.surface,
          stroke:'#d7dcd9',
          strokeWidth:S(1),
          dataRole:`card:${index}`,
          displayName:`Produktkarte ${index}`
        })
      );

      addSlot(canvas,X(x+11),Y(y+11),X(118),Y(90),index,'BILD',style,scale);

      canvas.add(
        B(`PRODUKT ${index}`,{
          left:X(x+142),top:Y(y+20),width:X(103),
          fontSize:S(13),
          fontWeight:900,
          fill:style.text,
          dataRole:`product-title:${index}`,
          displayName:`Produktname ${index}`
        }),
        R({
          left:X(x+142),top:Y(y+92),width:X(103),height:Y(42),
          rx:S(9),ry:S(9),
          fill:style.secondary,
          dataRole:`price-bg:${index}`
        }),
        T('4,99 €',{
          left:X(x+193.5),top:Y(y+113),
          originX:'center',
          originY:'center',
          fontSize:S(17),
          fontWeight:900,
          fill:'#fff',
          dataRole:`price:${index}`,
          displayName:`Preis ${index}`
        })
      );

      index+=1;
    }
  }

  canvas.add(
    B(brand.companyName,{
      left:X(30),top:Y(676),width:X(250),
      fontSize:S(20),
      fontWeight:900,
      fill:style.text,
      dataRole:'company-name'
    }),
    B([brand.companyPhone,brand.website].filter(Boolean).join(' · '),{
      left:X(30),top:Y(710),width:X(410),
      fontSize:S(9),
      fill:style.text,
      opacity:.75,
      dataRole:'company-contact'
    })
  );

  canvas.getObjects().forEach(obj=>{
    obj.setCoords?.();
  });
}

export async function applyPixvaFileTemplate(canvas,templateId,width,height,source={}){
  const template=getPixvaTemplate(templateId);
  if(!template) throw new Error('PIXVA Datei-Vorlage nicht gefunden.');

  resetCanvasView(canvas);

  const brand=normalizePixvaBrand(source,template.example||{});

  if(template.layout==='grid6'){
    await renderGrid6(canvas,template,width,height,brand);
  }else{
    await renderSingle(canvas,template,width,height,brand);
  }

  resetCanvasView(canvas);
  canvas.discardActiveObject();
  canvas.requestRenderAll();

  return{template,brand};
}
