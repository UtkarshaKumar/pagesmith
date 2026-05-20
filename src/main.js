// PageSmith v0.5 — browser owns DOM, engine owns source
// Text edits: browser handles DOM (cursor preserved natively).
// Engine synced async on each edit (no DOM re-render).
// Formatting: engine patch → re-render with node-path cursor restore.
// Constitution E1: engine is source of truth for SAVE, DOM is live editing view.

import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { t } from './locales/i18n.js';

// ── Status bar (non-blocking, replaces alert()) ──

const statusBar = document.getElementById('status-bar');
let statusTimer = null;

function showStatus(message, type = 'info', durationMs = 5000) {
  if (statusTimer) clearTimeout(statusTimer);
  statusBar.textContent = message;
  statusBar.className = type;
  statusBar.classList.remove('hidden');
  if (type !== 'error') {
    statusTimer = setTimeout(() => statusBar.classList.add('hidden'), durationMs);
  }
}

function clearStatus() {
  if (statusTimer) clearTimeout(statusTimer);
  statusBar.classList.add('hidden');
}

// ── State ──

let currentFilePath = null;
let isDirty = false;
let editMode = 'visual';
let composing = false; // IME composition guard
let pendingSync = null; // Debounce timer for engine sync
let zoomLevel = 100; // Zoom percent, step 10
let savedRange = null; // Last selection that was inside the visual editor

// ── DOM refs ──

const emptyState = document.getElementById('empty-state');
const editorView = document.getElementById('editor-view');
const visualEditor = document.getElementById('visual-editor');
const sourceTextarea = document.getElementById('source-textarea');
const sourceEditor = document.getElementById('source-editor');
const llmEditor = document.getElementById('llm-editor');
const llmTextarea = document.getElementById('llm-textarea');
const visualModeBtn = document.getElementById('visual-mode-btn');
const sourceModeBtn = document.getElementById('source-mode-btn');
const llmModeBtn = document.getElementById('llm-mode-btn');
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

// ── Selection preservation ──
// The contenteditable loses focus when a toolbar button/select is clicked,
// which collapses the selection. We track the last in-editor selection so
// formatting handlers can restore it before reading.

document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const anchor = sel.anchorNode;
  if (anchor && visualEditor.contains(anchor)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
});

function restoreSelection() {
  if (!savedRange) return false;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRange);
  return true;
}

function getActiveSelectionText() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && sel.anchorNode && visualEditor.contains(sel.anchorNode)) {
    const t = sel.toString();
    if (t) return t;
  }
  if (savedRange && !savedRange.collapsed) {
    restoreSelection();
    return savedRange.toString();
  }
  return '';
}

// ── File Operations ──

async function openFile() {
  try {
    const selected = await open({
      filters: [{ name: t('file.filters.html.name'), extensions: ['html', 'htm'] }],
      multiple: false,
    });
    if (!selected) return;

    deselectImage();
    const html = await invoke('open_file', { path: selected });
    currentFilePath = selected;
    isDirty = false;

    visualEditor.innerHTML = html;
    visualEditor.querySelectorAll('script').forEach(s => s.remove());
    sourceTextarea.value = html;
    addTableGuideBorders();
    showEditor();
    updateTitle();
    addRecentFile(selected);
    clearStatus();
  } catch (err) {
    showStatus(t('errors.openFailed'), 'error');
    console.error('Open file failed:', err);
  }
}

async function saveFile() {
  if (!currentFilePath) { await saveFileAs(); return; }
  try {
    if (editMode === 'source') {
      await invoke('set_source_content', { content: sourceTextarea.value });
    } else {
      await syncToEngine();
    }
    await invoke('save_file');
    isDirty = false;
    updateTitle();
    showStatus(t('status.saved'), 'success', 2500);
  } catch (err) {
    showStatus(t('errors.saveFailed'), 'error');
    console.error('Save failed:', err);
  }
}

async function saveFileAs() {
  try {
    const path = await save({
      filters: [{ name: t('file.filters.html.name'), extensions: ['html', 'htm'] }],
    });
    if (!path) return;
    if (editMode === 'source') {
      await invoke('set_source_content', { content: sourceTextarea.value });
    } else {
      await syncToEngine();
    }
    await invoke('save_file_as', { path });
    currentFilePath = path;
    isDirty = false;
    updateTitle();
    clearStatus();
  } catch (err) {
    showStatus(t('errors.saveAsFailed'), 'error');
    console.error('Save As failed:', err);
  }
}

// ── Engine sync (no DOM re-render) ──

async function syncToEngine() {
  await invoke('set_source_content', { content: visualEditor.innerHTML });
}

function debouncedSync() {
  if (pendingSync) clearTimeout(pendingSync);
  pendingSync = setTimeout(() => { syncToEngine().catch(() => {}); pendingSync = null; }, 300);
}

// ── IME composition guard ──

visualEditor.addEventListener('compositionstart', () => { composing = true; });
visualEditor.addEventListener('compositionend', () => {
  composing = false;
  syncToEngine().catch(() => {});
});
visualEditor.addEventListener('compositionupdate', () => { composing = true; }); // reset stale guard

// ── Text editing: browser owns DOM, engine synced in background ──

// Interactive elements: normal click = edit mode, Cmd+click = actual action.
visualEditor.addEventListener('mousedown', (e) => {
  const interactive = e.target.closest('a, button, input:not([type=text]), select, textarea, [onclick]');
  if (!interactive || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
});

visualEditor.addEventListener('click', async (e) => {
  const interactive = e.target.closest('a, button, input:not([type=text]), select, textarea, details, summary, [onclick]');
  if (!interactive) return;

  if (e.metaKey || e.ctrlKey) {
    if (interactive.tagName === 'A') {
      e.preventDefault();
      e.stopPropagation();
      const rawHref = interactive.getAttribute('href') || '';
      if (!rawHref) return;

      // Schemes we don't open in-app
      if (/^(https?:|mailto:|tel:|javascript:)/i.test(rawHref)) {
        if (rawHref.startsWith('http://') || rawHref.startsWith('https://')) {
          showStatus(t('errors.externalUrlWarning'), 'warning');
        }
        return;
      }

      // Split off the fragment (#anchor) so it's not treated as part of the path
      const hashIdx = rawHref.indexOf('#');
      const pathPart = hashIdx >= 0 ? rawHref.slice(0, hashIdx) : rawHref;
      const fragment = hashIdx >= 0 ? rawHref.slice(hashIdx + 1) : '';

      // Pure in-page anchor (#section) → scroll, don't open a file
      if (!pathPart) {
        if (fragment) {
          const target =
            visualEditor.querySelector('#' + CSS.escape(fragment)) ||
            visualEditor.querySelector('[name="' + CSS.escape(fragment) + '"]');
          if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
        return;
      }

      // Resolve relative paths against the current file's directory
      let targetPath = pathPart;
      if (!pathPart.startsWith('/') && currentFilePath) {
        const dir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/') + 1);
        targetPath = dir + pathPart;
      }

      try {
        const html = await invoke('open_file', { path: targetPath });
        currentFilePath = targetPath; isDirty = false;
        visualEditor.innerHTML = html;
        visualEditor.querySelectorAll('script').forEach(s => s.remove());
        sourceTextarea.value = html; addTableGuideBorders();
        updateTitle(); addRecentFile(targetPath);

        // If there was a fragment, scroll to it after the new file loads
        if (fragment) {
          requestAnimationFrame(() => {
            const target =
              visualEditor.querySelector('#' + CSS.escape(fragment)) ||
              visualEditor.querySelector('[name="' + CSS.escape(fragment) + '"]');
            if (target && typeof target.scrollIntoView === 'function') {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          });
        }
      } catch (err) {
        showStatus(t('errors.fileNotFound'), 'error');
      }
    }
    return;
  }
  e.preventDefault();
});

// WKWebView Sequoia fix: TSM (macOS Text Services Manager) can misroute
// text insertion in flex scroll containers. beforeinput fires with correct
// selection before TSM corrupts the insertion point.
visualEditor.addEventListener('beforeinput', (e) => {
  if (e.inputType === 'insertOrderedList' || e.inputType === 'insertUnorderedList') {
    e.preventDefault(); return;
  }
  if (e.inputType !== 'insertText' || e.data === null || composing) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return; // let browser handle if no selection
  e.preventDefault();
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
    const sel = window.getSelection();
    const range = document.createRange();
    if (saved.textNodeIndex >= 0 && node.childNodes[saved.textNodeIndex]) {
      const textNode = node.childNodes[saved.textNodeIndex];
      range.setStart(textNode, Math.min(saved.textOffset, textNode.textContent.length));
    } else {
      range.setStart(node, Math.min(saved.textOffset, node.childNodes.length));
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
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
  const selectedText = getActiveSelectionText();
  if (!selectedText) return;

  await syncToEngine();
  const source = await invoke('get_current_html');
  const offset = source.indexOf(selectedText);
  if (offset < 0) return;

  const openTag = attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`;
  const closeTag = `</${tag}>`;
  await applyFormatPatch(offset, selectedText.length, openTag + selectedText + closeTag);
  isDirty = true;
  updateTitle();
}

boldBtn.addEventListener('click', async () => { await wrapSelection('strong'); });
italicBtn.addEventListener('click', async () => { await wrapSelection('em'); });
underlineBtn.addEventListener('click', async () => { await wrapSelection('u'); });
strikeBtn.addEventListener('click', async () => { await wrapSelection('s'); });

// Find the nearest block ancestor of the current (or saved) selection
// inside the visual editor. Block ops surgically replace this element
// rather than wrapping inline — wrapping inline produces invalid HTML
// like <p><h2>x</h2></p> that the browser silently auto-corrects away.
const BLOCK_TAGS = /^(P|H[1-6]|DIV|BLOCKQUOTE|PRE|ARTICLE|SECTION|ASIDE|HEADER|FOOTER|MAIN|NAV|FIGURE|LI|UL|OL|DL|DD|DT|ADDRESS|HR|TABLE|TR|TD|TH)$/;

function getSelectionParentBlock() {
  let node = null;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && sel.anchorNode && visualEditor.contains(sel.anchorNode)) {
    node = sel.anchorNode;
  } else if (savedRange && savedRange.startContainer && visualEditor.contains(savedRange.startContainer)) {
    node = savedRange.startContainer;
  }
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  while (node && node !== visualEditor && node !== document.body) {
    const tag = node.tagName && node.tagName.toUpperCase();
    if (tag && BLOCK_TAGS.test(tag)) return node;
    node = node.parentNode;
  }
  return null;
}

// Apply a surgical edit to the source by locating the block's outerHTML.
// Caller provides a function that takes the old outerHTML string and
// returns the replacement HTML.
async function patchBlock(block, makeReplacement) {
  if (!block) return false;
  await syncToEngine();
  const source = await invoke('get_current_html');
  const oldHTML = block.outerHTML;
  const offset = source.indexOf(oldHTML);
  if (offset < 0) return false;
  const newHTML = makeReplacement(oldHTML, block);
  if (newHTML == null || newHTML === oldHTML) return false;
  await applyFormatPatch(offset, oldHTML.length, newHTML);
  isDirty = true;
  updateTitle();
  return true;
}

// Replace the parent block's tag with a new one, preserving inner content.
async function changeBlockTag(newTag) {
  const block = getSelectionParentBlock();
  if (!block) return false;
  // Preserve any style/class attributes from the original
  return patchBlock(block, (_, b) => {
    const attrs = [];
    if (b.getAttribute('style')) attrs.push(`style="${b.getAttribute('style').replace(/"/g, '&quot;')}"`);
    if (b.getAttribute('class')) attrs.push(`class="${b.getAttribute('class').replace(/"/g, '&quot;')}"`);
    if (b.getAttribute('id')) attrs.push(`id="${b.getAttribute('id').replace(/"/g, '&quot;')}"`);
    const open = attrs.length ? `<${newTag} ${attrs.join(' ')}>` : `<${newTag}>`;
    return `${open}${b.innerHTML}</${newTag}>`;
  });
}

// Wrap the parent block as a single-item list.
async function wrapBlockAsList(listTag) {
  const block = getSelectionParentBlock();
  if (!block) return false;
  return patchBlock(block, (_, b) => `<${listTag}><li>${b.innerHTML}</li></${listTag}>`);
}

// Apply (or update) text-align on the parent block.
async function setBlockAlign(align) {
  const block = getSelectionParentBlock();
  if (!block) return false;
  return patchBlock(block, (_, b) => {
    const clone = b.cloneNode(true);
    clone.style.textAlign = align;
    return clone.outerHTML;
  });
}

ulBtn.addEventListener('click', async () => { await wrapBlockAsList('ul'); });
olBtn.addEventListener('click', async () => { await wrapBlockAsList('ol'); });

formatSelect.addEventListener('change', async () => {
  const tag = formatSelect.value;
  if (!tag) return;
  await changeBlockTag(tag);
  formatSelect.value = 'p';
});

fontSelect.addEventListener('change', async () => {
  const font = fontSelect.value;
  if (!font) { return; }
  const text = getActiveSelectionText();
  if (!text) { fontSelect.value = ''; return; }
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
  const text = getActiveSelectionText();
  if (!text) { fontSizeSelect.value = ''; return; }
  const source = await invoke('get_current_html');
  const offset = source.indexOf(text);
  if (offset >= 0) {
    await applyFormatPatch(offset, text.length, `<span style="font-size:${size}">${text}</span>`);
  }
  fontSizeSelect.value = '';
});

async function applyAlignment(align) {
  await setBlockAlign(align);
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
      filters: [{ name: t('image.fileFilters.name'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
      multiple: false,
    });
    if (!selected) return;

    restoreSelection();

    const img = document.createElement('img');
    img.setAttribute('src', selected.split('/').pop());
    img.setAttribute('alt', t('editor.imageAltFallback'));

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && sel.anchorNode && visualEditor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      visualEditor.appendChild(img);
    }
    isDirty = true;
    updateTitle();
    await syncToEngine();
  } catch (err) {
    showStatus(t('errors.imageInsertFailed'), 'error');
    console.error('Image insert failed:', err);
  }
});

function showImageToolbar(img) {
  removeImageToolbar();

  imageToolbar = document.createElement('div');
  imageToolbar.id = 'image-toolbar';
  imageToolbar.innerHTML = `
    <div class="image-toolbar-section">
      <label class="image-toolbar-label">${t('image.toolbar.width')}</label>
      <input type="number" id="img-width-input" class="image-toolbar-input" min="1" value="${Math.round(img.offsetWidth)}" />
    </div>
    <div class="image-toolbar-section">
      <label class="image-toolbar-label">${t('image.toolbar.height')}</label>
      <input type="number" id="img-height-input" class="image-toolbar-input" min="1" value="${Math.round(img.offsetHeight)}" />
    </div>
    <div class="image-toolbar-sep"></div>
    <button class="image-toolbar-btn" id="img-link-btn" title="${t('image.toolbar.linkTitle')}">${t('image.toolbar.link')}</button>
    <button class="image-toolbar-btn" id="img-border-btn" title="${t('image.toolbar.borderTitle')}">${t('image.toolbar.border')}</button>
    <button class="image-toolbar-btn" id="img-replace-btn" title="${t('image.toolbar.replaceTitle')}">${t('image.toolbar.replace')}</button>
    <button class="image-toolbar-btn danger" id="img-remove-btn" title="${t('image.toolbar.removeTitle')}">${t('image.toolbar.remove')}</button>
  `;
  imageToolbar.style.cssText = `position:fixed;z-index:200;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);padding:6px 8px;display:flex;align-items:center;gap:4px;`;

  document.body.appendChild(imageToolbar);
  updateImageToolbarPosition();

  // Width/height inputs
  document.getElementById('img-width-input').addEventListener('change', () => {
    if (!selectedImage) return;
    const w = parseInt(document.getElementById('img-width-input').value) || 100;
    selectedImage.style.width = w + 'px';
    selectedImage.style.height = '';
    updateResizeHandlePositions(selectedImage);
    updateImageToolbarPosition();
    isDirty = true; updateTitle(); debouncedSync();
  });

  document.getElementById('img-height-input').addEventListener('change', () => {
    if (!selectedImage) return;
    const h = parseInt(document.getElementById('img-height-input').value) || 100;
    selectedImage.style.height = h + 'px';
    selectedImage.style.width = '';
    updateResizeHandlePositions(selectedImage);
    updateImageToolbarPosition();
    isDirty = true; updateTitle(); debouncedSync();
  });

  document.getElementById('img-replace-btn').addEventListener('click', async () => {
    if (!selectedImage) return;
    try {
      const selected = await open({
        filters: [{ name: t('image.fileFilters.name'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
        multiple: false,
      });
      if (!selected) return;
      selectedImage.setAttribute('src', selected.split('/').pop());
      isDirty = true; updateTitle(); debouncedSync();
    } catch (err) { console.error('Image replace failed:', err); }
  });

  document.getElementById('img-remove-btn').addEventListener('click', () => {
    if (!selectedImage) return;
    const img = selectedImage;
    deselectImage();
    img.remove();
    isDirty = true; updateTitle(); debouncedSync();
  });

  document.getElementById('img-border-btn').addEventListener('click', () => {
    if (!selectedImage) return;
    const style = selectedImage.getAttribute('style') || '';
    if (style.includes('border:')) {
      selectedImage.style.border = '';
      document.getElementById('img-border-btn').classList.remove('active');
    } else {
      selectedImage.style.border = '1px solid var(--border-color)';
      document.getElementById('img-border-btn').classList.add('active');
    }
    isDirty = true; updateTitle(); debouncedSync();
  });

  document.getElementById('img-link-btn').addEventListener('click', async () => {
    if (!selectedImage) return;
    const url = prompt(t('image.linkPrompt'), '');
    if (!url) return;
    const a = document.createElement('a');
    a.setAttribute('href', url);
    selectedImage.parentNode.insertBefore(a, selectedImage);
    a.appendChild(selectedImage);
    isDirty = true; updateTitle(); debouncedSync();
  });

  const currentBorder = selectedImage.style.border || '';
  if (currentBorder && currentBorder !== 'none') {
    document.getElementById('img-border-btn').classList.add('active');
  }
}

function updateSizeInputs() {
  if (!selectedImage || !imageToolbar) return;
  const wInput = document.getElementById('img-width-input');
  const hInput = document.getElementById('img-height-input');
  if (wInput) wInput.value = Math.round(selectedImage.offsetWidth);
  if (hInput) hInput.value = Math.round(selectedImage.offsetHeight);
}

function updateImageToolbarPosition() {
  if (!imageToolbar || !selectedImage) return;
  const r = selectedImage.getBoundingClientRect();
  imageToolbar.style.top = (r.bottom + 6) + 'px';
  imageToolbar.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 340)) + 'px';
}

visualEditor.addEventListener('click', (e) => {
  if (e.target.tagName === 'IMG') {
    selectImage(e.target);
    e.stopPropagation();
  } else {
    deselectImage();
  }
});

visualEditor.addEventListener('dblclick', async (e) => {
  if (e.target.tagName !== 'IMG') return;
  e.preventDefault();
  e.stopPropagation();
  try {
    const selected = await open({
      filters: [{ name: t('image.fileFilters.name'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
      multiple: false,
    });
    if (!selected) return;
    const img = e.target;
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
    list.innerHTML = `<p class="recent-label">${t('emptyState.recentHeading')}</p>`;
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

// ── PDF Export ──

const pdfBtn = document.getElementById('pdf-btn');
if (pdfBtn) {
  pdfBtn.addEventListener('click', async () => {
    try {
      if (editMode === 'source') {
        await invoke('set_source_content', { content: sourceTextarea.value });
      } else {
        await syncToEngine();
      }
      const filePath = await save({
        filters: [{ name: t('file.filters.pdf.name'), extensions: ['pdf'] }],
        defaultPath: (currentFilePath || 'document').replace(/\.html?$/i, '') + '.pdf',
      });
      if (!filePath) return;
      await invoke('export_pdf', { path: filePath });
      showStatus(`${t('status.pdfExported')} ${filePath}`, 'success', 6000);
    } catch (err) {
      showStatus(t('errors.pdfExportFailed'), 'error');
      console.error('PDF export failed:', err);
    }
  });
}

// ── Init ──

// Prevent toolbar buttons from stealing focus from the contenteditable.
// Without this, mousedown shifts focus → selection collapses → every
// formatting handler reads an empty selection and silently no-ops.
// Belt and suspenders: also explicitly capture the live selection on
// mousedown into savedRange BEFORE any focus shift can happen, so even if
// preventDefault is somehow bypassed (WKWebView quirks, <select>, etc.)
// the click handler still has a valid range to fall back on.
document.getElementById('toolbar').addEventListener('mousedown', (e) => {
  // Always save the live range (even when collapsed) so insert-at-cursor
  // operations (image, table, link without selection) can restore the
  // caret position after a file picker or prompt steals focus.
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && sel.anchorNode && visualEditor.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
  const btn = e.target.closest('button');
  if (btn && !btn.disabled) {
    e.preventDefault();
  }
}, true); // capture phase — run before anything else can mutate selection

// ── Keyboard shortcuts ──

document.addEventListener('keydown', async (e) => {
  const isMeta = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();

  if (isMeta && key === 'z' && !e.shiftKey) {
    e.preventDefault();
    try {
      const source = await invoke('undo');
      renderFromSource(source);
    } catch (err) { /* nothing to undo */ }
    return;
  }

  if (isMeta && key === 'z' && e.shiftKey) {
    e.preventDefault();
    try {
      const source = await invoke('redo');
      renderFromSource(source);
    } catch (err) { /* nothing to redo */ }
    return;
  }

  if (isMeta && key === 'b') { e.preventDefault(); await wrapSelection('strong'); return; }
  if (isMeta && key === 'i') { e.preventDefault(); await wrapSelection('em'); return; }
  if (isMeta && key === 'u') { e.preventDefault(); await wrapSelection('u'); return; }

  if (isMeta && key === 'o') { e.preventDefault(); await openFile(); return; }
  if (isMeta && key === 'n') { e.preventDefault(); await invoke('new_window').catch(err => console.error('New window failed:', err)); return; }
  if (isMeta && key === 's' && e.shiftKey) { e.preventDefault(); await saveFileAs(); return; }
  if (isMeta && key === 's') { e.preventDefault(); await saveFile(); return; }
  if (isMeta && key === 'k') { e.preventDefault(); linkBtn.click(); return; }

  if (isMeta && e.shiftKey && key === 'v') {
    e.preventDefault();
    await switchMode(editMode === 'visual' ? 'source' : 'visual');
    return;
  }

  if (isMeta && e.shiftKey && key === 'm') {
    e.preventDefault();
    const next = editMode === 'visual' ? 'source' : editMode === 'source' ? 'llm' : 'visual';
    await switchMode(next);
    return;
  }

  // Zoom
  if (isMeta && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    zoomLevel = Math.min(zoomLevel + 10, 300);
    document.documentElement.style.zoom = zoomLevel + '%';
    return;
  }
  if (isMeta && e.key === '-') {
    e.preventDefault();
    zoomLevel = Math.max(zoomLevel - 10, 50);
    document.documentElement.style.zoom = zoomLevel + '%';
    return;
  }
  if (isMeta && e.key === '0') {
    e.preventDefault();
    zoomLevel = 100;
    document.documentElement.style.zoom = '100%';
    return;
  }
});

openBtn.addEventListener('click', openFile);

// Toolbar Open button (visible when a file is open)
const toolbarOpenBtn = document.getElementById('toolbar-open-btn');
if (toolbarOpenBtn) {
  toolbarOpenBtn.addEventListener('click', openFile);
}

// Recent files dropdown from toolbar
const recentBtn = document.getElementById('recent-btn');
if (recentBtn) {
  recentBtn.addEventListener('click', toggleRecentPanel);
}

// New window button
const newWindowBtn = document.getElementById('new-window-btn');
if (newWindowBtn) {
  newWindowBtn.addEventListener('click', async () => {
    try { await invoke('new_window'); }
    catch (err) { console.error('New window failed:', err); }
  });
}

function toggleRecentPanel() {
  let panel = document.getElementById('recent-panel');
  if (panel) { panel.remove(); return; }

  const recent = getRecentFiles();
  if (recent.length === 0) {
    showStatus(t('toolbar.noRecentFiles'), 'warning');
    return;
  }

  panel = document.createElement('div');
  panel.id = 'recent-panel';
  panel.style.cssText = 'position:fixed;top:80px;left:12px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.24);z-index:1000;min-width:300px;max-height:400px;overflow-y:auto;padding:4px;';

  recent.slice(0, 10).forEach(path => {
    const item = document.createElement('div');
    const filename = path.split('/').pop();
    item.className = 'context-menu-item';
    item.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;padding:8px 12px;';
    item.innerHTML = `<span style="font-weight:500;font-size:13px">${filename}</span><span style="font-size:11px;color:var(--text-secondary);margin-top:2px">${path}</span>`;
    item.addEventListener('click', async () => {
      panel.remove();
      try {
        const html = await invoke('open_file', { path });
        currentFilePath = path; isDirty = false;
        visualEditor.innerHTML = html;
        visualEditor.querySelectorAll('script').forEach(s => s.remove());
        sourceTextarea.value = html; addTableGuideBorders();
        showEditor(); updateTitle(); addRecentFile(path);
      } catch (err) { showStatus(t('errors.fileNotFound'), 'error'); renderRecentFiles(); }
    });
    panel.appendChild(item);
  });

  document.body.appendChild(panel);

  // Close on outside click
  const close = (e) => { if (!panel.contains(e.target) && e.target !== recentBtn) { panel.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function showEditor() {
  emptyState.classList.add('hidden');
  editorView.classList.remove('hidden');
}

function updateTitle() {
  const filename = currentFilePath ? currentFilePath.split('/').pop() : t('app.untitled');
  document.title = (isDirty ? t('app.titleDirtyPrefix') : '') + filename + t('app.titleSuffix');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

renderRecentFiles();
console.log('PageSmith v0.5 — i18n, status bar, image resize, multi-window, LLM view');

// ── Source textarea sync ──

let sourceDirty = false;
let sourceSyncTimer = null;

sourceTextarea.addEventListener('input', () => {
  sourceDirty = true;
  if (sourceSyncTimer) clearTimeout(sourceSyncTimer);
  sourceSyncTimer = setTimeout(async () => {
    if (!sourceDirty) return;
    try {
      await invoke('set_source_content', { content: sourceTextarea.value });
      sourceDirty = false;
    } catch (err) { console.error('Source sync failed:', err); }
  }, 500);
});

// ── Binary image detection ──

const BINARY_IMAGE_EXTS = new Set(['.pdf', '.zip', '.tar', '.gz', '.exe', '.bin', '.dmg', '.iso', '.rar', '.7z', '.mp3', '.mp4', '.mov', '.avi']);

visualEditor.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  const src = img.getAttribute('src') || '';
  const ext = src.slice(src.lastIndexOf('.')).toLowerCase();
  if (BINARY_IMAGE_EXTS.has(ext)) {
    img.outerHTML = `<span style="display:inline-block;padding:6px 10px;background:var(--bg-secondary);color:var(--text-secondary);border:1px dashed var(--border-color);border-radius:4px;font-size:12px;font-family:var(--font-mono)">[Binary: ${src}]</span>`;
  }
}, true);

// ── Visual / Source / LLM Mode Toggle ──

visualModeBtn.addEventListener('click', () => switchMode('visual'));
sourceModeBtn.addEventListener('click', () => switchMode('source'));
if (llmModeBtn) llmModeBtn.addEventListener('click', () => switchMode('llm'));

async function switchMode(mode) {
  if (mode === editMode) return;
  deselectImage();
  try {
    if (editMode === 'source') {
      await invoke('set_source_content', { content: sourceTextarea.value });
    } else if (editMode === 'visual') {
      await syncToEngine();
    }
    const source = await invoke('get_current_html');

    if (mode === 'visual') {
      visualEditor.innerHTML = source;
      visualEditor.querySelectorAll('script').forEach(s => s.remove());
      addTableGuideBorders();
    } else if (mode === 'source') {
      sourceTextarea.value = source;
    } else if (mode === 'llm') {
      const filename = currentFilePath ? currentFilePath.split('/').pop() : t('app.untitled');
      const cxml = [
        '<documents>',
        '  <document index="1">',
        `    <source>${filename}</source>`,
        '    <document_content>',
        source,
        '    </document_content>',
        '  </document>',
        '</documents>'
      ].join('\n');
      llmTextarea.value = cxml;
      setTimeout(() => { llmTextarea.focus(); llmTextarea.select(); }, 50);
    }
    editMode = mode;
  } catch (err) {
    showStatus(t('errors.modeSwitchFailed'), 'error');
    console.error('Mode switch failed:', err);
    return;
  }
  visualEditor.classList.toggle('hidden', mode !== 'visual');
  sourceEditor.classList.toggle('hidden', mode !== 'source');
  llmEditor.classList.toggle('hidden', mode !== 'llm');
  visualModeBtn.classList.toggle('active', mode === 'visual');
  sourceModeBtn.classList.toggle('active', mode === 'source');
  if (llmModeBtn) llmModeBtn.classList.toggle('active', mode === 'llm');
}

// Keep image handles and toolbar positioned on scroll/resize
visualEditor.addEventListener('scroll', () => {
  if (resizeHandles && selectedImage) updateResizeHandlePositions(selectedImage);
  if (imageToolbar && selectedImage) updateImageToolbarPosition();
});
window.addEventListener('resize', () => {
  if (resizeHandles && selectedImage) updateResizeHandlePositions(selectedImage);
  if (imageToolbar && selectedImage) updateImageToolbarPosition();
});

// Theme toggle (auto → dark → light → auto)
const themeBtn = document.getElementById('theme-btn');
const themeIcons = { auto: 'brightness_auto', dark: 'dark_mode', light: 'light_mode' };
let currentTheme = localStorage.getItem('pagesmith_theme') || 'auto';

function applyTheme(theme) {
  document.documentElement.removeAttribute('data-theme');
  if (theme !== 'auto') document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pagesmith_theme', theme);
  if (themeBtn) {
    const icon = themeBtn.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = themeIcons[theme] || themeIcons.auto;
  }
}

applyTheme(currentTheme);
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const cycle = { auto: 'dark', dark: 'light', light: 'auto' };
    currentTheme = cycle[currentTheme] || 'auto';
    applyTheme(currentTheme);
  });
}

// Expose functions for macOS menu bar callbacks
window.__pageSmithOpenFile = openFile;
window.__pageSmithSaveFile = saveFile;
window.__pageSmithToggleSource = () => switchMode(editMode === 'visual' ? 'source' : 'visual');
