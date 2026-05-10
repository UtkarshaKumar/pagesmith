# PageSmith — Task Breakdown & Work Structure

> Maps MVP-OPTIONS.md Phase 1–4 into concrete, agent-assignable tasks.
> Each task has: ID, phase, assignable agent role, dependencies, acceptance criteria, and estimated effort.

---

## Design Map (mandatory reference per task)

Every UI task MUST match its corresponding design screen. Agents must read the design file before implementing.

| Design Screen | File | Used By Tasks |
|--------------|------|---------------|
| Empty state + Recent files | `designs/empty_state_and_recent_files/screen.png` | P3-T5 |
| Visual mode — text editing | `designs/visual_mode_editor_text_editing/screen.png` | P2-T1, P2-T2, P2-T5, P2-T6 |
| Visual mode — table editing | `designs/visual_mode_table_editing/screen.png` | P3-T1 |
| Link editing popover | `designs/link_editing_popover/screen.png` | P3-T2 |
| Source mode editor | `designs/source_mode_editor/screen.png` | P3-T4 |
| HTML5 semantic elements | `designs/html5_semantic_elements_view/screen.png` | P3-T6 |

**Design constraints (from product-overview.md Figma section):**
- macOS SF Pro, 8px grid, native button styles
- Single-window, no floating palettes, no inspector sidebar
- Toolbar: single row, buttons disabled (not hidden), tooltips with shortcuts
- Light mode only (v0.1), ~1200x800px default window
- Visual/Source toggle: segmented control clearly labeled "Visual | Source"
- Page content: white (#FFFFFF), centered max-width ~800px

---

## Agent Roles

| Role | Forge Agent | Responsibility | Can modify files? |
|------|-----------|----------------|-------------------|
| **Architect** | muse | System design, data model, API surface decisions, ADRs | No (plans to `plans/`) |
| **Builder** | forge | Implementation: writes Rust, JS, HTML/CSS, tests | Yes |
| **Researcher** | sage | Codebase exploration, dependency analysis, feasibility checks | No |
| **Reviewer** | (SWE workflow) | PR review, quality gate enforcement, findings | No |

---

## Phase 1 — Surgical Edit Engine (Weeks 1–3)

Gate: 100% of 500+ test files pass round-trip. Unedited regions byte-identical.

### P1-T1: Scaffold Tauri 2 project
- **Agent:** Builder (forge)
- **Deps:** None
- **Effort:** 2 hours
- **AC:** `cargo tauri dev` launches a blank macOS window. Project compiles from `src-tauri/`. WKWebView renders a test HTML page.
- **Files:** `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`, `src/index.html`

### P1-T2: Build HTML source model (byte buffer + offset map)
- **Agent:** Builder (forge)
- **Deps:** P1-T1
- **Effort:** 3 days
- **AC:** Given an HTML file, the engine produces a `SourceModel` struct containing: raw bytes, encoding detection, node-to-offset map. Parser handles UTF-8, ISO-8859-1, Windows-1252. Malformed HTML does not crash — falls back to raw source display.
- **Research:** Researcher (sage) evaluates `html5ever`, `lol-html`, `scraper` for lossless parsing feasibility. Output: recommendation doc.
- **Files:** `src-tauri/src/source_model.rs`, `src-tauri/src/parser.rs`

### P1-T3: Build patch model
- **Agent:** Builder (forge)
- **Deps:** P1-T2
- **Effort:** 2 days
- **AC:** `Patch { offset: usize, length: usize, replacement: String }` struct. Applying a patch replaces bytes [offset..offset+length] with replacement. Offset map updates correctly. Inverse patch computed for undo. 100 sequential patches produce correct output.
- **Files:** `src-tauri/src/patch.rs`

### P1-T4: Build atomic file I/O
- **Agent:** Builder (forge)
- **Deps:** P1-T2
- **Effort:** 1 day
- **AC:** Read file → detect encoding → convert to UTF-8 internally. Write: convert to original encoding → write to temp file → atomic rename. Kill -9 during save → original file intact. Handles files up to 50 MB.
- **Files:** `src-tauri/src/file_io.rs`

### P1-T5: Assemble 500+ test HTML corpus
- **Agent:** Researcher (sage) + Builder (forge)
- **Deps:** None (parallel with P1-T2)
- **Effort:** 2 days
- **AC:** Corpus contains: Common Crawl samples (200), hand-crafted edge cases (100), malformed HTML (50), script-heavy pages (50), framework templates (Vue/Angular/React, 50), mixed encoding (25), zero-byte (5), 50MB stress test (1), no-doctype (10), CDATA/nested comments (10+).
- **Files:** `tests/fixtures/*.html`, `tests/fixtures/manifest.json`

### P1-T6: Build round-trip test harness
- **Agent:** Builder (forge)
- **Deps:** P1-T3, P1-T4, P1-T5
- **Effort:** 2 days
- **AC:** For each test file: open → apply N random surgical patches → save → verify unedited regions byte-identical. Test runner produces pass/fail report. CI-compatible (exit 0 on 100% pass).
- **Files:** `tests/harness.rs`, `tests/integration_test.rs`

### P1-T7: Phase 1 gate check
- **Agent:** Orchestrator (manual review)
- **Deps:** P1-T6
- **Effort:** 1 day
- **AC:** 100% of 500+ test files pass. 0 crashes. All encoding variants handled. Atomic save verified. Gate L1 from PROBLEM.md satisfied.
- **Decision:** PASS → proceed to Phase 2. FAIL → fix root cause, re-run gate.

---

## Phase 2 — Core Visual Editor (Weeks 4–7)

Gate: 8/10 real users can open, edit, and save an HTML file without guidance.

### P2-T1: Design toolbar UI component
- **Agent:** Architect (muse) → Builder (forge)
- **Deps:** P1-T7 (engine validated)
- **Effort:** 1 day
- **AC:** Architect produces plan for toolbar HTML/CSS/JS. Builder implements: single-row toolbar, paragraph format dropdown, Bold/Italic/Underline buttons, alignment group. All buttons disabled (not hidden) when not applicable. Matches design spec `designs/visual_mode_editor_text_editing/screen.png`.
- **Files:** `src/toolbar.html`, `src/toolbar.css`, `src/toolbar.js`

### P2-T2: Wire contenteditable to surgical engine
- **Agent:** Builder (forge)
- **Deps:** P1-T7, P2-T1
- **Effort:** 3 days
- **AC:** Click-to-edit text in WKWebView works. Typing reports character-level patches to the Rust engine. Selection changes report offset ranges. Enter creates new paragraph. Backspace merges. The source buffer is updated, not the DOM. Tauri `invoke` bridge passes patches from JS → Rust.
- **Files:** `src/editor.js`, `src-tauri/src/commands.rs`, `src-tauri/src/bridge.rs`

### P2-T3: Implement undo/redo stack
- **Agent:** Builder (forge)
- **Deps:** P2-T2
- **Effort:** 1 day
- **AC:** Cmd+Z undoes last patch. Cmd+Shift+Z redoes. 100 sequential undos/redos produce byte-identical output. Undo clears on file close. Undo does not reload from disk.
- **Files:** `src-tauri/src/undo.rs`

### P2-T4: Implement open/save UI
- **Agent:** Builder (forge)
- **Deps:** P2-T2
- **Effort:** 1 day
- **AC:** Cmd+O opens native file picker (filtered to .html/.htm). Drag-and-drop onto window opens file. Cmd+S saves to original path. Cmd+Shift+S opens Save As dialog. Window title shows filename with "— Edited". External modification detected and warned.
- **Files:** `src/menu.js`, `src-tauri/src/file_commands.rs`

### P2-T5: Implement formatting toolbar (rich text)
- **Agent:** Builder (forge)
- **Deps:** P2-T2, P2-T1
- **Effort:** 2 days
- **AC:** Bold (Cmd+B) wraps in `<strong>`. Italic (Cmd+I) wraps in `<em>`. Underline wraps in `<u>`. Strikethrough wraps in `<s>`. Paragraph format dropdown sets H1-H6, P, Blockquote, Pre. Lists: bullet and numbered. Tab/Shift+Tab indents/outdents. All formatting uses the surgical patcher — no direct DOM manipulation.
- **Files:** `src/toolbar.js`, `src-tauri/src/format_commands.rs`

### P2-T6: Implement font/color/alignment
- **Agent:** Builder (forge)
- **Deps:** P2-T5
- **Effort:** 1 day
- **AC:** Font family dropdown (system fonts + web-safe). Font size. Text color picker, highlight color. Alignment: left, center, right, justify. All applied as inline styles via surgical patcher.
- **Files:** `src/toolbar.js`, `src-tauri/src/style_commands.rs`

### P2-T7: Phase 2 UX gate — 10-user test
- **Agent:** Orchestrator (manual)
- **Deps:** P2-T6
- **Effort:** 2 days
- **AC:** 10 real users (non-technical) given an HTML file and asked to: change a sentence, make a word bold, add a heading, save. 8/10 succeed without any guidance. Qualitative feedback collected.
- **Decision:** PASS → proceed to Phase 3. FAIL → UX iteration, re-test.

---

## Phase 3 — Full v0.1 (Weeks 8–10)

Gate: All L1-L6 pre-launch gates from PROBLEM.md pass. App Store submission ready.

### P3-T1: Implement table editing
- **Agent:** Builder (forge)
- **Deps:** P2-T7
- **Effort:** 3 days
- **AC:** Click into table cell → cursor. Tab/Shift+Tab navigates cells. Right-click context menu: Insert Row Above/Below, Insert Column Left/Right, Delete Row/Column/Table. Visual guide borders (dashed, not saved). Matches `designs/visual_mode_table_editing/screen.png`.
- **Files:** `src/table_editor.js`, `src-tauri/src/table_commands.rs`

### P3-T2: Implement link editing
- **Agent:** Builder (forge)
- **Deps:** P2-T7
- **Effort:** 1 day
- **AC:** Cmd+K on selected text → inline popover with URL, Link Text, Open in New Tab fields. Click existing link → floating toolbar: Edit, Open, Remove. Matches `designs/link_editing_popover/screen.png`.
- **Files:** `src/link_editor.js`

### P3-T3: Implement image handling
- **Agent:** Builder (forge)
- **Deps:** P2-T7
- **Effort:** 1 day
- **AC:** Images render at their specified size. Click → selection with resize handles. Double-click → file picker to replace src. Broken images show placeholder with path.
- **Files:** `src/image_editor.js`

### P3-T4: Implement Visual/Source mode toggle
- **Agent:** Builder (forge)
- **Deps:** P2-T7
- **Effort:** 2 days
- **AC:** Persistent "Visual | Source" toggle visible at all times. Source mode: monospace editor with HTML syntax highlighting. Switches preserve cursor position. Edits in source update visual view on toggle back (300ms debounce). Matches `designs/source_mode_editor/screen.png`.
- **Files:** `src/source_view.js`, `src/syntax_highlight.js`

### P3-T5: Implement recent files + empty state
- **Agent:** Builder (forge)
- **Deps:** P2-T4
- **Effort:** 1 day
- **AC:** Empty state: "Open an HTML file to start editing" + Open button + empty Recent Files. Recent files: 10 most recent, thumbnails, last-modified dates. Greyed-out entries for deleted files. Matches `designs/empty_state_and_recent_files/screen.png`.
- **Files:** `src/empty_state.html`, `src/recent_files.js`

### P3-T6: HTML5 semantic element support
- **Agent:** Builder (forge)
- **Deps:** P2-T5
- **Effort:** 1 day
- **AC:** Paragraph format dropdown includes: article, section, nav, header, footer, aside, figure, main. All rendered correctly in WKWebView. Matches `designs/html5_semantic_elements_view/screen.png`.
- **Files:** `src/toolbar.js` (extend format dropdown)

### P3-T7: Mac polish — file associations, menus, keyboard shortcuts
- **Agent:** Builder (forge)
- **Deps:** P3-T1 through P3-T6
- **Effort:** 2 days
- **AC:** `.html` and `.htm` file associations registered. "Open With → PageSmith" in Finder. Dock icon with drag-and-drop. Complete menu bar (File, Edit, View, Format, Window, Help) with all shortcuts. About dialog. Preferences window (default edit mode).
- **Files:** `src-tauri/tauri.conf.json`, `src-tauri/src/menu.rs`

### P3-T8: Testing, notarization, App Store submission
- **Agent:** Builder (forge) + Orchestrator (manual)
- **Deps:** P3-T7
- **Effort:** 2 days
- **AC:** All L1-L6 pre-launch gates pass. App sandboxed, notarized. TestFlight build ready. App Store listing prepared (screenshots from designs, description, keywords).
- **Gate:** All 6 pre-launch gates from PROBLEM.md pass before submission.

---

## Phase 4 — LLM Surgical Tooling (Weeks 11–13)

Gate: Claude/ChatGPT integration demonstrated end-to-end.

### P4-T1: Expose surgical edit operations via local API
- **Agent:** Builder (forge)
- **Deps:** P3-T8
- **Effort:** 2 days
- **AC:** `replace_range(offset, length, text)`, `insert_before(selector, html)`, `insert_after(selector, html)`, `set_attribute(selector, attr, value)`, `read_range(offset, length)`. All exposed via Tauri IPC or localhost HTTP. Same code path as human edits (Constitution L1).
- **Files:** `src-tauri/src/llm_api.rs`

### P4-T2: Build LLM access toggle + security boundary
- **Agent:** Builder (forge)
- **Deps:** P4-T1
- **Effort:** 1 day
- **AC:** Preferences toggle: "Allow AI tools to edit this file." Disabled by default. When enabled, IPC endpoints are active. `read_range` returns only requested range — never full source. "Share full source" override available.
- **Files:** `src/preferences.js`, `src-tauri/src/llm_security.rs`

### P4-T3: Demonstrate end-to-end LLM integration
- **Agent:** Orchestrator (manual) + Builder (forge)
- **Deps:** P4-T2
- **Effort:** 2 days
- **AC:** Claude (via Claude Code) reads an HTML file's structure via `read_range`, identifies a table that needs a row, calls `insert_after` to add it. File opens in PageSmith — new row visible, rest of file untouched. ChatGPT integration also demonstrated.
- **Artifacts:** Demo video, integration guide for LLM tool makers.

---

## Task Dependency Graph

```
Phase 1 (Engine):
P1-T1 ──► P1-T2 ──► P1-T3 ──► P1-T6 ──► P1-T7
              │         │
              ▼         ▼
           P1-T4    P1-T5 (parallel)

Phase 2 (Core Editor):
P1-T7 ──► P2-T1 ──► P2-T2 ──► P2-T3
              │         │
              │         ├──► P2-T4
              │         ├──► P2-T5 ──► P2-T6
              │         └──► P2-T7

Phase 3 (Full v0.1):
P2-T7 ──► P3-T1 ──┐
              ├──► P3-T2 ──┤
              ├──► P3-T3 ──┤
              ├──► P3-T4 ──┼──► P3-T7 ──► P3-T8
              ├──► P3-T5 ──┤
              └──► P3-T6 ──┘

Phase 4 (LLM Tooling):
P3-T8 ──► P4-T1 ──► P4-T2 ──► P4-T3
```

## Agent Swarm Assignment

| Phase | Primary Agent | Support Agents | Parallel Tasks |
|-------|--------------|----------------|----------------|
| Phase 1 | Builder (forge) | Researcher (sage) for P1-T5 corpus + parser evaluation | P1-T4 and P1-T5 parallel with P1-T2/P1-T3 |
| Phase 2 | Builder (forge) | Architect (muse) for P2-T1 toolbar design | P2-T3, P2-T4, P2-T5 can run in parallel after P2-T2 |
| Phase 3 | Builder (forge) | — | P3-T1 through P3-T6 all parallel after P2-T7 |
| Phase 4 | Builder (forge) | — | Sequential (API → security → demo) |

---

*Derived from: MVP-OPTIONS.md Option D — Sequential Engine → UI → Polish → LLM*
*Next: Assign first tasks to agents via forge CLI*
