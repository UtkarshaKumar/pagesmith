# PageSmith

> Edit HTML. Visually. Finally.

**Created:** 2026-05-11
**Status:** Active
**Platform:** Mac (Tauri 2), with optional web trial for Chromium users

## Overview

PageSmith is a Mac app that does for .html files what Microsoft Word does for .docx — open any HTML, edit content/tables/styling visually, and save it back cleanly. No project files, no build steps, no code panels unless you ask for one.

It also serves as the default refinement engine for LLM-generated HTML. Your Claude or ChatGPT produces an .html — open it in PageSmith, tweak it like a document, and when you need the LLM to change something, PageSmith gives it surgical tooling instead of asking it to regenerate the whole file.

## Goals

- Faithful HTML round-trip — untouched sections pass through verbatim
- Word-simple visual editing for non-technical users
- Surgical edit primitives that both humans and LLMs can use
- Native Mac experience: Finder integration, file associations, Dock icon
- ~10 MB binary, fast launch

## Architecture

- **Shell:** Tauri 2
- **Core model:** Surgical text editor with DOM awareness (source buffer + offset map as source of truth)
- **Editor surface:** TBD — `contenteditable` + structure view (Path B) or round-trip-aware GrapesJS fork (Path A)
- **LLM interface:** Well-defined surgical edit operations exposed as callable tools

## Notes

- Named after the concept of a wordsmith — someone who crafts with words and pages
- Pronounced "page-smith" (not "pages-mith")
