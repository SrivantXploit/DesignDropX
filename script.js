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
const logoutNode = document.getElementById('logoutBtn') || document.getElementById('btn-signout');
if (logoutNode) {
  logoutNode.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = 'index.html';
  });
}

// ========== HISTORY ==========
function createDefaultLayout() {
  selectElement(null);
}

window.addEventListener('DOMContentLoaded', () => {
  const s = localStorage.getItem('builderState');
  // Cache-Buster: Wipe legacy tutorial templates from local storage so the new 'drag drop done' placeholder renders immediately.
  if (s && s.includes('Start building your website')) {
    localStorage.removeItem('builderState');
    createDefaultLayout(); saveState();
  } else if (s) { 
    restoreState(s); history.push(s); historyIndex++; 
  } else { 
    createDefaultLayout(); saveState(); 
  }
});
function saveState() {
  if (isRestoring) return;
  const state = JSON.stringify({ html: canvas.innerHTML, bg: canvas.style.backgroundImage || '' });
  if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
  history.push(state); historyIndex++;
  localStorage.setItem('builderState', state);
  updateLayers(); updateCanvasState();
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
  updateFloatingToolbar(); updatePropertiesPanel(); updateLayers(); updateCanvasState();
  isRestoring = false;
}
document.getElementById('btn-undo').addEventListener('click', () => { if (historyIndex > 0) { historyIndex--; restoreState(history[historyIndex]); } });
document.getElementById('btn-redo').addEventListener('click', () => { if (historyIndex < history.length - 1) { historyIndex++; restoreState(history[historyIndex]); } });

// ========== TOAST ==========
function showToast(m) { toast.textContent = m; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2500); }

// ========== EMPTY STATE ==========
function updateCanvasState() {
  const canvas = document.getElementById("canvas");
  const placeholder = document.getElementById("placeholder");
  if (!canvas || !placeholder) return;
  const elements = canvas.querySelectorAll(".canvas-element");
  if (elements.length === 0) {
    placeholder.style.display = "flex";
  } else {
    placeholder.style.display = "none";
  }
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
    if (el.querySelector('label')) label = 'Label';
    else if (el.querySelector('textarea')) label = 'Textarea';
    else if (el.querySelector('.text-content')) label = 'Text';
    else if (el.querySelector('button')) label = 'Button';
    else if (el.querySelector('img')) label = 'Image';
    else if (el.classList.contains('el-form')) label = 'Form';
    else if (el.querySelector('input')) label = 'Input';
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
  // Highlight section/container/form drop targets
  const target = e.target.closest('.el-section, .el-container, .el-form');
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

  // Check if dropping onto a section, container, or form
  const dropTarget = e.target.closest('.el-section, .el-container, .el-form');
  // Allow forms/containers to be nested, but prevent sections from being dropped inside anything
  if (dropTarget && canvas.contains(dropTarget) && type !== 'section') {
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
  const el = document.createElement(type === 'form' ? 'form' : 'div');
  el.classList.add('element', 'canvas-element');
  el.style.left = `${x}px`; el.style.top = `${y}px`;

  if (type === 'text') {
    el.style.width = '200px'; el.style.height = '40px';
    const t = document.createElement('div');
    t.classList.add('text-content'); t.contentEditable = 'false'; t.innerText = 'Edit this text';
    el.appendChild(t);
  } else if (type === 'button') {
    el.style.width = '120px'; el.style.height = '45px';
    const b = document.createElement('button'); b.innerText = 'Click Me'; b.setAttribute('data-alert', 'Hello!');
    b.style.padding = '10px 20px';
    el.appendChild(b);
  } else if (type === 'image') {
    const img = document.createElement('img');
    el.style.width = '200px'; el.style.height = '200px';
    img.src = 'https://picsum.photos/400/300';
    el.appendChild(img);
  } else if (type === 'form') {
    el.classList.add('el-form');
    el.onsubmit = e => e.preventDefault();
    el.style.width = '300px'; el.style.height = '220px';
    el.style.display = 'flex'; el.style.flexDirection = 'column'; el.style.gap = '10px'; el.style.padding = '25px 15px 15px';
    const lbl = document.createElement('span'); lbl.className = 'form-label'; lbl.textContent = 'Form Engine'; el.appendChild(lbl);
    const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Enter email...'; inp.addEventListener('mousedown', e => e.stopPropagation()); 
    inp.style.padding = '10px'; el.appendChild(inp);
    const sub = document.createElement('input'); sub.type = 'submit'; sub.value = 'Subscribe'; 
    sub.style.padding = '10px 20px'; el.appendChild(sub);
  } else if (type === 'section') {
    el.classList.add('el-section');
    el.style.width = '400px'; el.style.height = '200px';
    el.style.padding = '40px 20px';
    const lbl = document.createElement('span'); lbl.className = 'section-label'; lbl.textContent = 'Section';
    el.appendChild(lbl);
  } else if (type === 'container') {
    el.classList.add('el-container');
    el.style.width = '240px'; el.style.height = '160px';
    el.style.padding = '20px';
    const lbl = document.createElement('span'); lbl.className = 'container-label'; lbl.textContent = 'Container';
    el.appendChild(lbl);
  } else if (type === 'label') {
    el.style.width = '120px'; el.style.height = '30px';
    const lbl = document.createElement('label'); 
    lbl.classList.add('text-content'); lbl.contentEditable = 'false'; lbl.innerText = 'Field Label';
    lbl.style.display = 'block'; lbl.style.marginBottom = '5px'; lbl.style.fontWeight = '500'; lbl.style.fontSize = '14px';
    el.appendChild(lbl);
  } else if (type === 'input') {
    const inp = document.createElement('input'); 
    inp.type = 'text'; inp.placeholder = 'Enter value...'; 
    inp.addEventListener('mousedown', e => e.stopPropagation());
    inp.style.padding = '10px';
    el.style.width = '200px'; el.style.height = '40px';
    el.appendChild(inp);
  } else if (type === 'textarea') {
    const ta = document.createElement('textarea'); 
    ta.placeholder = 'Type your message...'; 
    ta.addEventListener('mousedown', e => e.stopPropagation());
    ta.style.padding = '10px';
    el.style.width = '200px'; el.style.height = '100px';
    el.appendChild(ta);
  }

  const handle = document.createElement('div'); handle.classList.add('resize-handle');
  el.appendChild(handle); canvas.appendChild(el); selectElement(el);
}

// Create element inside a parent section/container
function createElementInParent(type, x, y, parent) {
  const el = document.createElement(type === 'form' ? 'form' : 'div');
  el.classList.add('element', 'canvas-element');
  el.style.left = `${x}px`; el.style.top = `${y}px`;

  if (type === 'text') {
    el.style.width = '200px'; el.style.height = '40px';
    const t = document.createElement('div'); t.classList.add('text-content'); t.contentEditable = 'false'; t.innerText = 'Edit this text'; el.appendChild(t);
  } else if (type === 'button') {
    el.style.width = '120px'; el.style.height = '45px';
    const b = document.createElement('button'); b.innerText = 'Click Me'; b.setAttribute('data-alert', 'Hello!'); 
    b.style.padding = '10px 20px'; el.appendChild(b);
  } else if (type === 'image') {
    const img = document.createElement('img'); img.src = 'https://picsum.photos/200/150';
    el.style.width = '160px'; el.style.height = '120px'; el.appendChild(img);
  } else if (type === 'form') {
    el.classList.add('el-form');
    el.onsubmit = e => e.preventDefault();
    el.style.width = '300px'; el.style.height = '220px';
    el.style.display = 'flex'; el.style.flexDirection = 'column'; el.style.gap = '10px'; el.style.padding = '25px 15px 15px';
    const lbl = document.createElement('span'); lbl.className = 'form-label'; lbl.textContent = 'Form Engine'; el.appendChild(lbl);
    const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Email...'; inp.addEventListener('mousedown', e => e.stopPropagation()); 
    inp.style.padding = '10px'; el.appendChild(inp);
    const sub = document.createElement('input'); sub.type = 'submit'; sub.value = 'Submit'; 
    sub.style.padding = '10px 20px'; el.appendChild(sub);
  } else if (type === 'container') {
    el.classList.add('el-container');
    el.style.width = '240px'; el.style.height = '160px';
    el.style.padding = '20px';
    const lbl = document.createElement('span'); lbl.className = 'container-label'; lbl.textContent = 'Container';
    el.appendChild(lbl);
  } else if (type === 'section') {
    el.classList.add('el-section');
    el.style.width = '300px'; el.style.height = '200px';
    el.style.padding = '40px 20px';
    const lbl = document.createElement('span'); lbl.className = 'section-label'; lbl.textContent = 'Section';
    el.appendChild(lbl);
  } else if (type === 'label') {
    el.style.width = '120px'; el.style.height = '30px';
    const lbl = document.createElement('label'); 
    lbl.classList.add('text-content'); lbl.contentEditable = 'false'; lbl.innerText = 'Field Label';
    lbl.style.display = 'block'; lbl.style.marginBottom = '5px'; lbl.style.fontWeight = '500'; lbl.style.fontSize = '14px';
    el.appendChild(lbl);
  } else if (type === 'input') {
    const inp = document.createElement('input'); 
    inp.type = 'text'; inp.placeholder = 'Enter value...'; 
    inp.addEventListener('mousedown', e => e.stopPropagation());
    inp.style.padding = '10px';
    el.style.width = '180px'; el.style.height = '40px';
    el.appendChild(inp);
  } else if (type === 'textarea') {
    const ta = document.createElement('textarea'); 
    ta.placeholder = 'Type your message...'; 
    ta.addEventListener('mousedown', e => e.stopPropagation());
    ta.style.padding = '10px';
    el.style.width = '180px'; el.style.height = '80px';
    el.appendChild(ta);
  }

  const handle = document.createElement('div'); handle.classList.add('resize-handle');
  el.appendChild(handle); parent.appendChild(el); 
  if(parent.style.display === 'flex' || parent.style.display === 'grid') {
    el.style.position = 'relative'; el.style.left = '0'; el.style.top = '0';
  }
  selectElement(el);
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
  if (document.body.classList.contains('preview-mode')) return;
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
    // If it is in a flex/grid container, lock its relative positioning to strictly adhere to box-mode alignment rules.
    const pDisp = activeElement.parentElement ? getComputedStyle(activeElement.parentElement).display : '';
    const inlineDisp = activeElement.parentElement ? activeElement.parentElement.style.display : '';
    if (inlineDisp === 'flex' || inlineDisp === 'grid' || pDisp === 'flex' || pDisp === 'grid') return;

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
  h += `<div class="prop-group"><div class="prop-label">Size (px, %, auto)</div>
          <div class="prop-row" style="margin-bottom:8px">
            <input class="prop-input" id="pw" type="text" placeholder="W" value="${selectedElement.style.width || selectedElement.offsetWidth+'px'}">
            <input class="prop-input" id="ph" type="text" placeholder="H" value="${selectedElement.style.height || selectedElement.offsetHeight+'px'}">
          </div>
          <div class="prop-row">
            <input class="prop-input" id="pmaxw" type="text" placeholder="Max-W" value="${selectedElement.style.maxWidth || ''}">
            <label style="font-size:0.8rem;color:#e4e4e7;display:flex;align-items:center;gap:6px;width:100%;"><input type="checkbox" id="pmxauto" ${selectedElement.style.marginLeft==='auto'&&selectedElement.style.marginRight==='auto'?'checked':''}> Center Box</label>
          </div>
        </div>`;

  // Section / Container specific
  if (isSection || isContainer) {
    const cs = getComputedStyle(selectedElement);
    const disp = selectedElement.style.display || cs.display;
    
    h += `<div class="prop-group"><div class="prop-label">Layout</div>
            <select class="prop-input" id="p-disp" style="margin-bottom:8px">
              <option value="block" ${disp==='block'?'selected':''}>Block (Free)</option>
              <option value="flex" ${disp==='flex'?'selected':''}>Flex</option>
              <option value="grid" ${disp==='grid'?'selected':''}>Grid</option>
            </select>`;
    
    if (disp === 'flex') {
      const fd = selectedElement.style.flexDirection || cs.flexDirection;
      const jc = selectedElement.style.justifyContent || cs.justifyContent;
      const ai = selectedElement.style.alignItems || cs.alignItems;
      h += `<div class="prop-row" style="margin-bottom:8px">
              <select class="prop-input" id="p-fdir"><option value="row" ${fd==='row'?'selected':''}>Row</option><option value="column" ${fd==='column'?'selected':''}>Column</option></select>
            </div>
            <div class="prop-row" style="margin-top:8px">
              <select class="prop-input" id="p-jc"><option value="flex-start" ${jc==='flex-start'?'selected':''}>Start</option><option value="center" ${jc==='center'?'selected':''}>Center</option><option value="space-between" ${jc==='space-between'?'selected':''}>Spc Btn</option></select>
            </div>
            <div class="prop-row" style="margin-top:8px">
              <select class="prop-input" id="p-ai"><option value="flex-start" ${ai==='flex-start'?'selected':''}>Start</option><option value="center" ${ai==='center'?'selected':''}>Center</option><option value="stretch" ${ai==='stretch'?'selected':''}>Stretch</option></select>
            </div>`;
    } else if (disp === 'grid') {
      const cols = (selectedElement.style.gridTemplateColumns || cs.gridTemplateColumns).split(' ').length || 2;
      h += `<div class="prop-row" style="margin-top:8px"><input class="prop-input" id="p-gcol" type="number" min="1" max="12" value="${cols}"> <span style="font-size:0.75rem;color:#a1a1aa;align-self:center;">Columns</span></div>`;
    }
    h += `</div>`;

    h += `<div class="prop-group">
            <div class="prop-label" style="color:#60a5fa;display:flex;align-items:center;gap:5px">
              <div style="width:8px;height:8px;background:#60a5fa;border-radius:2px"></div> PADDING
            </div>
            <div class="prop-row" style="margin-bottom:8px">
              <input class="prop-input" id="p-ptop" type="text" placeholder="Top" value="${selectedElement.style.paddingTop || cs.paddingTop}">
              <input class="prop-input" id="p-prgt" type="text" placeholder="Right" value="${selectedElement.style.paddingRight || cs.paddingRight}">
            </div>
            <div class="prop-row" style="margin-bottom:16px">
              <input class="prop-input" id="p-pbot" type="text" placeholder="Bottom" value="${selectedElement.style.paddingBottom || cs.paddingBottom}">
              <input class="prop-input" id="p-plft" type="text" placeholder="Left" value="${selectedElement.style.paddingLeft || cs.paddingLeft}">
            </div>
            <div class="prop-label" style="color:#fb923c;display:flex;align-items:center;gap:5px">
              <div style="width:8px;height:8px;background:#fb923c;border-radius:2px"></div> MARGIN
            </div>
            <div class="prop-row" style="margin-bottom:8px">
              <input class="prop-input" id="p-mtop" type="text" placeholder="Top" value="${selectedElement.style.marginTop || cs.marginTop}">
              <input class="prop-input" id="p-mrgt" type="text" placeholder="Right" value="${selectedElement.style.marginRight || cs.marginRight}">
            </div>
            <div class="prop-row">
              <input class="prop-input" id="p-mbot" type="text" placeholder="Bottom" value="${selectedElement.style.marginBottom || cs.marginBottom}">
              <input class="prop-input" id="p-mlft" type="text" placeholder="Left" value="${selectedElement.style.marginLeft || cs.marginLeft}">
            </div>
          </div>`;

    h += `<div class="prop-group"><div class="prop-label">Background</div>
            <div class="prop-row" style="margin-bottom:8px"><input type="color" class="prop-color-input" id="psc" value="${rgbHex(selectedElement.style.backgroundColor || cs.backgroundColor)}"><input class="prop-input" id="psch" value="${rgbHex(selectedElement.style.backgroundColor || cs.backgroundColor)}"></div>
            <div class="prop-row"><input class="prop-input" id="p-bgimg" type="text" placeholder="Image URL (e.g. url(...))" value="${(selectedElement.style.backgroundImage || cs.backgroundImage).replace(/"/g, '&quot;')}"></div>
          </div>`;

    h += `<div class="prop-group"><div class="prop-label">Borders</div>
            <div class="prop-row" style="margin-bottom:8px"><input class="prop-input" id="psbr" type="text" placeholder="Radius (e.g. 8px)" value="${selectedElement.style.borderRadius || cs.borderRadius}"></div>
            <div class="prop-row">
              <input class="prop-input" id="p-bdw" type="text" placeholder="Width" value="${selectedElement.style.borderWidth || cs.borderWidth}">
              <input type="color" class="prop-color-input" id="p-bdc" value="${rgbHex(selectedElement.style.borderColor || cs.borderColor)}">
            </div>
          </div>`;

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
    h += `<div class="prop-group"><div class="prop-label">Alert Action</div><input class="prop-input" id="pba" placeholder="Optional" value="${(btnEl.getAttribute('data-alert')||'').replace(/"/g,'&quot;')}"></div>`;
    h += `<div class="prop-group"><div class="prop-label">Action Type</div><select class="prop-input" id="pbty"><option value="button" ${btnEl.type!=='submit'?'selected':''}>Normal Button</option><option value="submit" ${btnEl.type==='submit'?'selected':''}>Submit Form</option></select></div>`;
  }
  if (imgEl) { h += `<div class="prop-group"><div class="prop-label">Source</div><div class="prop-row"><input class="prop-input" id="pis" value="${imgEl.src.length>80?'base64':imgEl.src}"><button id="pimg-btn" class="prop-input" style="width:auto;cursor:pointer;background:rgba(108,99,255,0.1);color:#a78bfa;border-color:rgba(108,99,255,0.3);padding:7px 12px;font-weight:600;">Upload</button></div></div>`; }

  const inputEl = selectedElement.querySelector(':scope > input');
  const textareaEl = selectedElement.querySelector(':scope > textarea');
  const labelEl = selectedElement.querySelector(':scope > label');
  
  if (inputEl) {
    h += `<div class="prop-group"><div class="prop-label">Placeholder</div><input class="prop-input" id="pinpph" value="${inputEl.placeholder?inputEl.placeholder.replace(/"/g,'&quot;'):''}"></div>`;
    h += `<div class="prop-group"><div class="prop-label">Input Type</div><select class="prop-input" id="pinpty"><option value="text" ${!inputEl.type||inputEl.type==='text'?'selected':''}>Text</option><option value="email" ${inputEl.type==='email'?'selected':''}>Email</option><option value="password" ${inputEl.type==='password'?'selected':''}>Password</option></select></div>`;
  }
  if (textareaEl) {
    h += `<div class="prop-group"><div class="prop-label">Placeholder</div><input class="prop-input" id="ptaph" value="${textareaEl.placeholder?textareaEl.placeholder.replace(/"/g,'&quot;'):''}"></div>`;
  }
  if (inputEl || textareaEl) {
    const ctrl = inputEl || textareaEl;
    h += `<div class="prop-group"><div class="prop-label">Element ID</div><input class="prop-input" id="pelid" placeholder="my-input" value="${ctrl.id}"></div>`;
    h += `<div class="prop-group"><div class="prop-label">Validation</div><label style="font-size:0.8rem;color:#e4e4e7;display:flex;align-items:center;gap:6px"><input type="checkbox" id="preq" ${ctrl.required?'checked':''}> Required Field</label></div>`;
  }
  if (labelEl) {
    h += `<div class="prop-group"><div class="prop-label">Text</div><input class="prop-input" id="plbltxt" value="${labelEl.innerText.replace(/"/g,'&quot;')}"></div>`;
    h += `<div class="prop-group"><div class="prop-label">For (Input ID)</div><input class="prop-input" id="plblfor" placeholder="my-input" value="${labelEl.htmlFor}"></div>`;
  }

  propsBody.innerHTML = h; bindProps();
}
function bindProps() {
  const b = (id, fn) => { const e = document.getElementById(id); if (e) { e.addEventListener('input', fn); e.addEventListener('mousedown', ev => ev.stopPropagation()); } };
  b('px', e => { if (selectedElement) { selectedElement.style.left = e.target.value + 'px'; updateFloatingToolbar(); } });
  b('py', e => { if (selectedElement) { selectedElement.style.top = e.target.value + 'px'; updateFloatingToolbar(); } });
  b('pw', e => { if (selectedElement) { let v = e.target.value; if(v && !isNaN(v)) v+='px'; selectedElement.style.width = v; } });
  b('ph', e => { if (selectedElement) { let v = e.target.value; if(v && !isNaN(v)) v+='px'; selectedElement.style.height = v; } });
  b('pmaxw', e => { if (selectedElement) { let v = e.target.value; if(v && !isNaN(v)) v+='px'; selectedElement.style.maxWidth = v; } });
  const pmxauto = document.getElementById('pmxauto');
  if (pmxauto) pmxauto.addEventListener('change', e => { 
    if (selectedElement) { 
      if (e.target.checked) { selectedElement.style.marginLeft = 'auto'; selectedElement.style.marginRight = 'auto'; } 
      else { selectedElement.style.marginLeft = '0'; selectedElement.style.marginRight = '0'; } 
      saveState(); 
    } 
  });
  b('pt', e => { const t = selectedElement?.querySelector('.text-content'); if (t) t.innerText = e.target.value; });
  b('pfs', e => { const t = selectedElement?.querySelector('.text-content'); if (t) t.style.fontSize = e.target.value + 'px'; });
  b('pc', e => { const t = selectedElement?.querySelector('.text-content'); if (t) t.style.color = e.target.value; const h = document.getElementById('pch'); if (h) h.value = e.target.value; });
  b('pch', e => { const t = selectedElement?.querySelector('.text-content'); if (t) t.style.color = e.target.value; const p = document.getElementById('pc'); if (p) p.value = e.target.value; });
  b('pbl', e => { const b = selectedElement?.querySelector('button'); if (b) b.innerText = e.target.value; });
  b('pba', e => { const b = selectedElement?.querySelector('button'); if (b) b.setAttribute('data-alert', e.target.value); });
  b('pis', e => { const i = selectedElement?.querySelector('img'); if (i && e.target.value !== 'base64') i.src = e.target.value; });
  const pimgBtn = document.getElementById('pimg-btn');
  if (pimgBtn) pimgBtn.addEventListener('click', () => { currentImageUploadTarget = selectedElement?.querySelector('img'); imageUpload.click(); });
  
  b('pinpph', e => { const i = selectedElement?.querySelector('input'); if (i) i.placeholder = e.target.value; });
  b('pinpty', e => { const i = selectedElement?.querySelector('input'); if (i) i.type = e.target.value; });
  b('ptaph', e => { const t = selectedElement?.querySelector('textarea'); if (t) t.placeholder = e.target.value; });
  b('pelid', e => { const c = selectedElement?.querySelector('input, textarea'); if (c) c.id = e.target.value; });
  const preq = document.getElementById('preq');
  if (preq) preq.addEventListener('change', e => { const c = selectedElement?.querySelector('input, textarea'); if (c) c.required = e.target.checked; saveState(); });
  b('plbltxt', e => { const l = selectedElement?.querySelector('label'); if (l) l.innerText = e.target.value; });
  b('plblfor', e => { const l = selectedElement?.querySelector('label'); if (l) l.htmlFor = e.target.value; });

  // Section/Container props
  b('psc', e => { if (selectedElement) selectedElement.style.backgroundColor = e.target.value; const h = document.getElementById('psch'); if (h) h.value = e.target.value; });
  b('psch', e => { if (selectedElement) selectedElement.style.backgroundColor = e.target.value; const p = document.getElementById('psc'); if (p) p.value = e.target.value; });
  b('p-bgimg', e => { if (selectedElement) { let v = e.target.value; if(v && !v.startsWith('url(')) v = `url(${v})`; selectedElement.style.backgroundImage = v; selectedElement.style.backgroundSize = 'cover'; } });
  b('psbr', e => { if (selectedElement) { let v = e.target.value; if(v && !isNaN(v)) v+='px'; selectedElement.style.borderRadius = v; } });
  b('p-bdw', e => { if (selectedElement) { let v = e.target.value; if(v && !isNaN(v)) v+='px'; selectedElement.style.borderWidth = v; selectedElement.style.borderStyle = 'solid'; } });
  b('p-bdc', e => { if (selectedElement) { selectedElement.style.borderColor = e.target.value; selectedElement.style.borderStyle = 'solid'; } });

  b('p-disp', e => { 
    if (selectedElement) { 
      const disp = e.target.value; selectedElement.style.display = disp; 
      if(disp==='grid') selectedElement.style.gridTemplateColumns = 'repeat(2, 1fr)'; 
      Array.from(selectedElement.children).forEach(c => {
        if(c.classList.contains('element')) { c.style.position = disp === 'block' ? 'absolute' : 'relative'; if(disp !== 'block') { c.style.left = '0'; c.style.top = '0'; } }
      });
      updatePropertiesPanel(); 
    } 
  });
  b('p-fdir', e => { if (selectedElement) selectedElement.style.flexDirection = e.target.value; });
  b('p-jc', e => { if (selectedElement) selectedElement.style.justifyContent = e.target.value; });
  b('p-ai', e => { if (selectedElement) selectedElement.style.alignItems = e.target.value; });
  b('p-gcol', e => { if (selectedElement) selectedElement.style.gridTemplateColumns = `repeat(${e.target.value}, 1fr)`; });

  b('p-ptop', e => { if (selectedElement) { let v=e.target.value; if(v&&!isNaN(v)) v+='px'; selectedElement.style.paddingTop = v; } });
  b('p-prgt', e => { if (selectedElement) { let v=e.target.value; if(v&&!isNaN(v)) v+='px'; selectedElement.style.paddingRight = v; } });
  b('p-pbot', e => { if (selectedElement) { let v=e.target.value; if(v&&!isNaN(v)) v+='px'; selectedElement.style.paddingBottom = v; } });
  b('p-plft', e => { if (selectedElement) { let v=e.target.value; if(v&&!isNaN(v)) v+='px'; selectedElement.style.paddingLeft = v; } });

  b('p-mtop', e => { if (selectedElement) { let v=e.target.value; if(v&&!isNaN(v)) v+='px'; selectedElement.style.marginTop = v; } });
  b('p-mrgt', e => { if (selectedElement) { let v=e.target.value; if(v&&!isNaN(v)) v+='px'; selectedElement.style.marginRight = v; } });
  b('p-mbot', e => { if (selectedElement) { let v=e.target.value; if(v&&!isNaN(v)) v+='px'; selectedElement.style.marginBottom = v; } });
  b('p-mlft', e => { if (selectedElement) { let v=e.target.value; if(v&&!isNaN(v)) v+='px'; selectedElement.style.marginLeft = v; } });
  document.querySelectorAll('.prop-input,.prop-color-input').forEach(i => i.addEventListener('change', () => saveState()));
}
function rgbHex(rgb) { if (rgb.startsWith('#')) return rgb; const m = rgb.match(/\d+/g); if (!m||m.length<3) return '#000000'; return '#' + m.slice(0,3).map(n=>parseInt(n).toString(16).padStart(2,'0')).join(''); }

// ========== MAIN ACTIONS ==========
function resetCanvas() {
  // 1. Remove any child from canvas that isn't part of the core structure
  [...canvas.children].forEach(child => {
    if (child.id !== 'root-container' && child.id !== 'floating-toolbar') {
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
  updateCanvasState();

  // 6. Save State for undo/redo
  saveState();

  showToast('Canvas fully reset! 🗑️');
}

document.getElementById('btn-clear').addEventListener('click', resetCanvas);
document.getElementById('btn-preview').addEventListener('click', () => { document.body.classList.add('preview-mode'); document.getElementById('exit-preview').style.display = 'block'; selectElement(null); });
document.getElementById('exit-preview').addEventListener('click', () => { document.body.classList.remove('preview-mode'); document.getElementById('exit-preview').style.display = 'none'; });

// ========== EXPORT ==========
function exportCleanHTML() {
  const canvas = document.getElementById("canvas").cloneNode(true);
  
  const placeholder = canvas.querySelector("#placeholder");
  if (placeholder) placeholder.remove();
  
  canvas.querySelectorAll(".selected, .dragging").forEach(el => {
    el.classList.remove("selected", "dragging");
  });

  canvas.querySelectorAll('.resize-handle').forEach(h => h.remove());
  const ftbar = canvas.querySelector('#floating-toolbar');
  if (ftbar) ftbar.remove();

  const elements = canvas.querySelectorAll('.canvas-element');
  if (elements.length === 0 && !canvas.style.backgroundImage) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Empty Site</title></head><body style="margin:0;padding:0;background:#fff;"></body></html>`;
  }

  canvas.querySelectorAll('.canvas-element').forEach(el => {
    el.removeAttribute('draggable'); el.style.cursor = 'default';
    const t = el.querySelector('.text-content'); if (t) { t.removeAttribute('contenteditable'); t.classList.remove('editing'); t.style.cursor = 'inherit'; }
    const sl = el.querySelector('.section-label,.container-label'); if (sl) sl.remove();
    if (el.classList.contains('el-section') || el.classList.contains('el-container')) { el.style.border = 'none'; el.style.background = 'transparent'; }
    
    // Re-enable interactivity disabled during editor mode
    const interactables = el.querySelectorAll('button, input, textarea');
    interactables.forEach(i => i.style.pointerEvents = 'auto');
    
    // Wire Forms to native mailto: since third-party APIs block local blob: Origins
    if (el.tagName === 'FORM') {
      const inputs = el.querySelectorAll('input, textarea');
      inputs.forEach((inp, idx) => {
        if (!inp.name) inp.name = inp.placeholder || inp.type || ('field_' + idx);
      });
      el.removeAttribute('action');
      el.removeAttribute('method');
    }
  });
  const css = `body{font-family:'Inter',sans-serif;margin:0;padding:0;background:#f0f2f5}.canvas{position:relative;width:100%;min-height:100vh;overflow:hidden;background:#fff;}.canvas-element{position:absolute;border-radius:4px;box-sizing:border-box}.canvas-element button{padding:10px 20px;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-size:1rem;font-weight:500;width:100%;height:100%;cursor:pointer}.canvas-element img{width:100%;height:100%;object-fit:contain;display:block}.canvas-element .text-content,.canvas-element div{padding:4px;font-size:1rem;line-height:1.5;width:100%;height:100%;word-wrap:break-word}.canvas-element form{display:flex;flex-direction:column;gap:10px;width:100%;height:100%;background:#fff;padding:15px;border-radius:8px;border:1px solid #e5e7eb}.canvas-element input, .canvas-element textarea{padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;width:100%;height:100%;font-family:inherit;font-size:.95rem;box-sizing:border-box}`;
  const sc = `<script>
      document.querySelectorAll('button[data-alert]').forEach(b=>b.addEventListener('click',()=>alert(b.getAttribute('data-alert'))));
      document.querySelectorAll('.el-form').forEach(f=>f.addEventListener('submit',e=>{
        e.preventDefault();
        let bodyText = "New submission:\\n\\n";
        f.querySelectorAll('input:not([type="hidden"]), textarea').forEach(inp => {
          bodyText += (inp.name || "Field") + ": " + inp.value + "\\n";
        });
        alert('Opening your email client to send this subscription to the site owner!');
        window.location.href = 'mailto:mandarapusrivant@gmail.com?subject=New Website Subscription&body=' + encodeURIComponent(bodyText);
      }));
    <\/script>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Deployed Site</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>${css}</style></head><body>${canvas.outerHTML}${sc}</body></html>`;
}
function genExport() { return new Blob([exportCleanHTML()], {type:'text/html'}); }
document.getElementById('btn-download').addEventListener('click', () => {
  if (selectedElement) selectElement(null);
  const a = document.createElement('a'); a.href = URL.createObjectURL(genExport()); a.download = 'index.html'; a.click(); URL.revokeObjectURL(a.href);
  showToast('Exported successfully! 📦');
});
function showDeployModal() {
  let modal = document.getElementById('deploy-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'deploy-modal';
    modal.className = 'tpl-modal';
    
    modal.innerHTML = `
      <div class="tpl-modal-card" style="text-align: center; max-width: 420px; padding: 40px 32px;">
        <div style="font-size: 3.5rem; margin-bottom: 20px; animation: fadeUp 0.5s ease;">🚀</div>
        <h3 style="font-size:1.5rem; margin-bottom: 12px; color:#fff; font-weight:700;">Your website is live!</h3>
        <p style="font-size:0.95rem; color:#a1a1aa; margin-bottom: 30px; line-height:1.5;">Anyone can now access your site using this link:</p>
        
        <div style="display:flex; align-items:center; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:6px; margin-bottom:32px; transition:border-color 0.2s;">
          <input type="text" id="deploy-url" readonly style="flex:1; background:transparent; border:none; color:#e4e4e7; font-family:'Inter',sans-serif; font-size:0.9rem; outline:none; padding-left:12px; min-width:0;">
          <button id="btn-copy-url" style="background:rgba(108,99,255,0.15); color:#a78bfa; border:none; border-radius:8px; padding:8px 16px; font-weight:600; cursor:pointer; font-size:0.85rem; transition:all 0.2s;">Copy</button>
        </div>
        
        <div class="tpl-modal-actions" style="justify-content: center;">
          <button id="btn-close-deploy" style="background:linear-gradient(135deg,#6c63ff,#4f46e5); color:#fff; border:none; border-radius:10px; padding:12px 32px; font-weight:600; cursor:pointer; font-size:1rem; width:100%; box-shadow:0 4px 20px rgba(108,99,255,0.3); transition:all 0.2s;">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const copyBtn = document.getElementById('btn-copy-url');
    copyBtn.addEventListener('click', () => {
      const urlInput = document.getElementById('deploy-url');
      urlInput.select();
      navigator.clipboard.writeText(urlInput.value).catch(err => {
        // Fallback
        document.execCommand('copy');
      });
      copyBtn.innerText = 'Copied!';
      copyBtn.style.background = 'rgba(16,185,129,0.15)';
      copyBtn.style.color = '#10b981';
      setTimeout(() => {
        copyBtn.innerText = 'Copy';
        copyBtn.style.background = 'rgba(108,99,255,0.15)';
        copyBtn.style.color = '#a78bfa';
      }, 2000);
      showToast('URL Copied! 🔗');
    });

    document.getElementById('btn-close-deploy').addEventListener('click', () => {
      modal.classList.remove('open');
      const html = exportCleanHTML();
      // Use window.open() to create a new tab
      const newWin = window.open('', '_blank');
      if (newWin) {
        // Write the canvas content into the new tab document
        newWin.document.open();
        newWin.document.write(html);
        newWin.document.close();
      } else {
        // Auto Redirect Alternative: If new tab is not used (blocked), replace current page content with the built site
        document.open();
        document.write(html);
        document.close();
      }
    });
    
    const closeBtn = document.getElementById('btn-close-deploy');
    closeBtn.addEventListener('mouseover', () => closeBtn.style.transform = 'translateY(-2px)');
    closeBtn.addEventListener('mouseout', () => closeBtn.style.transform = 'translateY(0)');
  }
  
  const randNum = Math.floor(Math.random() * 900) + 100;
  document.getElementById('deploy-url').value = `https://designdropx.site/demo${randNum}`;
  
  modal.classList.add('open');
}

document.getElementById('btn-deploy').addEventListener('click', () => {
  if (selectedElement) selectElement(null);
  showDeployModal();
});

// ========== SUPABASE PROJECT PERSISTENCE ==========
const btnSave = document.getElementById('btn-save');
const btnLoad = document.getElementById('btn-load');

if (btnSave) {
  btnSave.addEventListener('click', async () => {
    if (selectedElement) selectElement(null);
    showToast('Saving to Supabase...');
    try {
      const clone = canvas.cloneNode(true);
      const p = clone.querySelector('#placeholder');
      if (p) p.remove();
      clone.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
      
      const payload = JSON.stringify({ html: clone.innerHTML, bg: canvas.style.backgroundImage || '' });
      const { error } = await supabaseClient.from('projects').insert([{ content: payload }]);
      if (error) throw error;
      showToast('Project saved successfully! 💾');
    } catch(err) {
      console.error('Save error:', err);
      showToast('Error saving project!');
    }
  });
}

if (btnLoad) {
  btnLoad.addEventListener('click', async () => {
    showToast('Loading from Supabase...');
    try {
      const { data, error } = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false }).limit(1);
      if (error) throw error;
      if (data && data.length > 0) {
        const pBack = canvas.querySelector('#placeholder');
        const s = data[0].content;
        let html = s, bg = '';
        try {
          const parsed = JSON.parse(s);
          if (parsed && typeof parsed === 'object' && parsed.html !== undefined) { 
            html = parsed.html; bg = parsed.bg || ''; 
          }
        } catch(e) {}
        
        canvas.innerHTML = html;
        if (pBack && !canvas.querySelector('#placeholder')) {
           canvas.appendChild(pBack);
        }
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
        updateFloatingToolbar(); updatePropertiesPanel(); updateLayers(); updateCanvasState(); saveState();
        showToast('Project loaded! ☁️');
      } else {
        showToast('No saved projects found.');
      }
    } catch(err) {
      console.error('Load error:', err);
      showToast('Error loading project!');
    }
  });
}

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

// ========== BUILDER MICRO-IMPROVEMENTS (Device Switcher & Canvas Props) ==========
(function() {
  // --- Device Switcher ---
  const dsBtns = document.querySelectorAll('.ds-btn');
  const dsLabel = document.getElementById('ds-label');
  const canvasWrap = document.getElementById('canvas-wrapper');

  dsBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      dsBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update canvas wrapper class for CSS responsive scaling
      const device = btn.getAttribute('data-device');
      canvasWrap.className = 'canvas-wrap'; // reset
      if (device === 'desktop') {
         canvasWrap.classList.add('device-desktop');
         dsLabel.textContent = '100%';
      } else if (device === 'tablet') {
         canvasWrap.classList.add('device-tablet');
         dsLabel.textContent = '768px';
      } else if (device === 'mobile') {
         canvasWrap.classList.add('device-mobile');
         dsLabel.textContent = '375px';
      }
    });
  });

  // --- Canvas Properties ---
  const bgColorInput = document.getElementById('canvas-bg-color');
  const bgHexInput = document.getElementById('canvas-bg-hex');
  const bgImgInput = document.getElementById('canvas-bg-img');
  const gridToggle = document.getElementById('canvas-grid-toggle');
  const bgResetBtn = document.getElementById('canvas-bg-reset');

  if (bgColorInput && bgHexInput) {
    bgColorInput.addEventListener('input', (e) => {
      canvas.style.backgroundColor = e.target.value;
      bgHexInput.value = e.target.value;
      saveState();
    });
    bgHexInput.addEventListener('change', (e) => {
      canvas.style.backgroundColor = e.target.value;
      bgColorInput.value = rgbHex(e.target.value);
      saveState();
    });
  }

  if (bgImgInput) {
    bgImgInput.addEventListener('change', (e) => {
      let v = e.target.value;
      if (v && !v.startsWith('url(')) v = "url('" + v + "')";
      canvas.style.backgroundImage = v;
      canvas.style.backgroundSize = 'cover';
      canvas.style.backgroundPosition = 'center';
      saveState();
    });
  }

  if (gridToggle) {
    gridToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        canvasWrap.classList.remove('no-grid');
      } else {
        canvasWrap.classList.add('no-grid');
      }
    });
  }

  if (bgResetBtn) {
    bgResetBtn.addEventListener('click', () => {
      canvas.style.backgroundColor = '#ffffff';
      canvas.style.backgroundImage = '';
      if (bgColorInput) bgColorInput.value = '#ffffff';
      if (bgHexInput) bgHexInput.value = '#ffffff';
      if (bgImgInput) bgImgInput.value = '';
      saveState();
    });
  }
})();

// ========== PROJECT NAME FROM ONBOARDING ==========
(function() {
  const savedName = localStorage.getItem('project_name');
  const projectEl = document.querySelector('.nav-project');
  if (savedName && projectEl) {
    projectEl.textContent = savedName;
  }
})();
