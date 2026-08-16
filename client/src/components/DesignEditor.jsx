/* PIXVA V11.8.2 DESIGN WRAPPER – ZENTRIERT + PROGRAMMIERER */
import { useEffect, useState } from 'react';
import { FabricImage, FabricText, Rect } from 'fabric';
import { api } from '../api.js';
import DesignEditorLegacy from './DesignEditorLegacy.jsx';

const PIXVA_LOGO='/pixva-logo.png';
const obj=v=>v.toObject();
const typeKey=(type,other='')=>{const raw=`${type||''} ${other||''}`.toLowerCase();if(/programm|software|webentwick|entwickler|developer|it\b/.test(raw))return'programmierer';if(/supermarkt|market|lebensmittel/.test(raw))return'supermarkt';if(/werbetechnik|werbung|druck|folierung/.test(raw))return'werbetechnik';if(/elektrik|elektro/.test(raw))return'elektriker';return'sonstiges'};

function example(kind='programmierer',other=''){
  if(kind==='programmierer')return{name:'PIXVA',headline:'WEBSEITE &\nKI-PAKET',subject:'SOFTWARE · WEBSITES · AUTOMATISIERUNG',oldPrice:'39,99 €',newPrice:'29,99 €',badge:'25% RABATT',note:'pro Monat · nur für Neukunden · 1 Jahr',phone:'+49 711 1234567',email:'info@pixva-beispiel.de',website:'www.pixva-beispiel.de',address:'Musterstraße 12 · Stuttgart',bg:'#071923',dark:'#06131d',accent:'#39d6d0',light:'#f5fbff',logo:PIXVA_LOGO};
  if(kind==='supermarkt')return{name:'BEISPIEL MARKT',headline:'FRISCHE\nANGEBOTE',subject:'OBST & GEMÜSE',oldPrice:'4,99 €',newPrice:'3,49 €',badge:'ANGEBOT',note:'Beispiel-Aktionspreis',phone:'+49 711 1234567',email:'info@beispiel-markt.de',website:'www.beispiel-markt.de',address:'Musterstraße 12 · Stuttgart',bg:'#f8f0df',dark:'#0a563c',accent:'#e72828',light:'#ffffff',logo:PIXVA_LOGO};
  if(kind==='werbetechnik')return{name:'BEISPIEL WERBETECHNIK',headline:'DIBOND\nANGEBOT',subject:'E1 BEDRUCKTE DIBOND PLATTE',oldPrice:'59,99 €',newPrice:'44,99 €',badge:'25% RABATT',note:'Beispiel-Angebot',phone:'+49 711 1234567',email:'info@beispiel-werbetechnik.de',website:'www.beispiel-werbetechnik.de',address:'Musterstraße 12 · Stuttgart',bg:'#f4f4f1',dark:'#111111',accent:'#f7c948',light:'#ffffff',logo:PIXVA_LOGO};
  if(kind==='elektriker')return{name:'BEISPIEL ELEKTRO',headline:'ELEKTRO\nCHECK',subject:'SICHERHEIT · SERVICE · TECHNIK',oldPrice:'',newPrice:'-20%',badge:'AKTION',note:'Beispiel-Rabattaktion',phone:'+49 711 1234567',email:'info@beispiel-elektro.de',website:'www.beispiel-elektro.de',address:'Musterstraße 12 · Stuttgart',bg:'#eef6fb',dark:'#082139',accent:'#ffd42a',light:'#ffffff',logo:PIXVA_LOGO};
  return{name:'BEISPIEL FIRMA',headline:'ANGEBOT',subject:(other||'UNSERE LEISTUNG').toUpperCase(),oldPrice:'',newPrice:'AKTION',badge:'BEISPIEL',note:'Branchenpassendes Beispiel',phone:'+49 711 1234567',email:'info@beispiel-firma.de',website:'www.beispiel-firma.de',address:'Musterstraße 12 · Stuttgart',bg:'#f3f5f7',dark:'#1b2735',accent:'#7258ff',light:'#ffffff',logo:PIXVA_LOGO};
}
function brandFrom(brain){
  const c=brain?.company||{},kind=typeKey(c.companyType,c.companyTypeOther),e=example(kind,c.companyTypeOther||'');
  const real=Boolean(c.companyName||c.companyPhone||c.companyEmail||c.website||c.address||c.logoDataUrl||c.logoUrl);
  const value=(realValue,fallback)=>String(realValue||'').trim()?realValue:(real?'':fallback);
  return{kind,example:!real,name:value(c.companyName,e.name),headline:e.headline,subject:e.subject,oldPrice:e.oldPrice,newPrice:e.newPrice,badge:e.badge,note:e.note,
    phone:value(c.companyPhone,e.phone),email:value(c.companyEmail,e.email),website:value(c.website,e.website),address:value(c.address,e.address),
    logo:c.logoDataUrl||c.logoUrl||(real?'':e.logo),bg:e.bg,dark:c.primaryColor||e.dark,accent:c.secondaryColor||e.accent,light:e.light};
}
function T(text,left,top,size,fill,extra={}){return obj(new FabricText(text,{left,top,originX:'center',fontFamily:'Arial',fontWeight:extra.weight||800,fontSize:size,fill,...extra}))}
function R(left,top,width,height,fill,extra={}){return obj(new Rect({left,top,width,height,fill,rx:extra.rx||0,ry:extra.ry||0,stroke:extra.stroke,strokeWidth:extra.strokeWidth||0,...extra}))}

async function makeProject(brain,mode){
  const b=brandFrom(brain),w=600,h=750,objects=[];
  objects.push(R(0,0,w,h,b.bg));
  if(b.kind==='programmierer'){
    objects.push(R(0,0,w,16,b.accent));
    objects.push(T(mode==='image'?'PIXVA KI-WERBEMOTIV':b.headline,300,122,mode==='image'?32:42,b.light,{weight:900,textAlign:'center'}));
    objects.push(T(b.subject,300,235,16,b.accent,{weight:800,charSpacing:90}));
    objects.push(R(50,285,500,285,'#ffffff',{rx:24,ry:24}));
    if(b.oldPrice)objects.push(T(`statt ${b.oldPrice} / Monat`,300,320,16,'#6b7280',{weight:600}));
    objects.push(T(b.newPrice,300,365,58,b.dark,{weight:900}));
    objects.push(T('PRO MONAT',300,440,15,'#6b7280',{weight:800,charSpacing:120}));
    objects.push(R(160,482,280,48,b.accent,{rx:24,ry:24}));objects.push(T(b.badge,300,493,20,b.dark,{weight:900}));
    objects.push(T(b.note,300,545,14,'#53616b',{weight:700}));
    objects.push(T(b.name||'PIXVA',300,620,28,b.light,{weight:900}));
    objects.push(T([b.phone,b.email].filter(Boolean).join(' · ')||'DEINE KONTAKTDATEN',300,666,12,'#b8ccd6',{weight:600}));
    objects.push(T([b.website,b.address].filter(Boolean).join(' · '),300,693,11,'#8eabb9',{weight:600}));
  }else{
    objects.push(R(0,0,w,140,b.dark));objects.push(R(0,140,w,12,b.accent));
    objects.push(T(mode==='image'?'MARKENMOTIV':b.headline,300,42,38,b.light,{weight:900,textAlign:'center'}));
    objects.push(T(b.subject,300,190,24,b.dark,{weight:900}));
    objects.push(R(65,245,470,210,'#ffffff',{rx:22,ry:22,stroke:'#d7dce0',strokeWidth:2}));
    objects.push(T('PRODUKTBILD / MOTIV',300,330,18,'#8b9198',{weight:800}));
    if(b.oldPrice)objects.push(T(`statt ${b.oldPrice}`,300,485,15,'#747b82',{weight:600}));
    objects.push(T(b.newPrice,300,510,46,b.dark,{weight:900}));
    objects.push(R(175,575,250,44,b.accent,{rx:22,ry:22}));objects.push(T(b.badge,300,585,17,b.kind==='elektriker'?'#071923':'#ffffff',{weight:900}));
    objects.push(T(b.name||'DEINE FIRMA',300,646,24,b.dark,{weight:900}));
    objects.push(T([b.phone,b.email,b.website].filter(Boolean).join(' · '),300,686,11,b.dark,{weight:600}));
    objects.push(T(b.address,300,710,10,b.dark,{weight:500}));
  }
  if(b.example)objects.push(T('BEISPIEL · gespeicherte Firmendaten ersetzen diese Werte',300,730,9,b.kind==='programmierer'?'#f7c948':'#9b7300',{weight:800}));
  if(b.logo){try{const logo=await FabricImage.fromURL(b.logo,{crossOrigin:'anonymous'});const maxW=125,maxH=70;logo.scale(Math.min(maxW/logo.width,maxH/logo.height,1));logo.set({left:300,top:34,originX:'center',originY:'top'});if(b.kind!=='programmierer')logo.set({left:510,top:625,originX:'right',originY:'top'});objects.push(obj(logo))}catch{}}
  return{name:b.example?(mode==='flyer'?'PIXVA Programmierer-Beispielflyer':'PIXVA Beispielmotiv'):`${b.name||'Firma'} · ${mode==='flyer'?'Angebotsflyer':'Bilddesign'}`,type:mode,data:{pixvaPrepared:true,pixvaExample:b.example,pixvaV1182:true,format:'post',canvas:{version:'7.0.0',objects,background:b.bg}}};
}

export default function DesignEditor(props){
  const {project,mode='flyer'}=props;
  const [prepared,setPrepared]=useState(project||null),[version,setVersion]=useState(0);
  useEffect(()=>{
    if(project){setPrepared(project);return}
    let alive=true;(async()=>{
      const fallback=await makeProject(null,mode);if(!alive)return;setPrepared(fallback);setVersion(v=>v+1);
      try{const brain=await api('/api/pixva?action=brain-context');if(!alive)return;const actual=await makeProject(brain,mode);if(!alive)return;setPrepared(actual);setVersion(v=>v+1)}catch{}
    })();return()=>{alive=false};
  },[project,mode]);
  if(!prepared)return <div className="pixva-template-loading">PIXVA bereitet die Vorlage automatisch vor …</div>;
  return <DesignEditorLegacy key={`${mode}-${version}-${project?.id||'auto-1182'}`} {...props} project={prepared}/>;
}
