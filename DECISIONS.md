---
project: PageSmith
doc-type: architecture-decision-records
date-started: 2026-05-11
---

# PageSmith — Decision Log (ADRs)

> Every non-obvious decision is recorded here with context, options considered, decision made, and consequences.
> This is the institutional memory of the project. Never delete entries — mark as SUPERSEDED if overridden.
> Format: ADR-NNN | Date | Status | Decision Title

---

## ADR-001 | 2026-05-11 | ACCEPTED | MVP Strategy: Sequential Engine → UI → Polish → LLM

**Context:**
Four MVP options were evaluated in MVP-OPTIONS.md. The core question: build the full product in one go (Option B: 10 weeks), validate demand with a web trial first (Option C: 4+12 weeks), build just the engine first (Option A: 4 weeks), or sequence the build with gates at each phase (Option D: 13 weeks total)?

**Decision:**
Sequential Engine → UI → Polish → LLM (Option D). Build the surgical edit engine first with a test harness (Weeks 1-3), validate it against 500+ HTML files, then layer on visual editing (Weeks 4-7), full v0.1 features (Weeks 8-10), and LLM tooling (Weeks 11-13).

**Options considered:**
- A: Engine only with minimal UI (fastest to working code, but no user-facing product)
- B: Full v0.1 Mac App in one build (slowest to feedback, highest complexity risk)
- C: Web trial → Mac app (validates demand, but two codebases, can't demo round-trip in web)
- D: Sequential Engine → UI → Polish → LLM (selected)

**Reasoning:**
The surgical edit engine is the only genuine technical moat in this product. If it fails — if we cannot achieve faithful round-trip on arbitrary HTML — the product has no differentiator. Building the engine first eliminates the single biggest technical risk before a single line of UI code is written. Option A validates the engine but doesn't produce a user-facing product. Option B risks 10 weeks of build on an unvalidated engine. Option C creates two codebases and can't demonstrate round-trip in the web trial. Option D sequences complexity: validate engine → validate UX with real users → ship complete product → add LLM distribution moat.

**Consequences:**
- Phase 1 (Weeks 1-3) produces zero user-facing UI. This is intentional.
- Phase 1 gate is binary: 100% round-trip pass rate on 500 test files. If not met, no Phase 2.
- Phase 2 gate: 8/10 real users must edit and save without guidance before Phase 3.
- Phase 3 requires all L1-L6 pre-launch gates from PROBLEM.md before App Store submission.
- Tauri 2 setup and project scaffolding happen in Phase 1 even though UI comes in Phase 2. The engine lives inside the Tauri binary from day one.

**Review trigger:** At each phase gate — Phase 1 (Week 3), Phase 2 (Week 7), Phase 3 (Week 10).

---

## ADR-002 | 2026-05-11 | ACCEPTED | Shell: Tauri 2 over Electron or native Swift/SwiftUI

**Context:**
Three options for the Mac app shell: Tauri 2 (Rust backend + WKWebView), Electron (Chromium + Node.js), or native Swift/SwiftUI with WKWebView.

**Decision:**
Tauri 2.

**Options considered:**
- **Tauri 2:** ~10 MB binary, WKWebView rendering (same engine as Safari, correct HTML rendering), Rust for the surgical edit engine, native file APIs via Tauri plugin system, App Store eligible, production-mature in 2026.
- **Electron:** ~150 MB binary (heavy), Chromium rendering (different from Safari — rendering differences possible), Node.js for the engine (Rust would be preferred for byte-level operations), large memory footprint, App Store eligible but heavier.
- **Native Swift/SwiftUI:** Smallest binary, most native feel, WKWebView integration. But Swift slows iteration on the editor UI layer (HTML/CSS/JS is the right language for building an HTML editor). The surgical engine can be written in Swift, but Rust is better suited for byte-level buffer operations.

**Reasoning:**
Tauri 2 captures the best of all options: native file access, WKWebView for accurate HTML rendering, Rust for the performance-critical surgical engine, web technologies for the editor UI (faster iteration), and a ~10 MB binary (acceptable for App Store). Electron is too heavy and uses a different rendering engine (Chromium vs. Safari). Native Swift sacrifices iteration speed on the editor UI without meaningful polish gain — the editing surface is a webview either way.

**Consequences:**
- The surgical edit engine must be written in Rust (Tauri backend). This is acceptable — Rust's ownership model and string handling are well-suited for byte-level buffer operations.
- Frontend framework (for the toolbar and UI chrome) runs in WKWebView. Keep it simple — avoid heavy frameworks that add binary size.
- Tauri's file system APIs (`@tauri-apps/plugin-fs`) must be investigated for atomic write support.
- macOS code signing and notarization are required for distribution outside the App Store.

---

## ADR-003 | 2026-05-11 | ACCEPTED | Editing model: Surgical text editing over parse-tree serialization

**Context:**
The core architectural decision: how does PageSmith represent an HTML file internally such that edits are precise, lossless, and the untouched portions survive verbatim? The two fundamental approaches: (a) parse the HTML into a DOM tree, edit the tree, serialize back to string — the approach every WYSIWYG editor uses, or (b) treat the HTML as a text buffer with a DOM source-map — the surgical approach.

**Decision:**
Surgical text editing with DOM awareness (option b). The source of truth is a raw string buffer. A source-map maps DOM nodes to character offsets. Edits are `(offset, length, replacement)` patches against the buffer. The WYSIWYG view is rendered from the buffer, not the other way around.

**Options considered:**
- **Parse-tree serialization:** Parse HTML → DOM tree → edit tree nodes → serialize tree → write string. Standard approach, used by GrapesJS, TinyMCE, CKEditor, and every other WYSIWYG editor. Simple to implement, but the serializer normalizes — attribute order is alphabetized, whitespace is collapsed, comments are stripped or moved, CDATA is lost, inline scripts are re-encoded.
- **Surgical text editing:** Text buffer + DOM source-map + patch model. Preserves everything by only modifying the bytes that changed. Complex to implement — requires custom parser that produces lossless source-maps, careful offset tracking through edits, and a rendering pipeline that maps DOM interactions back to byte offsets.

**Reasoning:**
The parse-tree approach is a non-starter for the product's core promise. "Open any .html, edit, save back cleanly" is impossible if the serializer normalizes the output. The surgical approach is harder to build but is the entire product differentiator. Without it, PageSmith is just another WYSIWYG editor that corrupts files on import. With it, PageSmith does something no other product does.

The approach is inspired by rust-analyzer's syntax-tree-preserving edits and IntelliJ's PSI (Program Structure Interface), both of which maintain lossless source-maps for code editing. PageSmith applies the same concept to HTML.

**Consequences:**
- Requires a custom HTML parser that produces source-maps with byte-level precision. No off-the-shelf parser (html5ever, lol-html) produces lossless source-maps — they all discard whitespace, comments, and attribute order information during parsing.
- The parser must handle malformed HTML gracefully (the web is full of it). WebKit's parser is robust but doesn't expose source offsets. This is the single hardest technical component.
- The source-map must be updated after every patch — offsets after the edited region shift by `new_length - old_length`.
- The rendering pipeline must translate DOM interactions (click position, selection range) back to byte offsets in the source buffer. This requires tight coupling between the WKWebView and the Rust backend.
- Table of known-hard HTML constructs to test: nested comments, CDATA inside `<script>`, unquoted attributes, void elements without closing `/`, mixed SVG/MathML namespaces, conditional comments for IE, templating syntax (Vue/Mustache/Liquid) inside HTML.

---

## ADR-004 | 2026-05-11 | ACCEPTED | Editor surface: contenteditable over external library

**Context:**
For the visual WYSIWYG editing surface, options include: using the browser's native `contenteditable` with `document.execCommand`, integrating an external editor library (GrapesJS, Tiptap, ProseMirror, Lexical), or building a custom editing surface from scratch.

**Decision:**
Use `contenteditable` + `document.execCommand` for the Phase 2-3 editor surface. Do not integrate GrapesJS or any schema-strict rich-text editor. Re-evaluate for Phase 4 and beyond if limitations become blockers.

**Options considered:**
- **GrapesJS:** Block-based builder with component model. Excellent for structured layout editing, but normalizes HTML aggressively during import. Schema-strict — strips anything it doesn't recognize. Would fight the surgical edit model at every turn.
- **Tiptap/ProseMirror/Lexical:** Schema-strict rich-text editors. Will mangle arbitrary HTML on import because they parse into their own document model. Explicitly the wrong layer — designed for greenfield content creation, not arbitrary HTML round-tripping.
- **contenteditable:** Native browser editing surface. Supports click-to-edit text, selection, basic formatting via `document.execCommand`. No schema, no normalization — the DOM is the browser's own. The surgical engine controls what gets saved, not what gets displayed. The rendered view is just a view.

**Reasoning:**
The rendered WYSIWYG view is a display layer, not the source of truth. The surgical engine owns the source buffer and controls all save operations. The editor surface only needs to: (a) render HTML from the source buffer, (b) let the user click and type, (c) report edits back to the engine as patches. `contenteditable` is the simplest surface that satisfies these constraints. It doesn't try to own the data model — it's just an interactive view.

The well-known problems with `contenteditable` (inconsistent behavior across browsers, quirky selection handling) are mitigated because: (a) PageSmith targets a single browser engine (WKWebView in Tauri), not cross-browser, and (b) the surgical engine is the final arbiter of what gets saved — contenteditable quirks affect the editing experience, not the saved output.

**Consequences:**
- `document.execCommand` is deprecated in web standards but still functional in all browsers including WKWebView. It remains the simplest API for bold/italic/underline toggle. Migration plan: monitor WKWebKit release notes; if `execCommand` is removed, evaluate `Input Events Level 2` as replacement.
- Custom handling required for: Enter key behavior (create new `<p>` vs. `<br>` vs. `<div>` depending on context), Backspace behavior (merge paragraphs, handle list exit), table cell navigation (Tab/Shift+Tab).
- Rich text formatting (colors, fonts, alignment) requires custom UI that applies inline styles — not `execCommand` (which uses deprecated `<font>` tags).

---

## ADR-005 | 2026-05-11 | ACCEPTED | JavaScript execution: Blocked in editing view

**Context:**
When an HTML file is opened in PageSmith, should `<script>` tags execute in the editing view?

**Decision:**
No. JavaScript is blocked in the editing view. Scripts are preserved in the source buffer but are rendered as inert elements. A "Preview in Browser" button opens the file in the user's default browser, where JavaScript executes normally.

**Options considered:**
- **Allow JavaScript execution:** More accurate WYSIWYG rendering (JS-modified DOM reflects in the editor). But: security risk (opening a stranger's .html could execute arbitrary code), unpredictable editing behavior (JS mutations conflict with user edits), performance impact (scripts execute on every render).
- **Block JavaScript (selected):** Static rendering only. Safer, more predictable editing. Trade-off: the rendered view may not match the browser view for JS-heavy pages.

**Reasoning:**
PageSmith is a document editor, not a browser. The user's intent is to edit content and styling — not to debug JavaScript. Executing arbitrary scripts from unknown HTML files is a security risk that doesn't justify the rendering fidelity gain. Users who need to see JS effects can preview in a real browser. PageSmith's value is in content editing, not runtime behavior.

**Consequences:**
- `<script>` tags, inline event handlers, and `javascript:` URLs must be filtered from the rendered view. The source buffer retains them verbatim.
- A prominent "Preview in Browser" button (or Cmd+Shift+B shortcut) should be available in the toolbar.
- `<noscript>` content should be rendered (since scripts are effectively disabled).
- Iframes (`<iframe>`) should be rendered as placeholder boxes with the src URL displayed — not loaded. Loading external content in iframes carries the same security risks as script execution.

---

## ADR-006 | 2026-05-11 | ACCEPTED | Monetization: Free during v0.1 (no payment integration)

**Context:**
How should PageSmith monetize at launch? Options: paid upfront (Mac App Store purchase), freemium with paid Pro tier, free with optional donation, or completely free for v0.1.

**Decision:**
Completely free for v0.1. No payment integration, no licensing, no trial period, no feature gating. Re-evaluate monetization model after PMF signal (3-month gate in PROBLEM.md).

**Options considered:**
- Paid upfront ($9.99-$29.99 one-time): Validates WTP immediately but suppresses adoption during the critical PMF discovery phase.
- Freemium (free core, paid Pro features): Requires defining a feature split that doesn't compromise the free experience. Risk of gating something essential and ruining the product for free users.
- Free for v0.1 (selected): Maximizes adoption and word-of-mouth during launch. Defers monetization until product-market fit is clear.

**Reasoning:**
PageSmith's immediate goal is adoption and distribution, not revenue. The product competes with "opening the file in Notepad" — which is free. A paid-upfront model suppresses the exact users who need this most (non-technical professionals who wouldn't pay for something they don't yet understand). Monetization can be introduced once: (a) the product has proven retention, (b) the user base is large enough to segment, and (c) the paid features are clearly additive (LLM tooling, advanced table editing, batch processing) rather than subtractive (gating basic editing).

**Consequences:**
- No payment code, no licensing check, no App Store In-App Purchase integration in v0.1.
- App Store listing price: Free.
- v1 monetization candidates: LLM tooling as paid add-on, Pro features (batch edit, advanced CSS editing, export formats), or sponsorship/patronage model.
- If a competitor launches as paid, PageSmith's free positioning becomes a distribution advantage.

---

## ADR-007 | 2026-05-11 | ACCEPTED | Frontend framework: None (vanilla HTML/CSS/JS for Phase 1-3 editor surface)

**Context:**
What frontend framework should the editor UI (toolbar, dialogs, rendered view) use within the Tauri webview?

**Decision:**
Vanilla HTML/CSS/JS for Phase 1-3. No React, Vue, Svelte, or other framework. Re-evaluate for Phase 4 if the UI complexity warrants it.

**Options considered:**
- **React/Vue/Svelte:** Component model, state management, ecosystem. But adds build tooling, bundle size, and framework overhead to a product whose core value is in the Rust engine, not the JS UI.
- **Vanilla (selected):** No build step, no node_modules, no framework churn. The editor UI is a toolbar, a content area, and a few dialogs — well within the scope where a framework adds more complexity than it removes.

**Reasoning:**
The editor UI surface is intentionally simple: a toolbar row, a content area, and inline dialogs (link, image). The complexity is in the Rust engine (surgical text editing, source-map management, file I/O). Adding a JS framework to manage a toolbar's active states and a few dialog toggles is over-engineering. The webview renders the page from the engine — the JS layer is a thin controller between toolbar buttons and engine calls.

**Consequences:**
- No npm, no webpack/vite, no node_modules in the project. The webview loads plain .html/.css/.js files.
- Tauri's `invoke` API (for calling Rust commands from JS) is the bridge between the toolbar UI and the surgical engine.
- If Phase 4 requires complex UI (LLM tooling settings panel, source view with syntax highlighting), a lightweight library for syntax highlighting (CodeMirror 6 or Monaco) may be added. This does not require a framework.
- CSS approach: use system fonts (SF Pro via `-apple-system`), semantic HTML elements, and minimal custom CSS. No CSS framework (Tailwind, Bootstrap).

---

*Log started: 2026-05-11*
*Next ADR number: 008*
*Maintained by: Utkarsh Kumar + Claude Code*
