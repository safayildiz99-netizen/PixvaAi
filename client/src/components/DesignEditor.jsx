import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import {
  Canvas, Circle, FabricImage, FabricText, Group, Rect, filters
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
  return new FabricText(text, {
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
  const glow = new Circle({ left: width * .58, top: height * .1, radius: width * .25, fill: 'rgba(99,199,255,.22)', selectable: false, dataRole: 'template-bg' });
  const yellow = new Circle({ left: width * .02, top: height * .65, radius: width * .22, fill: 'rgba(255,212,0,.17)', selectable: false, dataRole: 'template-bg' });
  const title = makeText('DEINE IDEE.\nDEIN DESIGN.', { left: width * .08, top: height * .18, fontSize: width / 10, fill: '#ffffff', dataRole: 'headline', displayName: 'Hauptüberschrift' });
  const text = makeText('Bilder, Texte, Logos und Formen frei bearbeiten.', { left: width * .08, top: height * .48, fontSize: width / 28, fill: '#b9d6e8', dataRole: 'subtitle', displayName: 'Beschreibung' });
  const slot = new Rect({ left: width * .08, top: height * .58, width: width * .84, height: height * .3, fill: 'rgba(255,255,255,.06)', stroke: '#63c7ff', strokeDashArray: [10, 8], rx: 22, ry: 22, dataRole: 'product-slot', displayName: 'Bild-Platzhalter' });
  const hint = makeText('BILD HIER ABLEGEN', { left: width / 2, top: height * .73, originX: 'center', originY: 'center', fontSize: width / 27, fill: '#63c7ff', dataRole: 'product-slot-label', displayName: 'Bild-Hinweis' });
  canvas.add(glow, yellow, title, text, slot, hint);
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
  const isText = selected instanceof FabricText;
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
    const canvas = new Canvas(elementRef.current, {
      width: format.canvas[0],
      height: format.canvas[1],
      backgroundColor: background,
      preserveObjectStacking: true,
      selectionColor: 'rgba(99,199,255,.16)'
    });
    fabricRef.current = canvas;

    const onSelection = () => syncSelected(canvas.getActiveObject());
    const onChanged = () => { syncSelected(canvas.getActiveObject()); snapshot(); };
    canvas.on('selection:created', onSelection);
    canvas.on('selection:updated', onSelection);
    canvas.on('selection:cleared', () => syncSelected(null));
    canvas.on('object:modified', onChanged);
    canvas.on('text:changed', onChanged);

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
    canvas.setDimensions({ width: format.canvas[0], height: format.canvas[1] });
    canvas.requestRenderAll();
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
    const slot = canvas.getObjects().find((object) => object.dataRole === 'product-slot');
    const label = canvas.getObjects().find((object) => object.dataRole === 'product-slot-label');
    const existing = canvas.getObjects().find((object) => object.dataRole === 'product-image');
    const url = typeof fileOrUrl === 'string' ? fileOrUrl : await fileToDataUrl(fileOrUrl);
    const image = await createFabricImage(url);

    const target = slot || existing || {
      left: canvas.width * .34,
      top: canvas.height * .49,
      width: canvas.width * .5,
      height: canvas.height * .4,
      originX: 'center', originY: 'center'
    };
    const targetWidth = slot ? slot.getScaledWidth() * .9 : existing ? existing.getScaledWidth() : canvas.width * .5;
    const targetHeight = slot ? slot.getScaledHeight() * .9 : existing ? existing.getScaledHeight() : canvas.height * .4;

    image.scale(Math.min(targetWidth / image.width, targetHeight / image.height));
    image.set({
      left: slot ? slot.left + slot.getScaledWidth() / 2 : existing?.left ?? target.left,
      top: slot ? slot.top + slot.getScaledHeight() / 2 : existing?.top ?? target.top,
      originX: 'center', originY: 'center', dataRole: 'product-image', displayName: 'Produktbild'
    });

    if (slot) canvas.remove(slot);
    if (label) canvas.remove(label);
    if (existing) canvas.remove(existing);
    canvas.add(image);
    const price = canvas.getObjects().find((object) => object.dataRole === 'price-badge');
    if (price) canvas.bringObjectToFront(price);
    canvas.setActiveObject(image);
    canvas.renderAll();
    snapshot();
    setStatus('Produktbild wurde ersetzt. Du kannst es jetzt frei verschieben und bearbeiten.');
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

  function applyTemplate(type) {
    const canvas = fabricRef.current;
    const action = () => {
      if (type === 'offer') addOfferTemplate(canvas, canvas.width, canvas.height);
      else if (type === 'creative') addCreativeTemplate(canvas, canvas.width, canvas.height);
      else { canvas.clear(); canvas.backgroundColor = '#ffffff'; canvas.renderAll(); }
      setBackground(canvas.backgroundColor || '#ffffff');
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
      setLocalMotifUrl(result.imageDataUrl);
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
      if (fabricRef.current.getObjects().some((object) => object.dataRole === 'product-slot' || object.dataRole === 'product-image')) await replaceProductImage(file);
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
          <label>Vorlage<select defaultValue={mode === 'flyer' ? 'offer' : 'creative'} onChange={(event) => applyTemplate(event.target.value)}><option value="offer">Angebot mit Produkt & Preis</option><option value="creative">Modernes Social-Media-Design</option><option value="blank">Leere Arbeitsfläche</option></select></label>
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
          </div>
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
          <div className="canvas-holder" style={{ transform: `scale(${zoom / 100})` }}><canvas ref={elementRef}/></div>
          {dragActive && <div className="canvas-drop-overlay">Produkt- oder Bilddatei hier ablegen</div>}
        </div>
        <div className="canvas-footer-pro">
          <label><ZoomIn size={15}/><input type="range" min="35" max="140" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}/><span>{zoom}%</span></label>
          <div className="status-line">{status || 'Element anklicken. Text per Doppelklick bearbeiten. Produktbild direkt auf die Fläche ziehen.'}</div>
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
