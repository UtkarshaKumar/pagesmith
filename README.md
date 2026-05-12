<div align="center">

# PageSmith

**A visual HTML editor for macOS — open any `.html` file, edit it like a Word document, save it back cleanly.**

[![Latest release](https://img.shields.io/github/v/release/UtkarshaKumar/pagesmith?label=release&color=blue)](https://github.com/UtkarshaKumar/pagesmith/releases/latest)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/UtkarshaKumar/pagesmith/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB)](https://tauri.app)

![PageSmith — visual HTML editor for macOS](src/assets/screenshot.png)

</div>

## About

PageSmith is what Microsoft Word is for `.docx` — but for `.html`. Open any HTML file on your Mac, edit content, tables, and styling visually, and save it back as standard HTML. No proprietary project format. No build step. No code panel unless you ask for one.

It's also designed as a refinement surface for LLM-generated HTML. When an assistant produces an `.html`, PageSmith lets you tweak it visually and gives the model surgical edit primitives (instead of asking it to regenerate the whole file).

## Why it exists

Every existing tool sits in one of three boxes:

| Category | Examples | Problem |
|---|---|---|
| Site builders | Webflow, Sparkle, Blocs | Proprietary project formats — can't open a hand-written `.html` |
| Code editors | VS Code, BBEdit, Nova | Code-first; not WYSIWYG |
| Rich-text SDKs | TinyMCE, CKEditor, Tiptap | Components for other apps, not standalone editors |

The "open a file, edit visually, save it back" desktop app died with BlueGriffon (2024). PageSmith brings it back, native to macOS.

## Features

- **Open any local `.html`** — no import, no conversion, no project file
- **Visual editing** — headings, paragraphs, bold/italic/underline/strike, lists, alignment, links, images, tables
- **Surgical round-trip** — `<head>`, comments, inline scripts, and untouched regions pass through verbatim on save
- **Visual ⇆ Source toggle** — switch between WYSIWYG and raw HTML at any time
- **Cmd+click navigation** — follow in-page anchors and relative file links without leaving the app
- **PDF export** — render the current document to PDF in one click
- **Light, dark, and auto themes** — follows your system preference by default
- **Native macOS feel** — ~10 MB binary, Finder file association, recent files, keyboard shortcuts

## Install

Download the latest DMG from the [Releases](https://github.com/UtkarshaKumar/pagesmith/releases/latest) page:

1. Open `PageSmith_*.dmg`
2. Drag `PageSmith.app` into `/Applications`
3. Launch from Applications or Spotlight

> **Note:** The app is not yet notarized. On first launch, right-click the app icon and choose **Open** to bypass Gatekeeper.

Apple Silicon only for now (`aarch64`). Intel build coming.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Open file | `⌘O` |
| Save | `⌘S` |
| Save as | `⌘⇧S` |
| Bold | `⌘B` |
| Italic | `⌘I` |
| Underline | `⌘U` |
| Insert link | `⌘K` |
| Undo / Redo | `⌘Z` / `⌘⇧Z` |
| Toggle Visual / Source | `⌘⇧M` |
| Zoom in / out / reset | `⌘=` / `⌘-` / `⌘0` |
| Follow link in-app | `⌘`-click |

## Architecture

PageSmith is a hybrid Rust + web app built on [Tauri 2](https://tauri.app).

- **Shell** — Tauri 2 (native macOS window, file system access, file associations)
- **Editor surface** — Vanilla JavaScript on `contenteditable`, no framework
- **Source engine** — Rust, with `html5ever` for parsing
- **Source-of-truth model** — the raw HTML string plus an offset-keyed source map. Edits are recorded as `(offset, length, replacement)` patches against the original bytes; on save only changed regions are rewritten, so attribute order, whitespace, comments, and `<head>` content survive untouched

This is closer to how `rust-analyzer` does syntax-tree-preserving edits than how traditional WYSIWYG editors work.

## Building from source

### Prerequisites

- macOS 13+
- [Rust](https://rustup.rs/) (`rustup` toolchain, stable)
- Node.js 18+ and `npm`
- Xcode Command Line Tools

### Build

```bash
git clone https://github.com/UtkarshaKumar/pagesmith.git
cd pagesmith
npm install
npm run tauri -- build
```

The built `.app` and `.dmg` land in `src-tauri/target/release/bundle/`.

### Run in dev mode (with hot reload)

```bash
npm run tauri -- dev
```

### Run Rust tests

```bash
cd src-tauri && cargo test
```

The test suite covers ~70 round-trip scenarios across HTML5 semantics, forms, scripts, templates, comments, and whitespace edge cases.

## Project status

PageSmith is **active development**, currently at `v0.4.x`. Block-level editing (headings, lists, alignment), file I/O, undo/redo, and theming are stable. Image insertion, table editing, and PDF export work but may have rough edges. The web-trial build for non-Mac users is on the roadmap.

See [Releases](https://github.com/UtkarshaKumar/pagesmith/releases) for changelog.

## Roadmap

- [ ] Apple Silicon + Intel universal binary
- [ ] Notarized DMG for one-click install
- [ ] Web trial build (Chromium File System Access API)
- [ ] LLM tool surface (`replace_range`, `insert_before`, etc.) over a documented JSON-RPC layer
- [ ] Find / replace
- [ ] Drag-drop reordering of blocks
- [ ] Multi-file workspace

## Contributing

Issues and pull requests are welcome. Please open an issue first for any feature work so we can align on scope.

## License

MIT © [Utkarsh Kumar](https://github.com/UtkarshaKumar)
