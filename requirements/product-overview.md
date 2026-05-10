# PageSmith — Product Overview

> Edit HTML. Visually. Finally.

**Status:** Pre-build / Design phase
**Created:** 2026-05-11

---

## Business Problem

LLMs generate HTML by the gigabyte. Humans need to refine it. Then LLMs need to refine it again. Today this loop is broken — LLMs regenerate entire files and hope nothing else breaks, humans squint at markup in text editors, and every round-trip is lossy.

Beyond LLMs, millions of non-technical people receive HTML files they need to edit — email templates, LMS exports, BI reports, legacy sites — and their only option is "open it in Notepad."

The category between code editors (showing DOM trees) and site builders (trapping you in proprietary formats) is hollow. There is no "Word for HTML."

## Current State

| What people do today | Pain |
|---------------------|------|
| Open .html in TextEdit/Notepad, edit raw markup | Error-prone, intimidating, slow |
| Use WYSIWYG site builders (Wix, Webflow, Sparkle) | Can't open arbitrary .html — proprietary formats only |
| Use code editors with preview (VS Code, Nova) | Visual editing is an afterthought, split-pane only |
| Ask LLM to regenerate the whole file | Loses manual tweaks, unpredictable changes |
| Use Pinegrow | Closest match, but dev-tool UX overwhelms non-technical users; $120/yr |
| Use Dreamweaver | Subscription, dated, dev-framed |

None of these give a non-technical user: open any .html → edit it like a Word doc → save back cleanly.

## Personas

### Primary: Non-technical professional
**Name:** Maya (marketer, teacher, lawyer, consultant, small business owner)
**Goal:** Edit an HTML file someone sent me without learning to code
**Pain:** "I have this .html file and I just need to change the date and a few words. Why is this so hard?"
**Tech comfort:** Uses Word, email, browsers. Has never seen an HTML tag.
**Trigger:** Receives an HTML email template, LMS export, or BI report. Double-clicks it. Something opens that shows code. She closes it and asks someone for help.

### Secondary: LLM-augmented developer
**Name:** Arjun (developer using Claude/ChatGPT to generate HTML)
**Goal:** Refine LLM-generated HTML without the LLM breaking things it shouldn't touch
**Pain:** "I told it to change the table header and it rewrote the entire page and broke the CSS. Now I have to diff the outputs."
**Tech comfort:** Technical but wants speed, not ceremony.
**Trigger:** LLM produces an .html. He opens it in PageSmith, tweaks visually, then asks the LLM to do a surgical change — and PageSmith applies it without touching the rest.

### Tertiary: Legacy site maintainer
**Name:** Raj (small business owner with a 10-year-old hand-coded site)
**Goal:** Update content on his site without breaking it
**Pain:** "The person who built this moved on. Now it's just me and I'm terrified of breaking something."
**Tech comfort:** Low. Knows enough to be dangerous (and worried about it).

---

## Product Funnel

### 1. Discovery — How users find PageSmith

| Channel | Trigger | User state |
|---------|---------|------------|
| Organic search | "HTML editor Mac," "edit HTML visually," "WYSIWYG HTML editor" | Actively looking for exactly this |
| LLM workflow | Claude/ChatGPT generates HTML → "how do I edit this?" → search | Has a file in hand, needs to edit it now |
| App Store browse | "Developer Tools" or "Productivity" categories on Mac App Store | Browsing, comparing options |
| Word of mouth | Developer shares with non-technical colleague; teacher recommends to peers | Trust transfer — high-intent |
| File association | Double-clicks .html, Mac shows "No application set" → App Store suggestion | Unplanned discovery, high frustration |

**Acquisition cost:** Near-zero. No ad spend needed for v0.1. The demand already exists and is unserved.

### 2. Onboarding — First 60 seconds

The onboarding is the file. There is no sign-up, no account, no project creation, no template picker, no tutorial overlay.

**Empty state (cold launch):**
- Clean window with a centered prompt: "Open an HTML file to start editing" with a large "Open…" button
- Below it: a Recent Files area (empty, with gentle hint "Recently opened files will appear here")
- Standard Mac menu bar: File, Edit, View, Format, Help
- That's it. No dashboard. No welcome wizard. No "What's New."

**First session — the golden path:**
1. User drags an .html onto the window (or dock icon, or Cmd+O)
2. File renders immediately as a visual WYSIWYG page
3. User sees their content — looks right, familiar
4. User clicks a word → cursor appears, blinking
5. User types → text changes inline, in place
6. User presses Cmd+S → file saved. Changes are confirmed directly in PageSmith's rendered view — no browser required. Optional: File → Preview in Browser (Cmd+Shift+B) opens the file in the default browser for a second look.
7. Time from open to first successful edit + save: under 30 seconds.

**What we do NOT show during first session:**
- No feature tour / tooltips / coach marks
- No "Would you like to set PageSmith as default for .html?" — ask later
- Source/code view is available alongside the visual view — user chooses which mode to work in via a visible tab or toggle, not a hidden menu
- No upsell, no newsletter prompt, no rating ask

### 3. Aha Moment — When the user realizes this is different

The aha moment is not a feature. It's the absence of friction at a point where every other tool failed them.

**Aha #1: "I just edited an HTML file and didn't see any code."**
User opened an .html, changed text, saved, and the in-app rendered view shows exactly what changed. No angle brackets appeared. No dialog asked about encoding or doctype. It just worked.

**Aha #2: "It didn't break anything."**
User opened a complex HTML file — one with inline scripts, custom CSS, commented-out sections. They changed one sentence in a paragraph. Saved. Reopened. The scripts still work. The styles are intact. The comments are still there. The file is identical except for the one sentence they changed.

**Aha #3: "I can edit a table like a spreadsheet."**
User clicks into a table cell. Types. Tabs to the next cell. Right-clicks to add a row. It behaves exactly like they expect from Word or Excel. No table builder dialog. No "edit HTML" popup. Just direct manipulation.

**Aha #4 (LLM users): "The LLM fixed the table and nothing else moved."**
Developer asks Claude: "Add a striped row pattern to this table." Claude sends a surgical patch via PageSmith's tooling. PageSmith applies it at the exact character offsets. The rest of the file — header metadata, other sections, inline scripts — passes through untouched. The developer didn't have to copy-paste code or diff files.

### 4. Returning User Experience — Sessions 2 through N

**Launch to ready in under 2 seconds:**
- App opens cold to the Recent Files view (if no file was open when last closed)
- Or restores the last-open file (configurable preference, default: restore)
- Recent files show filename + last-modified date + small thumbnail preview

**The habitual workflow:**
1. Receive or generate an HTML file
2. Double-click it in Finder → opens in PageSmith (file association)
3. Make changes (typically < 5 minutes of work)
4. Cmd+S → done
5. Close window (or leave open)

**File association is the retention engine:**
Once PageSmith is set as the default handler for .html, every double-click on an HTML file in Finder opens PageSmith. This embeds it into the OS workflow — the user doesn't "decide to use PageSmith," it's just what happens when they open an HTML file.

### 5. Retention — What keeps users coming back

| Retention driver | Why it works |
|-----------------|--------------|
| **No alternative exists** | The job is "edit arbitrary HTML visually." Nobody else does it. Churn is to nothing — there is no competitor to leave for. |
| **File association lock-in** | Once default handler is set, the OS routes all .html files here. Habit forms without conscious choice. |
| **LLM workflow integration** | For devs, PageSmith becomes a tool in their chain: generate → refine → iterate. Sessions are short but frequent. |
| **Zero learning curve** | There's nothing to re-learn after a gap. Open file → click → edit → save. The interface is not a skill. |
| **Trust through reliability** | Round-trip faithfulness means the user never has a "PageSmith ate my file" moment. Trust compounds with every successful save. |
| **Performance** | Sub-second launch, instant file load. No "waiting for PageSmith to start" friction. |

**Retention metrics to track:**
- Day-1 retention: % of users who open a file, edit, and save in their first session
- Day-7 retention: % who return and edit another file within a week
- Default-handler adoption: % who set PageSmith as default .html handler
- Sessions per file: average edit sessions per unique file (indicates iterative refinement)

---

## Feature Spec — v0.1

### Domain: FILE — File operations

**REQ-FILE-001: Open any HTML file**
**User Story:** As a user, I want to open any .html or .htm file from disk, so I can start editing it visually.

**Acceptance Criteria:**
- AC-FILE-001.1: When the user presses Cmd+O or clicks File → Open, the system shall present a native macOS file picker filtered to .html / .htm files.
- AC-FILE-001.2: When the user drags an .html file onto the app window or dock icon, the system shall open it immediately.
- AC-FILE-001.3: When the user right-clicks an .html file in Finder and selects Open With → PageSmith, the system shall launch (or bring to foreground) and open the file.
- AC-FILE-001.4: When a file is opened, the system shall render it as a WYSIWYG visual page within 1 second for files under 5 MB.
- AC-FILE-001.5: When a file fails to parse (malformed HTML), the system shall display the raw source in a read-only view with a banner: "This file contains HTML errors. You can still edit the source." The system shall not crash or show a blank page.

---

**REQ-FILE-002: Save (overwrite original)**
**User Story:** As a user, I want to save my changes with Cmd+S, so I can overwrite the original file and see my changes in a browser.

**Acceptance Criteria:**
- AC-FILE-002.1: When the user presses Cmd+S (or File → Save), the system shall write the changes to the original file path.
- AC-FILE-002.2: After save, regions of the file the user did not edit shall be byte-identical to the pre-edit file (whitespace, comments, attribute order, scripts preserved).
- AC-FILE-002.3: After save, the window title shall lose the "— Edited" indicator.
- AC-FILE-002.4: When the file has been modified externally since last open, the system shall warn: "This file has been modified by another application. Save anyway?" with options [Save Anyway] [Cancel].

---

**REQ-FILE-003: Save As (new copy)**
**User Story:** As a user, I want to save a copy of my edited file to a new location, so I can create variants without losing the original.

**Acceptance Criteria:**
- AC-FILE-003.1: When the user presses Cmd+Shift+S (or File → Save As), the system shall present a native save dialog.
- AC-FILE-003.2: After Save As, the active document shall point to the new file path.

---

**REQ-FILE-004: Recent files**
**User Story:** As a returning user, I want to see a list of recently opened files, so I can resume editing without navigating Finder.

**Acceptance Criteria:**
- AC-FILE-004.1: The empty state and File → Open Recent menu shall display the 10 most recently opened files, sorted by last-open time (newest first).
- AC-FILE-004.2: Each entry shall show: filename, last-modified date, and a small thumbnail preview of the rendered page.
- AC-FILE-004.3: When a file in the recent list no longer exists at its path, the system shall show it greyed out with "(file not found)" and skip it on click.

---

### Domain: EDIT — Content editing

**REQ-EDIT-001: Inline text editing**
**User Story:** As a user, I want to click on any text and start typing, so I can edit content directly on the page.

**Acceptance Criteria:**
- AC-EDIT-001.1: When the user clicks on visible text content, the system shall place a blinking text cursor at the click position.
- AC-EDIT-001.2: When the user types, characters shall appear at the cursor position and the surrounding content shall reflow naturally.
- AC-EDIT-001.3: When the user presses Enter, the system shall create a new paragraph (insert `<p>` or split the current block element).
- AC-EDIT-001.4: When the user presses Backspace/Delete, characters shall be removed. When an entire text node is deleted, the system shall merge adjacent blocks if appropriate.
- AC-EDIT-001.5: Text selection (click-drag, double-click for word, triple-click for paragraph) shall behave as expected from any word processor.

---

**REQ-EDIT-002: Rich text formatting**
**User Story:** As a user, I want to apply bold, italic, underline, and strikethrough to selected text, so I can format content visually.

**Acceptance Criteria:**
- AC-EDIT-002.1: When the user selects text and presses Cmd+B (or clicks the Bold toolbar button), the system shall wrap the selection in `<strong>` tags. If already bold, unwrap.
- AC-EDIT-002.2: Cmd+I shall toggle `<em>`. Cmd+U shall toggle `<u>`. Strikethrough shall toggle `<s>` or `<del>`.
- AC-EDIT-002.3: The toolbar formatting buttons shall reflect the active state (pressed/active) when the cursor is inside formatted text.

---

**REQ-EDIT-003: Paragraph formatting**
**User Story:** As a user, I want to set heading levels, paragraphs, and blockquotes, so I can structure my document.

**Acceptance Criteria:**
- AC-EDIT-003.1: The system shall provide a dropdown or segmented control to set the current block to: Paragraph, H1, H2, H3, H4, H5, H6, Blockquote, Preformatted.
- AC-EDIT-003.2: Changing the block type shall replace the enclosing tag while preserving inner content.
- AC-EDIT-003.3: The selected block type shall be clearly indicated in the toolbar.

---

**REQ-EDIT-004: Lists**
**User Story:** As a user, I want to create ordered and unordered lists, so I can organize content.

**Acceptance Criteria:**
- AC-EDIT-004.1: The toolbar shall provide buttons for bulleted list and numbered list.
- AC-EDIT-004.2: Pressing Enter in a list item shall create a new list item.
- AC-EDIT-004.3: Pressing Enter twice in an empty list item shall exit the list.
- AC-EDIT-004.4: Tab shall indent the list item (nest sublist). Shift+Tab shall outdent.

---

**REQ-EDIT-005: Table editing**
**User Story:** As a user, I want to edit table content visually — type in cells, add/remove rows and columns — so I can manage tabular data like a spreadsheet.

**Acceptance Criteria:**
- AC-EDIT-005.1: When the user clicks inside a table cell, the system shall place a cursor and allow text editing, including formatted text within the cell.
- AC-EDIT-005.2: Tab shall move to the next cell. Shift+Tab shall move to the previous cell.
- AC-EDIT-005.3: Right-click on a table shall show a context menu: Insert Row Above, Insert Row Below, Insert Column Left, Insert Column Right, Delete Row, Delete Column, Delete Table.
- AC-EDIT-005.4: When rows/columns are added, the system shall match the styling of adjacent rows/columns where possible, or use sensible defaults.
- AC-EDIT-005.5: The table shall display visible cell borders (even if the source CSS doesn't define them) to make cells distinguishable during editing. These guide borders shall not appear in the saved output.

---

**REQ-EDIT-006: Links**
**User Story:** As a user, I want to add, edit, and remove hyperlinks, so I can connect content to URLs.

**Acceptance Criteria:**
- AC-EDIT-006.1: When the user selects text and presses Cmd+K, the system shall show an inline dialog with fields: URL, Link Text (pre-filled with selection), and Open in New Tab (checkbox).
- AC-EDIT-006.2: When the user clicks an existing link, a small floating toolbar shall appear with: Edit Link, Open Link, Remove Link.
- AC-EDIT-006.3: Removing a link shall unwrap the `<a>` tag while preserving the link text.

---

**REQ-EDIT-007: Images**
**User Story:** As a user, I want to view images on the page and replace them, so I can update visual content.

**Acceptance Criteria:**
- AC-EDIT-007.1: Images shall render inline at their natural or CSS-specified size.
- AC-EDIT-007.2: Clicking an image shall select it, showing resize handles at corners.
- AC-EDIT-007.3: Double-clicking an image shall open a file picker to replace the image source. The system shall copy the new image to a relative path if the file is saved in a directory with an assets folder, or prompt for path handling.
- AC-EDIT-007.4: The system shall not delete or orphan the original image file.

---

**REQ-EDIT-008: Text styling (color, font, size, alignment)**
**User Story:** As a user, I want to change text color, font, size, and alignment visually, so I can style content without CSS.

**Acceptance Criteria:**
- AC-EDIT-008.1: The toolbar shall provide: text color picker, background color picker (highlight), font family dropdown (web-safe fonts + system fonts), font size, and alignment buttons (left, center, right, justify).
- AC-EDIT-008.2: Color changes shall apply as inline styles (`style="color: #xxx"`) to the selected text or block.
- AC-EDIT-008.3: Alignment shall apply as inline CSS `text-align` on the block element.

---

**REQ-EDIT-009: Undo / Redo**
**User Story:** As a user, I want to undo and redo my changes, so I can recover from mistakes.

**Acceptance Criteria:**
- AC-EDIT-009.1: Cmd+Z shall undo the last edit operation. Cmd+Shift+Z shall redo.
- AC-EDIT-009.2: The undo stack shall persist for the current session. Closing the file clears the undo stack.
- AC-EDIT-009.3: Undo shall operate on the surgical edit model — replaying the inverse patch. Undo shall not reload the file from disk.

---

### Domain: VIEW — Display and navigation

**REQ-VIEW-001: WYSIWYG rendering**
**User Story:** As a user, I want the page to render visually as close to browser rendering as possible, so I can see what I'm editing.

**Acceptance Criteria:**
- AC-VIEW-001.1: The rendered view shall use WebKit (same engine as Safari) for accurate rendering.
- AC-VIEW-001.2: CSS (inline, internal `<style>`, and external linked stylesheets) shall be applied to the rendered view.
- AC-VIEW-001.3: JavaScript shall NOT execute in the editing view. The page shall be rendered statically.
- AC-VIEW-001.4: Inline scripts (`<script>`), event handlers (`onclick`), and external scripts shall be preserved in the source model but inert in the rendered view.

---

**REQ-VIEW-002: Dual editing modes (Visual + Source)**
**User Story:** As a user, I want to switch freely between visual WYSIWYG editing and source code editing, so I can work in whichever mode suits my task and skill level.

**Acceptance Criteria:**
- AC-VIEW-002.1: The editor shall provide a visible, persistent tab or toggle to switch between "Visual" and "Source" editing modes. The toggle shall be visible at all times — not hidden behind a menu.
- AC-VIEW-002.2: In Visual mode, the page renders as WYSIWYG with the formatting toolbar active. In Source mode, the raw HTML source is displayed with syntax highlighting in a monospace editor.
- AC-VIEW-002.3: Edits in Source mode shall update the rendered view in Visual mode when the user switches back (debounced at 300ms). Edits in Visual mode shall update the source when the user switches to Source mode.
- AC-VIEW-002.4: The active editing mode (Visual or Source) shall persist across app sessions per user preference.
- AC-VIEW-002.5: The default mode on first open shall be Visual (WYSIWYG). Users can change their default in Preferences.
- AC-VIEW-002.6: Cmd+Shift+V shall toggle between Visual and Source mode, in addition to the visible tab/toggle.

---

### Domain: HTML5 — HTML5 standards support

**REQ-HTML5-001: Semantic element support**
**User Story:** As a user, I want PageSmith to render and allow editing of HTML5 semantic elements, so that modern HTML documents are fully editable.

**Acceptance Criteria:**
- AC-HTML5-001.1: The rendered view shall correctly display all HTML5 semantic elements: `<article>`, `<section>`, `<nav>`, `<header>`, `<footer>`, `<aside>`, `<main>`, `<figure>`, `<figcaption>`, `<details>`, `<summary>`, `<mark>`, `<time>`, `<data>`, `<dialog>`, `<template>`.
- AC-HTML5-001.2: Semantic elements shall be preserved through edit + save (they are standard elements; round-trip rules apply).
- AC-HTML5-001.3: The paragraph format dropdown shall include `<main>`, `<header>`, `<footer>`, `<aside>`, `<nav>`, `<section>`, `<article>`, `<figure>`, `<figcaption>`, `<blockquote>` as available block-level formats alongside standard headings and paragraphs.

---

**REQ-HTML5-002: HTML5 form elements**
**User Story:** As a user, I want HTML5 form elements to render correctly and be editable, so that forms within HTML files are not broken by the editor.

**Acceptance Criteria:**
- AC-HTML5-002.1: All HTML5 input types shall render correctly: `date`, `time`, `datetime-local`, `month`, `week`, `color`, `range`, `number`, `email`, `url`, `tel`, `search`.
- AC-HTML5-002.2: Form elements and their attributes shall be preserved verbatim through edit + save (forms are not editable via visual mode but are preserved).
- AC-HTML5-002.3: The rendered view shall show form elements in their visual state (date picker shows date, color shows swatch, etc.) where the browser engine supports it, but they shall be rendered inert (non-interactive) in the editing view per JavaScript execution policy.

---

**REQ-HTML5-003: Multimedia elements**
**User Story:** As a user, I want `<audio>`, `<video>`, `<canvas>`, and `<svg>` elements to render as visual placeholders with their attributes editable, so I can manage multimedia content.

**Acceptance Criteria:**
- AC-HTML5-003.1: `<video>` and `<audio>` elements shall render as visual placeholders showing the source URL, dimensions, and controls attribute state. Media shall not auto-play in the editing view.
- AC-HTML5-003.2: `<canvas>` elements shall render as a placeholder box with dimensions. Canvas drawing is JavaScript-dependent and shall not execute.
- AC-HTML5-003.3: Inline and external `<svg>` elements shall render visually at their specified dimensions.
- AC-HTML5-003.4: All multimedia element attributes (`src`, `width`, `height`, `controls`, `autoplay`, `loop`, `muted`, `poster`) shall be editable via the source view and preserved through save.

---

**REQ-HTML5-004: Custom data attributes and ARIA**
**User Story:** As a user, I want `data-*` attributes and ARIA roles to be preserved, so that accessibility and framework-specific markup survives editing.

**Acceptance Criteria:**
- AC-HTML5-004.1: All `data-*` attributes shall be preserved verbatim through edit + save for unedited elements.
- AC-HTML5-004.2: All ARIA attributes (`role`, `aria-*`) shall be preserved verbatim through edit + save.
- AC-HTML5-004.3: Custom attributes from frameworks (Vue `v-*`, Alpine `x-*`, Angular `*ng*`, React `data-react-*`) shall be preserved verbatim through edit + save — PageSmith treats all attributes as opaque strings.

---

**REQ-HTML5-005: Microdata and metadata**
**User Story:** As a user, I want Schema.org microdata, Open Graph tags, and JSON-LD to survive editing intact, so that SEO and social sharing metadata is not lost.

**Acceptance Criteria:**
- AC-HTML5-005.1: Schema.org `itemscope`, `itemtype`, `itemprop` attributes shall be preserved verbatim through edit + save.
- AC-HTML5-005.2: `<meta>` tags (Open Graph, Twitter Cards, charset, viewport) in `<head>` shall be preserved verbatim.
- AC-HTML5-005.3: `<script type="application/ld+json">` JSON-LD blocks shall be preserved verbatim through edit + save.

---

### Domain: APP — Application shell

**REQ-APP-001: Native Mac window**
**User Story:** As a Mac user, I expect the app to feel native — standard window chrome, menu bar, keyboard shortcuts.

**Acceptance Criteria:**
- AC-APP-001.1: The window shall use standard macOS title bar, traffic-light buttons, and resize behavior.
- AC-APP-001.2: The menu bar shall include File, Edit, View, Format, Window, Help menus with standard Mac shortcuts.
- AC-APP-001.3: Cmd+W shall close the current window. Cmd+Q shall quit the app.
- AC-APP-001.4: The window title shall display the current filename, with "— Edited" appended when there are unsaved changes.

---

**REQ-APP-002: Toolbar**
**User Story:** As a user, I want a formatting toolbar at the top of the editing window, so I can access common formatting actions.

**Acceptance Criteria:**
- AC-APP-002.1: The toolbar shall be a single row below the title bar, not collapsible, always visible during editing.
- AC-APP-002.2: The toolbar shall include, left to right: paragraph format dropdown, font family dropdown, font size dropdown, Bold, Italic, Underline, Strikethrough, text color, highlight color, bullet list, numbered list, alignment group (L/C/R/J), link, image.
- AC-APP-002.3: The toolbar shall be context-sensitive: buttons that don't apply to the current selection shall be disabled (greyed out), not hidden. Hidden elements cause layout shift and confusion.
- AC-APP-002.4: Every toolbar button shall have a tooltip showing the action name and keyboard shortcut.

---

**REQ-APP-003: Context menu**
**User Story:** As a user, I want right-click to show a context-sensitive menu, so I can access actions relevant to what I clicked.

**Acceptance Criteria:**
- AC-APP-003.1: Right-click on text shall show: Cut, Copy, Paste, and formatting options.
- AC-APP-003.2: Right-click on a table shall add table-specific actions (see REQ-EDIT-005).
- AC-APP-003.3: Right-click on a link shall show: Edit Link, Open Link, Remove Link.
- AC-APP-003.4: Right-click on an image shall show: Replace Image, Copy Image Address.
- AC-APP-003.5: Right-click on empty space shall show: Paste.

---

### Domain: LLM — LLM surgical tooling (v1)

**REQ-LLM-001: Surgical replace**
**User Story:** As an LLM (acting on behalf of a user), I want to replace a precise character range in the source buffer, so I can make targeted edits without touching surrounding content.

**Acceptance Criteria:**
- AC-LLM-001.1: The system shall expose a `replace_range(offset, length, new_text)` operation accessible via IPC or local API.
- AC-LLM-001.2: The operation shall modify only the specified range. Bytes before `offset` and after `offset + length` shall pass through unmodified.
- AC-LLM-001.3: The operation shall be recorded on the undo stack, identical to a human edit.
- AC-LLM-001.4: After applying the patch, the rendered view shall update to reflect the change.

---

**REQ-LLM-002: Read source range**
**User Story:** As an LLM, I want to read a specific character range of the source, so I can understand context before making an edit.

**Acceptance Criteria:**
- AC-LLM-002.1: The system shall expose a `read_range(offset, length)` operation returning the raw source text in that range.
- AC-LLM-002.2: The returned text shall include whitespace, comments, and markup exactly as stored.

---

**REQ-LLM-003: DOM-aware insert**
**User Story:** As an LLM, I want to insert HTML before or after a CSS selector target, so I can add elements structurally.

**Acceptance Criteria:**
- AC-LLM-003.1: `insert_before(selector, html)` shall compute the character offset after the target element's closing `>` and insert the HTML string there.
- AC-LLM-003.2: `insert_after(selector, html)` shall insert after the target's closing tag.
- AC-LLM-003.3: If the selector matches zero or multiple elements, the system shall return an error with the match count.

---

## Non-Goals (v0.1)

- **AI content generation.** Claude/ChatGPT already generate HTML. PageSmith refines their output.
- **Multi-file / project management.** PageSmith edits one .html at a time. There is no "project" concept.
- **CSS class editor / visual style panel.** Inline styles and basic formatting only. No class management UI.
- **Site builder features.** No page linking, site navigation, publishing, or hosting.
- **Template gallery.** No "New from Template." Users bring their own HTML or start from blank.
- **Collaboration / cloud sync.** Local files only. No server component.
- **Browser-based full product.** Web trial for Chromium users is optional. The real product is the Mac app.
- **Cross-platform (Windows/Linux).** Mac-only for v0.1.
- **Plugin / extension system.**

---

## Success Metrics

| Metric | Target | How measured |
|--------|--------|-------------|
| Time-to-first-edit | < 30 seconds from app launch | Instrumentation |
| Round-trip faithfulness | 100% byte-identical untouched regions | Automated test suite |
| App launch time (cold) | < 1 second | Instrumentation |
| File open time (< 5 MB) | < 1 second | Instrumentation |
| Day-1 activation | > 80% of launches result in edit + save | Instrumentation |
| Default-handler adoption | > 40% of users set as default within 7 days | OS file association API |
| Binary size | < 15 MB | Build output |
| Crash rate | < 0.1% of sessions | Crash reporter |

---

## UX Principles

1. **The file is the onboarding.** No tours, no wizards, no "Getting Started" docs.
2. **Surgery over reconstruction.** Never rewrite what the user didn't touch.
3. **Visible grid, accessible code.** Users edit what they see in Visual mode. When they need precision, they switch to Source mode via a visible toggle. Both modes are first-class.
4. **No AI slop.** Every action is deterministic. No "smart" formatting, no opinionated cleanup, no guessing intent.
5. **Word, not Dreamweaver.** The mental model is a word processor for a different file format — not a "simplified dev tool."
6. **One code path.** LLM edits and human edits go through the same surgical patcher. No dual implementation.
7. **Silence is golden.** Don't prompt, don't upsell, don't notify. The app should feel quiet and focused.

---

## Figma Mockup Requirements

> Copy this entire section into Figma AI (or any design tool) to generate PageSmith prototypes.

**Product:** PageSmith — a macOS app that opens any .html file and lets you edit it visually, like Microsoft Word for HTML. No code required. No project files. Just open, edit, save.

**Platform:** macOS native (Tauri 2, WKWebView rendering). Target feel: native Mac app with SF Pro typography, standard window chrome, clean toolbar.

**Sample content for mockups:** Use a marketing email template as the sample HTML — it naturally contains headings (H1, H2), paragraphs, a table (pricing or schedule), an image (logo), and hyperlinks. This covers all core editing surfaces in one file.

---

### Screens to mock

1. **Empty state** — No file open. Clean window with centered prompt: "Open an HTML file to start editing" with a large "Open…" button. Below: Recent Files area (empty, with hint "Recently opened files will appear here"). Standard macOS title bar with File, Edit, View, Format, Help menus. No sidebar, no dashboard.

2. **Loaded file — Visual mode** — A sample HTML page (email template) rendered as WYSIWYG. Toolbar visible at top with: paragraph format dropdown (showing "Paragraph"), font dropdown, font size, Bold/Italic/Underline buttons, text color, alignment group, list buttons, link button, image button. Visual/Source toggle visible near the toolbar (set to "Visual"). Content area: white background, page content centered like a document.

3. **Text editing** — Same file, cursor blinking in a paragraph. User has selected a word — it's highlighted. Toolbar reflects: Bold button active (pressed state), font dropdown shows current font. Visual/Source toggle stays visible.

4. **Table editing** — Same file, user clicked inside a table cell. Cell has a blue focus outline. Guide borders visible on all table cells (light dashed lines — these are visual-only, not in the source). Right-click context menu visible: Insert Row Above, Insert Row Below, Insert Column Left, Insert Column Right, Delete Row, Delete Column.

5. **Link editing** — Inline dialog (small popover) floating near selected text. Fields: URL (with placeholder "https://..."), Link Text (pre-filled with selected text), "Open in New Tab" checkbox. Buttons: Save Link, Remove Link, Cancel.

6. **Recent files** — Empty-state variant with 5-6 recent files. Each row: small page thumbnail preview (miniature rendering), filename, last-modified date. Most recent at top. One entry greyed out with "(file not found)".

7. **Source mode** — Same file, toggled to Source mode. Visual/Source toggle shows "Source" as active. Content area: monospace text editor with HTML syntax highlighting (tags in blue, attributes in orange, text in white/grey on dark or light background). Line numbers on the left. Full HTML source visible — doctype, head, body, all tags. Toolbar still visible but most buttons disabled (greyed out) since formatting toolbar doesn't apply in source mode.

8. **HTML5 semantic elements** — A page showing HTML5 semantic elements rendered in Visual mode: article, section, nav (with links), header (with H1), footer (with copyright), aside (sidebar-style), figure with figcaption, details/summary (collapsed by default). The paragraph format dropdown is open, showing: Paragraph, H1-H6, Blockquote, Preformatted, Article, Section, Nav, Header, Footer, Aside, Figure, Main.

### Toolbar states to mock

- **Default:** Cursor in paragraph text. Paragraph format shows "Paragraph." Bold/Italic/Underline not active unless cursor is inside formatted text.
- **Text selected:** Formatting buttons reflect active formatting (Bold appears pressed if cursor is in bold text). Font dropdown and size dropdown show current values.
- **Inside table cell:** Table-specific context visible. Right-click menu shows table actions.
- **Image selected:** Image has blue selection outline with corner resize handles. Toolbar shows image-specific options (Replace, align).
- **Link hover:** Cursor changes to pointer on hover. Small floating toolbar appears near the link: Edit Link, Open Link, Remove Link.

### Design constraints

- macOS-native look and feel: SF Pro typeface, standard system spacing (8px grid), native button styles
- Single-window app: no floating palettes, no inspector sidebar, no detached tool panels
- Toolbar: single row, always visible. Buttons disabled (greyed out) when not applicable — never hidden. Each button has a tooltip on hover showing name + keyboard shortcut.
- Light mode only for v0.1 mockups (dark mode is v1)
- Page content area: white background (#FFFFFF), content centered with comfortable max-width (~800px), scrollable if content exceeds viewport
- Visual/Source toggle: segmented control or tab-style toggle near the toolbar area, clearly labeled "Visual" | "Source"
- Window size: ~1200x800px default. Resizable.
- No splash screen, no welcome wizard, no onboarding overlay
