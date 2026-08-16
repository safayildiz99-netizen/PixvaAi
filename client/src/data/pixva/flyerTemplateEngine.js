/* PIXVA V11.9 FILE TEMPLATE ENGINE */
import { FabricImage, IText, Rect, Textbox } from 'fabric';
import flyerTemplates from './flyer_vorlagen.json';

export const pixvaTemplateList = flyerTemplates.templates || [];

const first=(obj,keys,fallback='')=>{
  for(const key of keys){
    const v=obj?.[key];
    if(v!==undefined&&v!==null&&String(v).trim()!=='') return v;
  }
  return fallback;
};

export function normalizePixvaBrand(source={},example={}){
  const b=source?.company?source.company:source;
  return{
    type:String(first(b,['company_type','companyType','industry'],'sonstiges')).toLowerCase(),
    companyName:first(b,['company_name','companyName','name'],example.companyName||'BEISPIEL FIRMA'),
    ownerName:first(b,['owner_name','ownerName'],example.ownerName||''),
    companyPhone:first(b,['company_phone','companyPhone','phone'],example.companyPhone||''),
    companyEmail:first(b,['company_email','companyEmail','email'],example.companyEmail||''),
    website:first(b,['website'],example.website||''),
    instagram:first(b,['instagram'],example.instagram||''),
    address:first(b,['address'],example.address||''),
    logo:first(b,['logo_data_url','logoDataUrl','logo_url','logoUrl','logo_path','logoPath','logo'],example.logo||'/pixva-logo.png'),
    primary:first(b,['primary_color','primaryColor'],''),
    secondary:first(b,['secondary_color','secondaryColor'],'')
  };
}

function industryKey(raw=''){
  const v=String(raw||'').toLowerCase();
  if(/programm|software|webentwick|entwickler|developer|it\b/.test(v))return'programmierer';
  if(/supermarkt|market|lebensmittel/.test(v))return'supermarkt';
  if(/werbetechnik|werbung|druck|folierung/.test(v))return'werbetechnik';
  if(/elektrik|elektro/.test(v))return'elektriker';
  return'sonstiges';
}

export function getPixvaTemplate(id){
  return pixvaTemplateList.find(t=>t.id===id)||pixvaTemplateList[0];
}
export function pixvaTemplateIdForBrand(source={},mode='flyer'){
  if(mode==='image')return'pixva-firma';
  const b=normalizePixvaBrand(source,{});
  const kind=industryKey(`${b.type} ${source?.company_type_other||source?.companyTypeOther||''}`);
  return pixvaTemplateList.find(t=>t.industry===kind&&t.layout==='single')?.id||'pixva-firma';
}

const T=(v,o={})=>new IText(String(v||''),{fontFamily:'Arial',fontWeight:700,angle:0,...o});
const B=(v,o={})=>new Textbox(String(v||''),{fontFamily:'Arial',fontWeight:700,angle:0,splitByGrapheme:false,...o});

function addSlot(canvas,x,y,w,h,index,label,st,s){
  canvas.add(
    new Rect({left:x,top:y,width:w,height:h,rx:14*s,ry:14*s,fill:st.surface||'#fff',stroke:st.secondary,strokeWidth:2*s,strokeDashArray:[8*s,6*s],angle:0,dataRole:`product-slot:${index}`,displayName:`Produktbild ${index}`}),
    B(label||'PRODUKTBILD',{left:x+12*s,top:y+h/2-10*s,width:w-24*s,fontSize:15*s,textAlign:'center',fill:st.text,opacity:.6,dataRole:`product-slot-label:${index}`,displayName:`Bildhinweis ${index}`})
  );
}

async function addLogo(canvas,url,x,y,w,h,st,s){
  if(url){
    try{
      const image=await FabricImage.fromURL(url,{crossOrigin:'anonymous'});
      image.scale(Math.min(w/Math.max(1,image.width),h/Math.max(1,image.height),1));
      image.set({left:x+w/2,top:y+h/2,originX:'center',originY:'center',angle:0,dataRole:'logo-image:1',displayName:'Firmenlogo'});
      canvas.add(image); return;
    }catch{}
  }
  canvas.add(
    new Rect({left:x,top:y,width:w,height:h,rx:8*s,ry:8*s,fill:'#fff',stroke:st.secondary,strokeWidth:1.5*s,angle:0,dataRole:'logo-slot:1',displayName:'Logo'}),
    T('LOGO',{left:x+w/2,top:y+h/2,originX:'center',originY:'center',fontSize:14*s,fill:st.primary,dataRole:'logo-slot-label:1'})
  );
}

async function renderSingle(canvas,t,width,height,brand){
  const sx=width/600,sy=height/750,s=Math.min(sx,sy),X=n=>n*sx,Y=n=>n*sy,S=n=>n*s;
  const st={...t.style,primary:brand.primary||t.style.primary,secondary:brand.secondary||t.style.secondary};
  canvas.clear(); canvas.backgroundColor=st.background;
  canvas.add(
    new Rect({left:0,top:0,width,height:Y(118),fill:st.primary,selectable:false,evented:false,angle:0,dataRole:'template-bg'}),
    new Rect({left:0,top:Y(118),width:X(318),height:Y(14),fill:st.secondary,selectable:false,evented:false,angle:0,dataRole:'template-accent'}),
    T(t.content.eyebrow,{left:X(36),top:Y(28),fontSize:S(14),fill:'#fff',charSpacing:80,dataRole:'eyebrow'}),
    B(t.content.headline,{left:X(36),top:Y(150),width:X(528),fontSize:S(34),lineHeight:.98,fill:st.text,fontWeight:900,dataRole:'headline'}),
    B(t.content.subtitle,{left:X(36),top:Y(232),width:X(528),fontSize:S(14),fill:st.text,opacity:.72,dataRole:'subtitle'})
  );
  addSlot(canvas,X(36),Y(298),X(315),Y(245),1,t.content.productLabel,st,s);
  canvas.add(
    new Rect({left:X(378),top:Y(298),width:X(186),height:Y(245),rx:S(18),ry:S(18),fill:st.primary,angle:0,dataRole:'price-panel'}),
    T(t.content.oldPrice?`STATT ${t.content.oldPrice}`:'',{left:X(471),top:Y(333),originX:'center',fontSize:S(13),fill:'#fff',opacity:.72,linethrough:true,dataRole:'old-price'}),
    B(t.content.newPrice,{left:X(395),top:Y(372),width:X(152),fontSize:S(34),fontWeight:900,fill:'#fff',textAlign:'center',dataRole:'price:1'}),
    new Rect({left:X(401),top:Y(439),width:X(140),height:Y(40),rx:S(20),ry:S(20),fill:st.secondary,angle:0,dataRole:'discount-bg'}),
    T(t.content.badge,{left:X(471),top:Y(459),originX:'center',originY:'center',fontSize:S(13),fontWeight:900,fill:st.primary,dataRole:'discount'}),
    B(t.content.note,{left:X(397),top:Y(492),width:X(148),fontSize:S(10),fill:'#fff',textAlign:'center',opacity:.78,dataRole:'price-note'}),
    B(brand.companyName,{left:X(36),top:Y(574),width:X(360),fontSize:S(27),fontWeight:900,fill:st.text,dataRole:'company-name'}),
    B([brand.companyPhone,brand.companyEmail].filter(Boolean).join(' · '),{left:X(36),top:Y(620),width:X(360),fontSize:S(10),fill:st.text,opacity:.78,dataRole:'company-contact'}),
    B([brand.website,brand.instagram].filter(Boolean).join(' · '),{left:X(36),top:Y(644),width:X(360),fontSize:S(10),fill:st.text,opacity:.78,dataRole:'company-web'}),
    B(brand.address,{left:X(36),top:Y(668),width:X(360),fontSize:S(10),fill:st.text,opacity:.78,dataRole:'address'})
  );
  await addLogo(canvas,brand.logo,X(430),Y(574),X(134),Y(76),st,s);
  canvas.add(new Rect({left:X(36),top:Y(710),width:X(528),height:Y(2),fill:st.secondary,selectable:false,evented:false,angle:0}));
}

async function renderGrid6(canvas,t,width,height,brand){
  const sx=width/600,sy=height/750,s=Math.min(sx,sy),X=n=>n*sx,Y=n=>n*sy,S=n=>n*s;
  const st={...t.style,primary:brand.primary||t.style.primary,secondary:brand.secondary||t.style.secondary};
  canvas.clear(); canvas.backgroundColor=st.background;
  canvas.add(
    new Rect({left:0,top:0,width,height:Y(105),fill:st.primary,selectable:false,evented:false,angle:0}),
    T(t.content.eyebrow,{left:X(30),top:Y(26),fontSize:S(12),fill:'#fff',charSpacing:70}),
    T(t.content.headline,{left:X(30),top:Y(55),fontSize:S(27),fontWeight:900,fill:'#fff'})
  );
  await addLogo(canvas,brand.logo,X(462),Y(24),X(102),Y(55),st,s);
  const margin=30,gap=14,startY=128,cardW=(600-margin*2-gap)/2,cardH=166;
  let index=1;
  for(let row=0;row<3;row+=1)for(let col=0;col<2;col+=1){
    const x=margin+col*(cardW+gap),y=startY+row*(cardH+gap);
    canvas.add(new Rect({left:X(x),top:Y(y),width:X(cardW),height:Y(cardH),rx:S(13),ry:S(13),fill:st.surface,stroke:'#d7dcd9',strokeWidth:S(1),angle:0,dataRole:`card:${index}`,displayName:`Produktkarte ${index}`}));
    addSlot(canvas,X(x+11),Y(y+11),X(118),Y(90),index,'BILD',st,s);
    canvas.add(
      B(`PRODUKT ${index}`,{left:X(x+142),top:Y(y+20),width:X(103),fontSize:S(13),fontWeight:900,fill:st.text,dataRole:`product-title:${index}`}),
      new Rect({left:X(x+142),top:Y(y+92),width:X(103),height:Y(42),rx:S(9),ry:S(9),fill:st.secondary,angle:0,dataRole:`price-bg:${index}`}),
      T('4,99 €',{left:X(x+193.5),top:Y(y+113),originX:'center',originY:'center',fontSize:S(17),fontWeight:900,fill:'#fff',dataRole:`price:${index}`})
    );
    index+=1;
  }
  canvas.add(
    B(brand.companyName,{left:X(30),top:Y(676),width:X(250),fontSize:S(20),fontWeight:900,fill:st.text,dataRole:'company-name'}),
    B([brand.companyPhone,brand.website].filter(Boolean).join(' · '),{left:X(30),top:Y(710),width:X(410),fontSize:S(9),fill:st.text,opacity:.75,dataRole:'company-contact'})
  );
}

export async function applyPixvaFileTemplate(canvas,templateId,width,height,source={}){
  const template=getPixvaTemplate(templateId);
  if(!template)throw new Error('PIXVA Datei-Vorlage nicht gefunden.');
  const brand=normalizePixvaBrand(source,template.example||{});
  if(template.layout==='grid6')await renderGrid6(canvas,template,width,height,brand);
  else await renderSingle(canvas,template,width,height,brand);
  canvas.discardActiveObject(); canvas.requestRenderAll();
  return{template,brand};
}
