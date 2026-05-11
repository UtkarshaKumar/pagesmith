// PageSmith v0.3 — source-mapped visual editor
// Every text node is annotated with its byte offset in the engine's source buffer.
// Cursor positions are tracked as byte offsets, not DOM positions.
// Constitution E1: Source buffer is truth. DOM is annotated derived view.

import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

// ── State ──

let currentFilePath = null;
let isDirty = false;
let editMode = 'visual'; // 'visual' | 'source'
let lastSource = ''; // Full HTML source from engine

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
    renderFromSource(html);
    showEditor();
    updateTitle();
    addRecentFile(selected);
  } catch (err) {
    console.error('Failed to open file:', err);
  }
}

async function saveFile() {
  if (!currentFilePath) return;
  try {
    await invoke('save_file');
    isDirty = false;
    updateTitle();
  } catch (err) {
    console.error('Failed to save:', err);
  }
}

async function saveFileAs() {
  try {
    const filePath = await save({
      filters: [{ name: 'HTML Files', extensions: ['html', 'htm'] }],
    });
    if (!filePath) return;
    await invoke('save_file_as', { path: filePath });
    currentFilePath = filePath;
    isDirty = false;
    updateTitle();
  } catch (err) {
    console.error('Failed to save as:', err);
  }
}

// ── Rendering with byte-offset annotations ──

function renderFromSource(source) {
  lastSource = source;
  visualEditor.innerHTML = source;
  sourceTextarea.value = source;
  // Strip script tags (Constitution E4: no JS execution in editor)
  visualEditor.querySelectorAll('script').forEach(s => s.remove());
  addTableGuideBorders();
  annotateByteOffsets();
}

// Annotate every text node with its byte offset in the source buffer.
// Uses text search in source to find each text node's position.
function annotateByteOffsets() {
  const source = lastSource;
  let lastFoundAt = 0;
  const walker = document.createTreeWalker(visualEditor, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent;
    if (!text.trim() && !text.includes('\n')) continue;

    // Search for this text in the source, starting from last found position
    let offset = source.indexOf(text, lastFoundAt);
    if (offset === -1) {
      // Try from beginning if not found after last position
      offset = source.indexOf(text);
    }
    if (offset >= 0) {
      node.dataset.byteOffset = offset;
      node.dataset.byteEnd = offset + text.length;
      lastFoundAt = offset + text.length;
    }
  }
}

// Get byte offset of current cursor/selection in the source buffer
function getCursorByteOffset() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return { start: 0, end: 0 };

  const range = sel.getRangeAt(0);
  const startNode = range.startContainer;
  const startOffset = range.startOffset;
  const endNode = range.endContainer;
  const endOffset = range.endOffset;

  let startByte = resolveNodeByteOffset(startNode, startOffset);
  let endByte = resolveNodeByteOffset(endNode, endOffset);

  if (startByte < 0 || endByte < 0) return { start: 0, end: 0 };
  return { start: startByte, end: endByte };
}

// Resolve (node, offset-within-node) to a byte offset in the source buffer
function resolveNodeByteOffset(node, localOffset) {
  // If the node is a text node with annotation, use it directly
  if (node.nodeType === Node.TEXT_NODE && node.dataset.byteOffset !== undefined) {
    return parseInt(node.dataset.byteOffset) + localOffset;
  }
  // If cursor is in an element (between tags), walk to nearest text
  if (node.nodeType === Node.ELEMENT_NODE) {
    const child = node.childNodes[localOffset];
    if (child) {
      return resolveNodeByteOffset(child, 0);
    }
    // At end of element — find last text descendant
    const texts = [];
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) texts.push(w.currentNode);
    if (texts.length > 0) {
      const last = texts[texts.length - 1];
      if (last.dataset.byteOffset !== undefined) {
        return parseInt(last.dataset.byteOffset) + last.textContent.length;
      }
    }
  }
  return -1;
}

// Restore cursor to a specific byte offset in the source
function restoreCursorToByteOffset(byteOffset) {
  // Clamp
  byteOffset = Math.max(0, Math.min(byteOffset, lastSource.length));

  // Find the text node that contains this byte offset
  const walker = document.createTreeWalker(visualEditor, NodeFilter.SHOW_TEXT);
  let bestNode = null;
  let bestStart = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.dataset.byteOffset === undefined) continue;
    const start = parseInt(node.dataset.byteOffset);
    const end = parseInt(node.dataset.byteEnd);
    if (byteOffset >= start && byteOffset <= end) {
      const localOffset = byteOffset - start;
      setCursorInNode(node, localOffset);
      return;
    }
    // Track closest node after the target
    if (byteOffset < start && (!bestNode || start < bestStart)) {
      bestNode = node;
      bestStart = start;
    }
  }
  // If we fell through, use best match or end of document
  if (bestNode) {
    setCursorInNode(bestNode, 0);
  }
}

function setCursorInNode(node, offset) {
  const sel = window.getSelection();
  try {
    const range = document.createRange();
    range.setStart(node, Math.min(offset, node.textContent.length));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) { /* ignore */ }
}

// ── beforeinput handler: intercept all edits, apply via engine ──

// Save cursor byte offset before each edit
let pendingCursorByte = 0;

visualEditor.addEventListener('beforeinput', (e) => {
  if (editMode !== 'visual') return;

  // Save cursor position as byte offset
  const cursor = getCursorByteOffset();
  pendingCursorByte = cursor.start;

  // For all cancelable inputs, prevent browser from modifying DOM
  // We'll apply the change through the engine
  if (e.inputType === 'insertText' ||
      e.inputType === 'insertParagraph' ||
      e.inputType === 'insertLineBreak' ||
      e.inputType === 'deleteContentBackward' ||
      e.inputType === 'deleteContentForward' ||
      e.inputType === 'deleteWordBackward' ||
      e.inputType === 'deleteWordForward' ||
      e.inputType === 'deleteSoftLineBackward' ||
      e.inputType === 'deleteHardLineBackward') {
    e.preventDefault();
  }
});

visualEditor.addEventListener('input', async (e) => {
  if (editMode !== 'visual') return;

  // Build the edit from what happened in contenteditable
  const afterHTML = visualEditor.innerHTML;
  const beforeHTML = lastSource; // Source is our truth, not previous innerHTML

  // Find common prefix
  let prefixLen = 0;
  while (prefixLen < beforeHTML.length && prefixLen < afterHTML.length
    && beforeHTML[prefixLen] === afterHTML[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix
  let beforeEnd = beforeHTML.length;
  let afterEnd = afterHTML.length;
  while (beforeEnd > prefixLen && afterEnd > prefixLen
    && beforeHTML[beforeEnd - 1] === afterHTML[afterEnd - 1]) {
    beforeEnd--;
    afterEnd--;
  }

  const oldText = beforeHTML.slice(prefixLen, beforeEnd);
  const newText = afterHTML.slice(prefixLen, afterEnd);

  // Apply to engine with the cursor byte offset as hint
  try {
    const result = await invoke('replace_in_source', {
      offsetHint: pendingCursorByte,
      oldText: oldText,
      newText: newText,
    });

    isDirty = true;
    updateTitle();

    // Re-render and restore cursor
    const newCursorByte = result.offset + result.new_length;
    renderFromSource(result.source);
    restoreCursorToByteOffset(newCursorByte);
  } catch (err) {
    console.warn('replace_in_source failed, trying apply_patch:', err);
    // Fallback: try apply_patch with exact offset
    try {
      const result = await invoke('apply_patch', {
        offset: pendingCursorByte,
        length: oldText.length,
        replacement: newText,
      });
      isDirty = true;
      updateTitle();
      const newCursorByte = pendingCursorByte + newText.length;
      renderFromSource(result);
      restoreCursorToByteOffset(newCursorByte);
    } catch (err2) {
      console.error('Edit failed:', err2);
      // Reload from engine
      try {
        const html = await invoke('get_current_html');
        renderFromSource(html);
      } catch (e3) { /* give up */ }
    }
  }
});

// ── Formatting via engine with exact byte offsets ──

async function wrapSelection(tag, attrStr = '') {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const selectedText = sel.toString();
  if (!selectedText) return;

  const cursor = getCursorByteOffset();
  const openTag = attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`;
  const closeTag = `</${tag}>`;
  const replacement = openTag + selectedText + closeTag;

  try {
    const newSource = await invoke('apply_patch', {
      offset: cursor.start,
      length: selectedText.length,
      replacement,
    });
    isDirty = true;
    updateTitle();
    renderFromSource(newSource);
    // Cursor after the closing tag
    restoreCursorToByteOffset(cursor.start + replacement.length);
  } catch (err) {
    console.error('Format failed:', err);
    // Try replace_in_source as fallback
    try {
      const result = await invoke('replace_in_source', {
        offsetHint: cursor.start,
        oldText: selectedText,
        newText: replacement,
      });
      isDirty = true;
      updateTitle();
      renderFromSource(result.source);
      restoreCursorToByteOffset(result.offset + result.new_length);
    } catch (err2) { console.error('Format fallback failed:', err2); }
  }
}

boldBtn.addEventListener('click', () => wrapSelection('strong'));
italicBtn.addEventListener('click', () => wrapSelection('em'));
underlineBtn.addEventListener('click', () => wrapSelection('u'));
strikeBtn.addEventListener('click', () => wrapSelection('s'));

ulBtn.addEventListener('click', async () => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString();
  if (!text) return;
  const cursor = getCursorByteOffset();
  const replacement = '<ul><li>' + text + '</li></ul>';
  try {
    const newSource = await invoke('apply_patch', { offset: cursor.start, length: text.length, replacement });
    isDirty = true; updateTitle();
    renderFromSource(newSource);
    restoreCursorToByteOffset(cursor.start + replacement.length);
  } catch (err) { console.error(err); }
});

olBtn.addEventListener('click', async () => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString();
  if (!text) return;
  const cursor = getCursorByteOffset();
  const replacement = '<ol><li>' + text + '</li></ol>';
  try {
    const newSource = await invoke('apply_patch', { offset: cursor.start, length: text.length, replacement });
    isDirty = true; updateTitle();
    renderFromSource(newSource);
    restoreCursorToByteOffset(cursor.start + replacement.length);
  } catch (err) { console.error(err); }
});

formatSelect.addEventListener('change', async () => {
  const tag = formatSelect.value;
  if (!tag) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString() || ' ';
  const cursor = getCursorByteOffset();
  const replacement = `<${tag}>${text}</${tag}>`;
  try {
    const newSource = await invoke('apply_patch', { offset: cursor.start, length: text.length, replacement });
    isDirty = true; updateTitle();
    renderFromSource(newSource);
    restoreCursorToByteOffset(cursor.start + replacement.length);
  } catch (err) { console.error(err); }
  formatSelect.value = 'p';
});

fontSelect.addEventListener('change', async () => {
  const font = fontSelect.value;
  if (!font) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString();
  if (!text) return;
  const cursor = getCursorByteOffset();
  const replacement = `<span style="font-family:${font}">${text}</span>`;
  try {
    const newSource = await invoke('apply_patch', { offset: cursor.start, length: text.length, replacement });
    renderFromSource(newSource);
    restoreCursorToByteOffset(cursor.start + replacement.length);
  } catch (err) { console.error(err); }
  fontSelect.value = '';
});

fontSizeSelect.addEventListener('change', async () => {
  const sizes = {'1':'8pt','2':'10pt','3':'12pt','4':'14pt','5':'18pt','6':'24pt','7':'36pt'};
  const size = sizes[fontSizeSelect.value];
  if (!size) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString();
  if (!text) return;
  const cursor = getCursorByteOffset();
  const replacement = `<span style="font-size:${size}">${text}</span>`;
  try {
    const newSource = await invoke('apply_patch', { offset: cursor.start, length: text.length, replacement });
    renderFromSource(newSource);
    restoreCursorToByteOffset(cursor.start + replacement.length);
  } catch (err) { console.error(err); }
  fontSizeSelect.value = '';
});

async function applyAlignment(align) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString();
  if (!text) return;
  const cursor = getCursorByteOffset();
  const replacement = `<div style="text-align:${align}">${text}</div>`;
  try {
    const newSource = await invoke('apply_patch', { offset: cursor.start, length: text.length, replacement });
    isDirty = true; updateTitle();
    renderFromSource(newSource);
    restoreCursorToByteOffset(cursor.start + replacement.length);
  } catch (err) { console.error(err); }
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

// ── Undo/Redo via Engine ──

document.addEventListener('keydown', async (e) => {
  const isMeta = e.metaKey || e.ctrlKey;

  if (isMeta && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    try {
      const newSource = await invoke('undo');
      renderFromSource(newSource);
    } catch (err) { /* nothing to undo */ }
  }

  if (isMeta && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    try {
      const newSource = await invoke('redo');
      renderFromSource(newSource);
    } catch (err) { /* nothing to redo */ }
  }

  if (isMeta && e.key === 'o') { e.preventDefault(); await openFile(); }
  if (isMeta && e.key === 's' && e.shiftKey) { e.preventDefault(); await saveFileAs(); }
  else if (isMeta && e.key === 's') { e.preventDefault(); await saveFile(); }
  if (isMeta && e.shiftKey && e.key === 'v') { e.preventDefault(); switchMode(editMode === 'visual' ? 'source' : 'visual'); }
  if (isMeta && e.key === 'k') { e.preventDefault(); linkBtn.click(); }
});

// ── Visual/Source Mode Toggle ──

visualModeBtn.addEventListener('click', () => switchMode('visual'));
sourceModeBtn.addEventListener('click', () => switchMode('source'));

async function switchMode(mode) {
  if (mode === editMode) return;

  if (editMode === 'source') {
    // Source → Visual: send content to engine then render
    await invoke('set_source_content', { content: sourceTextarea.value });
    const html = await invoke('get_current_html');
    renderFromSource(html);
  } else {
    // Visual → Source: get latest from engine
    const html = await invoke('get_current_html');
    sourceTextarea.value = html;
  }

  editMode = mode;

  if (mode === 'visual') {
    visualEditor.classList.remove('hidden');
    sourceEditor.classList.add('hidden');
    visualModeBtn.classList.add('active');
    sourceModeBtn.classList.remove('active');
  } else {
    visualEditor.classList.add('hidden');
    sourceEditor.classList.remove('hidden');
    visualModeBtn.classList.remove('active');
    sourceModeBtn.classList.add('active');
  }
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
  const cellIndex = Array.from(row.children).indexOf(cell);
  const colCount = row.children.length;
  const cellTag = cell.tagName;

  let patchHTML = '';
  const rowHTML = row.outerHTML;
  const tableHTML = table.outerHTML;

  // Find the row's position in the source
  const cursor = getCursorByteOffset();

  switch (action) {
    case 'row-above': {
      const cells = Array.from({length: colCount}, () => `<${cellTag}></${cellTag}>`).join('');
      patchHTML = `<tr>${cells}</tr>`;
      break;
    }
    case 'row-below': {
      const cells = Array.from({length: colCount}, () => `<${cellTag}></${cellTag}>`).join('');
      patchHTML = `<tr>${cells}</tr>`;
      break;
    }
    case 'col-left':
    case 'col-right':
    case 'delete-row':
    case 'delete-col':
    case 'delete-table':
      return; // DOM-only for now
  }

  if (patchHTML) {
    try {
      if (action === 'row-above') {
        const rowOffset = lastSource.indexOf(rowHTML);
        if (rowOffset >= 0) {
          const newSource = await invoke('apply_patch', { offset: rowOffset, length: 0, replacement: patchHTML });
          renderFromSource(newSource);
        }
      } else if (action === 'row-below') {
        const rowEnd = lastSource.indexOf(rowHTML) + rowHTML.length;
        const newSource = await invoke('apply_patch', { offset: rowEnd, length: 0, replacement: patchHTML });
        renderFromSource(newSource);
      }
    } catch (err) { console.error('Table action failed:', err); }
  }

  isDirty = true;
  updateTitle();
}

// ── Link Editing ──

linkBtn.addEventListener('click', () => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const selectedText = sel.toString();
  if (!selectedText) return;
  showLinkPopover(selectedText);
});

function showLinkPopover(selectedText) {
  removeLinkPopover();
  const cursor = getCursorByteOffset();
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
    try {
      const newSource = await invoke('apply_patch', {
        offset: cursor.start,
        length: selectedText.length,
        replacement,
      });
      isDirty = true;
      updateTitle();
      renderFromSource(newSource);
      restoreCursorToByteOffset(cursor.start + replacement.length);
    } catch (err) { console.error('Link patch failed:', err); }
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
    visualEditor.querySelectorAll('img.selected').forEach(img => img.classList.remove('selected'));
    e.target.classList.add('selected');
    e.target.style.outline = '2px solid var(--accent-color)';
    e.target.style.outlineOffset = '2px';
  } else {
    visualEditor.querySelectorAll('img.selected').forEach(img => {
      img.classList.remove('selected');
      img.style.outline = '';
      img.style.outlineOffset = '';
    });
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
    const newSrc = selected.split('/').pop();
    const srcIndex = lastSource.indexOf(`src="${oldSrc}"`);
    if (srcIndex >= 0) {
      const newSource = await invoke('apply_patch', {
        offset: srcIndex + 5,
        length: oldSrc.length,
        replacement: newSrc,
      });
      isDirty = true;
      updateTitle();
      renderFromSource(newSource);
    }
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
        renderFromSource(html);
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

renderRecentFiles();
console.log('PageSmith v0.3 — source-mapped editor ready');
