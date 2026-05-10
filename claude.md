# PageSmith — Agent Instructions

> Read this file before making any changes to this project.

## Project Summary

**What it is:** A Mac app that lets non-technical users open any .html file, edit content/tables/styling visually (like a Word doc), and save it back — with surgical precision that preserves the rest of the file untouched. Serves as the default refinement engine for LLM-generated HTML.

**Status:** Active
**Created:** 2026-05-11

## Positioning

**Tagline:** *Edit HTML. Visually. Finally.*

**One-liner:** PageSmith is the visual HTML editor that opens any .html, round-trips it cleanly, and lets both humans and LLMs refine it surgically — without touching a line of code.

**The wedge:** Opens any local .html and round-trips it cleanly (like Pinegrow), Word-simple UI with zero project/build/deploy concepts (unlike Pinegrow), and surgical edit tools LLMs can call (nobody does this).

**Primary users:** Marketers, teachers, lawyers, consultants, small-business owners — anyone with an .html on disk who's been told "just open it in Notepad." Also: developers who use LLMs to generate HTML and need a refinement surface.

## The Problem

LLMs generate HTML. Then humans need to refine it. Then LLMs need to refine it again. Today this loop is broken — LLMs regenerate whole files, humans tweak in text editors, and nobody round-trips cleanly. PageSmith sits in the middle as the shared refinement surface.

## Architecture

### Core technical bet: Surgical text editing with DOM awareness

The parse-tree-rebuild approach everyone defaults to is wrong. Any serializer reconstructs from a normalized tree — attribute order, whitespace, comments, CDATA all get lost. Instead:

- **Source of truth:** Raw HTML string + source-map of character offsets for each node
- **Edits:** Recorded as `(offset, length, replacement)` patches against the original string
- **WYSIWYG:** A derived view rendered from the source model — not the source itself
- **Save:** Only changed regions are rewritten; untouched `<head>`, inline scripts, and comments pass through verbatim

This is closer to how rust-analyzer does syntax-tree-preserving edits than anything in the WYSIWYG world.

### Shell: Tauri 2

- ~10 MB binary, native file associations, Finder "Open With…", App Store eligible
- Production-mature in 2026
- Web codebase renders in WKWebView; Tauri provides native file access APIs
- Electron works but is heavier; native Swift slows iteration without polish gain

### Editor engine: TBD

GrapesJS normalizes aggressively and fights the round-trip goal. Two paths:

**Path A: Fork GrapesJS, make it round-trip-aware.** High effort, teach its parser to produce lossless source-maps and its serializer to emit only changed regions.

**Path B: Dual-layer.** Browser-native `contenteditable` + `document.execCommand` for text-level WYSIWYG, with GrapesJS (or equivalent) as a parallel structure/layout view. Edits feed back into the surgical patcher.

Path B is lower risk and ships faster. Decision deferred to prototype phase.

### LLM tooling (v1+)

PageSmith exposes a well-defined set of surgical edit operations that LLMs can invoke:
- `replace_range(offset, length, text)` — surgical text replacement
- `insert_before(selector, html)` — insert node before target
- `insert_after(selector, html)` — insert node after target  
- `set_attribute(selector, attr, value)` — set attribute on element
- `read_range(offset, length)` — read raw source for context

These are the primitives. LLMs call them through a defined API; PageSmith applies them as surgical patches against the source model.

## Non-Goals (explicitly NOT in scope)

- AI-powered content generation (Claude/ChatGPT already do this — PageSmith refines their output)
- Site building / multi-page projects / deploy
- Proprietary file format — always works with raw .html
- Code editing panel as primary UX (source view available with visible toggle — user chooses Visual or Source mode; both modes accessible, not hidden)
- Cross-platform launch (Mac-only; web trial for Chromium users as optional funnel)
- Browser-based full product (Safari doesn't support File System Access API)
- Rich-text SDK (not a library — a standalone app)

## Rules

- Every action must be well-defined, deterministic, and predictable. No AI slop — no "smart" auto-formatting, no opinionated cleanup, no guessing user intent.
- The source buffer is the source of truth. The visual editor is a view. Never derive source from the view.
- Surgery over reconstruction. Never rewrite the whole file unless the user explicitly asks.
- When an LLM calls a surgical tool, the result must be identical to a human making the same edit via the UI. One code path.
- No project file. No build step. No deploy button. The file on disk is the project.

## Key Files

```
(fill in once structure is known)
```

## Common Mistakes to Avoid

- Serializing from a normalized DOM tree and calling it "round-tripping"
- Adding a project system because "every editor has one"
- Making the default view a split code/WYSIWYG pane (Visual mode and Source mode are toggled, not split-pane)
- Treating the LLM tooling as a separate code path from the human UI
- Building for Safari/Firefox at the expense of the core experience
