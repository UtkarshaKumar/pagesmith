// PageSmith v0.2 — Visual editor bridged to surgical Rust engine
// Every edit goes through invoke('apply_patch', ...) to the Rust engine.
// Constitution E1: Source buffer is truth. DOM is derived view.

const { invoke } = window.__TAURI__?.core || {};
const { open, save } = window.__TAURI__?.plugin?.dialog || {};

// ── State ──

let currentFilePath = null;
let isDirty = false;
let editMode = 'visual'; // 'visual' | 'source'
let lastRenderedHTML = ''; // Track for diff detection

// ── DOM refs ──

const emptyState = document.getElementById('empty-state');
const editorView = document.getElementById('editor-view');
const visualEditor = document.getElementById('visual-editor');
const sourceTextarea = document.getElementById('source-textarea');
const sourceEditor = document.getElementById('source-editor');
const visualModeBtn = document.getElementById('visual-mode-btn');
const sourceModeBtn = document.getElementById('source-mode-btn');
const openBtn = document.getElementById('open-btn');

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

// ── File Operations ──

async function openFile() {
  try {
    const selected = await open({
      filters: [{ name: 'HTML Files', extensions: ['html', 'htm'] }],
      multiple: false,
    });
    if (!selected) return;

    // Use engine to open file
    const html = await invoke('open_file', { path: selected });
    const info = await invoke('get_file_info');

    currentFilePath = info.path;
    isDirty = false;
    lastRenderedHTML = html;

    renderHTML(html);
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
    // Sync source mode changes before save
    if (editMode === 'source') {
      await invoke('set_source_content', { content: sourceTextarea.value });
    }
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

    if (editMode === 'source') {
      await invoke('set_source_content', { content: sourceTextarea.value });
    }
    await invoke('save_file_as', { path: filePath });
    currentFilePath = filePath;
    isDirty = false;
    updateTitle();
  } catch (err) {
    console.error('Failed to save as:', err);
  }
}

// ── Rendering ──

function renderHTML(html) {
  visualEditor.innerHTML = html;
  sourceTextarea.value = html;
  lastRenderedHTML = html;
  addTableGuideBorders();
  // Disable JS execution safety
  visualEditor.querySelectorAll('script').forEach(s => s.remove());
}

function showEditor() {
  emptyState.classList.add('hidden');
  editorView.classList.remove('hidden');
}

function updateTitle() {
  const filename = currentFilePath
    ? currentFilePath.split('/').pop()
    : 'Untitled';
  document.title = (isDirty ? '● ' : '') + filename + ' — PageSmith';
}

// ── Engine Bridge: Compute and apply patches ──

async function applySurgicalEdit(oldText, newText, cursorOffset, deleteLength) {
  try {
    // Find the edit in the source buffer by searching for oldText
    // Simple approach: search from the cursor position
    const html = lastRenderedHTML;
    // Estimate byte offset from cursor position in visual text
    // Count visible characters before cursor
    const sel = window.getSelection();
    let byteOffset = 0;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      byteOffset = getTextOffsetBefore(range);
    }

    // Apply the patch through the engine
    const newHTML = await invoke('apply_patch', {
      offset: byteOffset,
      length: deleteLength,
      replacement: newText,
    });

    lastRenderedHTML = newHTML;
    isDirty = true;
    updateTitle();

    // Re-render and restore cursor
    const savedOffset = byteOffset + newText.length;
    renderHTMLKeepCursor(newHTML, savedOffset);
  } catch (err) {
    console.error('Patch failed:', err);
  }
}

// Estimate byte offset by counting text before a DOM range
function getTextOffsetBefore(range) {
  const pre = document.createRange();
  pre.selectNodeContents(visualEditor);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

// Re-render but restore cursor to the saved offset
function renderHTMLKeepCursor(html, offset) {
  visualEditor.innerHTML = html;
  addTableGuideBorders();
  visualEditor.querySelectorAll('script').forEach(s => s.remove());

  // Restore cursor at offset
  try {
    const sel = window.getSelection();
    const range = setCursorAtTextOffset(visualEditor, offset);
    if (range) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch (e) { /* ignore cursor restore failures */ }
}

function setCursorAtTextOffset(node, targetOffset) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
  let currentOffset = 0;
  let textNode;
  while ((textNode = walker.nextNode())) {
    const len = textNode.textContent.length;
    if (currentOffset + len >= targetOffset) {
      const range = document.createRange();
      range.setStart(textNode, targetOffset - currentOffset);
      range.collapse(true);
      return range;
    }
    currentOffset += len;
  }
  return null;
}

// ── Toolbar: Formatting through engine ──

// Each format action computes the patch and sends to engine
async function wrapSelection(tag, attrStr = '') {
  const html = lastRenderedHTML;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const selectedText = sel.toString();
  if (!selectedText) return;

  const startOffset = getTextOffsetBefore(sel.getRangeAt(0));
  const openTag = attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`;
  const closeTag = `</${tag}>`;
  const replacement = openTag + selectedText + closeTag;

  try {
    const newHTML = await invoke('apply_patch', {
      offset: startOffset,
      length: selectedText.length,
      replacement,
    });
    lastRenderedHTML = newHTML;
    isDirty = true;
    updateTitle();
    renderHTMLKeepCursor(newHTML, startOffset + replacement.length);
  } catch (err) {
    console.error('Format patch failed:', err);
  }
}

boldBtn.addEventListener('click', () => wrapSelection('strong'));
italicBtn.addEventListener('click', () => wrapSelection('em'));
underlineBtn.addEventListener('click', () => wrapSelection('u'));
strikeBtn.addEventListener('click', () => wrapSelection('s'));

// Lists
ulBtn.addEventListener('click', async () => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString();
  const offset = getTextOffsetBefore(sel.getRangeAt(0));
  const replacement = '<ul><li>' + text + '</li></ul>';
  const newHTML = await invoke('apply_patch', { offset, length: text.length, replacement });
  lastRenderedHTML = newHTML;
  isDirty = true;
  updateTitle();
  renderHTMLKeepCursor(newHTML, offset + replacement.length);
});

olBtn.addEventListener('click', async () => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString();
  const offset = getTextOffsetBefore(sel.getRangeAt(0));
  const replacement = '<ol><li>' + text + '</li></ol>';
  const newHTML = await invoke('apply_patch', { offset, length: text.length, replacement });
  lastRenderedHTML = newHTML;
  isDirty = true;
  updateTitle();
  renderHTMLKeepCursor(newHTML, offset + replacement.length);
});

// Paragraph format
formatSelect.addEventListener('change', async () => {
  const tag = formatSelect.value;
  if (!tag) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString() || ' ';
  const offset = getTextOffsetBefore(sel.getRangeAt(0));
  const replacement = `<${tag}>${text}</${tag}>`;
  const newHTML = await invoke('apply_patch', { offset, length: text.length, replacement });
  lastRenderedHTML = newHTML;
  isDirty = true;
  updateTitle();
  renderHTMLKeepCursor(newHTML, offset + replacement.length);
  formatSelect.value = 'p'; // Reset
});

// Font
fontSelect.addEventListener('change', async () => {
  const font = fontSelect.value;
  if (!font) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString();
  const offset = getTextOffsetBefore(sel.getRangeAt(0));
  const replacement = `<span style="font-family:${font}">${text}</span>`;
  const newHTML = await invoke('apply_patch', { offset, length: text.length, replacement });
  lastRenderedHTML = newHTML;
  renderHTMLKeepCursor(newHTML, offset + replacement.length);
  fontSelect.value = '';
});

// Font size
fontSizeSelect.addEventListener('change', async () => {
  const sizes = {'1':'8pt','2':'10pt','3':'12pt','4':'14pt','5':'18pt','6':'24pt','7':'36pt'};
  const size = sizes[fontSizeSelect.value];
  if (!size) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString();
  const offset = getTextOffsetBefore(sel.getRangeAt(0));
  const replacement = `<span style="font-size:${size}">${text}</span>`;
  const newHTML = await invoke('apply_patch', { offset, length: text.length, replacement });
  lastRenderedHTML = newHTML;
  renderHTMLKeepCursor(newHTML, offset + replacement.length);
  fontSizeSelect.value = '';
});

// Alignment
async function applyAlignment(align) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const text = sel.toString();
  const offset = getTextOffsetBefore(sel.getRangeAt(0));
  const replacement = `<div style="text-align:${align}">${text}</div>`;
  const newHTML = await invoke('apply_patch', { offset, length: text.length, replacement });
  lastRenderedHTML = newHTML;
  isDirty = true;
  updateTitle();
  renderHTMLKeepCursor(newHTML, offset + replacement.length);
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

// ── contenteditable input → surgical patch ──

// Track state before each input for diff computation
let beforeInputText = '';
let beforeInputOffset = 0;

visualEditor.addEventListener('keydown', (e) => {
  // Capture state before the edit
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    beforeInputOffset = getTextOffsetBefore(sel.getRangeAt(0));
  }
  beforeInputText = visualEditor.textContent || '';
});

visualEditor.addEventListener('input', async (e) => {
  e.preventDefault();
  const afterText = visualEditor.textContent || '';
  const beforeText = beforeInputText;

  if (beforeText === afterText) return;

  // Compute what changed
  // Find the first differing character
  let diffStart = 0;
  while (diffStart < beforeText.length && diffStart < afterText.length
    && beforeText[diffStart] === afterText[diffStart]) {
    diffStart++;
  }

  // Find the end of the difference
  let beforeEnd = beforeText.length;
  let afterEnd = afterText.length;
  while (beforeEnd > diffStart && afterEnd > diffStart
    && beforeText[beforeEnd - 1] === afterText[afterEnd - 1]) {
    beforeEnd--;
    afterEnd--;
  }

  const deleted = beforeText.slice(diffStart, beforeEnd);
  const inserted = afterText.slice(diffStart, afterEnd);

  // Estimate byte offset in source
  const byteOffset = beforeInputOffset + diffStart;

  // Restore the DOM from engine before applying patch
  visualEditor.innerHTML = lastRenderedHTML;
  addTableGuideBorders();
  visualEditor.querySelectorAll('script').forEach(s => s.remove());

  // Apply surgical patch
  try {
    const newHTML = await invoke('apply_patch', {
      offset: byteOffset,
      length: deleted.length,
      replacement: inserted,
    });
    lastRenderedHTML = newHTML;
    isDirty = true;
    updateTitle();

    // Re-render and restore cursor
    const newCursorOffset = byteOffset + inserted.length;
    renderHTMLKeepCursor(newHTML, newCursorOffset);
  } catch (err) {
    console.error('Input patch failed:', err);
    // Fallback: reload from engine
    try {
      const html = await invoke('get_current_html');
      renderHTMLKeepCursor(html, byteOffset);
    } catch (e2) { /* give up */ }
  }
});

// ── Undo/Redo via Engine ──

document.addEventListener('keydown', async (e) => {
  const isMeta = e.metaKey || e.ctrlKey;

  if (isMeta && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    try {
      const newHTML = await invoke('undo');
      lastRenderedHTML = newHTML;
      renderHTML(newHTML);
    } catch (err) { /* nothing to undo */ }
  }

  if (isMeta && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    try {
      const newHTML = await invoke('redo');
      lastRenderedHTML = newHTML;
      renderHTML(newHTML);
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
    lastRenderedHTML = html;
    renderHTML(html);
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
    table.style.setProperty('--guide-border', '1px dashed #c8c8ce');
    table.querySelectorAll('td, th').forEach(cell => {
      cell.style.border = 'var(--guide-border)';
    });
  });
}

// Context menu
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
    case 'col-left': {
      Array.from(table.rows).forEach(r => {
        const newCell = document.createElement(cellTag);
        r.insertBefore(newCell, r.children[cellIndex]);
      });
      return; // DOM-only for now
    }
    case 'col-right': {
      Array.from(table.rows).forEach(r => {
        const newCell = document.createElement(cellTag);
        r.insertBefore(newCell, r.children[cellIndex + 1]);
      });
      return;
    }
    case 'delete-row': if (table.rows.length > 1) row.remove(); return;
    case 'delete-col': {
      if (row.children.length > 1) {
        Array.from(table.rows).forEach(r => {
          if (r.children[cellIndex]) r.children[cellIndex].remove();
        });
      }
      return;
    }
    case 'delete-table': table.remove(); return;
  }

  if (patchHTML) {
    // Find the table in the source and insert
    const html = lastRenderedHTML;
    const tableHTML = table.outerHTML;
    const tableStart = html.indexOf(tableHTML);
    if (tableStart >= 0 && action === 'row-above') {
      // Insert before first row's content
      const firstRow = table.rows[0];
      const rowHTML = firstRow.outerHTML;
      const rowStart = html.indexOf(rowHTML);
      if (rowStart >= 0) {
        const newHTML = await invoke('apply_patch', {
          offset: rowStart,
          length: 0,
          replacement: patchHTML,
        });
        lastRenderedHTML = newHTML;
        renderHTML(newHTML);
      }
    }
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
  showLinkPopover(selectedText, getTextOffsetBefore(sel.getRangeAt(0)));
});

function showLinkPopover(selectedText, offset) {
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
    try {
      const newHTML = await invoke('apply_patch', {
        offset,
        length: selectedText.length,
        replacement,
      });
      lastRenderedHTML = newHTML;
      isDirty = true;
      updateTitle();
      renderHTML(newHTML);
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
    // Select the image
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

// Double-click image to replace
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
    const newSrc = selected.split('/').pop(); // Use filename as relative path

    // Find the old src in the source and replace
    const html = lastRenderedHTML;
    const srcIndex = html.indexOf(`src="${oldSrc}"`);
    if (srcIndex >= 0) {
      const newHTML = await invoke('apply_patch', {
        offset: srcIndex + 5, // after src="
        length: oldSrc.length,
        replacement: newSrc,
      });
      lastRenderedHTML = newHTML;
      isDirty = true;
      updateTitle();
      renderHTML(newHTML);
    }
  } catch (err) {
    console.error('Image replace failed:', err);
  }
});

// ── Recent Files ──

const RECENT_FILES_KEY = 'pagesmith_recent_files';
const MAX_RECENT = 10;

function getRecentFiles() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_FILES_KEY) || '[]');
  } catch { return []; }
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

  // Click handler
  list.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', async () => {
      const path = item.dataset.path;
      try {
        const html = await invoke('open_file', { path });
        const info = await invoke('get_file_info');
        currentFilePath = info.path;
        isDirty = false;
        lastRenderedHTML = html;
        renderHTML(html);
        showEditor();
        updateTitle();
        addRecentFile(path);
      } catch (err) {
        // File no longer exists — remove from recent
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Enable toolbar buttons for visual mode
function setToolbarEnabled(enabled) {
  document.querySelectorAll('#toolbar .toolbar-btn, #toolbar .toolbar-item').forEach(el => {
    el.disabled = !enabled;
  });
}

// Track toolbar state
document.addEventListener('selectionchange', () => {
  if (editMode !== 'visual') return;
  try {
    boldBtn.classList.toggle('active', document.queryCommandState('bold'));
    italicBtn.classList.toggle('active', document.queryCommandState('italic'));
    underlineBtn.classList.toggle('active', document.queryCommandState('underline'));
    strikeBtn.classList.toggle('active', document.queryCommandState('strikeThrough'));
  } catch (e) { /* ignore */ }
});

console.log('PageSmith v0.2 — engine-bridged editor ready');

// Load recent files on startup
renderRecentFiles();
