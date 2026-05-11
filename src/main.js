// PageSmith v0.4 — browser owns DOM, engine owns source
// Text edits: browser handles DOM (cursor preserved natively).
// Engine synced async on each edit (no DOM re-render).
// Formatting: engine patch → re-render with node-path cursor restore.
// Constitution E1: engine is source of truth for SAVE, DOM is live editing view.

import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

// ── State ──

let currentFilePath = null;
let isDirty = false;
let editMode = 'visual';
let composing = false; // IME composition guard
let pendingSync = null; // Debounce timer for engine sync
let zoomLevel = 100; // Zoom percent, step 10

// ── DOM refs ──

const emptyState = document.getElementById('empty-state');
const editorView = document.getElementById('editor-view');
const visualEditor = document.getElementById('visual-editor');
const sourceTextarea = document.getElementById('source-textarea');
const sourceEditor = document.getElementById('source-editor');
const visualModeBtn = document.getElementById('visual-mode-btn');
const sourceModeBtn = document.getElementById('source-mode-btn');
const openBtn = document.getElementById('open-btn');

const boldBtn = document.getElementById('bold-btn');
const italicBtn = document.getElementById('italic-btn');
const underlineBtn = document.getElementById('underline-btn');
const strikeBtn = document.getElementById('strike-btn');
const ulBtn = document.getElementById('ul-btn');
const olBtn = document.getElementById('ol-btn');
const formatSelect = document.getElementById('format-select');
const fontSelect = document.getElementById('font-select');
const fontSizeSelect = document.getElementById('font-size-select');
const alignLeftBtn = document.getElementById('align-left-btn');
const alignCenterBtn = document.getElementById('align-center-btn');
const alignRightBtn = document.getElementById('align-right-btn');
const linkBtn = document.getElementById('link-btn');

// ── File Operations ──

async function openFile() {
  try {
    const selected = await open({
      filters: [{ name: 'HTML Files', extensions: ['html', 'htm'] }],
      multiple: false,
    });
    if (!selected) return;

    const html = await invoke('open_file', { path: selected });
    const info = await invoke('get_file_info');
    currentFilePath = info.path;
    isDirty = false;

    visualEditor.innerHTML = html;
    visualEditor.querySelectorAll('script').forEach(s => s.remove());
    sourceTextarea.value = html;
    addTableGuideBorders();
    showEditor();
    updateTitle();
    addRecentFile(selected);
  } catch (err) {
    alert('Failed to open file: ' + err);
  }
}

async function saveFile() {
  if (!currentFilePath) return;
  try {
    // Sync DOM to engine before save
    await syncToEngine();
    await invoke('save_file');
    isDirty = false;
    updateTitle();
  } catch (err) {
    console.error('Save failed:', err);
  }
}

async function saveFileAs() {
  try {
    const path = await save({
      filters: [{ name: 'HTML Files', extensions: ['html', 'htm'] }],
    });
    if (!path) return;
    await syncToEngine();
    await invoke('save_file_as', { path });
    currentFilePath = path;
    isDirty = false;
    updateTitle();
  } catch (err) {
    console.error('Save As failed:', err);
  }
}

// ── Engine sync (no DOM re-render) ──

async function syncToEngine() {
  try {
    await invoke('set_source_content', { content: visualEditor.innerHTML });
  } catch (err) {
    console.error('Engine sync failed:', err);
  }
}

function debouncedSync() {
  if (pendingSync) clearTimeout(pendingSync);
  pendingSync = setTimeout(syncToEngine, 300);
}

// ── IME composition guard ──

document.addEventListener('compositionstart', () => { composing = true; });
document.addEventListener('compositionend', () => {
  composing = false;
  syncToEngine();
});

// ── Text editing: browser owns DOM, engine synced in background ──

// Interactive elements: normal click = edit mode, Cmd+click = actual action.
// Both mousedown AND click must be intercepted because browsers navigate
// links on mousedown, and contenteditable has its own click handling.
visualEditor.addEventListener('mousedown', (e) => {
  const interactive = e.target.closest('a, button, input:not([type=text]), select, textarea, [onclick]');
  if (!interactive) return;

  if (e.metaKey || e.ctrlKey) {
    // Cmd+click: let the browser handle the action natively
    return;
  }
  // Normal click: block default (navigation, form submit, etc.)
  e.preventDefault();
});

visualEditor.addEventListener('click', (e) => {
  const interactive = e.target.closest('a, button, input:not([type=text]), select, textarea, details, summary, [onclick]');
  if (!interactive) return;

  if (e.metaKey || e.ctrlKey) {
    // Cmd+click on link: manually open in default browser
    if (interactive.tagName === 'A' && interactive.href) {
      e.preventDefault();
      window.open(interactive.href, '_blank');
    }
    return;
  }

  // Normal click: prevent action, stay in edit mode
  e.preventDefault();
});

// WKWebView Sequoia fix: TSM (macOS Text Services Manager) can misroute
// text insertion in flex scroll containers. beforeinput fires with correct
// selection before TSM corrupts the insertion point.
visualEditor.addEventListener('beforeinput', (e) => {
  // Block contenteditable auto-formatting (1. -> ordered list, * -> bullet)
  if (e.inputType === 'insertOrderedList' || e.inputType === 'insertUnorderedList') {
    e.preventDefault();
    return;
  }

  if (e.inputType !== 'insertText' || e.data === null || composing) return;
  e.preventDefault();
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const text = document.createTextNode(e.data);
  range.insertNode(text);
  range.setStartAfter(text);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
});

visualEditor.addEventListener('input', () => {
  if (composing) return;
  isDirty = true;
  updateTitle();
  debouncedSync();
});

// ── Save cursor state via node path (for formatting re-renders) ──

function getCursorNodePath() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const node = sel.anchorNode;
  const offset = sel.anchorOffset;

  const path = [];
  let current = node;
  while (current && current !== visualEditor) {
    const parent = current.parentNode;
    if (!parent) break;
    const index = Array.from(parent.childNodes).indexOf(current);
    path.unshift(index);
    current = parent;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return { path, textNodeIndex: path.pop(), textOffset: offset, fullPath: path };
  }
  return { path, textNodeIndex: -1, textOffset: offset, fullPath: path };
}

function restoreCursorFromPath(saved) {
  if (!saved) return;
  try {
    let node = visualEditor;
    for (const idx of saved.fullPath) {
      node = node.childNodes[idx];
      if (!node) return;
    }
    // Walk into text node
    if (saved.textNodeIndex >= 0 && node.childNodes[saved.textNodeIndex]) {
      const textNode = node.childNodes[saved.textNodeIndex];
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode, Math.min(saved.textOffset, textNode.textContent.length));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch (e) { /* ignore */ }
}

// ── Formatting: engine patch → re-render (acceptable, infrequent) ──

async function applyFormatPatch(offset, length, replacement) {
  // Sync DOM first so engine is up to date
  await syncToEngine();
  const saved = getCursorNodePath();

  try {
    const source = await invoke('apply_patch', { offset, length, replacement });
    renderFromSource(source);
    restoreCursorFromPath(saved);
  } catch (err) {
    console.error('Format patch failed:', err);
  }
}

function renderFromSource(source) {
  visualEditor.innerHTML = source;
  visualEditor.querySelectorAll('script').forEach(s => s.remove());
  addTableGuideBorders();
  sourceTextarea.value = source;
}

async function wrapSelection(tag, attrStr = '') {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const selectedText = sel.toString();
  if (!selectedText) return;

  const openTag = attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`;
  const closeTag = `</${tag}>`;
  const replacement = openTag + selectedText + closeTag;

  // Search for selected text in source to find byte offset
  const source = await invoke('get_current_html');
  const offset = source.indexOf(selectedText);
  if (offset < 0) return;

  await applyFormatPatch(offset, selectedText.length, replacement);
  isDirty = true;
  updateTitle();
}

boldBtn.addEventListener('click', () => wrapSelection('strong'));
italicBtn.addEventListener('click', () => wrapSelection('em'));
underlineBtn.addEventListener('click', () => wrapSelection('u'));
strikeBtn.addEventListener('click', () => wrapSelection('s'));

async function formatAsBlock(tag, text) {
  const replacement = `<${tag}>${text}</${tag}>`;
  const source = await invoke('get_current_html');
  const offset = source.indexOf(text);
  if (offset < 0) return;
  await applyFormatPatch(offset, text.length, replacement);
  isDirty = true;
  updateTitle();
}

ulBtn.addEventListener('click', async () => {
  const text = window.getSelection()?.toString();
  if (text) await formatAsBlock('ul', text);
});

olBtn.addEventListener('click', async () => {
  const text = window.getSelection()?.toString();
  if (text) await formatAsBlock('ol', text);
});

formatSelect.addEventListener('change', async () => {
  const tag = formatSelect.value;
  if (!tag) return;
  const text = window.getSelection()?.toString();
  if (text) {
    await formatAsBlock(tag, text);
    formatSelect.value = 'p';
  }
});

fontSelect.addEventListener('change', async () => {
  const font = fontSelect.value;
  if (!font) return;
  const text = window.getSelection()?.toString();
  if (!text) return;
  const source = await invoke('get_current_html');
  const offset = source.indexOf(text);
  if (offset >= 0) {
    await applyFormatPatch(offset, text.length, `<span style="font-family:${font}">${text}</span>`);
  }
  fontSelect.value = '';
});

fontSizeSelect.addEventListener('change', async () => {
  const sizes = {'1':'8pt','2':'10pt','3':'12pt','4':'14pt','5':'18pt','6':'24pt','7':'36pt'};
  const size = sizes[fontSizeSelect.value];
  if (!size) return;
  const text = window.getSelection()?.toString();
  if (!text) return;
  const source = await invoke('get_current_html');
  const offset = source.indexOf(text);
  if (offset >= 0) {
    await applyFormatPatch(offset, text.length, `<span style="font-size:${size}">${text}</span>`);
  }
  fontSizeSelect.value = '';
});

async function applyAlignment(align) {
  const text = window.getSelection()?.toString();
  if (!text) return;
  const source = await invoke('get_current_html');
  const offset = source.indexOf(text);
  if (offset >= 0) {
    await applyFormatPatch(offset, text.length, `<div style="text-align:${align}">${text}</div>`);
    isDirty = true;
    updateTitle();
  }
  updateAlignButtons(align);
}

alignLeftBtn.addEventListener('click', () => applyAlignment('left'));
alignCenterBtn.addEventListener('click', () => applyAlignment('center'));
alignRightBtn.addEventListener('click', () => applyAlignment('right'));

function updateAlignButtons(active) {
  [alignLeftBtn, alignCenterBtn, alignRightBtn].forEach(b => b.classList.remove('active'));
  if (active === 'left') alignLeftBtn.classList.add('active');
  if (active === 'center') alignCenterBtn.classList.add('active');
  if (active === 'right') alignRightBtn.classList.add('active');
}

// ── Image Insert ──

const imageBtn = document.getElementById('image-btn');

imageBtn.addEventListener('click', async () => {
  try {
    const selected = await open({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
      multiple: false,
    });
    if (!selected) return;

    const filename = selected.split('/').pop();
    const imgHTML = `<img src="${filename}" alt="Image" />`;

    // Insert at cursor
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const temp = document.createElement('div');
      temp.innerHTML = imgHTML;
      const img = temp.firstChild;
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      visualEditor.innerHTML += imgHTML;
    }
    isDirty = true;
    updateTitle();
    debouncedSync();
  } catch (err) { console.error('Image insert failed:', err); }
});

// ── Table Insert ──

const tableBtn = document.getElementById('table-btn');

tableBtn.addEventListener('click', () => {
  const rows = prompt('Number of rows:', '3');
  const cols = prompt('Number of columns:', '3');
  if (!rows || !cols) return;

  const r = parseInt(rows) || 3;
  const c = parseInt(cols) || 3;
  let html = '<table>';
  for (let i = 0; i < r; i++) {
    html += '<tr>';
    for (let j = 0; j < c; j++) {
      html += i === 0 ? '<th></th>' : '<td></td>';
    }
    html += '</tr>';
  }
  html += '</table>';

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const table = temp.firstChild;
    range.insertNode(table);
    range.setStart(table.querySelector('th, td') || table, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    visualEditor.innerHTML += html;
  }
  addTableGuideBorders();
  isDirty = true;
  updateTitle();
  debouncedSync();
});

// ── Undo/Redo via Engine ──

document.addEventListener('keydown', async (e) => {
  const isMeta = e.metaKey || e.ctrlKey;

  if (isMeta && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    try {
      const source = await invoke('undo');
      renderFromSource(source);
    } catch (err) { /* nothing to undo */ }
  }

  if (isMeta && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    try {
      const source = await invoke('redo');
      renderFromSource(source);
    } catch (err) { /* nothing to redo */ }
  }

  if (isMeta && e.key === 'o') { e.preventDefault(); await openFile(); }
  if (isMeta && e.key === 's' && e.shiftKey) { e.preventDefault(); await saveFileAs(); }
  else if (isMeta && e.key === 's') { e.preventDefault(); await saveFile(); }
  if (isMeta && e.shiftKey && e.key === 'v') { e.preventDefault(); switchMode(editMode === 'visual' ? 'source' : 'visual'); }
  if (isMeta && e.key === 'k') { e.preventDefault(); linkBtn.click(); }

  // Zoom: Cmd+/Cmd-/Cmd+0
  if (isMeta && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    zoomLevel = Math.min(zoomLevel + 10, 300);
    document.documentElement.style.zoom = zoomLevel + '%';
  }
  if (isMeta && e.key === '-') {
    e.preventDefault();
    zoomLevel = Math.max(zoomLevel - 10, 50);
    document.documentElement.style.zoom = zoomLevel + '%';
  }
  if (isMeta && e.key === '0') {
    e.preventDefault();
    zoomLevel = 100;
    document.documentElement.style.zoom = '100%';
  }
});

// ── Visual/Source Mode Toggle ──

visualModeBtn.addEventListener('click', () => switchMode('visual'));
sourceModeBtn.addEventListener('click', () => switchMode('source'));

async function switchMode(mode) {
  if (mode === editMode) return;

  if (editMode === 'source') {
    await invoke('set_source_content', { content: sourceTextarea.value });
    const source = await invoke('get_current_html');
    visualEditor.innerHTML = source;
    visualEditor.querySelectorAll('script').forEach(s => s.remove());
    addTableGuideBorders();
  } else {
    await syncToEngine();
    const source = await invoke('get_current_html');
    sourceTextarea.value = source;
  }

  editMode = mode;
  visualEditor.classList.toggle('hidden', mode !== 'visual');
  sourceEditor.classList.toggle('hidden', mode !== 'source');
  visualModeBtn.classList.toggle('active', mode === 'visual');
  sourceModeBtn.classList.toggle('active', mode === 'source');
}

// ── Table Editing ──

function addTableGuideBorders() {
  visualEditor.querySelectorAll('table').forEach(table => {
    table.querySelectorAll('td, th').forEach(cell => {
      cell.style.border = '1px dashed #c8c8ce';
    });
  });
}

let contextMenuEl = null;

visualEditor.addEventListener('contextmenu', async (e) => {
  const td = e.target.closest('td, th');
  if (!td) return;
  e.preventDefault();
  removeContextMenu();

  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.innerHTML = `
    <button class="context-menu-item" data-action="row-above">Insert Row Above</button>
    <button class="context-menu-item" data-action="row-below">Insert Row Below</button>
    <div class="context-separator"></div>
    <button class="context-menu-item" data-action="col-left">Insert Column Left</button>
    <button class="context-menu-item" data-action="col-right">Insert Column Right</button>
    <div class="context-separator"></div>
    <button class="context-menu-item" data-action="delete-row">Delete Row</button>
    <button class="context-menu-item" data-action="delete-col">Delete Column</button>
    <button class="context-menu-item" data-action="delete-table">Delete Table</button>
  `;
  menu.style.top = e.clientY + 'px';
  menu.style.left = e.clientX + 'px';
  document.body.appendChild(menu);
  contextMenuEl = menu;

  menu.addEventListener('click', (me) => {
    const action = me.target.dataset.action;
    if (action) {
      handleTableAction(td, action);
      removeContextMenu();
    }
  });
});

document.addEventListener('click', (e) => {
  if (contextMenuEl && !contextMenuEl.contains(e.target)) removeContextMenu();
  if (!e.target.closest('#link-popover')) removeLinkPopover();
});

function removeContextMenu() {
  if (contextMenuEl) { contextMenuEl.remove(); contextMenuEl = null; }
}

async function handleTableAction(cell, action) {
  const row = cell.closest('tr');
  const table = cell.closest('table');
  const colCount = row.children.length;
  const cellTag = cell.tagName;

  if (action === 'col-left' || action === 'col-right') {
    const cellIndex = Array.from(row.children).indexOf(cell);
    Array.from(table.rows).forEach(r => {
      const newCell = document.createElement(cellTag);
      r.insertBefore(newCell, r.children[action === 'col-right' ? cellIndex + 1 : cellIndex]);
    });
  } else if (action === 'delete-row' && table.rows.length > 1) {
    row.remove();
  } else if (action === 'delete-col' && row.children.length > 1) {
    const cellIndex = Array.from(row.children).indexOf(cell);
    Array.from(table.rows).forEach(r => {
      if (r.children[cellIndex]) r.children[cellIndex].remove();
    });
  } else if (action === 'delete-table') {
    table.remove();
  } else if (action === 'row-above' || action === 'row-below') {
    const newRow = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
      const c = document.createElement(cellTag);
      c.textContent = '';
      newRow.appendChild(c);
    }
    if (action === 'row-above') row.parentNode.insertBefore(newRow, row);
    else row.parentNode.insertBefore(newRow, row.nextSibling);
  }

  isDirty = true;
  updateTitle();
  debouncedSync();
}

// ── Link Editing ──

linkBtn.addEventListener('click', () => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const selectedText = sel.toString();
  if (!selectedText) return;
  showLinkPopover(selectedText);
});

let linkOffset = 0;

function showLinkPopover(selectedText) {
  removeLinkPopover();
  const popover = document.createElement('div');
  popover.id = 'link-popover';
  popover.innerHTML = `
    <input type="text" id="link-url" placeholder="https://..." />
    <input type="text" id="link-text" placeholder="Link text" value="${escapeHtml(selectedText)}" />
    <label><input type="checkbox" id="link-new-tab" /> Open in new tab</label>
    <div class="popover-actions">
      <button id="link-cancel">Cancel</button>
      <button id="link-save" class="primary-btn">Save</button>
    </div>
  `;

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    popover.style.top = `${rect.bottom + 8}px`;
    popover.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
  }

  document.body.appendChild(popover);
  document.getElementById('link-url').focus();

  document.getElementById('link-save').addEventListener('click', async () => {
    const url = document.getElementById('link-url').value;
    const text = document.getElementById('link-text').value || url;
    const newTab = document.getElementById('link-new-tab').checked;
    if (!url) return;

    const targetAttr = newTab ? ' target="_blank"' : '';
    const replacement = `<a href="${url}"${targetAttr}>${text}</a>`;

    await syncToEngine();
    const source = await invoke('get_current_html');
    const offset = source.indexOf(selectedText);
    if (offset >= 0) {
      await applyFormatPatch(offset, selectedText.length, replacement);
    }
    isDirty = true;
    updateTitle();
    removeLinkPopover();
  });

  document.getElementById('link-cancel').addEventListener('click', removeLinkPopover);
}

function removeLinkPopover() {
  const el = document.getElementById('link-popover');
  if (el) el.remove();
}

// ── Image Handling ──

visualEditor.addEventListener('click', (e) => {
  if (e.target.tagName === 'IMG') {
    visualEditor.querySelectorAll('img.selected').forEach(img => {
      img.classList.remove('selected');
      img.style.outline = '';
      img.style.outlineOffset = '';
    });
    e.target.classList.add('selected');
    e.target.style.outline = '2px solid var(--accent-color)';
    e.target.style.outlineOffset = '2px';
  }
});

visualEditor.addEventListener('dblclick', async (e) => {
  if (e.target.tagName !== 'IMG') return;
  e.preventDefault();
  try {
    const selected = await open({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
      multiple: false,
    });
    if (!selected) return;
    const img = e.target;
    const oldSrc = img.getAttribute('src') || '';
    img.setAttribute('src', selected.split('/').pop());
    isDirty = true;
    updateTitle();
    debouncedSync();
  } catch (err) { console.error('Image replace failed:', err); }
});

// ── Recent Files ──

const RECENT_FILES_KEY = 'pagesmith_recent_files';
const MAX_RECENT = 10;

function getRecentFiles() {
  try { return JSON.parse(localStorage.getItem(RECENT_FILES_KEY) || '[]'); }
  catch { return []; }
}

function addRecentFile(path) {
  let recent = getRecentFiles();
  recent = recent.filter(p => p !== path);
  recent.unshift(path);
  if (recent.length > MAX_RECENT) recent.pop();
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(recent));
  renderRecentFiles();
}

async function renderRecentFiles() {
  const recent = getRecentFiles();
  const list = document.getElementById('recent-list');
  if (!list) return;
  if (recent.length === 0) {
    list.innerHTML = '<p class="recent-label">Recently opened files will appear here</p>';
    return;
  }
  list.innerHTML = recent.map(path => {
    const filename = path.split('/').pop();
    return `<div class="recent-item" data-path="${escapeHtml(path)}">
      <span class="recent-filename">${escapeHtml(filename)}</span>
      <span class="recent-path">${escapeHtml(path)}</span>
    </div>`;
  }).join('');

  list.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', async () => {
      const path = item.dataset.path;
      try {
        const html = await invoke('open_file', { path });
        const info = await invoke('get_file_info');
        currentFilePath = info.path;
        isDirty = false;
        visualEditor.innerHTML = html;
        visualEditor.querySelectorAll('script').forEach(s => s.remove());
        sourceTextarea.value = html;
        addTableGuideBorders();
        showEditor();
        updateTitle();
        addRecentFile(path);
      } catch (err) {
        let recent = getRecentFiles();
        recent = recent.filter(p => p !== path);
        localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(recent));
        renderRecentFiles();
      }
    });
  });
}

// ── Init ──

openBtn.addEventListener('click', openFile);

function showEditor() {
  emptyState.classList.add('hidden');
  editorView.classList.remove('hidden');
}

function updateTitle() {
  const filename = currentFilePath ? currentFilePath.split('/').pop() : 'Untitled';
  document.title = (isDirty ? '● ' : '') + filename + ' — PageSmith';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Sync on page unload
window.addEventListener('beforeunload', () => {
  if (isDirty) syncToEngine();
});

renderRecentFiles();
console.log('PageSmith v0.4 — browser-owns-DOM editor ready');
