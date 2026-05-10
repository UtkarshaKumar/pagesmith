---
project: PageSmith
doc-type: mvp-options
method: Best of N (N=4)
date: 2026-05-11
status: DECIDED — see ADR-001 in DECISIONS.md
---

# PageSmith — Best of N MVP Analysis

> Four distinct MVP options generated, each evaluated against the same criteria.
> The goal is to select the option that maximizes speed to validated learning, not speed to feature completeness.
> Decision is documented in ADR-001 in DECISIONS.md.

---

## Evaluation Criteria (Applied Equally to All Options)

| Criterion | Weight | Definition |
|---|---|---|
| Time to first validated learning | 30% | How fast can we know if the core value proposition is real? |
| Build complexity | 20% | How many unknowns in the technical execution? |
| Defensibility | 20% | Does this option build a moat or is it trivially copyable? |
| User adoption potential | 15% | How likely is this to attract and retain users in its first form? |
| Constitution alignment | 15% | Does this option satisfy all product principles without forcing compromises? |

---

## Option A — "Round-Trip Engine First" (Minimal Surface)

### What it is
Build the surgical editing engine with a deliberately minimal UI wrapper:
- Open .html file → rendered view (no editing yet)
- Click text → cursor appears → type to edit
- Save → overwrites original
- Undo/Redo
- No formatting toolbar, no table editing, no link/image handling, no source view
- Basic Mac window, File menu, Cmd+O/Cmd+S/Cmd+Z

The point is to validate the hard technical problem (faithful round-trip) before investing in the full UX layer. Users get a functional, if bare, editor.

### Technical Stack
- Tauri 2 shell
- Custom surgical edit engine (source buffer + offset map)
- WKWebView for rendering (Tauri's default)
- contenteditable for text-level WYSIWYG
- No GrapesJS or external editor dependency

### Build timeline
- Week 1-2: Surgical edit engine — HTML parser that produces lossless source-map; patch model; save with atomic write
- Week 3: Minimal UI — open/save/undo/render; Mac window shell
- Week 4: Test suite — 500 diverse HTML files, automated round-trip verification

**Total: 4 weeks to functionally working product.**

### Evaluation

| Criterion | Score (1-5) | Reasoning |
|---|---|---|
| Time to first validated learning | 4 | 4 weeks to a working editor. Validates the core technical bet before building anything else. |
| Build complexity | 4 | No formatting toolbar, no table editor, no rich text — just text-level editing. But the engine itself is novel and has unknowns. |
| Defensibility | 5 | The engine IS the moat. Building it first means the hardest-to-copy component is done before any visible features. |
| User adoption potential | 2 | Bare text editor won't attract non-technical users. No formatting = not "Word for HTML." But enough for technical users to test. |
| Constitution alignment | 5 | E1-E5 all satisfied. U1-U3 satisfied by design. No features means no violations. |

**Weighted score: (4×0.30) + (4×0.20) + (5×0.20) + (2×0.15) + (5×0.15) = 1.20+0.80+1.00+0.30+0.75 = 4.05 / 5.00**

### Critical risks
- Minimal UI won't demonstrate "Word for HTML" value — harder to get early user feedback
- Risk of building the engine and then discovering the UX approach is wrong for the engine
- No "aha moment" for non-technical users in this build

---

## Option B — "Full v0.1 Mac App" (Big Bang)

### What it is
Build the complete v0.1 product in one go:
- Full toolbar: text formatting, paragraph styles, lists, alignment, colors, fonts
- Table editing: click-to-edit cells, add/remove rows/columns, visual guide borders
- Links: insert/edit/remove with Cmd+K dialog
- Images: view, replace, resize handles
- Source view: toggle-able split pane
- Mac-native: file associations, Dock menu, Recent Files, standard menu bar
- Full undo/redo stack

The product as described in the requirements document. Ship directly to Mac App Store.

### Technical Stack
- Tauri 2 shell + WKWebView
- Surgical edit engine (same as Option A, but built inside the full app)
- Custom toolbar UI (HTML/CSS/JS rendered in the webview)
- No external editor library dependency

### Build timeline
- Week 1-3: Surgical edit engine (shared with Option A)
- Week 4-6: Full visual editor — toolbar, formatting, tables, links, images
- Week 7-8: Mac polish — file associations, menus, keyboard shortcuts, window management
- Week 9-10: Testing, App Store submission, landing page

**Total: 10 weeks to App Store.**

### Evaluation

| Criterion | Score (1-5) | Reasoning |
|---|---|---|
| Time to first validated learning | 2 | 10 weeks before any user feedback on the full product. Long feedback loop. |
| Build complexity | 2 | Engine + full UI + Mac polish + App Store submission = 4 parallel complex streams. High risk of delay. |
| Defensibility | 4 | Full product ships with engine + UX moat. But competitor could copy the UI layer while we're still building. |
| User adoption potential | 5 | Complete product. Has the "Word for HTML" experience. Can go viral on launch. |
| Constitution alignment | 4 | All principles satisfiable, but complexity increases risk of accidental violations (e.g., a save path that doesn't go through the surgical patcher). |

**Weighted score: (2×0.30) + (2×0.20) + (4×0.20) + (5×0.15) + (4×0.15) = 0.60+0.40+0.80+0.75+0.60 = 3.15 / 5.00**

### Critical risks
- 10 weeks is a long time with no external validation — build something nobody wants
- Complexity risk: engine + UI + polish in parallel means any one delay blocks everything
- The engine might need to change based on UI requirements discovered during build
- Competitor could ship a simpler version in 4-6 weeks while we're still building

---

## Option C — "Web Trial → Mac App" (Validate Demand First)

### What it is
Ship a Chromium-only web trial (landing page + basic editor) to validate demand and collect feedback, then build the Mac app based on learnings.

Phase 1 (Weeks 1-4): Landing page + web-based trial
- Landing page with "Edit HTML. Visually. Finally." positioning
- Web-based editor (Chromium only, File System Access API)
- Basic text editing + formatting toolbar
- "Get the Mac app" CTA after save
- Collect emails, usage data, feedback

Phase 2 (Weeks 5-12): Mac app informed by Phase 1 learnings
- Build the Tauri app with features prioritized by trial usage data
- Surgical edit engine (validated architecture from Phase 1)
- Ship to App Store with waitlist from Phase 1

### Technical Stack
- Phase 1: Static site (no backend) + client-side editor using File System Access API
- Phase 2: Tauri 2 + custom engine

### Build timeline
- Week 1-2: Landing page + web editor prototype
- Week 3-4: Launch web trial, drive traffic, collect feedback
- Week 5-7: Mac app build begins — surgical engine
- Week 8-10: Full UI based on trial feedback
- Week 11-12: Testing, App Store submission

**Total: 4 weeks to web trial launch; 12 weeks to Mac App Store.**

### Evaluation

| Criterion | Score (1-5) | Reasoning |
|---|---|---|
| Time to first validated learning | 5 | 4 weeks to real user feedback on the core concept. Demand signal before heavy build investment. |
| Build complexity | 3 | Two separate builds (web + Mac). Web version is simpler but still requires editor logic. Surgical engine can't be built in web (File System Access API limitations). |
| Defensibility | 3 | Web trial demonstrates demand but doesn't build the engine moat. Anyone can copy a web trial faster than we can build the Mac app. |
| User adoption potential | 4 | Web trial can go viral (link sharing). Mac app gets App Store distribution. Two channels. But Safari users can't use the trial — limits reach. |
| Constitution alignment | 3 | Web trial violates U1 (File System Access API requires a picker flow that feels like onboarding). T1 (atomic save) is impossible in web. |

**Weighted score: (5×0.30) + (3×0.20) + (3×0.20) + (4×0.15) + (3×0.15) = 1.50+0.60+0.60+0.60+0.45 = 3.75 / 5.00**

### Critical risks
- Web trial can't demonstrate faithful round-trip (the core differentiator) because File System Access API doesn't support surgical editing with byte-level precision
- Web trial users who have a bad experience (no round-trip, no Safari support) won't return for the Mac app
- Two separate codebases (web editor + Mac editor) — risk of divergence
- Waitlist-to-install conversion is typically < 10% — most web trial users won't install the Mac app

---

## Option D — "Sequential: Engine → UI → Polish → LLM" (Recommended)

### What it is
A sequenced build that validates the hardest problem first, then layers on the user-facing experience:

**Phase 1 — Engine (Weeks 1-3):** Build the surgical edit engine with a developer-facing test harness. Validate round-trip faithfulness against 500+ diverse HTML files. No visual UI — just automated tests proving the engine works. Gate: 100% of test files pass round-trip.

**Phase 2 — Core Editor (Weeks 4-7):** Build the visual editing surface on top of the validated engine. Text editing, basic formatting toolbar (bold, italic, headings, lists), undo/redo, open/save. This is a functional "text editor for HTML" — not yet "Word for HTML," but demonstrably useful. Gate: 10 real users can open, edit, and save an HTML file without instructions.

**Phase 3 — Full v0.1 (Weeks 8-10):** Add tables, links, images, source view, Mac polish (file associations, menus, keyboard shortcuts). Ship to App Store. Gate: Product passes all pre-launch gates in PROBLEM.md.

**Phase 4 — LLM Tooling (Weeks 11-13):** Add surgical edit operations exposed for LLM consumption, read_range API, and user-facing LLM access toggle.

### Why this is better than choosing one option

| Advantage | Detail |
|---|---|
| Fail fast on the hard problem | If the surgical engine can't achieve 100% round-trip fidelity, we know before building a single UI component. No sunk cost in visual features. |
| Engine validated before UI lock-in | The UI is built on a proven, stable engine. No "the engine needs to change but the UI depends on the old behavior" rework. |
| User feedback at Phase 2 | 10 real users test the core editor at Week 7 — 3 weeks before full v0.1 launch. Feedback cycles are short and targeted. |
| Sequenced complexity | Each phase adds one layer. Phase 1 = engine. Phase 2 = text editing. Phase 3 = rich editing. Phase 4 = LLM. No parallel unknowns. |
| App Store waitlist building | Phase 2 testers become Phase 3 evangelists. App Store page can go live during Phase 2 for "Coming Soon" pre-orders. |

### Build timeline

| Phase | Weeks | Key milestone | Decision gate |
|---|---|---|---|
| Phase 1: Engine | 1–3 | 500 test files pass round-trip | Gate: 100% pass rate. If not, fix engine before Phase 2. |
| Phase 2: Core Editor | 4–7 | 10 users edit + save without guidance | Gate: 8/10 succeed. If not, UX iteration before Phase 3. |
| Phase 3: Full v0.1 | 8–10 | App Store submission | Gate: All L1-L6 pre-launch gates pass. |
| Phase 4: LLM Tooling | 11–13 | LLM can surgically edit via local API | Gate: Claude/ChatGPT integration demonstrated end-to-end. |

### Evaluation

| Criterion | Score (1-5) | Reasoning |
|---|---|---|
| Time to first validated learning | 5 | 3 weeks to validate the engine (hardest unknown). 7 weeks to validate user experience with real users. |
| Build complexity | 4 | Sequenced — only one complex system under construction at a time. But the engine itself is novel and has unknowns. |
| Defensibility | 5 | Engine built first, proven, then UI layered on. Competitor building UI-first will hit the round-trip wall. |
| User adoption potential | 5 | Phase 2 gets early feedback. Phase 3 ships complete product. Phase 4 adds LLM distribution moat. |
| Constitution alignment | 5 | All principles satisfied. Engine-first ensures E1-E5 are foundational, not retrofitted. |

**Weighted score: (5×0.30) + (4×0.20) + (5×0.20) + (5×0.15) + (5×0.15) = 1.50+0.80+1.00+0.75+0.75 = 4.80 / 5.00**

---

## Decision

**Selected: Option D — Sequential: Engine → UI → Polish → LLM**

Option D scores highest on every weighted criterion. The key insight: the surgical edit engine is the only genuine technical moat in this product. Building it first, proving it works against real-world HTML, and then layering the UX on top eliminates the single biggest technical risk before any visual features are built. A competitor building UI-first will inevitably hit the round-trip wall — and by the time they realize the parse-tree approach is wrong, PageSmith's engine will have months of hardening.

Phase 2's 10-user gate gives us a real UX signal before the full App Store launch. If non-technical users can't edit and save without guidance by Week 7, we know the UX needs work — and we have 3 weeks to iterate before Phase 3 ships.

---

## Phase 1 MVP — Technical Specification (Engine)

This is the spec for Weeks 1-3.

### Components

**1. HTML Source Model**
- Raw HTML string as byte buffer
- Offset map: for each DOM node, store (start_offset, end_offset) in the source string
- The offset map is generated once on file open; updated on every patch
- Character encoding: preserve the file's original encoding (detect from `<meta charset>` or BOM)

**2. Patch Model**
- A patch is `(offset: usize, length: usize, replacement: &str)`
- Applying a patch: replace bytes [offset..offset+length] with replacement string
- All offsets are byte offsets, not character offsets (multi-byte encoding safe)
- Patches are stored on the undo stack with their inverse

**3. File I/O**
- Read: load file as byte buffer, detect encoding, convert to UTF-8 internally
- Write: convert to original encoding, write to temp file in same directory, atomic rename
- Atomic rename: `fs::rename(temp_path, original_path)` — POSIX guarantees atomicity on same filesystem

**4. Test Harness**
- Input: HTML file + list of patches to apply
- Output: modified HTML file
- Verification: diff against expected output
- 500+ test files from Common Crawl, hand-crafted edge cases, malformed HTML samples
- Edge case categories: nested comments, CDATA in script tags, mixed encoding, zero-byte files, 50 MB files, files with BOM, files without closing tags

### Success Criteria for Phase 1 Gate
- 100% of test files produce byte-identical output for unedited regions
- 0 crashes processing any test file
- All patches apply correctly at the byte-offset level
- UTF-8, ISO-8859-1, and Windows-1252 encoded files handled correctly
- Atomic save verified (kill -9 during save → original file intact)

### What Phase 1 does NOT build
- Any visual UI (no window, no toolbar, no rendered view)
- Table editing, link editing, image handling
- LLM tooling API
- File associations or Mac integration
- Undo stack (engine supports patches; undo UI comes in Phase 2)

---

*Version: 1.0*
*Decision: Option D selected — see ADR-001 in DECISIONS.md*
