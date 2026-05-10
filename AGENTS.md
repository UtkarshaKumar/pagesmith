# PageSmith — Forge Agent Instructions

> This file is read by Forge agents at the start of every conversation.
> It provides project-wide context that all agents (forge, sage, muse) need.

## Project

PageSmith is a macOS app (Tauri 2 + Rust + WKWebView) that lets non-technical users open any .html file, edit content visually like a Word doc, and save it back with surgical precision — untouched regions pass through byte-for-byte unchanged.

**Stack:** Rust (engine), HTML/CSS/JS (editor UI in WKWebView), Tauri 2 (shell)
**Platform:** macOS only (v0.1)
**Repo:** `BUILD/PageSmith/`

## Critical Docs (read before any work)

| Order | Doc | Purpose |
|-------|-----|---------|
| 1 | `CLAUDE.md` | Architecture, rules, non-goals |
| 2 | `PROBLEM.md` | Problem statement, success criteria, launch gates |
| 3 | `CONSTITUTION.md` | Binary product principles (pass/fail gates) |
| 4 | `MVP-OPTIONS.md` | Phase strategy (Option D: Engine → UI → Polish → LLM) |
| 5 | `DECISIONS.md` | All ADRs |
| 6 | `TASKS.md` | Work breakdown, task assignments, dependencies |

## Phase 1 — Current Focus

Building the surgical edit engine. No UI yet. Target: 100% round-trip pass rate on 500+ test files.

**Key files for Phase 1:**
- `src-tauri/src/main.rs` — Tauri app entry
- `src-tauri/src/source_model.rs` — HTML byte buffer + offset map
- `src-tauri/src/parser.rs` — Lossless HTML parser
- `src-tauri/src/patch.rs` — Patch model
- `src-tauri/src/file_io.rs` — Atomic file read/write
- `tests/fixtures/` — Test HTML corpus (500+ files)
- `tests/harness.rs` — Round-trip test harness

## Coding Conventions

- **Rust:** snake_case functions, CamelCase types, `anyhow` for errors, ` tracing` for logging
- **JS:** vanilla (no framework), ES modules, `prettier` formatting
- **CSS:** system fonts (`-apple-system`), 8px grid spacing, no CSS framework
- **Commits:** conventional commits (`feat:`, `fix:`, `test:`, `refactor:`)

## Rules (non-negotiable)

1. The source buffer is the source of truth. Never derive source from the DOM.
2. Surgery over reconstruction. Only edited regions are rewritten on save.
3. Every edit uses the surgical patcher (human and LLM edits share one code path).
4. Save is atomic (temp file → rename). Never produce a zero-byte or partial file.
5. No AI slop: deterministic behavior only. No "smart" formatting or opinionated cleanup.
6. JavaScript does not execute in the editing view.
7. No project system, no build step, no deploy button. The file on disk is the project.

## Common Mistakes

- Serializing from a normalized DOM tree and calling it "round-tripping"
- Adding a project system because "every editor has one"
- Making the UI a split code/WYSIWYG pane (it's a toggle, not split)
- Treating LLM tooling as a separate code path from human UI
- Using a schema-strict rich text editor (Tiptap, ProseMirror) — they mangle arbitrary HTML
