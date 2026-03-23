// DOM
const draggables = document.querySelectorAll('.sb-item');
const canvas = document.getElementById('canvas');
const imageUpload = document.getElementById('image-upload');
const floatingToolbar = document.getElementById('floating-toolbar');
const toast = document.getElementById('toast');
const propsBody = document.getElementById('props-body');
const layersList = document.getElementById('layers-list');
const SNAP = 20;

let selectedElement = null, currentImageUploadTarget = null;
let isInteracting = false, isResizing = false;
let startX, startY, initialLeft, initialTop, initialWidth, initialHeight;
let activeElement = null;
let history = [], historyIndex = -1, isRestoring = false;
const emptyState = document.getElementById('empty-state');

// Sign Out
document.getElementById('btn-signout').addEventListener('click', () => window.location.href = 'index.html');

// ========== HISTORY ==========
window.addEventListener('DOMContentLoaded', () => {
  const s = localStorage.getItem('builderState');
  if (s) { restoreState(s); history.push(s); historyIndex++; } else saveState();
});
function saveState() {
  if (isRestoring) return;
  const state = JSON.stringify({ html: canvas.innerHTML, bg: canvas.style.backgroundImage || '' });
  if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
  history.push(state); historyIndex++;
  localStorage.setItem('builderState', state);
  updateLayers(); updateEmptyState();
}
function restoreState(s) {
  isRestoring = true;
  let html = s, bg = '';
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === 'object' && parsed.html !== undefined) {
      html = parsed.html;
      bg = parsed.bg || '';
    }
  } catch(e) { /* old format: raw HTML string */ }
  canvas.innerHTML = html;
  canvas.style.backgroundImage = bg;
  if (bg) {
    canvas.style.backgroundSize = 'cover';
    canvas.style.backgroundPosition = 'center';
    canvas.style.backgroundRepeat = 'no-repeat';
  } else {
    canvas.style.backgroundSize = '';
    canvas.style.backgroundPosition = '';
    canvas.style.backgroundRepeat = '';
  }
  selectedElement = null; activeElement = null;
  updateFloatingToolbar(); updatePropertiesPanel(); updateLayers(); updateEmptyState();
  isRestoring = false;
}
document.getElementById('btn-undo').addEventListener('click', () => { if (historyIndex > 0) { historyIndex--; restoreState(history[historyIndex]); } });
document.getElementById('btn-redo').addEventListener('click', () => { if (historyIndex < history.length - 1) { historyIndex++; restoreState(history[historyIndex]); } });

// ========== TOAST ==========
function showToast(m) { toast.textContent = m; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2500); }

// ========== EMPTY STATE ==========
function updateEmptyState() {
  const hasElements = canvas.querySelectorAll('.element').length > 0;
  if (emptyState) emptyState.classList.toggle('hidden', hasElements);
}

// ========== LAYERS ==========
function updateLayers() {
  const els = canvas.querySelectorAll('.element');
  if (!els.length) { layersList.innerHTML = '<p class="layers-empty">No elements</p>'; return; }
  layersList.innerHTML = '';
  els.forEach((el, i) => {
    const d = document.createElement('div');
    d.className = 'layer-item' + (el === selectedElement ? ' active' : '');
    let label = 'Element';
    if (el.querySelector('.text-content')) label = 'Text';
    else if (el.querySelector('button')) label = 'Button';
    else if (el.querySelector('img')) label = 'Image';
    else if (el.querySelector('form')) label = 'Form';
    else if (el.classList.contains('el-section')) label = 'Section';
    else if (el.classList.contains('el-container')) label = 'Container';
    d.textContent = `${label} ${i + 1}`;
    d.addEventListener('click', () => selectElement(el));
    layersList.appendChild(d);
  });
}

// ========== SIDEBAR DRAG ==========
draggables.forEach(d => {
  d.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', d.dataset.type); setTimeout(() => d.style.opacity = '0.4', 0); });
  d.addEventListener('dragend', () => { d.style.opacity = '1'; canvas.classList.remove('drag-over'); });
});
canvas.addEventListener('dragover', e => {
  e.preventDefault(); canvas.classList.add('drag-over');
  // Highlight section/container drop targets
  const target = e.target.closest('.el-section, .el-container');
  document.querySelectorAll('.drop-target').forEach(d => d.classList.remove('drop-target'));
  if (target && canvas.contains(target)) target.classList.add('drop-target');
});
canvas.addEventListener('dragleave', e => {
  canvas.classList.remove('drag-over');
  document.querySelectorAll('.drop-target').forEach(d => d.classList.remove('drop-target'));
});
canvas.addEventListener('drop', e => {
  e.preventDefault(); canvas.classList.remove('drag-over');
  document.querySelectorAll('.drop-target').forEach(d => d.classList.remove('drop-target'));
  const type = e.dataTransfer.getData('text/plain');
  if (!type || isInteracting) return;

  // Check if dropping onto a section or container
  const dropTarget = e.target.closest('.el-section, .el-container');
  if (dropTarget && canvas.contains(dropTarget) && type !== 'section' && type !== 'container') {
    const r = dropTarget.getBoundingClientRect();
    const x = Math.round((e.clientX - r.left) / SNAP) * SNAP;
    const y = Math.round((e.clientY - r.top) / SNAP) * SNAP;
    createElementInParent(type, x, y, dropTarget);
  } else {
    const r = canvas.getBoundingClientRect();
    createElementOnCanvas(type, Math.round((e.clientX - r.left) / SNAP) * SNAP, Math.round((e.clientY - r.top) / SNAP) * SNAP);
  }
  saveState();
});

// ========== ELEMENT CREATION ==========
function createElementOnCanvas(type, x, y) {
  const el = document.createElement('div');
  el.classList.add('element');
  el.style.left = `${x}px`; el.style.top = `${y}px`;

  if (type === 'text') {
    const t = document.createElement('div');
    t.classList.add('text-content'); t.contentEditable = 'false'; t.innerText = 'Edit this text';
    el.appendChild(t);
  } else if (type === 'button') {
    const text = prompt('Button text:', 'Click Me') || 'Click Me';
    const action = prompt('Alert message:', 'Hello!') || 'Hello!';
    const b = document.createElement('button'); b.innerText = text; b.setAttribute('data-alert', action);
    el.appendChild(b);
  } else if (type === 'image') {
    const choice = prompt('"1" for URL, "2" to Upload:', '1');
    const img = document.createElement('img');
    el.style.width = '200px'; el.style.height = '200px';
    if (choice === '1') { img.src = prompt('Image URL:', 'https://picsum.photos/400/300') || 'https://picsum.photos/400/300'; el.appendChild(img); }
    else if (choice === '2') { el.appendChild(img); currentImageUploadTarget = img; imageUpload.click(); }
    else return;
  } else if (type === 'form') {
    el.style.width = '240px'; el.style.height = '140px';
    const f = document.createElement('form'); f.onsubmit = e => e.preventDefault();
    const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Enter email...';
    inp.addEventListener('mousedown', e => e.stopPropagation());
    const sub = document.createElement('input'); sub.type = 'submit'; sub.value = 'Subscribe';
    f.appendChild(inp); f.appendChild(sub); el.appendChild(f);
  } else if (type === 'section') {
    el.classList.add('el-section');
    el.style.width = '400px'; el.style.height = '200px';
    const lbl = document.createElement('span'); lbl.className = 'section-label'; lbl.textContent = 'Section';
    el.appendChild(lbl);
  } else if (type === 'container') {
    el.classList.add('el-container');
    el.style.width = '240px'; el.style.height = '160px';
    const lbl = document.createElement('span'); lbl.className = 'container-label'; lbl.textContent = 'Container';
    el.appendChild(lbl);
  }

  const handle = document.createElement('div'); handle.classList.add('resize-handle');
  el.appendChild(handle); canvas.appendChild(el); selectElement(el);
}

// Create element inside a parent section/container
function createElementInParent(type, x, y, parent) {
  const el = document.createElement('div');
  el.classList.add('element');
  el.style.left = `${x}px`; el.style.top = `${y}px`;

  if (type === 'text') {
    const t = document.createElement('div'); t.classList.add('text-content'); t.contentEditable = 'false'; t.innerText = 'Edit this text'; el.appendChild(t);
  } else if (type === 'button') {
    const b = document.createElement('button'); b.innerText = 'Click Me'; b.setAttribute('data-alert', 'Hello!'); el.appendChild(b);
  } else if (type === 'image') {
    const img = document.createElement('img'); img.src = 'https://picsum.photos/200/150';
    el.style.width = '160px'; el.style.height = '120px'; el.appendChild(img);
  } else if (type === 'form') {
    el.style.width = '200px'; el.style.height = '120px';
    const f = document.createElement('form'); f.onsubmit = e => e.preventDefault();
    const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Email...';
    inp.addEventListener('mousedown', e => e.stopPropagation());
    const sub = document.createElement('input'); sub.type = 'submit'; sub.value = 'Submit';
    f.appendChild(inp); f.appendChild(sub); el.appendChild(f);
  }

  const handle = document.createElement('div'); handle.classList.add('resize-handle');
  el.appendChild(handle); parent.appendChild(el); selectElement(el);
}

// ========== IMAGE UPLOAD ==========
imageUpload.addEventListener('change', function(e) {
  const file = e.target.files[0]; const imgRef = currentImageUploadTarget;
  if (file && imgRef) { const r = new FileReader(); r.onload = ev => { imgRef.src = ev.target.result; saveState(); }; r.readAsDataURL(file); }
  imageUpload.value = ''; currentImageUploadTarget = null;
});

// ========== TEXT DOUBLE-CLICK ==========
canvas.addEventListener('dblclick', e => {
  const t = e.target.closest('.text-content');
  if (t && canvas.contains(t)) {
    t.contentEditable = 'true'; t.classList.add('editing'); t.focus();
    const range = document.createRange(); range.selectNodeContents(t); range.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }
});
canvas.addEventListener('focusout', e => {
  if (e.target.classList && e.target.classList.contains('text-content')) {
    e.target.contentEditable = 'false'; e.target.classList.remove('editing');
    saveState(); updatePropertiesPanel();
  }
});
canvas.addEventListener('click', e => { const b = e.target.closest('button[data-alert]'); if (b && !isInteracting) alert(b.getAttribute('data-alert')); });

// ========== SELECT / MOVE / RESIZE ==========
function selectElement(el) {
  if (selectedElement) selectedElement.classList.remove('selected');
  selectedElement = el;
  if (el) el.classList.add('selected');
  updateFloatingToolbar(); updatePropertiesPanel(); updateLayers();
}
function updateFloatingToolbar() {
  if (!selectedElement) { floatingToolbar.classList.remove('active'); return; }
  let top = selectedElement.offsetTop - floatingToolbar.offsetHeight - 10;
  if (top < 0) top = selectedElement.offsetTop + selectedElement.offsetHeight + 10;
  floatingToolbar.style.top = `${top}px`; floatingToolbar.style.left = `${selectedElement.offsetLeft}px`;
  floatingToolbar.classList.add('active');
}
canvas.addEventListener('mousedown', e => {
  if (e.target === canvas) selectElement(null);
  // Also deselect when clicking directly on a section/container background (not on a child)
});

document.addEventListener('mousedown', e => {
  // Find the innermost .element (for nested elements inside section/container)
  const allElements = e.target.closest ? document.elementsFromPoint(e.clientX, e.clientY) : [];
  let el = null;
  for (const elem of allElements) {
    if (elem.classList && elem.classList.contains('element') && canvas.contains(elem)) {
      el = elem; break;
    }
  }
  // Fallback
  if (!el) { el = e.target.closest('.element'); if (!el || !canvas.contains(el)) return; }

  const editing = el.querySelector('.text-content.editing');
  if (editing && editing.contains(e.target)) return;
  if (e.target.tagName === 'INPUT') return;
  selectElement(el); activeElement = el; isInteracting = true; startX = e.clientX; startY = e.clientY;
  if (e.target.classList.contains('resize-handle')) { isResizing = true; const r = el.getBoundingClientRect(); initialWidth = r.width; initialHeight = r.height; e.preventDefault(); }
  else { e.preventDefault(); isResizing = false; initialLeft = el.offsetLeft; initialTop = el.offsetTop;
    // Keep element in its current parent (don't reparent nested elements to canvas)
    const parent = el.parentElement;
    if (parent) parent.appendChild(el);
  }
});

document.addEventListener('mousemove', e => {
  if (!isInteracting || !activeElement) return;
  const dx = e.clientX - startX, dy = e.clientY - startY, cr = canvas.getBoundingClientRect();
  if (isResizing) {
    let w = Math.max(Math.round((initialWidth + dx) / SNAP) * SNAP, SNAP);
    let h = Math.max(Math.round((initialHeight + dy) / SNAP) * SNAP, SNAP);
    if (activeElement.offsetLeft + w > cr.width) w = Math.floor((cr.width - activeElement.offsetLeft) / SNAP) * SNAP;
    if (activeElement.offsetTop + h > cr.height) h = Math.floor((cr.height - activeElement.offsetTop) / SNAP) * SNAP;
    activeElement.style.width = `${w}px`; activeElement.style.height = `${h}px`;
  } else {
    let l = Math.round((initialLeft + dx) / SNAP) * SNAP, t = Math.round((initialTop + dy) / SNAP) * SNAP;
    const er = activeElement.getBoundingClientRect();
    if (l < 0) l = 0; if (t < 0) t = 0;
    if (l + er.width > cr.width) l = Math.floor((cr.width - er.width) / SNAP) * SNAP;
    if (t + er.height > cr.height) t = Math.floor((cr.height - er.height) / SNAP) * SNAP;
    activeElement.style.left = `${l}px`; activeElement.style.top = `${t}px`;
  }
  updateFloatingToolbar();
});
document.addEventListener('mouseup', () => { if (isInteracting && activeElement) saveState(); setTimeout(() => { isInteracting = false; isResizing = false; activeElement = null; }, 50); });

// ========== TOOLBAR ACTIONS ==========
document.getElementById('ft-delete').addEventListener('click', () => { if (selectedElement) { selectedElement.remove(); selectElement(null); saveState(); } });
document.getElementById('ft-duplicate').addEventListener('click', () => {
  if (!selectedElement) return;
  const c = selectedElement.cloneNode(true);
  let t = selectedElement.offsetTop + SNAP, l = selectedElement.offsetLeft + SNAP;
  const cr = canvas.getBoundingClientRect();
  if (l + 50 > cr.width) l = cr.width - 80; if (t + 50 > cr.height) t = cr.height - 80;
  c.style.top = `${t}px`; c.style.left = `${l}px`; c.classList.remove('selected');
  const ct = c.querySelector('.text-content'); if (ct) { ct.contentEditable = 'false'; ct.classList.remove('editing'); }
  canvas.appendChild(c); selectElement(c); saveState();
});
document.getElementById('ft-style').addEventListener('click', () => { if (selectedElement) { const c = prompt('Background color:', '#ffffff'); if (c) { selectedElement.style.backgroundColor = c; saveState(); } } });

// ========== PROPERTIES PANEL ==========
function updatePropertiesPanel() {
  if (!selectedElement) { propsBody.innerHTML = '<p class="props-empty">Select an element to edit.</p>'; return; }
  let h = '';
  const textEl = selectedElement.querySelector(':scope > .text-content'), btnEl = selectedElement.querySelector(':scope > button'), imgEl = selectedElement.querySelector(':scope > img');
  const isSection = selectedElement.classList.contains('el-section');
  const isContainer = selectedElement.classList.contains('el-container');

  h += `<div class="prop-group"><div class="prop-label">Position</div><div class="prop-row"><input class="prop-input" id="px" type="number" value="${parseInt(selectedElement.style.left)||0}" step="20"><input class="prop-input" id="py" type="number" value="${parseInt(selectedElement.style.top)||0}" step="20"></div></div>`;
  h += `<div class="prop-group"><div class="prop-label">Size</div><div class="prop-row"><input class="prop-input" id="pw" type="number" value="${selectedElement.offsetWidth}" step="20"><input class="prop-input" id="ph" type="number" value="${selectedElement.offsetHeight}" step="20"></div></div>`;

  // Section / Container specific
  if (isSection || isContainer) {
    const cs = getComputedStyle(selectedElement);
    h += `<div class="prop-group"><div class="prop-label">Background</div><div class="prop-row"><input type="color" class="prop-color-input" id="psc" value="${rgbHex(cs.backgroundColor)}"><input class="prop-input" id="psch" value="${rgbHex(cs.backgroundColor)}"></div></div>`;
    h += `<div class="prop-group"><div class="prop-label">Padding (px)</div><input class="prop-input" id="pspad" type="number" value="${parseInt(cs.paddingLeft)||0}"></div>`;
    h += `<div class="prop-group"><div class="prop-label">Border Radius</div><input class="prop-input" id="psbr" type="number" value="${parseInt(cs.borderRadius)||8}"></div>`;
    const childCount = selectedElement.querySelectorAll(':scope > .element').length;
    h += `<div class="prop-group"><div class="prop-label">Children</div><p style="font-size:.75rem;color:#6b6b78">${childCount} nested element${childCount !== 1 ? 's' : ''}</p></div>`;
  }

  if (textEl) {
    h += `<div class="prop-group"><div class="prop-label">Content</div><input class="prop-input" id="pt" value="${textEl.innerText.replace(/"/g,'&quot;')}"></div>`;
    h += `<div class="prop-group"><div class="prop-label">Font Size</div><input class="prop-input" id="pfs" type="number" value="${parseInt(getComputedStyle(textEl).fontSize)||16}"></div>`;
    h += `<div class="prop-group"><div class="prop-label">Color</div><div class="prop-row"><input type="color" class="prop-color-input" id="pc" value="${rgbHex(getComputedStyle(textEl).color)}"><input class="prop-input" id="pch" value="${rgbHex(getComputedStyle(textEl).color)}"></div></div>`;
  }
  if (btnEl) {
    h += `<div class="prop-group"><div class="prop-label">Label</div><input class="prop-input" id="pbl" value="${btnEl.innerText.replace(/"/g,'&quot;')}"></div>`;
    h += `<div class="prop-group"><div class="prop-label">Alert</div><input class="prop-input" id="pba" value="${(btnEl.getAttribute('data-alert')||'').replace(/"/g,'&quot;')}"></div>`;
  }
  if (imgEl) { h += `<div class="prop-group"><div class="prop-label">Source</div><input class="prop-input" id="pis" value="${imgEl.src.length>80?'base64':imgEl.src}"></div>`; }

  propsBody.innerHTML = h; bindProps();
}
function bindProps() {
  const b = (id, fn) => { const e = document.getElementById(id); if (e) { e.addEventListener('input', fn); e.addEventListener('mousedown', ev => ev.stopPropagation()); } };
  b('px', e => { if (selectedElement) { selectedElement.style.left = e.target.value + 'px'; updateFloatingToolbar(); } });
  b('py', e => { if (selectedElement) { selectedElement.style.top = e.target.value + 'px'; updateFloatingToolbar(); } });
  b('pw', e => { if (selectedElement) selectedElement.style.width = e.target.value + 'px'; });
  b('ph', e => { if (selectedElement) selectedElement.style.height = e.target.value + 'px'; });
  b('pt', e => { const t = selectedElement?.querySelector('.text-content'); if (t) t.innerText = e.target.value; });
  b('pfs', e => { const t = selectedElement?.querySelector('.text-content'); if (t) t.style.fontSize = e.target.value + 'px'; });
  b('pc', e => { const t = selectedElement?.querySelector('.text-content'); if (t) t.style.color = e.target.value; const h = document.getElementById('pch'); if (h) h.value = e.target.value; });
  b('pch', e => { const t = selectedElement?.querySelector('.text-content'); if (t) t.style.color = e.target.value; const p = document.getElementById('pc'); if (p) p.value = e.target.value; });
  b('pbl', e => { const b = selectedElement?.querySelector('button'); if (b) b.innerText = e.target.value; });
  b('pba', e => { const b = selectedElement?.querySelector('button'); if (b) b.setAttribute('data-alert', e.target.value); });
  b('pis', e => { const i = selectedElement?.querySelector('img'); if (i && e.target.value !== 'base64') i.src = e.target.value; });
  // Section/Container props
  b('psc', e => { if (selectedElement) selectedElement.style.backgroundColor = e.target.value; const h = document.getElementById('psch'); if (h) h.value = e.target.value; });
  b('psch', e => { if (selectedElement) selectedElement.style.backgroundColor = e.target.value; const p = document.getElementById('psc'); if (p) p.value = e.target.value; });
  b('pspad', e => { if (selectedElement) selectedElement.style.padding = e.target.value + 'px'; });
  b('psbr', e => { if (selectedElement) selectedElement.style.borderRadius = e.target.value + 'px'; });
  document.querySelectorAll('.prop-input,.prop-color-input').forEach(i => i.addEventListener('change', () => saveState()));
}
function rgbHex(rgb) { if (rgb.startsWith('#')) return rgb; const m = rgb.match(/\d+/g); if (!m||m.length<3) return '#000000'; return '#' + m.slice(0,3).map(n=>parseInt(n).toString(16).padStart(2,'0')).join(''); }

// ========== MAIN ACTIONS ==========
function resetCanvas() {
  // 1. Remove any child from canvas that isn't part of the core structure (root-container or empty-state)
  [...canvas.children].forEach(child => {
    if (child.id !== 'root-container' && child.id !== 'empty-state' && child.id !== 'floating-toolbar') {
      child.remove();
    }
  });

  // 2. Also clear anything that might have been nested inside root-container
  const rootContainer = document.getElementById('root-container');
  if (rootContainer) {
    const label = rootContainer.querySelector('.root-label');
    rootContainer.innerHTML = '';
    if (label) rootContainer.appendChild(label);
  }

  // 3. Reset background
  canvas.style.backgroundImage = '';
  canvas.style.backgroundSize = '';
  canvas.style.backgroundPosition = '';
  canvas.style.backgroundRepeat = '';

  // 4. Reset internal state
  selectElement(null);
  activeElement = null;
  currentImageUploadTarget = null;
  isInteracting = false;
  isResizing = false;

  // 5. Update UI components
  updateFloatingToolbar();
  updatePropertiesPanel();
  updateLayers();
  updateEmptyState();

  // 6. Save State for undo/redo
  saveState();

  showToast('Canvas fully reset! 🗑️');
}

document.getElementById('btn-clear').addEventListener('click', resetCanvas);
document.getElementById('btn-preview').addEventListener('click', () => { document.body.classList.add('preview-mode'); document.getElementById('exit-preview').style.display = 'block'; selectElement(null); });
document.getElementById('exit-preview').addEventListener('click', () => { document.body.classList.remove('preview-mode'); document.getElementById('exit-preview').style.display = 'none'; });

// ========== EXPORT ==========
function genExport() {
  const c = canvas.cloneNode(true);
  c.querySelectorAll('.resize-handle').forEach(h => h.remove());
  c.querySelectorAll('.element').forEach(el => {
    el.removeAttribute('draggable'); el.style.cursor = 'default'; el.classList.remove('selected');
    const t = el.querySelector('.text-content'); if (t) { t.removeAttribute('contenteditable'); t.classList.remove('editing'); t.style.cursor = 'inherit'; }
    const sl = el.querySelector('.section-label,.container-label'); if (sl) sl.remove();
    if (el.classList.contains('el-section') || el.classList.contains('el-container')) { el.style.border = 'none'; el.style.background = 'transparent'; }
  });
  const css = `body{font-family:'Inter',sans-serif;margin:0;padding:20px;background:#f0f2f5}.canvas{position:relative;width:100%;min-height:100vh;overflow:hidden;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.05)}.element{position:absolute;border-radius:4px}.element button{padding:10px 20px;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-size:1rem;font-weight:500;width:100%;height:100%;cursor:pointer}.element img{width:100%;height:100%;object-fit:contain;display:block}.element .text-content,.element div{padding:4px;font-size:1rem;line-height:1.5;width:100%;height:100%;word-wrap:break-word}.element form{display:flex;flex-direction:column;gap:10px;width:100%;height:100%;background:#fff;padding:15px;border-radius:8px;border:1px solid #e5e7eb}.element input[type="text"]{padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;width:100%;font-family:inherit;font-size:.95rem}.element input[type="submit"]{padding:10px 12px;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-family:inherit;font-size:.95rem}`;
  const sc = `<script>document.querySelectorAll('button[data-alert]').forEach(b=>b.addEventListener('click',()=>alert(b.getAttribute('data-alert'))));<\/script>`;
  return new Blob([`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>My Website</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>${css}</style></head><body>${c.outerHTML}${sc}</body></html>`], {type:'text/html'});
}
document.getElementById('btn-download').addEventListener('click', () => {
  if (selectedElement) selectElement(null);
  const a = document.createElement('a'); a.href = URL.createObjectURL(genExport()); a.download = 'my-website.html'; a.click(); URL.revokeObjectURL(a.href);
  showToast('Exported successfully! 📦');
});
document.getElementById('btn-deploy').addEventListener('click', () => {
  if (selectedElement) selectElement(null);
  window.open(URL.createObjectURL(genExport()), '_blank');
  showToast('Deployed successfully! 🚀');
});

// ========== PARTICLES + IDLE ==========
(function() {
  const cvs = document.getElementById('particles-canvas'); if (!cvs) return;
  const ctx = cvs.getContext('2d');
  let w, h;
  const N = 50, CD = 140, IT = 4000, pts = [];
  let idleT = null, idle = false, sm = 1, tm = 1, gm = 1, tg = 1;

  function resetIdle() { if (idle) { tm = 1; tg = 1; idle = false; } clearTimeout(idleT); idleT = setTimeout(() => { idle = true; tm = 3; tg = 2.2; }, IT); }
  ['mousemove','mousedown','keydown','scroll','touchstart'].forEach(e => document.addEventListener(e, resetIdle, {passive:true}));
  resetIdle();

  function resize() { w = cvs.width = innerWidth; h = cvs.height = innerHeight; }
  addEventListener('resize', resize); resize();

  for (let i = 0; i < N; i++) pts.push({ x: Math.random()*w, y: Math.random()*h, vx: (Math.random()-.5)*.28, vy: (Math.random()-.5)*.28, r: Math.random()*1.4+.4, a: Math.random()*.22+.06 });

  function lerp(a, b, t) { return a + (b - a) * t; }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    sm = lerp(sm, tm, .012); gm = lerp(gm, tg, .012);

    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < CD) {
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(108,99,255,${(1 - d/CD) * .05 * gm})`; ctx.lineWidth = .5; ctx.stroke();
        }
      }
    }

    for (const p of pts) {
      p.x += p.vx * sm; p.y += p.vy * sm;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      const a = p.a * gm;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(108,99,255,${Math.min(a,.55)})`; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3 * gm, 0, Math.PI*2);
      ctx.fillStyle = `rgba(108,99,255,${Math.min(a*.1,.08)})`; ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

// ========== BACKGROUND TEMPLATE ==========
const bgUpload = document.createElement('input');
bgUpload.type = 'file';
bgUpload.accept = 'image/*';
bgUpload.style.display = 'none';
document.body.appendChild(bgUpload);

function applyBackgroundTemplate() {
  bgUpload.click();
}

bgUpload.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    canvas.style.backgroundImage = `url('${ev.target.result}')`;
    canvas.style.backgroundSize = 'cover';
    canvas.style.backgroundPosition = 'center';
    canvas.style.backgroundRepeat = 'no-repeat';
    saveState();
    showToast('🖼️ Background image applied!');
  };
  reader.readAsDataURL(file);
  bgUpload.value = '';
});

// Template card click
(function() {
  const bgCard = document.querySelector('.tpl-card[data-tpl="background"]');
  if (bgCard) {
    bgCard.addEventListener('click', () => {
      applyBackgroundTemplate();
    });
  }

  // Empty state "Use a Template" button — now opens background picker
  const emptyTplBtn = document.getElementById('empty-tpl-btn');
  if (emptyTplBtn) {
    emptyTplBtn.addEventListener('click', () => {
      applyBackgroundTemplate();
    });
  }
})();

// ========== AI ASSISTANT ==========
(function() {
  const toggle = document.getElementById('ai-toggle');
  const panel = document.getElementById('ai-panel');
  const closeBtn = document.getElementById('ai-close');
  const input = document.getElementById('ai-input');
  const sendBtn = document.getElementById('ai-send');
  const msgs = document.getElementById('ai-messages');

  toggle.addEventListener('click', () => panel.classList.toggle('open'));
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  function addMsg(text, type) {
    const d = document.createElement('div');
    d.className = 'ai-msg ' + type;
    d.innerHTML = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function botReply(text) {
    setTimeout(() => addMsg(text, 'ai-bot'), 400);
  }

  function getNextY() {
    let maxY = 40;
    canvas.querySelectorAll('.element').forEach(el => {
      const bottom = parseInt(el.style.top) + el.offsetHeight;
      if (bottom > maxY) maxY = bottom;
    });
    return Math.round((maxY + 20) / SNAP) * SNAP;
  }

  function processCommand(text) {
    const t = text.toLowerCase();

    if (t.includes('background') || t.includes('bg') || t.includes('wallpaper')) {
      applyBackgroundTemplate();
      botReply('✅ Choose an image from your computer to set as the background!');
    }

    else if (t.includes('heading') || t.includes('title') || t.includes('h1')) {
      const y = getNextY();
      createElementOnCanvas('text', 40, y);
      const h = canvas.lastElementChild.querySelector('.text-content');
      if (h) { h.innerText = 'Your Heading Here'; h.style.fontSize = '1.8rem'; h.style.fontWeight = '700'; }
      saveState();
      botReply('✅ Heading added! Double-click to edit the text.');
    }
    else if (t.includes('paragraph') || t.includes('para')) {
      const y = getNextY();
      createElementOnCanvas('text', 40, y);
      const p = canvas.lastElementChild.querySelector('.text-content');
      if (p) { p.innerText = 'This is a paragraph. Double-click to edit.'; p.style.fontSize = '1rem'; p.style.color = '#555'; }
      saveState();
      botReply('✅ Paragraph added!');
    }
    else if (t.includes('text')) {
      createElementOnCanvas('text', 40, getNextY());
      saveState();
      botReply('✅ Text element added! Double-click to edit.');
    }
    else if (t.includes('button') || t.includes('btn') || t.includes('cta')) {
      createElementOnCanvas('button', 40, getNextY());
      saveState();
      botReply('✅ Button created!');
    }
    else if (t.includes('image') || t.includes('img') || t.includes('photo') || t.includes('picture')) {
      const y = getNextY();
      const el = document.createElement('div');
      el.classList.add('element');
      el.style.left = '40px'; el.style.top = `${y}px`;
      el.style.width = '200px'; el.style.height = '200px';
      const img = document.createElement('img');
      img.src = 'https://picsum.photos/400/300';
      el.appendChild(img);
      const handle = document.createElement('div'); handle.classList.add('resize-handle');
      el.appendChild(handle);
      canvas.appendChild(el);
      selectElement(el);
      saveState();
      botReply('✅ Image added with placeholder! Select it to change the source in Properties.');
    }
    else if (t.includes('form') || t.includes('subscribe') || t.includes('email')) {
      createElementOnCanvas('form', 40, getNextY());
      saveState();
      botReply('✅ Form element added with email input and submit button!');
    }
    else if (t.includes('section')) {
      createElementOnCanvas('section', 40, getNextY());
      saveState();
      botReply('✅ Section container added! Drag other elements inside it.');
    }
    else if (t.includes('container') || t.includes('box') || t.includes('div')) {
      createElementOnCanvas('container', 40, getNextY());
      saveState();
      botReply('✅ Container added!');
    }
    else if (t.includes('nav') || t.includes('navbar') || t.includes('menu')) {
      const y = getNextY();
      createElementOnCanvas('section', 20, y);
      const sec = canvas.lastElementChild;
      sec.style.width = '90%'; sec.style.height = '60px';
      createElementOnCanvas('text', 40, y + 10);
      const logo = canvas.lastElementChild.querySelector('.text-content');
      if (logo) { logo.innerText = 'MySite'; logo.style.fontSize = '1.2rem'; logo.style.fontWeight = '700'; }
      saveState();
      botReply('✅ Navigation bar added with logo text!');
    }
    else if (t.includes('clear') || t.includes('reset') || t.includes('delete all')) {
      resetCanvas();
      botReply('🗑️ Canvas cleared!');
    }
    else if (t.includes('help') || t.includes('what can')) {
      botReply('I can add: <b>heading</b>, <b>paragraph</b>, <b>text</b>, <b>button</b>, <b>image</b>, <b>form</b>, <b>section</b>, <b>container</b>, <b>navbar</b>, <b>background</b>. I can also <b>clear</b> the canvas!');
    }
    else {
      botReply("🤔 I didn't understand that. Try saying something like \"add a hero section\" or \"create a button\". Type <b>help</b> for all commands.");
    }
  }

  function send() {
    const val = input.value.trim();
    if (!val) return;
    addMsg(val, 'ai-user');
    input.value = '';
    processCommand(val);
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  // Stop propagation so typing in AI input doesn't trigger builder shortcuts
  input.addEventListener('mousedown', e => e.stopPropagation());
})();
