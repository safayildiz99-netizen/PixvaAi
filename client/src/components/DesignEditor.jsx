/* PIXVA V11.8.1 DESIGN WRAPPER */
import { useEffect, useState } from 'react';
import { Circle, FabricImage, FabricText, Rect } from 'fabric';
import { api } from '../api.js';
import DesignEditorLegacy from './DesignEditorLegacy.jsx';

const EXAMPLE_LOGO="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5MDAiIGhlaWdodD0iNDIwIiB2aWV3Qm94PSIwIDAgOTAwIDQyMCI+CjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAiIHkxPSIwIiB4Mj0iMSIgeTI9IjEiPjxzdG9wIHN0b3AtY29sb3I9IiM3MjU4ZmYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMzOWQ2ZDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz4KPHJlY3Qgd2lkdGg9IjkwMCIgaGVpZ2h0PSI0MjAiIHJ4PSI3MCIgZmlsbD0iI2ZmZiIvPgo8cmVjdCB4PSIyOCIgeT0iMjgiIHdpZHRoPSI4NDQiIGhlaWdodD0iMzY0IiByeD0iNTIiIGZpbGw9InVybCgjZykiLz4KPHRleHQgeD0iNDUwIiB5PSIxODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjgwIiBmb250LXdlaWdodD0iODAwIiBmaWxsPSIjZmZmIj5CRUlTUElFTCBMT0dPPC90ZXh0Pgo8dGV4dCB4PSI0NTAiIHk9IjI1OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMzEiIGZvbnQtd2VpZ2h0PSI2MDAiIGZpbGw9IiNlYWZmZmYiPmF1dG9tYXRpc2NoIGR1cmNoIGRlaW4gRmlybWVubG9nbyBlcnNldHp0PC90ZXh0Pgo8L3N2Zz4=";

function exampleFor(type='sonstiges',other=''){
  if(type==='supermarkt')return{name:'BEISPIEL MARKT',title:'FRISCHE ANGEBOTE',subject:'OBST & GEMÜSE',offer:'3,49 €',unit:'AKTIONSPREIS',phone:'+49 711 1234567',email:'info@beispiel-markt.de',website:'www.beispiel-markt.de',address:'Musterstraße 12 · Stuttgart',bg:'#f8f0df',dark:'#0a563c',accent:'#e72828'};
  if(type==='werbetechnik')return{name:'BEISPIEL WERBETECHNIK',title:'DIBOND ANGEBOT',subject:'BEDRUCKTE DIBOND PLATTE',offer:'44,99 €',unit:'STATT 59,99 €',phone:'+49 711 1234567',email:'info@beispiel-werbetechnik.de',website:'www.beispiel-werbetechnik.de',address:'Musterstraße 12 · Stuttgart',bg:'#f4f4f1',dark:'#111111',accent:'#f7c948'};
  if(type==='elektriker')return{name:'BEISPIEL ELEKTRO',title:'ELEKTRO AKTION',subject:'ELEKTRO-CHECK',offer:'-20%',unit:'JETZT RABATT SICHERN',phone:'+49 711 1234567',email:'info@beispiel-elektro.de',website:'www.beispiel-elektro.de',address:'Musterstraße 12 · Stuttgart',bg:'#eef6fb',dark:'#082139',accent:'#ffd42a'};
  return{name:'BEISPIEL FIRMA',title:'ANGEBOT',subject:(other||'UNSERE LEISTUNG').toUpperCase(),offer:'AKTION',unit:'JETZT ANFRAGEN',phone:'+49 711 1234567',email:'info@beispiel-firma.de',website:'www.beispiel-firma.de',address:'Musterstraße 12 · Stuttgart',bg:'#f3f5f7',dark:'#1b2735',accent:'#7258ff'};
}
function brandFrom(brain){
  const c=brain?.company||{},type=c.companyType||'sonstiges',e=exampleFor(type,c.companyTypeOther||'');
  const real=Boolean(c.companyName||c.companyPhone||c.companyEmail||c.website||c.logoDataUrl||c.logoUrl);
  return{example:!real,name:c.companyName||e.name,title:e.title,subject:e.subject,offer:e.offer,unit:e.unit,
    phone:c.companyPhone||e.phone,email:c.companyEmail||e.email,website:c.website||e.website,address:c.address||e.address,
    logo:c.logoDataUrl||c.logoUrl||EXAMPLE_LOGO,bg:e.bg,dark:c.primaryColor||e.dark,accent:c.secondaryColor||e.accent};
}
const obj=v=>v.toObject();

async function makeProject(brain,mode){
  const b=brandFrom(brain),w=600,h=750,r=69;
  const objects=[
    obj(new Rect({left:0,top:0,width:w,height:h*.14,fill:b.dark,selectable:false})),
    obj(new Rect({left:0,top:h*.14,width:w*.52,height:h*.035,fill:b.accent,selectable:false})),
    obj(new FabricText(mode==='image'?'MARKENMOTIV':b.title,{left:w*.065,top:h*.045,fontFamily:'Arial',fontWeight:900,fontSize:36,fill:'#fff'})),
    obj(new FabricText(b.subject,{left:w*.065,top:h*.23,fontFamily:'Arial',fontWeight:900,fontSize:34,fill:b.dark})),
    obj(new Rect({left:w*.065,top:h*.34,width:w*.56,height:h*.31,fill:'#fff',stroke:'#d5d0c4',strokeWidth:2,rx:16,ry:16})),
    obj(new FabricText('PRODUKTBILD / MOTIV',{left:w*.345,top:h*.49,originX:'center',fontFamily:'Arial',fontWeight:800,fontSize:18,fill:'#989083'})),
    obj(new Circle({left:w*.68,top:h*.38,radius:r,fill:b.accent})),
    obj(new FabricText(b.offer,{left:w*.68+r,top:h*.38+r-8,originX:'center',originY:'center',fontFamily:'Arial',fontWeight:900,fontSize:36,fill:'#fff'})),
    obj(new FabricText(b.unit,{left:w*.68+r,top:h*.38+r+28,originX:'center',originY:'center',fontFamily:'Arial',fontWeight:800,fontSize:13,fill:'#fff'})),
    obj(new FabricText(b.name,{left:w*.065,top:h*.75,fontFamily:'Arial',fontWeight:900,fontSize:28,fill:b.dark})),
    obj(new FabricText([b.phone,b.email,b.website].filter(Boolean).join(' · '),{left:w*.065,top:h*.82,fontFamily:'Arial',fontWeight:600,fontSize:13,fill:b.dark})),
    obj(new FabricText(b.address,{left:w*.065,top:h*.865,fontFamily:'Arial',fontWeight:500,fontSize:12,fill:b.dark}))
  ];
  if(b.example)objects.push(obj(new FabricText('BEISPIEL · echte Firmendaten ersetzen diese Werte',{left:w*.065,top:h*.92,fontFamily:'Arial',fontWeight:800,fontSize:11,fill:'#a67c00'})));
  try{
    const logo=await FabricImage.fromURL(b.logo,{crossOrigin:'anonymous'});
    logo.scale(Math.min((w*.20)/logo.width,(h*.095)/logo.height,1));
    logo.set({left:w*.93,top:h*.75,originX:'right',originY:'top'});
    objects.push(obj(logo));
  }catch{}
  return{name:b.example?(mode==='flyer'?'Beispiel Angebotsflyer':'Beispiel Bilddesign'):`${b.name} · ${mode==='flyer'?'Angebotsflyer':'Bilddesign'}`,
    type:mode,data:{pixvaPrepared:true,pixvaExample:b.example,format:'post',canvas:{version:'7.0.0',objects,background:b.bg}}};
}

export default function DesignEditor(props){
  const {project,mode='flyer'}=props;
  const [prepared,setPrepared]=useState(project||null),[version,setVersion]=useState(0);
  useEffect(()=>{
    if(project){setPrepared(project);return}
    let alive=true;
    (async()=>{
      const fallback=await makeProject(null,mode);
      if(!alive)return;setPrepared(fallback);setVersion(v=>v+1);
      try{
        const brain=await api('/api/pixva?action=brain-context');
        if(!alive)return;
        const actual=await makeProject(brain,mode);
        if(!alive)return;setPrepared(actual);setVersion(v=>v+1);
      }catch{}
    })();
    return()=>{alive=false};
  },[project,mode]);
  if(!prepared)return <div className="pixva-template-loading">PIXVA bereitet die Vorlage automatisch vor …</div>;
  return <DesignEditorLegacy key={`${mode}-${version}-${project?.id||'auto'}`} {...props} project={prepared}/>;
}
