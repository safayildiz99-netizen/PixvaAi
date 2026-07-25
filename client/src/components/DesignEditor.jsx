import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import {
  ActiveSelection, Canvas, Circle, FabricImage, FabricText, Group, IText, Rect, Textbox, filters
} from 'fabric';
import {
  AlignCenter, ArrowDownToLine, ArrowUpToLine, Bold, Copy, Download, Eye, EyeOff,
  FileArchive, FileText, FlipHorizontal2, FlipVertical2, ImagePlus, Layers, LoaderCircle,
  Lock, MoveDown, MoveUp, Plus, Redo2, RotateCcw, Save, Sparkles, Square, Trash2,
  Type, Undo2, Unlock, Upload, WandSparkles, ZoomIn
} from 'lucide-react';
import { api } from '../api.js';

const formats = {
  square: { label: '1:1 · 1080 × 1080', canvas: [650, 650], export: [1080, 1080] },
  post: { label: '4:5 · 1080 × 1350', canvas: [600, 750], export: [1080, 1350] },
  story: { label: '9:16 · 1080 × 1920', canvas: [450, 800], export: [1080, 1920] }
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


function addProductCard(canvas, x, y, cardW, cardH, index, accent) {
  const slotId = `product-slot:${index}`;
  const inner = cardW * .06;
  const card = new Rect({
    left: x, top: y, width: cardW, height: cardH,
    fill: '#ffffff', rx: 14, ry: 14, stroke: '#d7d7d7', strokeWidth: 1,
    selectable: false, dataRole: `card:${index}`, displayName: `Produktkarte ${index}`
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
    selectable: false, evented: false, dataRole: `product-slot-label:${index}`,
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
  canvas.backgroundColor = '#f3f1e8';
  const headerH = height * .18;
  const footerH = height * .075;
  const header = new Rect({ left: 0, top: 0, width, height: headerH, fill: '#224b35', selectable: false, dataRole: 'template-bg', displayName: 'Kopfbereich' });
  const accent = new Rect({ left: 0, top: headerH, width, height: height * .035, fill: '#e32636', selectable: false, dataRole: 'template-bg', displayName: 'Akzentlinie' });
  const footer = new Rect({ left: 0, top: height - footerH, width, height: footerH, fill: '#3564ad', selectable: false, dataRole: 'template-bg', displayName: 'Fußbereich' });
  const heroText = makeText('FRISCHE ANGEBOTE', { left: width * .055, top: height * .045, fontSize: width / 14, fill: '#ffffff', displayName: 'Kopfzeile' });
  const address = makeText('Musterstraße 12 · 70173 Stuttgart', { left: width * .055, top: height * .125, fontSize: width / 32, fill: '#d9f3de', displayName: 'Adresse' });
  canvas.add(header, accent, footer, heroText, address);

  const cols = 3;
  const rows = 3;
  const gapX = width * .022;
  const gapY = height * .018;
  const startY = headerH + height * .065;
  const usableH = height - startY - footerH - height * .025;
  const cardW = (width - gapX * 4) / cols;
  const cardH = (usableH - gapY * (rows - 1)) / rows;
  let index = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      addProductCard(canvas, gapX + col * (cardW + gapX), startY + row * (cardH + gapY), cardW, cardH, index, '#ff5a24');
      index += 1;
    }
  }
  canvas.renderAll();
}

function addFreshGridTemplate(canvas, width, height) {
  canvas.clear();
  canvas.backgroundColor = '#237a43';
  const headerH = height * .2;
  const footerH = height * .055;
  const header = new Rect({ left: 0, top: 0, width, height: headerH, fill: '#252525', selectable: false, dataRole: 'template-bg', displayName: 'Kopfbereich' });
  const accent = new Rect({ left: 0, top: headerH, width, height: height * .035, fill: '#e52b38', selectable: false, dataRole: 'template-bg', displayName: 'Akzentlinie' });
  const footer = new Rect({ left: 0, top: height - footerH, width, height: footerH, fill: '#165f34', selectable: false, dataRole: 'template-bg', displayName: 'Fußbereich' });
  const logoBox = new Rect({ left: width * .045, top: height * .025, width: width * .22, height: height * .145, fill: '#4c913f', rx: 12, ry: 12, displayName: 'Logo-Hintergrund' });
  const logo = makeText('THE\nFRESH\nMARKET', { left: width * .155, top: height * .097, originX: 'center', originY: 'center', fontSize: width / 21, textAlign: 'center', fill: '#ffffff', displayName: 'Logo' });
  const headline = makeText('ANGEBOT DER WOCHE', { left: width * .32, top: height * .073, fontSize: width / 18, fill: '#ffffff', displayName: 'Kopfzeile' });
  canvas.add(header, accent, footer, logoBox, logo, headline);

  const cols = 3;
  const rows = 3;
  const gapX = width * .022;
  const gapY = height * .018;
  const startY = headerH + height * .065;
  const usableH = height - startY - footerH - height * .02;
  const cardW = (width - gapX * 4) / cols;
  const cardH = (usableH - gapY * (rows - 1)) / rows;
  let index = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      addProductCard(canvas, gapX + col * (cardW + gapX), startY + row * (cardH + gapY), cardW, cardH, index, '#ff5a24');
      index += 1;
    }
  }
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

export default function DesignEditor({ mode = 'flyer', project, onSaved, canSave = true }) {
  const elementRef = useRef(null);
  const fabricRef = useRef(null);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const restoringRef = useRef(false);
  const productInputRef = useRef(null);
  const clipboardRef = useRef(null);
  const lastCanvasSizeRef = useRef(null);

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
      if (project?.data?.canvas) {
        try {
          await canvas.loadFromJSON(project.data.canvas);
          canvas.renderAll();
          setBackground(canvas.backgroundColor || '#f6f0e5');
        } catch {
          mode === 'flyer' ? addOfferTemplate(canvas, canvas.width, canvas.height) : addCreativeTemplate(canvas, canvas.width, canvas.height);
        }
      } else {
        mode === 'flyer' ? addOfferTemplate(canvas, canvas.width, canvas.height) : addCreativeTemplate(canvas, canvas.width, canvas.height);
      }
      normalizeCanvasObjects(canvas);
      historyRef.current = [];
      historyIndexRef.current = -1;
      snapshot();
      refreshLayers();
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
    normalizeCanvasObjects(canvas);
    canvas.requestRenderAll();
    snapshot();
  }, [format]);

  function addText() {
    const canvas = fabricRef.current;
    const text = makeText('Neuer Text', { left: 70, top: 110, fontSize: 44, fill: '#111111', displayName: 'Neuer Text' });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    snapshot();
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
    image.scale(Math.min(maxW / image.width, maxH / image.height, 1));
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

  async function replaceProductImage(fileOrUrl) {
    const canvas = fabricRef.current;
    const active = canvas.getActiveObject();
    const activeRole = String(active?.dataRole || '');
    const activeId = activeRole.includes(':') ? activeRole.split(':')[1] : '';
    const slot = activeRole.startsWith('product-slot:')
      ? active
      : canvas.getObjects().find((object) => String(object.dataRole || '') === `product-slot:${activeId}`)
        || canvas.getObjects().find((object) => String(object.dataRole || '').startsWith('product-slot:'));
    const slotId = String(slot?.dataRole || '').split(':')[1] || activeId || '1';
    const label = canvas.getObjects().find((object) => String(object.dataRole || '') === `product-slot-label:${slotId}`);
    const existing = activeRole.startsWith('product-image:')
      ? active
      : canvas.getObjects().find((object) => String(object.dataRole || '') === `product-image:${slotId}`);
    const url = typeof fileOrUrl === 'string' ? fileOrUrl : await fileToDataUrl(fileOrUrl);
    const image = await createFabricImage(url);
    const targetWidth = slot ? slot.getScaledWidth() * .92 : existing ? existing.getScaledWidth() : canvas.width * .45;
    const targetHeight = slot ? slot.getScaledHeight() * .92 : existing ? existing.getScaledHeight() : canvas.height * .35;
    image.scale(Math.min(targetWidth / image.width, targetHeight / image.height));
    image.set({
      left: slot ? slot.left + slot.getScaledWidth() / 2 : existing?.left ?? canvas.width / 2,
      top: slot ? slot.top + slot.getScaledHeight() / 2 : existing?.top ?? canvas.height / 2,
      originX: 'center', originY: 'center', dataRole: `product-image:${slotId}`, displayName: `Produktbild ${slotId}`
    });
    if (slot) canvas.remove(slot);
    if (label) canvas.remove(label);
    if (existing) canvas.remove(existing);
    canvas.add(image); canvas.setActiveObject(image); canvas.requestRenderAll(); snapshot();
    setStatus(`Produktbild ${slotId} wurde ersetzt. Cmd/Ctrl+C und Cmd/Ctrl+V funktionieren jetzt.`);
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      await addImageUrl(url, { displayName: file.name });
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

  function applyTemplate(type) {
    const canvas = fabricRef.current;
    const action = () => {
      if (type === 'offer') addOfferTemplate(canvas, canvas.width, canvas.height);
      else if (type === 'atlas-grid') addAtlasGridTemplate(canvas, canvas.width, canvas.height);
      else if (type === 'fresh-grid') addFreshGridTemplate(canvas, canvas.width, canvas.height);
      else if (type === 'tea-single') addSingleTeaTemplate(canvas, canvas.width, canvas.height);
      else if (type === 'creative') addCreativeTemplate(canvas, canvas.width, canvas.height);
      else { canvas.clear(); canvas.backgroundColor = '#ffffff'; canvas.renderAll(); }
      setBackground(canvas.backgroundColor || '#ffffff');
      normalizeCanvasObjects(canvas);
      snapshot();
      refreshLayers();
    };
    if (canvas.getObjects().length && !confirm('Aktuelles Design durch die gewählte Vorlage ersetzen?')) return;
    action();
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
    zip.file('README.txt', 'Yildiz AI Designprojekt\nEnthält PNG und bearbeitbare Ebenen/Projektinformationen.');
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

  async function generateAiImage() {
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
      if (activeRole.startsWith('product-slot:') || activeRole.startsWith('product-image:') || fabricRef.current.getObjects().some((object) => String(object.dataRole || '').startsWith('product-slot:'))) await replaceProductImage(file);
      else await addImageUrl(await fileToDataUrl(file), { displayName: file.name });
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="editor-pro-shell">
      <aside className="tool-panel editor-tools-pro">
        <div className="panel-section">
          <label>Projektname<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
          <label>Format<select value={formatKey} onChange={(event) => setFormatKey(event.target.value)}>{Object.entries(formats).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
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
          <label className="tool-upload"><Upload size={18}/>Bild/Logo<input type="file" accept="image/*" onChange={uploadImage}/></label>
          <button className="primary-btn" onClick={() => productInputRef.current?.click()}><ImagePlus size={18}/>Produkt ersetzen</button>
          <input ref={productInputRef} type="file" accept="image/*" hidden onChange={uploadProduct}/>
          <button onClick={removeImageBackground} disabled={removingBackground}>{removingBackground ? <LoaderCircle className="spin" size={18}/> : <WandSparkles size={18}/>}Hintergrund weg</button>
          <button onClick={duplicateSelected}><Copy size={18}/>Duplizieren</button>
          <button onClick={removeSelected}><Trash2 size={18}/>Löschen</button>
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
          {localMotifUrl && <div className="ai-result"><img src={localMotifUrl} alt="KI Motiv"/><button onClick={() => mode === 'flyer' ? replaceProductImage(localMotifUrl) : addImageUrl(localMotifUrl)}><ImagePlus size={16}/>In Design einsetzen</button></div>}
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
            <button className="primary-btn" onClick={exportPng}><Download size={17}/>PNG</button>
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
          <div className="status-line">{status || 'Text anklicken und direkt tippen. Doppelklick öffnet die Texteingabe. Cmd/Ctrl+C, V, Z, D sowie Pfeiltasten funktionieren.'}</div>
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
            <button onClick={resetImageAdjustments}><RotateCcw size={16}/>Bildwerte zurücksetzen</button>
            <button className="primary-btn" onClick={removeImageBackground} disabled={removingBackground}><WandSparkles size={16}/>{removingBackground ? 'Wird entfernt …' : 'Hintergrund entfernen'}</button>
          </div>}
        </>}

        <div className="inspector-section">
          <h4>Dokument</h4>
          <label>Hintergrund<input type="color" value={background} onChange={(event) => setBackgroundColor(event.target.value)}/></label>
        </div>
      </aside>
    </section>
  );
}
