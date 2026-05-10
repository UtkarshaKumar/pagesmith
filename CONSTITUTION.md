---
project: PageSmith
doc-type: constitution
version: 1.0
date: 2026-05-11
status: LOCKED — amendment requires ADR + explicit user approval
---

# PageSmith — Product Constitution

> The constitution governs every product decision, feature addition, and build trade-off.
> Before shipping any feature, run it through the relevant section below.
> Each principle is binary and checkable — not aspirational language.
> A feature that violates any principle is rejected until revised.

---

## Section 1 — Editing Principles (The Core Promise)

**E1. The source buffer is the source of truth. The rendered view is derived. Never the reverse.**
PageSmith's internal model is a raw HTML string with a character-offset map to DOM nodes. Every edit — human or LLM — is recorded as a (offset, length, replacement_text) patch against the source buffer. The rendered WYSIWYG view is regenerated from this model. The source is never derived from the DOM. If the DOM disagrees with the source, the DOM is wrong.

**E2. Surgery over reconstruction. Never rewrite what the user didn't touch.**
On save, only regions that were edited are rewritten. All unedited regions — including whitespace, comments, attribute order, CDATA sections, inline scripts, and formatting the user didn't change — must pass through byte-for-byte unchanged. If the save operation touches a byte the user didn't edit, it's a bug.

**E3. Every edit is undoable. The undo stack operates on patches, not state snapshots.**
Undo replays the inverse patch. Redo replays the forward patch. The undo stack must survive 100+ sequential operations without data degradation. Closing the file clears the undo stack (no persistent undo history). Undo must not reload the file from disk.

**E4. JavaScript does not execute in the editing view. Ever.**
The editing view renders HTML statically. `<script>` tags, inline event handlers (`onclick`, `onload`), and external scripts are preserved in the source buffer but are inert in the rendered view. This is a safety requirement, not a limitation. Execute JavaScript in the browser, not in the editor.

**E5. Inline scripts, comments, and CDATA sections are preserved verbatim.**
These are the most fragile parts of arbitrary HTML. Most WYSIWYG editors strip or corrupt them. PageSmith must preserve them byte-for-byte in unedited regions. This is the hardest test of round-trip faithfulness and the primary differentiator.

---

## Section 2 — User Experience Principles

**U1. Zero onboarding. The file is the onboarding.**
There is no welcome wizard, no tutorial, no feature tour, no "Getting Started" screen. On first launch, the user sees an empty window with an "Open an HTML file" prompt and a Recent Files area. If a file is passed via "Open With..." or drag-and-drop, it opens immediately with no intermediate screen.

**U2. No project system. The file on disk is the project.**
PageSmith edits files, not projects. There is no .pagesmith project file, no workspace folder, no file browser sidebar, no multi-file management. The file path is the identity. Save = overwrite that path. Save As = new path. That's it.

**U3. Both Visual and Source editing modes are accessible via a visible toggle. Neither mode is hidden.**
A persistent, visible tab or toggle labeled "Visual" and "Source" sits at the top or side of the editing area. Users switch freely between WYSIWYG editing and raw source code editing. The toggle is always visible — never hidden behind a menu or preference pane. Both modes are equally first-class. The default mode on first open is Visual (WYSIWYG).

**U4. Every toolbar button is either available or disabled. Never hidden.**
Context-sensitive buttons that don't apply to the current selection are greyed out with a tooltip explaining why. Hiding buttons causes layout shift, breaks muscle memory, and confuses users about where a feature went. Disabled = "this exists but doesn't apply here." Hidden = "this feature disappeared."

**U5. The user is never interrupted.**
No modal dialogs for: rating the app, signing up for a newsletter, enabling notifications, upgrading to a paid tier, or "what's new in this version." Errors are inline, not modal where possible. The only acceptable modals: save confirmation, file-externally-modified warning, crash recovery.

**U6. Every action is deterministic.**
Bold always wraps in `<strong>`. Italic always wraps in `<em>`. Paragraph format always uses the same tag mapping. There is no "smart" formatting, no opinionated cleanup, no silent tag rewriting. The same input always produces the same output. This is a feature — predictability is trust.

---

## Section 3 — Fidelity Principles

**F1. CSS is preserved and applied. It is not edited visually.**
External stylesheets (`<link rel="stylesheet">`), internal `<style>` blocks, and inline styles are all preserved in the source buffer and applied to the rendered view. The visual editor does not provide a CSS editing interface in v0.1. Inline styles applied via the formatting toolbar (color, font, alignment) are added as `style` attributes on the target element.

**F2. Table guide borders are visual-only and never saved.**
During editing, tables display visible cell borders to make cells distinguishable. These guide borders are a rendering overlay — they are never written to the saved file. The saved file's table styling is whatever the original CSS defined (or didn't).

**F3. Image paths are preserved as written. They are resolved relative to the file's directory.**
If an HTML file references `<img src="images/logo.png">`, the image is resolved relative to the directory containing the HTML file. Broken image references show a placeholder with the unresolved path — not a blank space. Replacing an image changes the `src` attribute only.

**F4. The doctype and `<head>` are never silently modified.**
The doctype declaration, `<meta>` tags, `<title>`, `<link>` tags, and everything inside `<head>` is preserved verbatim unless the user explicitly edits it via the source view. The toolbar and visual editor never touch the `<head>`.

---

## Section 4 — Technical Principles

**T1. Save is atomic. Never produce a zero-byte or partially-written file.**
Save operations write to a temporary file in the same directory, then atomically rename over the original. If the write fails, the original file is untouched. If the application crashes during save, the user finds either the complete old file or the complete new file — never a partial write.

**T2. The app must work offline, without an internet connection.**
PageSmith is a local Mac app. It does not require internet access for any core function (opening, editing, saving). External CSS and images referenced via absolute URLs may fail to load offline — this is expected and must not crash or hang the app.

**T3. File size is not a reason to fail.**
The app must handle HTML files up to 50 MB without crashing. Performance may degrade for files > 5 MB (load time > 2 seconds), but the app must not become unresponsive. If a file is too large to render within 5 seconds, show a progress indicator — never a beach ball.

**T4. Malformed HTML is handled gracefully.**
If a file contains syntax errors (unclosed tags, invalid nesting, missing quotes), the browser's native parser (WebKit) will render it as best it can. PageSmith must not crash, hang, or corrupt malformed files. If the parser cannot produce a usable DOM, display the raw source in a read-only "source only" mode with a warning.

**T5. No telemetry without explicit opt-in consent.**
If instrumentation is added, it must be opt-in with a clear explanation of what is collected and why. Crash reports may be collected automatically (like macOS crash reporter) but must be anonymized. No user behavior data, file content, or editing patterns are ever sent off-device without consent.

---

## Section 5 — LLM Tooling Principles (v1+)

**L1. LLM edits and human edits go through the same surgical patcher. One code path.**
The `replace_range()`, `insert_before()`, `insert_after()`, and `set_attribute()` operations used by LLMs are the exact same functions invoked by the visual editor UI. No dual implementation. An LLM edit is indistinguishable from a human edit in the undo stack and the save pipeline.

**L2. The LLM does not have direct file system access.**
LLM tooling is exposed through a well-defined IPC or local API surface. The LLM cannot read or write files directly. It can only call the surgical edit operations and `read_range()` for context retrieval. This is a security boundary, not a limitation.

**L3. The user must explicitly enable LLM tooling access.**
LLM tooling is disabled by default. Enabling it requires a user action (toggle in Preferences) that includes a clear explanation: "This allows AI tools like Claude to edit the current file. You can disable this at any time."

**L4. The LLM never sees the full source buffer by default.**
`read_range()` returns only the requested range. The LLM must explicitly request context. This prevents unintended transmission of sensitive file content to LLM providers. A "Share full source" toggle exists for users who want to bypass this.

---

## Self-Evaluation Checklist (Run Before Shipping Any Feature)

Before presenting any feature or change to the user for review, verify:

- [ ] E1: Is the source buffer still the source of truth, or did we start deriving content from the DOM?
- [ ] E2: Does every save operation preserve unedited regions byte-for-byte?
- [ ] E3: Does undo use inverse patches, not state snapshots?
- [ ] E4: Is JavaScript execution blocked in the editing view?
- [ ] E5: Are comments, scripts, and CDATA preserved through a test edit-save cycle?
- [ ] U1: Did we add any onboarding screens, tours, or wizards?
- [ ] U2: Did we add any project/file management concepts?
- [ ] U3: Are both Visual and Source editing modes accessible via a visible toggle? Is neither mode hidden behind a menu?
- [ ] U4: Are toolbar buttons disabled (not hidden) when they don't apply?
- [ ] U5: Did we add any interruptive modals?
- [ ] U6: Is the behavior deterministic — same input always produces same output?
- [ ] F1: Are CSS blocks preserved verbatim when not edited?
- [ ] F2: Are table guide borders visual-only (not saved)?
- [ ] F4: Is `<head>` untouched by toolbar operations?
- [ ] T1: Is save atomic (temp file → rename)?
- [ ] T4: Does the app handle a malformed HTML file without crashing?

---

*Version: 1.0 — LOCKED*
*Owner: Utkarsh Kumar*
*Amendment process: Create ADR in DECISIONS.md → user review and approval → update version number*
