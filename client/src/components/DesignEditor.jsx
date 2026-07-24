import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, Circle, FabricImage, FabricText, Group, Rect } from 'fabric';
import {
  Download, ImagePlus, Layers, MoveDown, MoveUp, Plus, Save, Sparkles,
  Square, Trash2, Type, Upload, WandSparkles
} from 'lucide-react';
import { api } from '../api.js';

const formats = {
  square: { label: '1:1 · 1080 × 1080', canvas: [650, 650], export: [1080, 1080] },
  post: { label: '4:5 · 1080 × 1350', canvas: [600, 750], export: [1080, 1350] },
  story: { label: '9:16 · 1080 × 1920', canvas: [450, 800], export: [1080, 1920] }
};

function makeTitle(text, width) {
  return new FabricText(text, {
    left: width / 2,
    top: 70,
    originX: 'center',
    fontFamily: 'Arial',
    fontWeight: 800,
    fontSize: Math.max(30, width / 13),
    fill: '#111111'
  });
}

function addStarterTemplate(canvas, width, height, mode) {
  canvas.clear();
  canvas.backgroundColor = '#f4f0e8';
  const header = new Rect({ left: 0, top: 0, width, height: height * 0.2, fill: '#111111', selectable: false });
  const accent = new Rect({ left: 0, top: height * 0.2, width, height: height * 0.035, fill: '#f7c948', selectable: false });
  const title = makeTitle(mode === 'image' ? 'DEIN MOTIV' : 'ANGEBOTE DER WOCHE', width);
  title.set({ fill: '#ffffff', top: height * 0.065 });
  const subtitle = new FabricText(mode === 'image' ? 'KI-BILD · INDIVIDUELL BEARBEITBAR' : 'WERBETECHNIK & BESCHRIFTUNG', {
    left: width / 2, top: height * 0.145, originX: 'center', fontFamily: 'Arial',
    fontSize: Math.max(12, width / 40), fill: '#d7d7d7', charSpacing: 120
  });
  const imageArea = new Rect({
    left: width * 0.08, top: height * 0.29, width: width * 0.84, height: height * 0.43,
    fill: '#ddd7cb', rx: 18, ry: 18, stroke: '#bfb8aa', strokeDashArray: [10, 8]
  });
  const imageText = new FabricText('BILD ODER PRODUKT HIER EINFÜGEN', {
    left: width / 2, top: height * 0.5, originX: 'center', originY: 'center',
    fontFamily: 'Arial', fontWeight: 700, fontSize: Math.max(15, width / 30), fill: '#716a60'
  });
  const bottomText = new FabricText(mode === 'image' ? 'Text, Logo und Elemente frei verschieben' : 'Leuchtwerbung · Folierung · Schilder · Druck', {
    left: width * 0.08, top: height * 0.79, fontFamily: 'Arial', fontWeight: 700,
    fontSize: Math.max(16, width / 29), fill: '#111111'
  });
  const cta = new Rect({ left: width * 0.08, top: height * 0.86, width: width * 0.5, height: height * 0.07, fill: '#111111', rx: 12, ry: 12 });
  const ctaText = new FabricText('JETZT ANGEBOT ANFRAGEN', {
    left: width * 0.33, top: height * 0.895, originX: 'center', originY: 'center',
    fontFamily: 'Arial', fontWeight: 800, fontSize: Math.max(13, width / 34), fill: '#ffffff'
  });
  const logo = new FabricText('DEIN LOGO', {
    left: width * 0.92, top: height * 0.895, originX: 'right', originY: 'center',
    fontFamily: 'Arial', fontWeight: 800, fontSize: Math.max(14, width / 31), fill: '#111111'
  });
  canvas.add(header, accent, title, subtitle, imageArea, imageText, bottomText, cta, ctaText, logo);
  canvas.renderAll();
}

export default function DesignEditor({ mode = 'flyer', project, onSaved }) {
  const elementRef = useRef(null);
  const fabricRef = useRef(null);
  const [formatKey, setFormatKey] = useState(project?.data?.format || 'post');
  const [projectId, setProjectId] = useState(project?.id || '');
  const [projectName, setProjectName] = useState(project?.name || (mode === 'image' ? 'Neues Bilddesign' : 'Neuer Angebotsflyer'));
  const [background, setBackground] = useState('#f4f0e8');
  const [status, setStatus] = useState('');
  const [aiPrompt, setAiPrompt] = useState('Professionelles Werbetechnik-Motiv, hochwertige Leuchtreklame an moderner Fassade, realistische Fotografie');
  const [aiUrl, setAiUrl] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [imageModel, setImageModel] = useState('flux');

  const format = useMemo(() => formats[formatKey], [formatKey]);

  useEffect(() => {
    const canvas = new Canvas(elementRef.current, {
      width: format.canvas[0], height: format.canvas[1], backgroundColor: background,
      preserveObjectStacking: true, selectionColor: 'rgba(45, 125, 255, .15)'
    });
    fabricRef.current = canvas;

    async function initialize() {
      if (project?.data?.canvas) {
        try {
          await canvas.loadFromJSON(project.data.canvas);
          canvas.renderAll();
          setBackground(canvas.backgroundColor || '#f4f0e8');
        } catch {
          addStarterTemplate(canvas, format.canvas[0], format.canvas[1], mode);
        }
      } else {
        addStarterTemplate(canvas, format.canvas[0], format.canvas[1], mode);
      }
    }
    initialize();
    return () => canvas.dispose();
    // project intentionally initializes only when opening a project
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
    const text = new FabricText('Neuer Text', {
      left: 80, top: 120, fontFamily: 'Arial', fontWeight: 700, fontSize: 42, fill: '#111111'
    });
    canvas.add(text); canvas.setActiveObject(text); canvas.renderAll();
  }

  function addShape() {
    const canvas = fabricRef.current;
    const shape = new Rect({ left: 100, top: 160, width: 220, height: 120, fill: '#f7c948', rx: 18, ry: 18 });
    canvas.add(shape); canvas.setActiveObject(shape); canvas.renderAll();
  }

  function addPrice() {
    const canvas = fabricRef.current;
    const circle = new Circle({ radius: 78, fill: '#e62f2f', originX: 'center', originY: 'center' });
    const price = new FabricText('9,99 €', {
      originX: 'center', originY: 'center', fontFamily: 'Arial', fontWeight: 900, fontSize: 34, fill: '#ffffff'
    });
    const group = new Group([circle, price], { left: 300, top: 240 });
    canvas.add(group); canvas.setActiveObject(group); canvas.renderAll();
  }

  async function addImageUrl(url) {
    const canvas = fabricRef.current;
    const image = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    const maxW = canvas.width * 0.72;
    const maxH = canvas.height * 0.48;
    image.scale(Math.min(maxW / image.width, maxH / image.height, 1));
    image.set({ left: canvas.width / 2, top: canvas.height / 2, originX: 'center', originY: 'center' });
    canvas.add(image); canvas.setActiveObject(image); canvas.renderAll();
  }

  function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => addImageUrl(reader.result).catch((error) => setStatus(error.message));
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function removeSelected() {
    const canvas = fabricRef.current;
    const selected = canvas.getActiveObjects();
    selected.forEach((object) => canvas.remove(object));
    canvas.discardActiveObject(); canvas.renderAll();
  }

  function move(direction) {
    const canvas = fabricRef.current;
    const object = canvas.getActiveObject();
    if (!object) return;
    if (direction === 'up') canvas.bringObjectForward(object);
    else canvas.sendObjectBackwards(object);
    canvas.renderAll();
  }

  function setBackgroundColor(color) {
    setBackground(color);
    const canvas = fabricRef.current;
    canvas.backgroundColor = color;
    canvas.renderAll();
  }

  function resetTemplate() {
    const canvas = fabricRef.current;
    if (confirm('Aktuelles Design wirklich durch die Vorlage ersetzen?')) {
      addStarterTemplate(canvas, canvas.width, canvas.height, mode);
      setBackground('#f4f0e8');
    }
  }

  function exportPng() {
    const canvas = fabricRef.current;
    canvas.discardActiveObject(); canvas.renderAll();
    const multiplier = format.export[0] / canvas.width;
    const data = canvas.toDataURL({ format: 'png', multiplier, quality: 1 });
    const anchor = document.createElement('a');
    anchor.download = `${projectName.replace(/[^a-z0-9äöüß_-]+/gi, '-') || 'design'}.png`;
    anchor.href = data;
    anchor.click();
  }

  async function saveProject() {
    const canvas = fabricRef.current;
    setStatus('Speichern …');
    try {
      const payload = { name: projectName, type: mode === 'image' ? 'image' : 'flyer', data: { format: formatKey, canvas: canvas.toJSON() } };
      const result = projectId
        ? await api(`/api/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await api('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
      setProjectId(result.project.id);
      setStatus('Gespeichert');
      onSaved?.(result.project);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function generateImage() {
    setAiLoading(true); setStatus('Bild wird erzeugt …');
    try {
      const result = await api('/api/ai/image', {
        method: 'POST', body: JSON.stringify({ prompt: aiPrompt, model: imageModel, size: `${format.export[0]}x${format.export[1]}` })
      });
      setAiUrl(result.url); setStatus('KI-Bild fertig');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <section className="editor-layout">
      <aside className="tool-panel">
        <div className="panel-section">
          <label>Projektname<input value={projectName} onChange={(e) => setProjectName(e.target.value)} /></label>
          <label>Format<select value={formatKey} onChange={(e) => setFormatKey(e.target.value)}>{Object.entries(formats).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        </div>
        <div className="tool-grid">
          <button onClick={addText}><Type size={18} />Text</button>
          <button onClick={addShape}><Square size={18} />Form</button>
          <button onClick={addPrice}><Plus size={18} />Preis</button>
          <label className="tool-upload"><Upload size={18} />Bild/Logo<input type="file" accept="image/*" onChange={uploadImage} /></label>
          <button onClick={() => move('up')}><MoveUp size={18} />Nach vorn</button>
          <button onClick={() => move('down')}><MoveDown size={18} />Nach hinten</button>
          <button onClick={removeSelected}><Trash2 size={18} />Löschen</button>
          <button onClick={resetTemplate}><Layers size={18} />Vorlage</button>
        </div>
        <label>Hintergrund<input className="color-input" type="color" value={background} onChange={(e) => setBackgroundColor(e.target.value)} /></label>

        <div className="panel-section ai-panel">
          <h3><WandSparkles size={18} /> KI-Bild</h3>
          <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={5} />
          <label>Modell<select value={imageModel} onChange={(e) => setImageModel(e.target.value)}><option value="flux">Flux</option><option value="zimage">Z-Image</option><option value="gptimage">GPT Image</option><option value="seedream5">Seedream</option></select></label>
          <button className="primary-btn" onClick={generateImage} disabled={aiLoading}><Sparkles size={17} />{aiLoading ? 'Generiert …' : 'Bild generieren'}</button>
          {aiUrl && <div className="ai-result"><img src={aiUrl} alt="KI Ergebnis" /><button onClick={() => addImageUrl(aiUrl)}><ImagePlus size={16} />In Design einfügen</button></div>}
        </div>
      </aside>

      <div className="canvas-stage">
        <div className="canvas-topline">
          <span>{format.label}</span>
          <div>
            <button onClick={saveProject}><Save size={17} />Speichern</button>
            <button className="primary-btn" onClick={exportPng}><Download size={17} />PNG exportieren</button>
          </div>
        </div>
        <div className="canvas-scroll"><div className="canvas-holder"><canvas ref={elementRef} /></div></div>
        <div className="status-line">{status || 'Element anklicken und per Drag & Drop verschieben. Doppelklick auf Text zum Bearbeiten.'}</div>
      </div>
    </section>
  );
}
