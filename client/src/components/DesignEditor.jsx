import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import {
  ActiveSelection, Canvas, Circle, FabricImage, FabricText, Group, IText, Path as FabricPath, Rect, StaticCanvas, Textbox, filters
} from 'fabric';
import {
  AlignCenter, ArrowDownToLine, ArrowUpToLine, Bold, Copy, Download, Eye, EyeOff,
  ExternalLink, FileArchive, FileText, FlipHorizontal2, FlipVertical2, ImagePlus, Instagram, Layers, LoaderCircle, Maximize2, Minimize2,
  Lock, MoveDown, MoveUp, Plus, Redo2, RotateCcw, Save, Sparkles, Square, Trash2,
  Type, Undo2, Unlock, Upload, WandSparkles, ZoomIn
} from 'lucide-react';
import { api } from '../api.js';
import { canUseFeature } from '../plans.js';

const formats = {
  square: { label: '1:1 · 1080 × 1080', canvas: [650, 650], export: [1080, 1080] },
  post: { label: '4:5 · 1080 × 1350', canvas: [600, 750], export: [1080, 1350] },
  story: { label: '9:16 · 1080 × 1920', canvas: [450, 800], export: [1080, 1920] },
  landscape: { label: '16:9 · 1920 × 1080', canvas: [800, 450], export: [1920, 1080] }
};

const fontOptions = ['Arial', 'Inter', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Impact'];
const customProps = ['dataRole', 'displayName', '_brightness', '_contrast', '_saturation'];

function safeName(value, fallback = 'design') {
  return String(value || fallback).trim().replace(/[^a-z0-9äöüß_-]+/gi, '-').replace(/^-+|-+$/g, '') || fallback;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

function makeText(text, options = {}) {
  return new IText(text, {
    fontFamily: 'Arial',
    fontWeight: 700,
    fill: '#111111',
    ...options
  });
}

function addOfferTemplate(canvas, width, height) {
  canvas.clear();
  canvas.backgroundColor = '#f6f0e5';

  const header = new Rect({ left: 0, top: 0, width, height: height * .17, fill: '#0b5e3f', selectable: false, dataRole: 'template-bg', displayName: 'Grüner Kopfbereich' });
  const yellow = new Rect({ left: 0, top: height * .17, width, height: height * .035, fill: '#ffd400', selectable: false, dataRole: 'template-bg', displayName: 'Gelbe Linie' });
  const title = makeText('ANGEBOT DER WOCHE', { left: width * .06, top: height * .05, fontSize: width / 14, fill: '#ffffff', dataRole: 'headline', displayName: 'Hauptüberschrift' });
  const date = makeText('NUR SOLANGE DER VORRAT REICHT', { left: width * .06, top: height * .125, fontSize: width / 36, fill: '#d7f5e9', charSpacing: 80, dataRole: 'subtitle', displayName: 'Hinweis' });

  const productCard = new Rect({
    left: width * .06, top: height * .25, width: width * .56, height: height * .48,
    fill: '#ffffff', stroke: '#d7cec0', strokeWidth: 2, rx: 24, ry: 24,
    dataRole: 'product-slot', displayName: 'Produkt-Platzhalter'
  });
  const productHint = makeText('PRODUKTBILD\nHIER ABLEGEN', {
    left: width * .34, top: height * .49, originX: 'center', originY: 'center',
    textAlign: 'center', fontSize: width / 30, fill: '#9a9288', dataRole: 'product-slot-label', displayName: 'Produkt-Hinweis'
  });

  const productName = makeText('SALKIM DOMATES', { left: width * .06, top: height * .765, fontSize: width / 17, fill: '#15382b', dataRole: 'product-title', displayName: 'Produktname' });
  const productInfo = makeText('Rispentomaten · 5 kg', { left: width * .06, top: height * .84, fontSize: width / 31, fill: '#5e665f', dataRole: 'product-info', displayName: 'Produktinformation' });

  const circle = new Circle({ radius: width * .17, fill: '#df2525', originX: 'center', originY: 'center' });
  const oldPrice = makeText('STATT 5,99 €', { originX: 'center', originY: 'center', top: -width * .07, fontSize: width / 34, fill: '#ffd8d8', linethrough: true });
  const price = makeText('3,49 €', { originX: 'center', originY: 'center', top: width * .015, fontSize: width / 10.5, fill: '#ffffff', fontWeight: 900 });
  const unit = makeText('5 KG KISTE', { originX: 'center', originY: 'center', top: width * .1, fontSize: width / 34, fill: '#ffffff' });
  const priceGroup = new Group([circle, oldPrice, price, unit], {
    left: width * .68, top: height * .34, dataRole: 'price-badge', displayName: 'Preis-Rosette'
  });

  const cta = new Rect({ left: width * .67, top: height * .68, width: width * .27, height: height * .08, fill: '#0b5e3f', rx: 14, ry: 14, dataRole: 'cta-bg', displayName: 'CTA-Hintergrund' });
  const ctaText = makeText('JETZT\nZUGREIFEN', { left: width * .805, top: height * .72, originX: 'center', originY: 'center', textAlign: 'center', fontSize: width / 31, fill: '#ffffff', dataRole: 'cta', displayName: 'CTA-Text' });
  const logo = makeText('DEIN LOGO', { left: width * .94, top: height * .91, originX: 'right', fontSize: width / 30, fill: '#0b5e3f', dataRole: 'logo', displayName: 'Logo' });
  const address = makeText('Musterstraße 12 · 70173 Stuttgart', { left: width * .06, top: height * .92, fontSize: width / 42, fill: '#6c726e', dataRole: 'address', displayName: 'Adresse' });

  canvas.add(header, yellow, title, date, productCard, productHint, productName, productInfo, priceGroup, cta, ctaText, logo, address);
  canvas.renderAll();
}

function addCreativeTemplate(canvas, width, height) {
  canvas.clear();
  canvas.backgroundColor = '#071018';
  const glow = new Circle({ left: width * .66, top: height * .08, radius: width * .2, fill: 'rgba(99,199,255,.22)', selectable: false, dataRole: 'template-bg' });
  const yellow = new Circle({ left: -width * .05, top: height * .66, radius: width * .19, fill: 'rgba(255,212,0,.17)', selectable: false, dataRole: 'template-bg' });
  const title = new Textbox('DEINE IDEE.\nDEIN DESIGN.', {
    left: width * .08, top: height * .16, width: width * .78,
    fontFamily: 'Arial', fontWeight: 800, fontSize: width / 10,
    lineHeight: 1.04, fill: '#ffffff', dataRole: 'headline', displayName: 'Hauptüberschrift'
  });
  const description = new Textbox('Bilder, Texte, Logos und Formen frei bearbeiten.', {
    left: width * .08, top: height * .46, width: width * .82,
    fontFamily: 'Arial', fontWeight: 600, fontSize: width / 28,
    lineHeight: 1.2, fill: '#b9d6e8', dataRole: 'subtitle', displayName: 'Beschreibung'
  });
  const slot = new Rect({ left: width * .08, top: height * .58, width: width * .84, height: height * .3, fill: 'rgba(255,255,255,.06)', stroke: '#63c7ff', strokeDashArray: [10, 8], rx: 22, ry: 22, dataRole: 'product-slot', displayName: 'Bild-Platzhalter' });
  const hint = makeText('BILD HIER ABLEGEN', { left: width / 2, top: height * .73, originX: 'center', originY: 'center', fontSize: width / 27, fill: '#63c7ff', dataRole: 'product-slot-label', displayName: 'Bild-Hinweis' });
  canvas.add(glow, yellow, title, description, slot, hint);
  canvas.renderAll();
}



const referenceTemplates = {
  'tea-single': '/templates/atlas-tee-single.jpg',
  'atlas-grid': '/templates/atlas-grid.jpg',
  'fresh-grid': '/templates/fresh-grid.jpg',
  offer: '/templates/fresh-market-single.jpg'
};

async function addReferenceTemplate(canvas, type, width, height) {
  const url = referenceTemplates[type];
  if (!url) return false;
  canvas.clear();
  canvas.backgroundColor = '#ffffff';
  const image = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
  image.set({
    left: 0, top: 0, originX: 'left', originY: 'top',
    scaleX: width / Math.max(1, image.width),
    scaleY: height / Math.max(1, image.height),
    selectable: false, evented: false,
    dataRole: 'template-reference', displayName: 'Original-Vorlage'
  });
  canvas.add(image);

  const addInvisibleSlot = (x, y, w, h, index) => {
    canvas.add(new Rect({
      left: x, top: y, width: w, height: h,
      fill: 'rgba(255,255,255,0.001)', stroke: 'rgba(99,199,255,0)', strokeWidth: 1,
      dataRole: `product-slot:${index}`, displayName: `Produktbild ${index}`
    }));
  };

  if (type === 'atlas-grid' || type === 'fresh-grid') {
    const cols = 3;
    const rows = 3;
    const startX = width * .045;
    const startY = type === 'atlas-grid' ? height * .39 : height * .38;
    const gapX = width * .022;
    const gapY = height * .018;
    const cardW = (width - startX * 2 - gapX * 2) / cols;
    const cardH = height * .165;
    let index = 1;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        addInvisibleSlot(
          startX + col * (cardW + gapX) + cardW * .08,
          startY + row * (cardH + gapY) + cardH * .19,
          cardW * .84,
          cardH * .53,
          index
        );
        index += 1;
      }
    }
  } else if (type === 'tea-single') {
    addInvisibleSlot(width * .33, height * .29, width * .38, height * .41, 1);
  } else if (type === 'offer') {
    addInvisibleSlot(width * .45, height * .42, width * .43, height * .34, 1);
  }

  canvas.requestRenderAll();
  return true;
}

function addWaveBackground(canvas, width, height, palette = 'atlas') {
  if (palette === 'fresh') {
    canvas.backgroundColor = '#2b7b43';
    const dark = new Rect({ left: 0, top: 0, width, height: height * .34, fill: '#292929', dataRole: 'template-bg:dark', displayName: 'Dunkler Kopfbereich' });
    const redWave = new FabricPath(
      `M 0 ${height*.315} C ${width*.22} ${height*.25}, ${width*.58} ${height*.28}, ${width} ${height*.38} L ${width} ${height*.455} C ${width*.72} ${height*.405}, ${width*.36} ${height*.36}, 0 ${height*.425} Z`,
      { fill: '#e52b38', dataRole: 'template-bg:red-wave', displayName: 'Roter Pinselstrich' }
    );
    const greenWave = new FabricPath(
      `M 0 ${height*.40} C ${width*.28} ${height*.34}, ${width*.64} ${height*.37}, ${width} ${height*.445} L ${width} ${height} L 0 ${height} Z`,
      { fill: '#247640', dataRole: 'template-bg:green-wave', displayName: 'Grüner Pinselstrich' }
    );
    canvas.add(dark, redWave, greenWave);
  } else {
    canvas.backgroundColor = '#f2efe5';
    const redWave = new FabricPath(
      `M 0 ${height*.31} C ${width*.24} ${height*.24}, ${width*.68} ${height*.27}, ${width} ${height*.38} L ${width} ${height*.67} C ${width*.72} ${height*.6}, ${width*.32} ${height*.58}, 0 ${height*.66} Z`,
      { fill: '#e61e2b', dataRole: 'template-bg:red-wave', displayName: 'Roter Pinselstrich' }
    );
    const blueWave = new FabricPath(
      `M 0 ${height*.67} C ${width*.28} ${height*.58}, ${width*.68} ${height*.65}, ${width} ${height*.73} L ${width} ${height} L 0 ${height} Z`,
      { fill: '#3564ad', dataRole: 'template-bg:blue-wave', displayName: 'Blauer Pinselstrich' }
    );
    canvas.add(redWave, blueWave);
  }
}

function addProductCard(canvas, x, y, cardW, cardH, index, accent) {
  const slotId = `product-slot:${index}`;
  const inner = cardW * .06;
  const card = new Rect({
    left: x, top: y, width: cardW, height: cardH,
    fill: '#ffffff', rx: 14, ry: 14, stroke: '#d7d7d7', strokeWidth: 1,
    dataRole: `card:${index}`, displayName: `Produktkarte ${index}`
  });
  const title = new Textbox('PRODUKTNAME', {
    left: x + inner, top: y + cardH * .045, width: cardW - inner * 2,
    fontFamily: 'Arial', fontWeight: 700, fontSize: Math.max(12, cardW / 12),
    lineHeight: 1.04, fill: '#111111', dataRole: `product-title:${index}`,
    displayName: `Produktname ${index}`
  });
  const slot = new Rect({
    left: x + inner, top: y + cardH * .22, width: cardW - inner * 2, height: cardH * .49,
    fill: '#f8f8f8', stroke: '#bfc3c7', strokeDashArray: [6, 5], rx: 10, ry: 10,
    dataRole: slotId, displayName: `Produktbild ${index}`
  });
  const hint = makeText('BILD HIER\nABLEGEN', {
    left: x + cardW / 2, top: y + cardH * .465, originX: 'center', originY: 'center',
    textAlign: 'center', fontSize: Math.max(10, cardW / 16), fill: '#9a9a9a',
    dataRole: `product-slot-label:${index}`,
    displayName: `Bildhinweis ${index}`
  });
  const badgeW = cardW * .42;
  const badgeH = cardH * .14;
  const badgeX = x + cardW - inner - badgeW;
  const badgeY = y + cardH - inner - badgeH;
  const badge = new Rect({
    left: badgeX, top: badgeY, width: badgeW, height: badgeH,
    fill: accent, rx: 6, ry: 6, dataRole: `price-bg:${index}`,
    displayName: `Preisfläche ${index}`
  });
  const price = makeText('4,99 €', {
    left: badgeX + badgeW / 2, top: badgeY + badgeH / 2,
    originX: 'center', originY: 'center', fontSize: Math.max(13, cardW / 10),
    fontWeight: 900, fill: '#ffffff', dataRole: `price:${index}`,
    displayName: `Preis ${index}`
  });
  canvas.add(card, title, slot, hint, badge, price);
}

function addAtlasGridTemplate(canvas, width, height) {
  canvas.clear();
  addWaveBackground(canvas, width, height, 'atlas');
  const heroSlot = new Rect({ left: width * .39, top: height * .025, width: width * .56, height: height * .25, fill: '#efe9dc', stroke: '#c6bfb1', strokeDashArray: [8,6], dataRole: 'hero-slot:1', displayName: 'Kopfbild' });
  const heroHint = makeText('KOPFBILD', { left: width * .67, top: height * .15, originX: 'center', originY: 'center', fontSize: width / 26, fill: '#8f887c', dataRole: 'hero-slot-label:1', displayName: 'Kopfbild-Hinweis' });
  const logoPanel = new Rect({ left: width * .045, top: height * .025, width: width * .28, height: height * .17, fill: '#ffffff', stroke: '#d7d0c5', dataRole: 'logo-panel', displayName: 'Logo-Fläche' });
  const logoSlot = new Rect({ left: width * .075, top: height * .05, width: width * .22, height: height * .105, fill: '#f7f4ed', stroke: '#3564ad', strokeDashArray: [6,5], dataRole: 'logo-slot:1', displayName: 'Logo-Platzhalter' });
  const logoHint = makeText('LOGO', { left: width * .185, top: height * .102, originX: 'center', originY: 'center', fontSize: width / 28, fill: '#3564ad', dataRole: 'logo-slot-label:1', displayName: 'Logo-Hinweis' });
  const heroText = makeText('FRISCHE ANGEBOTE', { left: width * .055, top: height * .21, fontSize: width / 17, fill: '#234a35', displayName: 'Kopfzeile' });
  const address = makeText('Musterstraße 12 · 70173 Stuttgart', { left: width * .055, top: height * .275, fontSize: width / 34, fill: '#234a35', displayName: 'Adresse' });
  canvas.add(heroSlot, heroHint, logoPanel, logoSlot, logoHint, heroText, address);

  const cols = 3, rows = 3;
  const gapX = width * .022, gapY = height * .015;
  const startY = height * .39;
  const usableH = height - startY - height * .06;
  const cardW = (width - gapX * 4) / cols;
  const cardH = (usableH - gapY * (rows - 1)) / rows;
  let index = 1;
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) {
    addProductCard(canvas, gapX + col * (cardW + gapX), startY + row * (cardH + gapY), cardW, cardH, index++, '#ff5a24');
  }
  canvas.add(makeText('Copyright · Dein Markt', { left: width * .67, top: height * .965, fontSize: width / 45, fill: '#ffffff', displayName: 'Copyright' }));
  canvas.renderAll();
}

function addFreshGridTemplate(canvas, width, height) {
  canvas.clear();
  addWaveBackground(canvas, width, height, 'fresh');

  const heroSlot = new Rect({ left: width * .34, top: height * .015, width: width * .63, height: height * .29, fill: '#333333', stroke: '#7a7a7a', strokeDashArray: [8,6], dataRole: 'hero-slot:1', displayName: 'Fleisch-Kopfbild' });
  const heroHint = makeText('KOPFBILD HIER ABLEGEN', { left: width * .655, top: height * .16, originX: 'center', originY: 'center', fontSize: width / 30, fill: '#d5d5d5', dataRole: 'hero-slot-label:1', displayName: 'Kopfbild-Hinweis' });
  const logoPanel = new Rect({ left: width * .04, top: height * .015, width: width * .29, height: height * .18, fill: '#ffffff', stroke: '#e3e3e3', dataRole: 'logo-panel', displayName: 'Weiße Logo-Fläche' });
  const logoSlot = new Rect({ left: width * .075, top: height * .04, width: width * .22, height: height * .115, fill: '#f6f6f6', stroke: '#4c913f', strokeDashArray: [6,5], dataRole: 'logo-slot:1', displayName: 'Logo-Platzhalter' });
  const logoHint = makeText('DEIN LOGO', { left: width * .185, top: height * .098, originX: 'center', originY: 'center', fontSize: width / 28, fill: '#4c913f', dataRole: 'logo-slot-label:1', displayName: 'Logo-Hinweis' });
  const address = new Textbox('langwiesenweg\n30/34', { left: width * .055, top: height * .205, width: width * .26, fontFamily: 'Arial', fontStyle: 'italic', fontWeight: 800, fontSize: width / 24, lineHeight: 1.05, textAlign: 'center', fill: '#4c913f', dataRole: 'address', displayName: 'Adresse' });
  const music = makeText('music time', { left: width * .08, top: height * .31, fontStyle: 'italic', fontSize: width / 22, fill: '#4c913f', dataRole: 'headline', displayName: 'Aktionszeile' });
  canvas.add(heroSlot, heroHint, logoPanel, logoSlot, logoHint, address, music);

  const cols = 3, rows = 3;
  const gapX = width * .018, gapY = height * .012;
  const startY = height * .405;
  const usableH = height - startY - height * .055;
  const cardW = (width - gapX * 4) / cols;
  const cardH = (usableH - gapY * (rows - 1)) / rows;
  let index = 1;
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) {
    addProductCard(canvas, gapX + col * (cardW + gapX), startY + row * (cardH + gapY), cardW, cardH, index++, '#ff5a24');
  }
  const cart = makeText('🛒', { left: width * .045, top: height * .955, fontSize: width / 25, fill: '#ffffff', displayName: 'Warenkorb-Symbol' });
  const copyright = makeText('Copyright · Dein Markt', { left: width * .67, top: height * .965, fontSize: width / 45, fill: '#ffffff', displayName: 'Copyright' });
  canvas.add(cart, copyright);
  canvas.renderAll();
}

function addSingleTeaTemplate(canvas, width, height) {
  canvas.clear();
  canvas.backgroundColor = '#f4f1e6';
  const script = makeText('Angebot der Woche', { left: width * .11, top: height * .05, fontFamily: 'Georgia', fontStyle: 'italic', fontSize: width / 10, fill: '#e41f32', displayName: 'Angebotstitel' });
  const product = makeText('MEVLANA SCHWARZER TEE', { left: width * .1, top: height * .21, fontSize: width / 18, fill: '#111111', displayName: 'Produktname' });
  const slot = new Rect({ left: width * .18, top: height * .34, width: width * .64, height: height * .34, fill: '#ffffff', stroke: '#c9c4b8', strokeDashArray: [9, 7], rx: 20, ry: 20, dataRole: 'product-slot:1', displayName: 'Produktbild' });
  const hint = makeText('PRODUKTBILD HIER ABLEGEN', { left: width / 2, top: height * .51, originX: 'center', originY: 'center', fontSize: width / 28, fill: '#8d887f', dataRole: 'product-slot-label:1', displayName: 'Bildhinweis' });
  const yellow = new Rect({ left: 0, top: height * .72, width, height: height * .28, fill: '#f2bc17', selectable: false, dataRole: 'template-bg' });
  const price = makeText('9,99 €', { left: width * .72, top: height * .78, fontSize: width / 9, fontWeight: 900, fill: '#2d12d9', displayName: 'Preis' });
  const logo = makeText('DEIN LOGO', { left: width * .07, top: height * .86, fontSize: width / 16, fill: '#24528c', displayName: 'Logo' });
  canvas.add(script, product, slot, hint, yellow, price, logo);
  canvas.renderAll();
}

function getObjectName(object, index) {
  if (object.displayName) return object.displayName;
  if (object instanceof FabricText) return String(object.text || 'Text').slice(0, 24);
  if (object instanceof FabricImage) return object.dataRole === 'product-image' ? 'Produktbild' : 'Bild';
  if (object.type === 'group') return 'Gruppe';
  if (object.type === 'rect') return 'Rechteck';
  if (object.type === 'circle') return 'Kreis';
  return `Ebene ${index + 1}`;
}

function keepObjectInsideCanvas(canvas, object, padding = 4) {
  if (!canvas || !object || object.visible === false) return;
  const role = String(object.dataRole || '');
  if (object.selectable === false || role.startsWith('template-') || role.startsWith('card:') || role.startsWith('price-bg:')) return;
  object.setCoords();
  let bounds = object.getBoundingRect();
  const maxWidth = Math.max(10, canvas.width - padding * 2);
  const maxHeight = Math.max(10, canvas.height - padding * 2);
  if (bounds.width > maxWidth || bounds.height > maxHeight) {
    const scale = Math.min(maxWidth / Math.max(1, bounds.width), maxHeight / Math.max(1, bounds.height));
    object.scaleX = Number(object.scaleX || 1) * scale;
    object.scaleY = Number(object.scaleY || 1) * scale;
    object.setCoords();
    bounds = object.getBoundingRect();
  }
  let dx = 0;
  let dy = 0;
  if (bounds.left < padding) dx = padding - bounds.left;
  if (bounds.top < padding) dy = padding - bounds.top;
  if (bounds.left + bounds.width > canvas.width - padding) dx = (canvas.width - padding) - (bounds.left + bounds.width);
  if (bounds.top + bounds.height > canvas.height - padding) dy = (canvas.height - padding) - (bounds.top + bounds.height);
  if (dx || dy) {
    object.set({ left: Number(object.left || 0) + dx, top: Number(object.top || 0) + dy });
    object.setCoords();
  }
}

function normalizeCanvasObjects(canvas) {
  if (!canvas) return;
  canvas.getObjects().forEach((object) => keepObjectInsideCanvas(canvas, object));
  canvas.requestRenderAll();
}

function sourceElementToBlob(imageObject) {
  return new Promise((resolve, reject) => {
    try {
      const source = imageObject.getElement();
      const width = source.naturalWidth || source.videoWidth || source.width;
      const height = source.naturalHeight || source.videoHeight || source.height;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(source, 0, 0, width, height);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Bild konnte nicht vorbereitet werden.')), 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}


function pixvaTheme(brand={}){
  const type=brand.company_type||'sonstiges';
  if(type==='supermarkt')return{bg:'#f8f0df',dark:'#0a563c',accent:'#e72828',headline:'FRISCHE ANGEBOTE',title:'OBST & GEMÜSE',offer:'3,49 €',unit:'AKTIONSPREIS',prompt:'Professionelles Supermarkt-Werbemotiv mit frischem Obst oder Gemüse, appetitliche Produktfotografie, Angebotsästhetik'};
  if(type==='werbetechnik')return{bg:'#f4f4f1',dark:'#111111',accent:'#f7c948',headline:'ANGEBOT',title:'BEDRUCKTE DIBOND PLATTE',offer:'44,99 €',unit:'STATT 59,99 €',prompt:'Professionelles Werbetechnik-Motiv mit hochwertiger bedruckter Dibond-Platte, moderne Werkstatt oder Montage, realistische Produktfotografie'};
  if(type==='elektriker')return{bg:'#eef6fb',dark:'#082139',accent:'#ffd42a',headline:'ELEKTRO AKTION',title:'ELEKTRO-CHECK',offer:'-20%',unit:'JETZT RABATT SICHERN',prompt:'Professionelles Elektriker-Werbemotiv, moderne Elektroinstallation, Sicherungskasten und saubere technische Arbeit, vertrauenswürdig und hochwertig'};
  return{bg:'#f3f5f7',dark:brand.primary_color||'#1b2735',accent:brand.secondary_color||'#39d6d0',headline:'ANGEBOT',title:(brand.company_type_other||'UNSERE LEISTUNG').toUpperCase(),offer:'AKTION',unit:'JETZT ANFRAGEN',prompt:`Professionelles Werbemotiv für ${brand.company_type_other||'ein Unternehmen'}, hochwertig, modern, realistische Fotografie`};
}

async function pixvaCompanyTemplate(canvas,width,height,mode,brand={}){
  const t=pixvaTheme(brand);
  canvas.clear();
  canvas.backgroundColor=t.bg;

  const header=new Rect({left:0,top:0,width,height:height*.14,fill:t.dark});
  const accent=new Rect({left:0,top:height*.14,width:width*.48,height:height*.035,fill:t.accent});
  const headline=new FabricText(t.headline,{left:width*.07,top:height*.045,fontFamily:'Arial',fontWeight:900,fontSize:Math.max(24,width/18),fill:'#ffffff'});
  const title=new FabricText(mode==='image'?'MARKENMOTIV':t.title,{left:width*.07,top:height*.23,fontFamily:'Arial',fontWeight:900,fontSize:Math.max(30,width/14),fill:t.dark});
  const imageArea=new Rect({left:width*.07,top:height*.34,width:width*.56,height:height*.34,fill:'#ffffff',stroke:'#d5d5d5',strokeWidth:2,rx:16,ry:16});
  const imageText=new FabricText('PRODUKTBILD / MOTIV',{left:width*.35,top:height*.50,originX:'center',fontFamily:'Arial',fontWeight:800,fontSize:Math.max(15,width/32),fill:'#9b9b9b'});
  const priceCircle=new Circle({left:width*.68,top:height*.36,radius:Math.max(58,width*.115),fill:t.accent});
  const price=new FabricText(t.offer,{left:width*.68+Math.max(58,width*.115),top:height*.36+Math.max(58,width*.115)-10,originX:'center',originY:'center',fontFamily:'Arial',fontWeight:900,fontSize:Math.max(28,width/17),fill:t.dark==='#111111'?'#111111':'#ffffff'});
  const unit=new FabricText(t.unit,{left:width*.68+Math.max(58,width*.115),top:height*.36+Math.max(58,width*.115)+28,originX:'center',originY:'center',fontFamily:'Arial',fontWeight:800,fontSize:Math.max(10,width/45),fill:t.dark==='#111111'?'#111111':'#ffffff'});
  const company=new FabricText(brand.company_name||'DEINE FIRMA',{left:width*.07,top:height*.75,fontFamily:'Arial',fontWeight:900,fontSize:Math.max(22,width/22),fill:t.dark});
  const contact=[brand.company_phone,brand.company_email,brand.website,brand.instagram].filter(Boolean).join('  ·  ');
  const contactText=new FabricText(contact||'FIRMENKONTAKT',{left:width*.07,top:height*.82,fontFamily:'Arial',fontWeight:600,fontSize:Math.max(11,width/46),fill:t.dark});
  const address=new FabricText(brand.address||'',{left:width*.07,top:height*.865,fontFamily:'Arial',fontWeight:500,fontSize:Math.max(10,width/50),fill:t.dark});

  canvas.add(header,accent,headline,title,imageArea,imageText,priceCircle,price,unit,company,contactText,address);

  const logoUrl=brand.logo_data_url||'';
  if(logoUrl){
    try{
      const logo=await FabricImage.fromURL(logoUrl,{crossOrigin:'anonymous'});
      const maxW=width*.22,maxH=height*.10;
      logo.scale(Math.min(maxW/logo.width,maxH/logo.height,1));
      logo.set({left:width*.92,top:height*.77,originX:'right',originY:'top'});
      logo.set('pixvaCompanyLogo',true);
      canvas.add(logo);
    }catch{}
  }
  canvas.renderAll();
  return t;
}


function pixvaBrainBrand(brain){
  const c=brain?.company||{};
  return{
    company_name:c.companyName||'',
    company_type:c.companyType||'sonstiges',
    company_type_other:c.companyTypeOther||'',
    owner_name:c.ownerName||'',
    company_email:c.companyEmail||'',
    company_phone:c.companyPhone||'',
    private_phone:c.privatePhone||c.personalPhone||'',
    website:c.website||'',
    instagram:c.instagram||'',
    address:c.address||'',
    logo_data_url:c.logoDataUrl||c.logoUrl||'',
    logo_path:c.logoPath||'',
    primary_color:c.primaryColor||'#7258ff',
    secondary_color:c.secondaryColor||'#39d6d0'
  };
}

export default function DesignEditor({ mode = 'flyer', project, onSaved, canSave = true, subscription, userRole = 'user', onOpenPlans, uiText = {}, costPromptMode = 'all', customPlans = [] }) {
  const [companyBrand, setCompanyBrand] = useState(null);
  const [pixvaBrain, setPixvaBrain] = useState(null);

  const elementRef = useRef(null);
  const fabricRef = useRef(null);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const restoringRef = useRef(false);
  const productInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const heroInputRef = useRef(null);
  const clipboardRef = useRef(null);
  const lastCanvasSizeRef = useRef(null);
  const baseTemplateRef = useRef(null);
  const currentTemplateRef = useRef(mode === 'flyer' ? 'offer' : 'creative');

  const [formatKey, setFormatKey] = useState(project?.data?.format || 'post');
  const [projectId, setProjectId] = useState(project?.id || '');
  const [projectName, setProjectName] = useState(project?.name || (mode === 'image' ? 'Neues Bilddesign' : 'Neuer Angebotsflyer'));
  const [background, setBackground] = useState('#f6f0e5');
  const [status, setStatus] = useState('');
  const [aiPrompt, setAiPrompt] = useState(mode === 'image' ? 'Fotorealistisches Social-Media-Motiv mit hochwertiger Beleuchtung' : 'Fotorealistisches Produktfoto für ein Wochenangebot');
  const [localMotifUrl, setLocalMotifUrl] = useState('');
  const [imageStyle, setImageStyle] = useState('product');
  const [generating, setGenerating] = useState(false);
  const [removingBackground, setRemovingBackground] = useState(false);
  const [selected, setSelected] = useState(null);
  const [layers, setLayers] = useState([]);
  const [zoom, setZoom] = useState(82);
  const [dragActive, setDragActive] = useState(false);
  const [adjustments, setAdjustments] = useState({ brightness: 0, contrast: 0, saturation: 0 });
  const [templateVariant, setTemplateVariant] = useState('editable');
  const [externalExportMode, setExternalExportMode] = useState('edited');
  const [rasterText, setRasterText] = useState({
    text:'Neuer Text',
    fontFamily:'Arial',
    fontSize:52,
    textColor:'#111111',
    coverColor:'#ffffff',
    coverOldText:true
  });

  const format = useMemo(() => formats[formatKey], [formatKey]);
  const isText = selected instanceof IText || selected instanceof FabricText || ['i-text', 'textbox', 'text'].includes(selected?.type);
  const isImage = selected instanceof FabricImage;

  function refreshLayers() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    setLayers([...canvas.getObjects()].reverse().map((object, index) => ({ object, name: getObjectName(object, index) })));
  }

  function syncSelected(object) {
    setSelected(object || null);
    if (object instanceof FabricImage) {
      setAdjustments({
        brightness: Number(object._brightness || 0),
        contrast: Number(object._contrast || 0),
        saturation: Number(object._saturation || 0)
      });
    }
  }

  function snapshot() {
    const canvas = fabricRef.current;
    if (!canvas || restoringRef.current) return;
    const json = JSON.stringify(canvas.toJSON(customProps));
    const current = historyRef.current[historyIndexRef.current];
    if (current === json) return;
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(json);
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
    refreshLayers();
  }

  async function restoreHistory(index) {
    const canvas = fabricRef.current;
    const json = historyRef.current[index];
    if (!canvas || !json) return;
    restoringRef.current = true;
    await canvas.loadFromJSON(JSON.parse(json));
    canvas.requestRenderAll();
    historyIndexRef.current = index;
    restoringRef.current = false;
    canvas.discardActiveObject();
    syncSelected(null);
    refreshLayers();
  }


  useEffect(() => {
    const onKeyDown = async (event) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      const editingText = active && active.isEditing;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (modifier && key === 'c' && active && !editingText) {
        event.preventDefault();
        clipboardRef.current = await active.clone(customProps);
      } else if (modifier && key === 'v' && clipboardRef.current && !editingText) {
        event.preventDefault();
        const clone = await clipboardRef.current.clone(customProps);
        clone.set({ left: Number(clone.left || 0) + 22, top: Number(clone.top || 0) + 22, evented: true });
        canvas.add(clone); canvas.setActiveObject(clone); canvas.requestRenderAll(); clipboardRef.current = clone; snapshot();
      } else if (modifier && key === 'x' && active && !editingText) {
        event.preventDefault();
        clipboardRef.current = await active.clone(customProps); removeSelected();
      } else if (modifier && key === 'd' && active && !editingText) {
        event.preventDefault(); await duplicateSelected();
      } else if (modifier && key === 'a' && !editingText) {
        event.preventDefault();
        const objects = canvas.getObjects().filter((item) => item.selectable !== false);
        if (objects.length) { const selection = new ActiveSelection(objects, { canvas }); canvas.setActiveObject(selection); canvas.requestRenderAll(); }
      } else if (modifier && key === 'z') {
        event.preventDefault();
        await restoreHistory(historyIndexRef.current + (event.shiftKey ? 1 : -1));
      } else if (modifier && key === 'y') {
        event.preventDefault(); await restoreHistory(historyIndexRef.current + 1);
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && active && !editingText) {
        event.preventDefault(); removeSelected();
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && active && !editingText) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        if (event.key === 'ArrowLeft') active.set('left', Number(active.left || 0) - step);
        if (event.key === 'ArrowRight') active.set('left', Number(active.left || 0) + step);
        if (event.key === 'ArrowUp') active.set('top', Number(active.top || 0) - step);
        if (event.key === 'ArrowDown') active.set('top', Number(active.top || 0) + step);
        active.setCoords(); canvas.requestRenderAll(); snapshot();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  useEffect(() => {
    const canvas = new Canvas(elementRef.current, {
      width: format.canvas[0],
      height: format.canvas[1],
      backgroundColor: background,
      preserveObjectStacking: true,
      selectionColor: 'rgba(99,199,255,.16)'
    });
    fabricRef.current = canvas;
    lastCanvasSizeRef.current = [format.canvas[0], format.canvas[1]];

    const onSelection = () => syncSelected(canvas.getActiveObject());
    const onChanged = () => { syncSelected(canvas.getActiveObject()); snapshot(); };
    canvas.on('selection:created', onSelection);
    canvas.on('selection:updated', onSelection);
    canvas.on('selection:cleared', () => syncSelected(null));
    canvas.on('object:modified', onChanged);
    canvas.on('text:changed', onChanged);
    canvas.on('mouse:up', (event) => {
      const target = event.target;
      if (!target || typeof target.enterEditing !== 'function' || target.isEditing) return;
      canvas.setActiveObject(target);
      target.enterEditing();
      target.setCursorByClick?.(event.e);
      syncSelected(target);
      canvas.requestRenderAll();
    });
    canvas.on('mouse:dblclick', (event) => {
      const target = event.target;
      if (target && typeof target.enterEditing === 'function') {
        canvas.setActiveObject(target);
        target.enterEditing();
        target.selectAll?.();
        syncSelected(target);
        canvas.requestRenderAll();
      }
    });

    async function initialize() {
      let brand=null;
      try{
        const overview=await api('/api/pixva?action=overview');
        brand=overview?.brand||null;
        setCompanyBrand(brand);
        if(brand){
          const theme=pixvaTheme(brand);
          setAiPrompt(theme.prompt);
        }
      }catch{}

      if (project?.data?.canvas) {
        try {
          await canvas.loadFromJSON(project.data.canvas);
          canvas.renderAll();
          setBackground(canvas.backgroundColor || '#f4f0e8');
        } catch {
          if(brand)await pixvaCompanyTemplate(canvas,format.canvas[0],format.canvas[1],mode,brand);
          else addStarterTemplate(canvas,format.canvas[0],format.canvas[1],mode);
        }
      } else {
        if(brand)await pixvaCompanyTemplate(canvas,format.canvas[0],format.canvas[1],mode,brand);
        else addStarterTemplate(canvas,format.canvas[0],format.canvas[1],mode);
      }
    }
    initialize();

    return () => canvas.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, mode]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const [nextWidth, nextHeight] = format.canvas;
    const previous = lastCanvasSizeRef.current || [canvas.width, canvas.height];
    const [previousWidth, previousHeight] = previous;

    if (previousWidth && previousHeight && (previousWidth !== nextWidth || previousHeight !== nextHeight)) {
      const scaleX = nextWidth / previousWidth;
      const scaleY = nextHeight / previousHeight;
      const uniformScale = Math.min(scaleX, scaleY);
      canvas.getObjects().forEach((object) => {
        object.set({
          left: Number(object.left || 0) * scaleX,
          top: Number(object.top || 0) * scaleY,
          scaleX: Number(object.scaleX || 1) * uniformScale,
          scaleY: Number(object.scaleY || 1) * uniformScale
        });
        object.setCoords();
      });
    }

    canvas.setDimensions({ width: nextWidth, height: nextHeight });
    lastCanvasSizeRef.current = [nextWidth, nextHeight];
    canvas.requestRenderAll();
    snapshot();
  }, [format]);


  /* PIXVA BRAIN GUARANTEED TEMPLATE V11.6 */
  useEffect(()=>{
    if(project?.id)return;
    let cancelled=false;
    const timer=window.setTimeout(async()=>{
      try{
        const brain=await api('/api/pixva?action=brain-context');
        if(cancelled)return;
        setPixvaBrain(brain);
        const brand=pixvaBrainBrand(brain);
        setCompanyBrand(brand);
        const canvas=fabricRef.current;
        if(!canvas||!brain?.isCompany)return;
        if(typeof pixvaCompanyTemplate==='function'){
          await pixvaCompanyTemplate(canvas,canvas.width,canvas.height,mode,brand);
          setBackground(canvas.backgroundColor||brand.primary_color||'#f4f0e8');
          setStatus(`PIXVA Brain: ${brain.company?.companyName||'Firma'} · ${brain.company?.industryLabel||''} · Firmenlogo & Kontaktdaten aktiv`);
        }
      }catch(error){
        if(!cancelled)setStatus(`PIXVA Brain konnte Firmenprofil nicht laden: ${error.message}`);
      }
    },180);
    return()=>{cancelled=true;window.clearTimeout(timer)};
  },[project?.id,mode]);

  function addText() {
    const canvas = fabricRef.current;
    const text = makeText('Neuer Text', { left: 70, top: 110, fontSize: 44, fill: '#111111', displayName: 'Neuer Text' });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    snapshot();
  }

  function markRasterTextArea() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const oldMask = canvas.getObjects().find((object) => object.dataRole === 'text-replace-mask');
    if (oldMask) canvas.remove(oldMask);
    const mask = new Rect({
      left: canvas.width * .2,
      top: canvas.height * .38,
      width: canvas.width * .6,
      height: Math.max(80, canvas.height * .12),
      fill:'rgba(255,212,0,.16)',
      stroke:'#ffd400',
      strokeWidth:3,
      strokeDashArray:[12,8],
      cornerColor:'#63c7ff',
      transparentCorners:false,
      dataRole:'text-replace-mask',
      displayName:'Schriftbereich'
    });
    canvas.add(mask);
    canvas.setActiveObject(mask);
    canvas.requestRenderAll();
    syncSelected(mask);
    refreshLayers();
    setStatus('Gelben Rahmen genau über die alte Schrift ziehen und skalieren. Danach unten „Schrift ersetzen“ drücken.');
  }
  function applyRasterTextReplacement() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const mask = canvas.getObjects().find((object) => object.dataRole === 'text-replace-mask');
    if (!mask) {
      setStatus('Bitte zuerst „Schriftbereich markieren“ drücken und den gelben Rahmen über den alten Text legen.');
      return;
    }
    const value = String(rasterText.text || '').trim();
    if (!value) {
      setStatus('Bitte den neuen Text eintragen.');
      return;
    }
    mask.setCoords();
    const bounds = mask.getBoundingRect();
    if (rasterText.coverOldText) {
      const cover = new Rect({
        left:bounds.left,
        top:bounds.top,
        width:Math.max(20,bounds.width),
        height:Math.max(20,bounds.height),
        fill:rasterText.coverColor,
        strokeWidth:0,
        dataRole:'text-replace-cover',
        displayName:'Abdeckung alte Schrift'
      });
      canvas.add(cover);
    }
    const text = makeText(value, {
      left:bounds.left + bounds.width / 2,
      top:bounds.top + bounds.height / 2,
      originX:'center',
      originY:'center',
      fontFamily:rasterText.fontFamily,
      fontSize:Number(rasterText.fontSize || 52),
      fill:rasterText.textColor,
      fontWeight:700,
      textAlign:'center',
      displayName:'Bearbeitbare Bildschrift',
      dataRole:'editable-replaced-text'
    });
    canvas.remove(mask);
    canvas.add(text);
    canvas.setActiveObject(text);
    text.enterEditing?.();
    text.selectAll?.();
    canvas.requestRenderAll();
    syncSelected(text);
    snapshot();
    refreshLayers();
    setStatus('Die Bildschrift ist jetzt eine echte Textebene. Doppelklicken, Text ändern oder oben eine andere Schrift wählen.');
  }
  function cancelRasterTextReplacement() {
    const canvas = fabricRef.current;
    const mask = canvas?.getObjects().find((object) => object.dataRole === 'text-replace-mask');
    if (mask) canvas.remove(mask);
    canvas?.discardActiveObject();
    canvas?.requestRenderAll();
    syncSelected(null);
    refreshLayers();
  }
  function addShape() {
    const canvas = fabricRef.current;
    const shape = new Rect({ left: 100, top: 160, width: 220, height: 120, fill: '#ffd400', rx: 18, ry: 18, displayName: 'Form' });
    canvas.add(shape);
    canvas.setActiveObject(shape);
    canvas.renderAll();
    snapshot();
  }

  function addPrice() {
    const canvas = fabricRef.current;
    const circle = new Circle({ radius: 78, fill: '#df2525', originX: 'center', originY: 'center' });
    const price = makeText('9,99 €', { originX: 'center', originY: 'center', fontWeight: 900, fontSize: 34, fill: '#ffffff' });
    const group = new Group([circle, price], { left: 300, top: 240, displayName: 'Preis-Rosette', dataRole: 'price-badge' });
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.renderAll();
    snapshot();
  }

  async function createFabricImage(url) {
    return FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
  }

  async function addImageUrl(url, options = {}) {
    const canvas = fabricRef.current;
    const image = await createFabricImage(url);
    const maxW = options.maxW || canvas.width * .72;
    const maxH = options.maxH || canvas.height * .48;
    const nextScale = options.fillCanvas
      ? Math.max(canvas.width / Math.max(1,image.width), canvas.height / Math.max(1,image.height))
      : Math.min(maxW / Math.max(1,image.width), maxH / Math.max(1,image.height), 1);
    image.scale(nextScale);
    image.set({
      left: options.left ?? canvas.width / 2,
      top: options.top ?? canvas.height / 2,
      originX: 'center', originY: 'center',
      dataRole: options.dataRole || 'image',
      displayName: options.displayName || 'Bild'
    });
    canvas.add(image);
    canvas.setActiveObject(image);
    canvas.renderAll();
    snapshot();
    return image;
  }

  async function replaceSlotImage(fileOrUrl, kind = 'product') {
    const canvas = fabricRef.current;
    const active = canvas.getActiveObject();
    const activeRole = String(active?.dataRole || '');
    const slotPrefix = `${kind}-slot:`;
    const imagePrefix = `${kind}-image:`;
    const labelPrefix = `${kind}-slot-label:`;
    const activeId = activeRole.includes(':') ? activeRole.split(':')[1] : '1';
    const slot = activeRole.startsWith(slotPrefix)
      ? active
      : canvas.getObjects().find((object) => String(object.dataRole || '') === `${slotPrefix}${activeId}`)
        || canvas.getObjects().find((object) => String(object.dataRole || '').startsWith(slotPrefix));
    const slotId = String(slot?.dataRole || '').split(':')[1] || activeId || '1';
    const label = canvas.getObjects().find((object) => String(object.dataRole || '') === `${labelPrefix}${slotId}`);
    const existing = activeRole.startsWith(imagePrefix)
      ? active
      : canvas.getObjects().find((object) => String(object.dataRole || '') === `${imagePrefix}${slotId}`);
    const url = typeof fileOrUrl === 'string' ? fileOrUrl : await fileToDataUrl(fileOrUrl);
    const image = await createFabricImage(url);
    const targetWidth = slot ? slot.getScaledWidth() * (kind === 'hero' ? 1 : .92) : existing ? existing.getScaledWidth() : canvas.width * .45;
    const targetHeight = slot ? slot.getScaledHeight() * (kind === 'hero' ? 1 : .92) : existing ? existing.getScaledHeight() : canvas.height * .35;
    if (kind === 'hero') {
      image.set({ scaleX: targetWidth / Math.max(1, image.width), scaleY: targetHeight / Math.max(1, image.height) });
    } else {
      image.scale(Math.min(targetWidth / Math.max(1, image.width), targetHeight / Math.max(1, image.height)));
    }
    image.set({
      left: slot ? Number(slot.left || 0) + slot.getScaledWidth() / 2 : existing?.left ?? canvas.width / 2,
      top: slot ? Number(slot.top || 0) + slot.getScaledHeight() / 2 : existing?.top ?? canvas.height / 2,
      originX: 'center', originY: 'center',
      dataRole: `${imagePrefix}${slotId}`,
      displayName: kind === 'logo' ? 'Logo' : kind === 'hero' ? 'Kopfbild' : `Produktbild ${slotId}`
    });
    const targetIndex = slot ? canvas.getObjects().indexOf(slot) : existing ? canvas.getObjects().indexOf(existing) : canvas.getObjects().length;
    if (slot) canvas.remove(slot);
    if (label) canvas.remove(label);
    if (existing) canvas.remove(existing);
    if (typeof canvas.insertAt === 'function') canvas.insertAt(Math.max(0, targetIndex), image);
    else canvas.add(image);
    canvas.setActiveObject(image);
    canvas.requestRenderAll();
    snapshot();
    setStatus(`${image.displayName} ersetzt. Das Bild kann jetzt frei verschoben, skaliert, gedreht und kopiert werden.`);
  }

  const replaceProductImage = (fileOrUrl) => replaceSlotImage(fileOrUrl, 'product');
  const replaceLogoImage = (fileOrUrl) => replaceSlotImage(fileOrUrl, 'logo');
  const replaceHeroImage = (fileOrUrl) => replaceSlotImage(fileOrUrl, 'hero');

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const role = String(fabricRef.current?.getActiveObject()?.dataRole || '');
      if (role.startsWith('product-slot:') || role.startsWith('product-image:')) await replaceProductImage(file);
      else if (role.startsWith('logo-slot:') || role.startsWith('logo-image:')) await replaceLogoImage(file);
      else if (role.startsWith('hero-slot:') || role.startsWith('hero-image:')) await replaceHeroImage(file);
      else await addImageUrl(await fileToDataUrl(file), { displayName: file.name });
    } catch (error) {
      setStatus(error.message);
    }
    event.target.value = '';
  }

  async function uploadProduct(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await replaceProductImage(file); } catch (error) { setStatus(error.message); }
    event.target.value = '';
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await replaceLogoImage(file); } catch (error) { setStatus(error.message); }
    event.target.value = '';
  }

  async function uploadHero(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await replaceHeroImage(file); } catch (error) { setStatus(error.message); }
    event.target.value = '';
  }

  async function removeImageBackground() {
    const canvas = fabricRef.current;
    const object = canvas.getActiveObject();
    if (!(object instanceof FabricImage)) {
      setStatus('Wähle zuerst ein Bild aus.');
      return;
    }
    setRemovingBackground(true);
    setStatus('Hintergrund wird lokal im Browser entfernt. Beim ersten Mal wird das KI-Modell geladen …');
    try {
      const sourceBlob = await sourceElementToBlob(object);
      const module = await import('@imgly/background-removal');
      const removeBackground = module.default;
      const resultBlob = await removeBackground(sourceBlob, {
        progress: (key, current, total) => {
          if (total) setStatus(`Hintergrund entfernen: ${Math.round((current / total) * 100)} % · ${key}`);
        }
      });
      const url = URL.createObjectURL(resultBlob);
      const replacement = await createFabricImage(url);
      replacement.scaleX = object.scaleX;
      replacement.scaleY = object.scaleY;
      replacement.set({
        left: object.left, top: object.top, originX: object.originX, originY: object.originY,
        angle: object.angle, flipX: object.flipX, flipY: object.flipY,
        opacity: object.opacity, dataRole: object.dataRole, displayName: object.displayName || 'Bild ohne Hintergrund'
      });
      canvas.remove(object);
      canvas.add(replacement);
      canvas.setActiveObject(replacement);
      canvas.renderAll();
      snapshot();
      setStatus('Hintergrund entfernt. Das Bild bleibt vollständig bearbeitbar.');
    } catch (error) {
      setStatus(`Hintergrund konnte nicht entfernt werden: ${error.message}`);
    } finally {
      setRemovingBackground(false);
    }
  }

  function fitSelectedImage(modeName = 'cover') {
    const canvas = fabricRef.current;
    const object = canvas?.getActiveObject();
    if (!(object instanceof FabricImage)) { setStatus('Wähle zuerst ein Bild aus.'); return; }
    const scale = modeName === 'contain'
      ? Math.min(canvas.width / Math.max(1,object.width), canvas.height / Math.max(1,object.height))
      : Math.max(canvas.width / Math.max(1,object.width), canvas.height / Math.max(1,object.height));
    object.set({ left:canvas.width/2, top:canvas.height/2, originX:'center', originY:'center', scaleX:scale, scaleY:scale, angle:0 });
    object.setCoords();
    canvas.requestRenderAll();
    snapshot();
    setStatus(modeName === 'contain' ? 'Das ganze Bild ist sichtbar.' : 'Das Bild füllt die Arbeitsfläche randlos aus. Überstehende Ränder werden abgeschnitten.');
  }

  function sendImageToBackground() {
    const canvas = fabricRef.current;
    const object = canvas?.getActiveObject();
    if (!(object instanceof FabricImage)) { setStatus('Wähle zuerst ein Bild aus.'); return; }
    fitSelectedImage('cover');
    canvas.sendObjectToBack(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    snapshot();
    setStatus('Bild liegt jetzt randlos als unterste Ebene. Es bleibt weiterhin auswählbar und bearbeitbar.');
  }

  async function shareCurrentToInstagram() {
    try {
      setStatus('Design wird für Instagram vorbereitet …');
      const data = currentPngData();
      const blob = await (await fetch(data)).blob();
      const file = new File([blob], `${safeName(projectName)}.png`, { type:'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))) {
        await navigator.share({ files:[file], title:projectName, text:'Erstellt mit PIXVA' });
        setStatus('Teilen geöffnet. Wähle Instagram aus.');
      } else {
        downloadDataUrl(data, `${safeName(projectName)}.png`);
        window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
        setStatus('PNG heruntergeladen und Instagram geöffnet. Auf dem Handy ist die direkte Teilen-Auswahl verfügbar.');
      }
    } catch (error) {
      if (error?.name === 'AbortError') setStatus('Instagram-Teilen abgebrochen.');
      else setStatus(error.message || 'Instagram-Teilen war nicht möglich.');
    }
  }

  function removeSelected() {
    const canvas = fabricRef.current;
    const objects = canvas.getActiveObjects();
    objects.forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    canvas.renderAll();
    syncSelected(null);
    snapshot();
  }

  async function duplicateSelected() {
    const canvas = fabricRef.current;
    const active = canvas.getActiveObject();
    if (!active) return;
    const clone = await active.clone(customProps);
    clone.set({ left: Number(active.left || 0) + 24, top: Number(active.top || 0) + 24 });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    canvas.renderAll();
    snapshot();
  }

  function move(direction) {
    const canvas = fabricRef.current;
    const object = canvas.getActiveObject();
    if (!object) return;
    if (direction === 'up') canvas.bringObjectForward(object);
    else canvas.sendObjectBackwards(object);
    canvas.renderAll();
    snapshot();
  }

  function moveExtreme(direction) {
    const canvas = fabricRef.current;
    const object = canvas.getActiveObject();
    if (!object) return;
    if (direction === 'front') canvas.bringObjectToFront(object);
    else canvas.sendObjectToBack(object);
    canvas.renderAll();
    snapshot();
  }

  function alignCenter() {
    const canvas = fabricRef.current;
    const object = canvas.getActiveObject();
    if (!object) return;
    canvas.centerObjectH(object);
    canvas.centerObjectV(object);
    object.setCoords();
    canvas.renderAll();
    snapshot();
  }

  function toggleLock() {
    const canvas = fabricRef.current;
    const object = canvas.getActiveObject();
    if (!object) return;
    const locked = !object.lockMovementX;
    object.set({ lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked });
    canvas.renderAll();
    syncSelected(object);
    snapshot();
  }

  function updateObject(property, value) {
    const canvas = fabricRef.current;
    const object = canvas.getActiveObject();
    if (!object) return;
    object.set(property, value);
    object.setCoords();
    canvas.renderAll();
    syncSelected(object);
  }

  function commitObject(property, value) {
    updateObject(property, value);
    snapshot();
  }

  function applyImageAdjustments(next) {
    const canvas = fabricRef.current;
    const object = canvas.getActiveObject();
    if (!(object instanceof FabricImage)) return;
    object._brightness = next.brightness;
    object._contrast = next.contrast;
    object._saturation = next.saturation;
    object.filters = [
      new filters.Brightness({ brightness: next.brightness }),
      new filters.Contrast({ contrast: next.contrast }),
      new filters.Saturation({ saturation: next.saturation })
    ];
    object.applyFilters();
    canvas.requestRenderAll();
    setAdjustments(next);
  }

  function resetImageAdjustments() {
    const next = { brightness: 0, contrast: 0, saturation: 0 };
    applyImageAdjustments(next);
    snapshot();
  }

  function setBackgroundColor(color) {
    setBackground(color);
    const canvas = fabricRef.current;
    canvas.backgroundColor = color;
    canvas.renderAll();
    snapshot();
  }

  function fitAllObjects() {
    const canvas = fabricRef.current;
    normalizeCanvasObjects(canvas);
    canvas.discardActiveObject();
    syncSelected(null);
    snapshot();
    setStatus('Alle Elemente wurden vollständig in die Arbeitsfläche eingepasst.');
  }

  async function applyTemplate(type) {
    const canvas = fabricRef.current;
    if (canvas.getObjects().length && !confirm('Aktuelles Design durch die gewählte Vorlage ersetzen?')) return;
    try {
      let usedReference = false;
      if (templateVariant === 'reference' && referenceTemplates[type]) {
        usedReference = await addReferenceTemplate(canvas, type, canvas.width, canvas.height);
      }
      if (!usedReference) {
        if (type === 'offer') addOfferTemplate(canvas, canvas.width, canvas.height);
        else if (type === 'atlas-grid') addAtlasGridTemplate(canvas, canvas.width, canvas.height);
        else if (type === 'fresh-grid') addFreshGridTemplate(canvas, canvas.width, canvas.height);
        else if (type === 'tea-single') addSingleTeaTemplate(canvas, canvas.width, canvas.height);
        else if (type === 'creative') addCreativeTemplate(canvas, canvas.width, canvas.height);
        else { canvas.clear(); canvas.backgroundColor = '#ffffff'; canvas.renderAll(); }
      }
      currentTemplateRef.current = type;
      baseTemplateRef.current = canvas.toJSON(customProps);
      setBackground(canvas.backgroundColor || '#ffffff');
      canvas.discardActiveObject();
      syncSelected(null);
      snapshot();
      refreshLayers();
      setStatus(usedReference
        ? 'Original-Vorlage geladen. Produktbilder können ersetzt werden. Für vollständig getrennte Ebenen wähle „Voll bearbeitbar“.'
        : 'Voll bearbeitbare Vorlage geladen.');
    } catch (error) {
      setStatus(error.message || 'Vorlage konnte nicht geladen werden.');
    }
  }

  async function renderJsonData(json) {
    if (!json) return currentPngData();
    const temporaryElement = document.createElement('canvas');
    const temporaryCanvas = new StaticCanvas(temporaryElement, {
      width: format.canvas[0], height: format.canvas[1], backgroundColor: '#ffffff'
    });
    await temporaryCanvas.loadFromJSON(json);
    temporaryCanvas.requestRenderAll();
    const multiplier = format.export[0] / format.canvas[0];
    const data = temporaryCanvas.toDataURL({ format: 'png', multiplier, quality: 1 });
    temporaryCanvas.dispose();
    return data;
  }

  function downloadDataUrl(data, fileName) {
    const anchor = document.createElement('a');
    anchor.href = data;
    anchor.download = fileName;
    anchor.click();
  }

  async function externalPngData() {
    if (externalExportMode === 'template' && baseTemplateRef.current) {
      return renderJsonData(baseTemplateRef.current);
    }
    return currentPngData();
  }

  async function openInCanva() {
    try {
      const data = await externalPngData();
      const orientation = format.export[0] > format.export[1] ? 'landscape' : 'portrait';
      const doc = new jsPDF({ orientation, unit: 'px', format: [format.export[0], format.export[1]] });
      doc.addImage(data, 'PNG', 0, 0, format.export[0], format.export[1]);
      doc.save(`${safeName(projectName)}-${externalExportMode === 'template' ? 'vorlage' : 'bearbeitet'}-canva.pdf`);
      window.open('https://www.canva.com/', '_blank', 'noopener,noreferrer');
      setStatus('Canva wurde geöffnet und die PDF heruntergeladen. In Canva: Erstellen → Hochladen. Für vollautomatischen Import ist eine Canva-OAuth-Verbindung erforderlich.');
    } catch (error) {
      setStatus(error.message || 'Canva-Export ist fehlgeschlagen.');
    }
  }

  async function openInPhotoshop() {
    try {
      const data = await externalPngData();
      downloadDataUrl(data, `${safeName(projectName)}-${externalExportMode === 'template' ? 'vorlage' : 'bearbeitet'}-photoshop.png`);
      window.open('https://photoshop.adobe.com/', '_blank', 'noopener,noreferrer');
      setStatus('Photoshop im Web wurde geöffnet und die PNG-Datei heruntergeladen. Dort „Datei hochladen“ wählen oder die Datei hineinziehen.');
    } catch (error) {
      setStatus(error.message || 'Photoshop-Export ist fehlgeschlagen.');
    }
  }

  function currentPngData() {
    const canvas = fabricRef.current;
    canvas.discardActiveObject();
    canvas.renderAll();
    const multiplier = format.export[0] / canvas.width;
    return canvas.toDataURL({ format: 'png', multiplier, quality: 1 });
  }

  function exportPng() {
    const anchor = document.createElement('a');
    anchor.download = `${safeName(projectName)}.png`;
    anchor.href = currentPngData();
    anchor.click();
  }

  function exportPdf() {
    const data = currentPngData();
    const orientation = format.export[0] > format.export[1] ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'px', format: [format.export[0], format.export[1]] });
    doc.addImage(data, 'PNG', 0, 0, format.export[0], format.export[1]);
    doc.save(`${safeName(projectName)}.pdf`);
    setStatus('PDF exportiert.');
  }

  async function exportZip() {
    const data = currentPngData();
    const zip = new JSZip();
    const safe = safeName(projectName);
    zip.file(`${safe}.png`, data.split(',')[1], { base64: true });
    zip.file('projekt.json', JSON.stringify({ name: projectName, type: mode, format: formatKey, canvas: fabricRef.current.toJSON(customProps) }, null, 2));
    zip.file('README.txt', 'PIXVA Designprojekt\nEnthält PNG und bearbeitbare Ebenen/Projektinformationen.');
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safe}-projekt.zip`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Design als ZIP exportiert.');
  }

  async function saveProject() {
    if (!canSave) { setStatus('Zum dauerhaften Speichern bitte anmelden. Exporte funktionieren auch als Gast.'); return; }
    const canvas = fabricRef.current;
    setStatus('Speichern …');
    try {
      const payload = {
        name: projectName,
        type: mode === 'image' ? 'image' : 'flyer',
        data: { format: formatKey, canvas: canvas.toJSON(customProps) }
      };
      const result = projectId
        ? await api(`/api/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await api('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
      setProjectId(result.project.id);
      setStatus('Gespeichert.');
      onSaved?.(result.project);
    } catch (error) {
      setStatus(error.message);
    }
  }


  /* PIXVA AUTOSAVE V10 */
  const pixvaLastAutosaveRef = useRef('');
  useEffect(() => {
    if (!canSave || !projectId) return;
    const timer = window.setInterval(async () => {
      try {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const canvasJson = canvas.toJSON();
        const fingerprint = JSON.stringify({ projectName, formatKey, canvas:canvasJson });
        if (fingerprint === pixvaLastAutosaveRef.current) return;
        const payload = {
          name:projectName,
          type:mode === 'image' ? 'image' : 'flyer',
          data:{ format:formatKey, canvas:canvasJson }
        };
        const result = await api(`/api/projects/${projectId}`, {
          method:'PUT',
          body:JSON.stringify(payload)
        });
        pixvaLastAutosaveRef.current = fingerprint;
        onSaved?.(result.project);
      } catch {
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [canSave, projectId, projectName, formatKey, mode, onSaved]);

  async function generateAiImage() {
    if (!canUseFeature(subscription, 'paidImages', userRole, customPlans)) {
      setStatus('OpenAI-Bilder sind ab Creator enthalten. Während der Beta kannst du Creator für 0,00 € aktivieren.');
      onOpenPlans?.();
      return;
    }
    if (costPromptMode !== 'none') {
      const approved = window.confirm('Kostenhinweis: Dieses echte OpenAI-Bild kann ungefähr 0,02–0,20 US-Dollar API-Guthaben verbrauchen. Wirklich erstellen?');
      if (!approved) { setStatus('Kostenpflichtige Bilderstellung abgebrochen.'); return; }
    } else {
      setStatus('Kostenabfrage ist für dieses Konto deaktiviert. Die API kann trotzdem Guthaben verbrauchen.');
    }
    setGenerating(true);
    setStatus('KI-Bild wird erstellt …');
    try {
      const result = await api('/api/ai/image', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt, aspect: formatKey, style: imageStyle })
      });
      const imageSource = result?.imageDataUrl || result?.imageUrl;
      if (!imageSource) throw new Error('Der Bilddienst hat keine Bilddatei geliefert.');
      setLocalMotifUrl(imageSource);
      setStatus(`KI-Bild erstellt · ${result.provider || 'Bildmodell'}`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setGenerating(false);
    }
  }

  function selectLayer(object) {
    const canvas = fabricRef.current;
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    syncSelected(object);
  }

  function toggleLayerVisible(object) {
    object.visible = !object.visible;
    fabricRef.current.requestRenderAll();
    snapshot();
  }

  async function onCanvasDrop(event) {
    event.preventDefault();
    setDragActive(false);
    const file = Array.from(event.dataTransfer.files || []).find((item) => item.type.startsWith('image/'));
    if (!file) return;
    try {
      const active = fabricRef.current.getActiveObject();
      const activeRole = String(active?.dataRole || '');
      if (activeRole.startsWith('product-slot:') || activeRole.startsWith('product-image:')) await replaceProductImage(file);
      else if (activeRole.startsWith('logo-slot:') || activeRole.startsWith('logo-image:')) await replaceLogoImage(file);
      else if (activeRole.startsWith('hero-slot:') || activeRole.startsWith('hero-image:')) await replaceHeroImage(file);
      else await addImageUrl(await fileToDataUrl(file), { displayName: file.name });
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="editor-pro-page">
      <div className="editor-page-heading"><div><h2>{mode === 'image' ? (uiText.imageTitle || 'Motive & Editor') : (uiText.flyerTitle || 'Angebote & Flyer')}</h2><p>{mode === 'image' ? (uiText.imageSubtitle || 'Bilder, Motive, Texte und Ebenen direkt bearbeiten.') : (uiText.flyerSubtitle || 'Bearbeitbare Vorlagen für Angebote, Produkte und Preise.')}</p></div></div>
      <div className="editor-pro-shell">
      <aside className="tool-panel editor-tools-pro">
        <div className="panel-section">
          <div className="pixva-brain-chip">PIXVA Brain arbeitet hier mit{pixvaBrain?.isCompany?` · ${pixvaBrain.company?.industryLabel||''}`:''}</div><label>Projektname<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
          <label>Format<select value={formatKey} onChange={(event) => setFormatKey(event.target.value)}>{Object.entries(formats).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
          <label>Vorlagenmodus<select value={templateVariant} onChange={(event) => setTemplateVariant(event.target.value)}><option value="editable">Voll bearbeitbar (empfohlen)</option><option value="reference">Nur Originalbild – nicht alle Ebenen editierbar</option></select></label>
          <div className="template-gallery">
            <button onClick={() => applyTemplate('tea-single')}><img src="/templates/atlas-tee-single.jpg" alt="Einzelangebot"/><span>Einzelangebot</span></button>
            <button onClick={() => applyTemplate('atlas-grid')}><img src="/templates/atlas-grid.jpg" alt="Atlas Raster"/><span>Atlas 3×3</span></button>
            <button onClick={() => applyTemplate('fresh-grid')}><img src="/templates/fresh-grid.jpg" alt="Fresh Raster"/><span>Fresh 3×3</span></button>
            <button onClick={() => applyTemplate('offer')}><img src="/templates/fresh-market-single.jpg" alt="Produktangebot"/><span>Produkt & Preis</span></button>
            <button onClick={() => applyTemplate('creative')}><span className="template-abstract">AI</span><span>Kreativ</span></button>
            <button onClick={() => applyTemplate('blank')}><span className="template-blank">+</span><span>Leer</span></button>
          </div>
        </div>

        <div className="tool-grid">
          <button onClick={addText}><Type size={18}/>Text</button>
          <button onClick={addShape}><Square size={18}/>Form</button>
          <button onClick={addPrice}><Plus size={18}/>Preis</button>
          <label className="tool-upload"><Upload size={18}/>Bild hinzufügen<input type="file" accept="image/*" onChange={uploadImage}/></label>
          <button className="primary-btn" onClick={() => productInputRef.current?.click()}><ImagePlus size={18}/>Produkt ersetzen</button>
          <input ref={productInputRef} type="file" accept="image/*" hidden onChange={uploadProduct}/>
          <button onClick={() => logoInputRef.current?.click()}><ImagePlus size={18}/>Logo ersetzen</button>
          <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={uploadLogo}/>
          <button onClick={() => heroInputRef.current?.click()}><ImagePlus size={18}/>Kopfbild ersetzen</button>
          <input ref={heroInputRef} type="file" accept="image/*" hidden onChange={uploadHero}/>
          <button onClick={removeImageBackground} disabled={removingBackground}>{removingBackground ? <LoaderCircle className="spin" size={18}/> : <WandSparkles size={18}/>}Hintergrund weg</button>
          <button onClick={duplicateSelected}><Copy size={18}/>Duplizieren</button>
          <button onClick={removeSelected}><Trash2 size={18}/>Löschen</button>
        </div>

        <div className="panel-section">
          <h3><Type size={17}/> Schrift im KI-Bild ändern</h3>
          <p>Text, der direkt im erzeugten Bild steckt, ist Teil der Pixel. Markiere ihn einmal; PIXVA deckt ihn ab und setzt eine echte bearbeitbare Textebene darüber.</p>
          <button className="wide" onClick={markRasterTextArea}><Type size={17}/>Schriftbereich markieren</button>
          <label>Neuer Text<textarea rows={2} value={rasterText.text} onChange={(event)=>setRasterText({...rasterText,text:event.target.value})}/></label>
          <label>Schrift<select value={rasterText.fontFamily} onChange={(event)=>setRasterText({...rasterText,fontFamily:event.target.value})}>{fontOptions.map((font)=><option key={font}>{font}</option>)}</select></label>
          <div>
            <label>Größe<input type="number" min="8" max="240" value={rasterText.fontSize} onChange={(event)=>setRasterText({...rasterText,fontSize:Number(event.target.value)})}/></label>
            <label>Textfarbe<input type="color" value={rasterText.textColor} onChange={(event)=>setRasterText({...rasterText,textColor:event.target.value})}/></label>
            <label>Abdeckfarbe<input type="color" value={rasterText.coverColor} onChange={(event)=>setRasterText({...rasterText,coverColor:event.target.value})}/></label>
          </div>
          <label className="checkbox-row"><input type="checkbox" checked={rasterText.coverOldText} onChange={(event)=>setRasterText({...rasterText,coverOldText:event.target.checked})}/>Alte Bildschrift abdecken</label>
          <div><button className="primary-btn" onClick={applyRasterTextReplacement}>Schrift ersetzen</button><button onClick={cancelRasterTextReplacement}>Abbrechen</button></div>
          <small>Danach ist die neue Schrift unter „Ebenen“ auswählbar und kann jederzeit geändert werden.</small>
        </div>
        <div className="panel-section">
          <h3><Layers size={17}/> Ebenen</h3>
          <div className="layers-list">
            {layers.map(({ object, name }, index) => (
              <button key={`${name}-${index}`} className={object === selected ? 'active' : ''} onClick={() => selectLayer(object)}>
                <span>{name}</span>
                <i onClick={(event) => { event.stopPropagation(); toggleLayerVisible(object); }}>{object.visible === false ? <EyeOff size={14}/> : <Eye size={14}/>}</i>
              </button>
            ))}
          </div>
        </div>

        <div className="panel-section ai-panel">
          <h3><Sparkles size={17}/> KI-Bilderstellung</h3>
          <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} rows={4}/>
          <label>Stil<select value={imageStyle} onChange={(event) => setImageStyle(event.target.value)}><option value="realistic">Realistisch</option><option value="product">Produktfoto</option><option value="poster">Werbeposter</option><option value="studio">Studio</option></select></label>
          <button className="primary-btn wide" onClick={generateAiImage} disabled={generating}>{generating ? <LoaderCircle className="spin" size={17}/> : <Sparkles size={17}/>} {generating ? 'Wird erstellt …' : 'KI-Bild erstellen'}</button>
          {localMotifUrl && <div className="ai-result"><img src={localMotifUrl} alt="KI Motiv"/><button onClick={() => mode === 'flyer' ? replaceProductImage(localMotifUrl) : addImageUrl(localMotifUrl,{fillCanvas:true,displayName:'KI-Bild'})}><ImagePlus size={16}/>In Design einsetzen</button></div>}
        </div>
      </aside>

      <div className="canvas-stage editor-canvas-pro">
        <div className="canvas-topline">
          <div className="history-controls">
            <button onClick={() => restoreHistory(historyIndexRef.current - 1)} disabled={historyIndexRef.current <= 0}><Undo2 size={17}/>Rückgängig</button>
            <button onClick={() => restoreHistory(historyIndexRef.current + 1)} disabled={historyIndexRef.current >= historyRef.current.length - 1}><Redo2 size={17}/>Wiederholen</button>
            <button onClick={() => move('up')}><MoveUp size={17}/>Vor</button>
            <button onClick={() => move('down')}><MoveDown size={17}/>Zurück</button>
            <button onClick={fitAllObjects}><AlignCenter size={17}/>Alles einpassen</button>
          </div>
          {isText && <div className="context-text-toolbar">
            <select value={selected.fontFamily || 'Arial'} onChange={(event) => commitObject('fontFamily', event.target.value)}>{fontOptions.map((font) => <option key={font}>{font}</option>)}</select>
            <input type="number" min="6" max="240" value={Math.round(selected.fontSize || 40)} onChange={(event) => updateObject('fontSize', Number(event.target.value))} onBlur={snapshot}/>
            <input type="color" value={typeof selected.fill === 'string' ? selected.fill : '#111111'} onChange={(event) => commitObject('fill', event.target.value)}/>
            <button onClick={() => commitObject('fontWeight', selected.fontWeight === 700 || selected.fontWeight === 'bold' ? 400 : 700)}><Bold size={16}/></button>
          </div>}
          <div className="export-controls">
            <button onClick={saveProject}><Save size={17}/>{canSave ? 'Speichern' : 'Anmelden'}</button>
            <button onClick={exportPdf}><FileText size={17}/>PDF</button>
            <button onClick={exportZip}><FileArchive size={17}/>ZIP</button>
            <button className="primary-btn" onClick={exportPng}><Download size={17}/>PNG</button><button className="instagram-btn" onClick={shareCurrentToInstagram}><Instagram size={17}/>Instagram</button>
            <select className="external-mode" value={externalExportMode} onChange={(event) => setExternalExportMode(event.target.value)} title="Was soll extern geöffnet werden?">
              <option value="edited">Bearbeitetes Design</option>
              <option value="template">Nur Vorlage</option>
            </select>
            <button className="canva-btn" onClick={openInCanva}><ExternalLink size={16}/>Canva</button>
            <button className="photoshop-btn" onClick={openInPhotoshop}><ExternalLink size={16}/>Photoshop</button>
          </div>
        </div>
        <div
          className={`canvas-scroll editor-drop-area ${dragActive ? 'drag-active' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onCanvasDrop}
        >
          <div className="canvas-zoom-frame" style={{ width: `${format.canvas[0] * zoom / 100}px`, height: `${format.canvas[1] * zoom / 100}px` }}>
            <div className="canvas-holder" style={{ transform: `scale(${zoom / 100})` }}><canvas ref={elementRef}/></div>
          </div>
          {dragActive && <div className="canvas-drop-overlay">Produkt- oder Bilddatei hier ablegen</div>}
        </div>
        <div className="canvas-footer-pro">
          <label><ZoomIn size={15}/><input type="range" min="35" max="140" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}/><span>{zoom}%</span></label>
          <div className="status-line">{status || 'Text einmal anklicken und direkt tippen. Cmd/Ctrl+C, V, Z, D sowie Pfeiltasten funktionieren. Canva/Photoshop exportieren das bearbeitete Design oder die reine Vorlage.'}</div>
        </div>
      </div>

      <aside className="inspector-panel">
        <h3>Eigenschaften</h3>
        {!selected && <div className="inspector-empty">Wähle ein Element auf der Arbeitsfläche oder in den Ebenen aus.</div>}
        {selected && <>
          <div className="inspector-actions">
            <button onClick={alignCenter}><AlignCenter size={16}/>Zentrieren</button>
            <button onClick={() => moveExtreme('front')}><ArrowUpToLine size={16}/>Ganz vorn</button>
            <button onClick={() => moveExtreme('back')}><ArrowDownToLine size={16}/>Ganz hinten</button>
            <button onClick={() => commitObject('flipX', !selected.flipX)}><FlipHorizontal2 size={16}/>Spiegeln X</button>
            <button onClick={() => commitObject('flipY', !selected.flipY)}><FlipVertical2 size={16}/>Spiegeln Y</button>
            <button onClick={toggleLock}>{selected.lockMovementX ? <Unlock size={16}/> : <Lock size={16}/>} {selected.lockMovementX ? 'Entsperren' : 'Sperren'}</button>
          </div>
          <div className="inspector-grid">
            <label>X<input type="number" value={Math.round(selected.left || 0)} onChange={(event) => updateObject('left', Number(event.target.value))} onBlur={snapshot}/></label>
            <label>Y<input type="number" value={Math.round(selected.top || 0)} onChange={(event) => updateObject('top', Number(event.target.value))} onBlur={snapshot}/></label>
            <label>Breite<input type="number" value={Math.round(selected.getScaledWidth?.() || selected.width || 0)} onChange={(event) => { const value = Number(event.target.value); if (selected.width) updateObject('scaleX', value / selected.width); }} onBlur={snapshot}/></label>
            <label>Höhe<input type="number" value={Math.round(selected.getScaledHeight?.() || selected.height || 0)} onChange={(event) => { const value = Number(event.target.value); if (selected.height) updateObject('scaleY', value / selected.height); }} onBlur={snapshot}/></label>
            <label>Drehung<input type="number" value={Math.round(selected.angle || 0)} onChange={(event) => updateObject('angle', Number(event.target.value))} onBlur={snapshot}/></label>
            <label>Deckkraft<input type="number" min="0" max="100" value={Math.round((selected.opacity ?? 1) * 100)} onChange={(event) => updateObject('opacity', Number(event.target.value) / 100)} onBlur={snapshot}/></label>
          </div>

          {isText && <div className="inspector-section">
            <h4>Text</h4>
            <textarea value={selected.text || ''} onChange={(event) => updateObject('text', event.target.value)} onBlur={snapshot}/>
            <label>Schrift<select value={selected.fontFamily || 'Arial'} onChange={(event) => commitObject('fontFamily', event.target.value)}>{fontOptions.map((font) => <option key={font}>{font}</option>)}</select></label>
            <div className="inspector-grid">
              <label>Größe<input type="number" value={Math.round(selected.fontSize || 40)} onChange={(event) => updateObject('fontSize', Number(event.target.value))} onBlur={snapshot}/></label>
              <label>Farbe<input type="color" value={typeof selected.fill === 'string' ? selected.fill : '#111111'} onChange={(event) => commitObject('fill', event.target.value)}/></label>
            </div>
            <button className={selected.fontWeight === 700 || selected.fontWeight === 'bold' ? 'active' : ''} onClick={() => commitObject('fontWeight', selected.fontWeight === 700 || selected.fontWeight === 'bold' ? 400 : 700)}><Bold size={16}/>Fett</button>
          </div>}

          {!isText && !isImage && <div className="inspector-section"><h4>Form</h4><label>Füllfarbe<input type="color" value={typeof selected.fill === 'string' && selected.fill.startsWith('#') ? selected.fill : '#ffd400'} onChange={(event) => commitObject('fill', event.target.value)}/></label></div>}

          {isImage && <div className="inspector-section">
            <h4>Bildbearbeitung</h4>
            <label>Helligkeit <span>{adjustments.brightness.toFixed(2)}</span><input type="range" min="-1" max="1" step="0.05" value={adjustments.brightness} onChange={(event) => applyImageAdjustments({ ...adjustments, brightness: Number(event.target.value) })} onMouseUp={snapshot}/></label>
            <label>Kontrast <span>{adjustments.contrast.toFixed(2)}</span><input type="range" min="-1" max="1" step="0.05" value={adjustments.contrast} onChange={(event) => applyImageAdjustments({ ...adjustments, contrast: Number(event.target.value) })} onMouseUp={snapshot}/></label>
            <label>Sättigung <span>{adjustments.saturation.toFixed(2)}</span><input type="range" min="-1" max="1" step="0.05" value={adjustments.saturation} onChange={(event) => applyImageAdjustments({ ...adjustments, saturation: Number(event.target.value) })} onMouseUp={snapshot}/></label>
            <div className="image-fit-actions"><button onClick={()=>fitSelectedImage('cover')}><Maximize2 size={16}/>Ausfüllen</button><button onClick={()=>fitSelectedImage('contain')}><Minimize2 size={16}/>Ganzes Bild</button><button onClick={sendImageToBackground}><Layers size={16}/>Als Hintergrund</button></div>
            <button onClick={resetImageAdjustments}><RotateCcw size={16}/>Bildwerte zurücksetzen</button>
            <button className="primary-btn" onClick={removeImageBackground} disabled={removingBackground}><WandSparkles size={16}/>{removingBackground ? 'Wird entfernt …' : 'Hintergrund entfernen'}</button>
          </div>}
        </>}

        <div className="inspector-section">
          <h4>Dokument</h4>
          <label>Hintergrund<input type="color" value={background} onChange={(event) => setBackgroundColor(event.target.value)}/></label>
        </div>
      </aside>
      </div>
    </section>
  );
}
