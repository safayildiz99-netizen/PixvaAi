import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './stability.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PIXVA UI BRAND GUARD
function pixvaBrandText(value) {
  return String(value ?? '')
    .replace(/Yildiz[\s-]*AI/gi, 'PIXVA')
    .replace(/YILDIZ[\s-]*AI/g, 'PIXVA');
}
function pixvaSkip(el) {
  return Boolean(el?.closest?.('script,style,textarea,.message.user,[data-keep-original-brand]'));
}
function applyPixvaBranding(root = document.body) {
  if (!root) return;
  if (root.nodeType === 3) {
    if (!pixvaSkip(root.parentElement)) {
      const next = pixvaBrandText(root.nodeValue);
      if (next !== root.nodeValue) root.nodeValue = next;
    }
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const node of texts) {
    if (pixvaSkip(node.parentElement)) continue;
    const next = pixvaBrandText(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }
  const elements = root.querySelectorAll?.('[placeholder],[title],[alt]') || [];
  for (const el of elements) {
    if (pixvaSkip(el)) continue;
    for (const attr of ['placeholder','title','alt']) {
      if (!el.hasAttribute(attr)) continue;
      const old = el.getAttribute(attr);
      const next = pixvaBrandText(old);
      if (next !== old) el.setAttribute(attr,next);
    }
  }
}
if (typeof window !== 'undefined') {
  const run = () => applyPixvaBranding(document.body);
  queueMicrotask(run);
  window.addEventListener('load',run,{once:true});

  // React erzeugt beim Seitenwechsel sehr viele DOM-Mutationen auf einmal.
  // Die alte Version hat für JEDE Mutation sofort einen kompletten Text-Scan gestartet.
  // Jetzt werden Änderungen gesammelt und höchstens einmal pro Frame verarbeitet.
  const pending = new Set();
  let frame = 0;
  const schedule = (node) => {
    const target = node?.nodeType === 3 ? node.parentElement : node;
    if (!target) return;
    pending.add(target);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const roots = [...pending];
      pending.clear();
      for (const root of roots) applyPixvaBranding(root);
    });
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') schedule(mutation.target);
      for (const node of mutation.addedNodes || []) schedule(node);
    }
  });
  const start = () => observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  if (document.body) start(); else document.addEventListener('DOMContentLoaded',start,{once:true});
}
