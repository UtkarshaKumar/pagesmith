// PageSmith frontend entry point
// WKWebView-based visual HTML editor

const { invoke } = window.__TAURI__?.core || {};
const { open, save } = window.__TAURI__?.plugin?.dialog || {};
const { readTextFile, writeTextFile } = window.__TAURI__?.plugin?.fs || {};

// State
let currentFilePath = null;
let isDirty = false;
let editMode = 'visual'; // 'visual' | 'source'
let sourceHTML = '';

// DOM refs
const emptyState = document.getElementById('empty-state');
const editorView = document.getElementById('editor-view');
const visualEditor = document.getElementById('visual-editor');
const sourceEditor = document.getElementById('source-editor');
const sourceTextarea = document.getElementById('source-textarea');
const visualModeBtn = document.getElementById('visual-mode-btn');
const sourceModeBtn = document.getElementById('source-mode-btn');
const openBtn = document.getElementById('open-btn');
const recentList = document.getElementById('recent-list');

// Toolbar refs
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

// --- File Operations ---

async function openFile() {
  try {
    const selected = await open({
      filters: [{ name: 'HTML Files', extensions: ['html', 'htm'] }],
      multiple: false,
    });

    if (!selected) return;

    const filePath = selected;
    const content = await readTextFile(filePath);
    
    currentFilePath = filePath;
    sourceHTML = content;
    isDirty = false;
    
    renderFile(content);
    showEditor();
    updateTitle();
  } catch (err) {
    console.error('Failed to open file:', err);
  }
}

async function saveFile() {
  if (!currentFilePath) return;
  
  try {
    const content = editMode === 'source' ? sourceTextarea.value : getVisualContent();
    await writeTextFile(currentFilePath, content);
    
    sourceHTML = content;
    isDirty = false;
    updateTitle();
  } catch (err) {
    console.error('Failed to save file:', err);
  }
}

async function saveFileAs() {
  try {
    const filePath = await save({
      filters: [{ name: 'HTML Files', extensions: ['html', 'htm'] }],
    });
    
    if (!filePath) return;
    
    const content = editMode === 'source' ? sourceTextarea.value : getVisualContent();
    await writeTextFile(filePath, content);
    
    currentFilePath = filePath;
    sourceHTML = content;
    isDirty = false;
    updateTitle();
  } catch (err) {
    console.error('Failed to save file:', err);
  }
}

// --- Rendering ---

function renderFile(html) {
  visualEditor.innerHTML = html;
  sourceTextarea.value = html;
  addTableGuideBorders();
}

function getVisualContent() {
  removeTableGuideBorders();
  const html = visualEditor.innerHTML;
  addTableGuideBorders();
  return '<!DOCTYPE html>\n' + html;
}

function showEditor() {
  emptyState.classList.add('hidden');
  editorView.classList.remove('hidden');
}

function showEmptyState() {
  editorView.classList.add('hidden');
  emptyState.classList.remove('hidden');
}

function updateTitle() {
  const filename = currentFilePath 
    ? currentFilePath.split('/').pop() 
    : 'Untitled';
  document.title = filename + (isDirty ? ' — Edited' : '') + ' — PageSmith';
}

// --- Edit Mode Toggle ---

visualModeBtn.addEventListener('click', () => switchMode('visual'));
sourceModeBtn.addEventListener('click', () => switchMode('source'));

function switchMode(mode) {
  if (mode === editMode) return;
  
  if (editMode === 'source') {
    // Switching from source to visual
    const srcContent = sourceTextarea.value;
    visualEditor.innerHTML = srcContent;
    sourceHTML = srcContent;
    addTableGuideBorders();
  } else {
    // Switching from visual to source
    removeTableGuideBorders();
    const visualContent = getVisualContent();
    sourceTextarea.value = visualContent;
  }
  
  editMode = mode;
  
  if (mode === 'visual') {
    visualEditor.classList.remove('hidden');
    sourceEditor.classList.add('hidden');
    visualModeBtn.classList.add('active');
    sourceModeBtn.classList.remove('active');
    enableToolbar();
  } else {
    visualEditor.classList.add('hidden');
    sourceEditor.classList.remove('hidden');
    visualModeBtn.classList.remove('active');
    sourceModeBtn.classList.add('active');
    disableToolbar();
  }
}

// --- Toolbar ---

function enableToolbar() {
  document.querySelectorAll('.toolbar-btn, .toolbar-item').forEach(el => {
    el.disabled = false;
  });
}

function disableToolbar() {
  document.querySelectorAll('.toolbar-btn, .toolbar-item').forEach(el => {
    el.disabled = true;
  });
}

// Bold
boldBtn.addEventListener('click', () => {
  visualEditor.focus();
  document.execCommand('bold', false, null);
  markDirty();
});

// Italic
italicBtn.addEventListener('click', () => {
  visualEditor.focus();
  document.execCommand('italic', false, null);
  markDirty();
});

// Underline
underlineBtn.addEventListener('click', () => {
  visualEditor.focus();
  document.execCommand('underline', false, null);
  markDirty();
});

// Strikethrough
strikeBtn.addEventListener('click', () => {
  visualEditor.focus();
  document.execCommand('strikeThrough', false, null);
  markDirty();
});

// Lists
ulBtn.addEventListener('click', () => {
  visualEditor.focus();
  document.execCommand('insertUnorderedList', false, null);
  markDirty();
});

olBtn.addEventListener('click', () => {
  visualEditor.focus();
  document.execCommand('insertOrderedList', false, null);
  markDirty();
});

// Paragraph format
formatSelect.addEventListener('change', () => {
  visualEditor.focus();
  document.execCommand('formatBlock', false, formatSelect.value);
  markDirty();
});

// Font
fontSelect.addEventListener('change', () => {
  if (!fontSelect.value) return;
  visualEditor.focus();
  document.execCommand('fontName', false, fontSelect.value);
  markDirty();
});

// Font size
fontSizeSelect.addEventListener('change', () => {
  if (!fontSizeSelect.value) return;
  visualEditor.focus();
  document.execCommand('fontSize', false, fontSizeSelect.value);
  markDirty();
});

// Alignment
alignLeftBtn.addEventListener('click', () => {
  visualEditor.focus();
  document.execCommand('justifyLeft', false, null);
  updateAlignButtons('left');
  markDirty();
});

alignCenterBtn.addEventListener('click', () => {
  visualEditor.focus();
  document.execCommand('justifyCenter', false, null);
  updateAlignButtons('center');
  markDirty();
});

alignRightBtn.addEventListener('click', () => {
  visualEditor.focus();
  document.execCommand('justifyRight', false, null);
  updateAlignButtons('right');
  markDirty();
});

function updateAlignButtons(active) {
  [alignLeftBtn, alignCenterBtn, alignRightBtn].forEach(b => b.classList.remove('active'));
  if (active === 'left') alignLeftBtn.classList.add('active');
  if (active === 'center') alignCenterBtn.classList.add('active');
  if (active === 'right') alignRightBtn.classList.add('active');
}

// Link
linkBtn.addEventListener('click', () => {
  visualEditor.focus();
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  
  const range = selection.getRangeAt(0);
  const selectedText = selection.toString();
  
  showLinkPopover(range, selectedText);
});

// --- Table Editing ---

function addTableGuideBorders() {
  visualEditor.querySelectorAll('table').forEach(table => {
    table.classList.add('guide-borders');
  });
}

function removeTableGuideBorders() {
  visualEditor.querySelectorAll('table.guide-borders').forEach(table => {
    table.classList.remove('guide-borders');
  });
}

visualEditor.addEventListener('click', (e) => {
  const td = e.target.closest('td, th');
  if (td) {
    visualEditor.querySelectorAll('td.editing, th.editing').forEach(el => {
      el.classList.remove('editing');
    });
    td.classList.add('editing');
  }
});

// --- Link Popover ---

function showLinkPopover(range, selectedText) {
  removeLinkPopover();
  
  const popover = document.createElement('div');
  popover.id = 'link-popover';
  popover.innerHTML = `
    <input type="text" id="link-url" placeholder="https://..." />
    <input type="text" id="link-text" placeholder="Link text" value="${escapeHtml(selectedText)}" />
    <label><input type="checkbox" id="link-new-tab" /> Open in new tab</label>
    <div class="popover-actions">
      <button id="link-remove" class="danger">Remove</button>
      <button id="link-save" class="primary-btn">Save</button>
      <button id="link-cancel">Cancel</button>
    </div>
  `;
  
  const rect = range.getBoundingClientRect();
  popover.style.top = `${rect.bottom + 8}px`;
  popover.style.left = `${rect.left}px`;
  
  document.body.appendChild(popover);
  
  document.getElementById('link-url').focus();
  document.getElementById('link-save').addEventListener('click', () => {
    const url = document.getElementById('link-url').value;
    const text = document.getElementById('link-text').value || url;
    const newTab = document.getElementById('link-new-tab').checked;
    
    if (url) {
      range.deleteContents();
      const a = document.createElement('a');
      a.href = url;
      a.textContent = text;
      if (newTab) a.target = '_blank';
      range.insertNode(a);
      markDirty();
    }
    removeLinkPopover();
  });
  
  document.getElementById('link-remove').addEventListener('click', removeLinkPopover);
  document.getElementById('link-cancel').addEventListener('click', removeLinkPopover);
}

function removeLinkPopover() {
  const existing = document.getElementById('link-popover');
  if (existing) existing.remove();
}

// --- Context Menu ---

let contextMenuEl = null;

visualEditor.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  removeContextMenu();
  
  const td = e.target.closest('td, th');
  if (!td) return;
  
  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.innerHTML = `
    <button class="context-menu-item" data-action="insert-row-above">Insert Row Above</button>
    <button class="context-menu-item" data-action="insert-row-below">Insert Row Below</button>
    <div class="context-separator"></div>
    <button class="context-menu-item" data-action="insert-col-left">Insert Column Left</button>
    <button class="context-menu-item" data-action="insert-col-right">Insert Column Right</button>
    <div class="context-separator"></div>
    <button class="context-menu-item" data-action="delete-row">Delete Row</button>
    <button class="context-menu-item" data-action="delete-col">Delete Column</button>
    <button class="context-menu-item" data-action="delete-table">Delete Table</button>
  `;
  
  menu.style.top = `${e.clientY}px`;
  menu.style.left = `${e.clientX}px`;
  
  document.body.appendChild(menu);
  contextMenuEl = menu;
  
  menu.addEventListener('click', (me) => {
    const action = me.target.dataset.action;
    if (!action) return;
    handleTableAction(td, action);
    removeContextMenu();
  });
});

document.addEventListener('click', (e) => {
  if (contextMenuEl && !contextMenuEl.contains(e.target)) {
    removeContextMenu();
  }
  if (!e.target.closest('#link-popover')) {
    removeLinkPopover();
  }
});

function removeContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
}

function handleTableAction(cell, action) {
  const row = cell.closest('tr');
  const table = cell.closest('table');
  const cellIndex = Array.from(row.children).indexOf(cell);
  
  switch (action) {
    case 'insert-row-above': {
      const newRow = row.cloneNode(true);
      Array.from(newRow.children).forEach(c => c.textContent = '');
      row.parentNode.insertBefore(newRow, row);
      break;
    }
    case 'insert-row-below': {
      const newRow = row.cloneNode(true);
      Array.from(newRow.children).forEach(c => c.textContent = '');
      row.parentNode.insertBefore(newRow, row.nextSibling);
      break;
    }
    case 'insert-col-left': {
      Array.from(table.rows).forEach(r => {
        const newCell = document.createElement(cell.tagName);
        r.insertBefore(newCell, r.children[cellIndex]);
      });
      break;
    }
    case 'insert-col-right': {
      Array.from(table.rows).forEach(r => {
        const newCell = document.createElement(cell.tagName);
        r.insertBefore(newCell, r.children[cellIndex + 1]);
      });
      break;
    }
    case 'delete-row':
      if (table.rows.length > 1) row.remove();
      break;
    case 'delete-col':
      if (row.children.length > 1) {
        Array.from(table.rows).forEach(r => {
          if (r.children[cellIndex]) r.children[cellIndex].remove();
        });
      }
      break;
    case 'delete-table':
      table.remove();
      break;
  }
  markDirty();
  addTableGuideBorders();
}

// --- Dirty Tracking ---

function markDirty() {
  if (!isDirty) {
    isDirty = true;
    updateTitle();
  }
}

visualEditor.addEventListener('input', markDirty);
sourceTextarea.addEventListener('input', markDirty);

// --- Keyboard Shortcuts ---

document.addEventListener('keydown', async (e) => {
  const isMeta = e.metaKey || e.ctrlKey;
  
  if (isMeta && e.key === 'o') {
    e.preventDefault();
    await openFile();
  }
  
  if (isMeta && e.key === 's' && e.shiftKey) {
    e.preventDefault();
    await saveFileAs();
  } else if (isMeta && e.key === 's') {
    e.preventDefault();
    await saveFile();
  }
  
  if (isMeta && e.shiftKey && e.key === 'v') {
    e.preventDefault();
    switchMode(editMode === 'visual' ? 'source' : 'visual');
  }
  
  if (isMeta && e.key === 'k') {
    e.preventDefault();
    visualEditor.focus();
    linkBtn.click();
  }
});

// --- Init ---

openBtn.addEventListener('click', openFile);

// Update toolbar button states on selection change
document.addEventListener('selectionchange', () => {
  if (editMode !== 'visual') return;
  
  boldBtn.classList.toggle('active', document.queryCommandState('bold'));
  italicBtn.classList.toggle('active', document.queryCommandState('italic'));
  underlineBtn.classList.toggle('active', document.queryCommandState('underline'));
  strikeBtn.classList.toggle('active', document.queryCommandState('strikeThrough'));
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

console.log('PageSmith v0.1.0 ready');
