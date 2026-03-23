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

// Sign Out
document.getElementById('btn-signout').addEventListener('click', () => window.location.href = 'login.html');

// ========== HISTORY ==========
window.addEventListener('DOMContentLoaded', () => {
  const s = localStorage.getItem('builderState');
  if (s) { restoreState(s); history.push(s); historyIndex++; } else saveState();
});
function saveState() {
  if (isRestoring) return;
  const html = canvas.innerHTML;
  if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
  history.push(html); historyIndex++;
  localStorage.setItem('builderState', html);
  updateLayers();
}
function restoreState(html) {
  isRestoring = true; canvas.innerHTML = html;
  selectedElement = null; activeElement = null;
  updateFloatingToolbar(); updatePropertiesPanel(); updateLayers();
  isRestoring = false;
}
document.getElementById('btn-undo').addEventListener('click', () => { if (historyIndex > 0) { historyIndex--; restoreState(history[historyIndex]); } });
document.getElementById('btn-redo').addEventListener('click', () => { if (historyIndex < history.length - 1) { historyIndex++; restoreState(history[historyIndex]); } });

// ========== TOAST ==========
function showToast(m) { toast.textContent = m; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2500); }

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
canvas.addEventListener('dragover', e => { e.preventDefault(); canvas.classList.add('drag-over'); });
canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over'));
canvas.addEventListener('drop', e => {
  e.preventDefault(); canvas.classList.remove('drag-over');
  const type = e.dataTransfer.getData('text/plain');
  if (!type || isInteracting) return;
  const r = canvas.getBoundingClientRect();
  createElementOnCanvas(type, Math.round((e.clientX - r.left) / SNAP) * SNAP, Math.round((e.clientY - r.top) / SNAP) * SNAP);
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
canvas.addEventListener('mousedown', e => { if (e.target === canvas) selectElement(null); });

document.addEventListener('mousedown', e => {
  const el = e.target.closest('.element'); if (!el || !canvas.contains(el)) return;
  const editing = el.querySelector('.text-content.editing');
  if (editing && editing.contains(e.target)) return;
  if (e.target.tagName === 'INPUT') return;
  selectElement(el); activeElement = el; isInteracting = true; startX = e.clientX; startY = e.clientY;
  if (e.target.classList.contains('resize-handle')) { isResizing = true; const r = el.getBoundingClientRect(); initialWidth = r.width; initialHeight = r.height; e.preventDefault(); }
  else { e.preventDefault(); isResizing = false; initialLeft = el.offsetLeft; initialTop = el.offsetTop; canvas.appendChild(el); }
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
  const textEl = selectedElement.querySelector('.text-content'), btnEl = selectedElement.querySelector('button'), imgEl = selectedElement.querySelector('img');

  h += `<div class="prop-group"><div class="prop-label">Position</div><div class="prop-row"><input class="prop-input" id="px" type="number" value="${parseInt(selectedElement.style.left)||0}" step="20"><input class="prop-input" id="py" type="number" value="${parseInt(selectedElement.style.top)||0}" step="20"></div></div>`;
  h += `<div class="prop-group"><div class="prop-label">Size</div><div class="prop-row"><input class="prop-input" id="pw" type="number" value="${selectedElement.offsetWidth}" step="20"><input class="prop-input" id="ph" type="number" value="${selectedElement.offsetHeight}" step="20"></div></div>`;

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
  document.querySelectorAll('.prop-input,.prop-color-input').forEach(i => i.addEventListener('change', () => saveState()));
}
function rgbHex(rgb) { if (rgb.startsWith('#')) return rgb; const m = rgb.match(/\d+/g); if (!m||m.length<3) return '#000000'; return '#' + m.slice(0,3).map(n=>parseInt(n).toString(16).padStart(2,'0')).join(''); }

// ========== MAIN ACTIONS ==========
document.getElementById('btn-clear').addEventListener('click', () => { if (confirm('Clear canvas?')) { canvas.innerHTML = ''; selectElement(null); saveState(); } });
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
