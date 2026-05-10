---
project: PageSmith
doc-type: problem-statement
version: 1.0
date: 2026-05-11
status: LOCKED — do not change without ADR
---

# PageSmith — Problem Statement, Success Criteria & Launch Gates

> This document is the single source of truth for what problem we are solving and how we know we've solved it.
> Every product decision must trace back to a clause in this document.
> Any change to the problem statement or launch gates requires an ADR in DECISIONS.md.

---

## 1. Problem Statement (Canonical — 3 sentences)

Non-technical users have no way to open an arbitrary .html file and edit its content visually — the way they edit a Word document. LLMs generate HTML by the gigabyte, but every human→LLM→human editing loop breaks because LLMs regenerate entire files and corrupt untouched sections. The category between code editors (showing DOM trees) and site builders (trapping users in proprietary formats) is hollow — there is no "Word for HTML."

**The single sentence version (for external use):**
"PageSmith is Microsoft Word for HTML files — open any .html, edit visually, save back cleanly."

---

## 2. Who Has This Problem

### Primary User: Non-Technical Professional
- **Who:** Marketers, teachers, lawyers, consultants, small business owners
- **What they do:** Receive or maintain HTML files (email templates, LMS exports, BI reports, legacy websites) and need to update content without learning HTML
- **What they lose today:** Hours per edit session; damaged files from wrong edits; dependence on developers for trivial changes; LLM re-generation costs when a single sentence needs changing
- **Current workaround:** Open in TextEdit/Notepad and edit raw markup (error-prone); ask a developer (expensive, slow); ask an LLM to regenerate (loses manual tweaks)
- **Their emotional state:** Frustration every time they receive an .html file. "Why can't I just click and edit like I do in Word?"

### Secondary User: LLM-Augmented Developer
- **Who:** Developers using Claude, ChatGPT, or other LLMs to generate HTML
- **What they do:** Prompt LLM → receive HTML → need to visually refine the output → need LLM to surgically fix specific sections
- **What they lose today:** LLM regeneration costs (tokens + time) for trivial changes; LLM corrupts sections it shouldn't touch; manual diff-and-merge workflow
- **Current workaround:** Copy-paste LLM output to a code editor; manually identify and edit the target region; ask LLM to regenerate whole file (and hope)
- **Their emotional state:** "I told it to fix the table header and it rewrote the entire page. Now I have to diff 800 lines."

### Tertiary User: Legacy Site Maintainer
- **Who:** Small business owners with 5-15 year old hand-coded websites
- **What they do:** Maintain content on sites built by someone who's no longer available
- **What they lose today:** Fear of breaking the site; inability to make even trivial content updates
- **Current workaround:** Pay a developer for every change; avoid updating content at all; eventually abandon the site

### Anti-Target (explicitly not building for):
- Professional web developers who use VS Code / Nova and are comfortable with split-pane code/preview — they have tools
- Site builders choosing a platform for a new project — they need templates, hosting, multi-page management, not a single-file editor
- Users who need collaboration, version control, or cloud sync — these require backend infrastructure, not a local Mac app

### Market Volume

**Direct market: Mac users who edit HTML files**
- macOS installed base: ~100 million active devices (Apple Q4 FY24 earnings: Mac revenue $7.7B)
- LLM coding tool users: ~10M+ MAU across GitHub Copilot (1.8M paid subscribers, 2024), Cursor, Claude, ChatGPT (NASSCOM 2024 Indian tech adoption report; BCG 2024 AI in Enterprise survey)
- Canvas LMS alone: ~30M users (Instructure FY24 annual report); LMS exports are typically HTML
- Email marketing: ~4B emails sent daily (Statista 2024); McKinsey 2024 estimates 65% of marketing emails use custom HTML templates
- RedSeer 2024 EdTech report: 85M+ LMS users globally
- Economic Times (2024): 70% of Indian SMEs with websites have no developer on staff — proxy for legacy site maintainer persona

**LLM-driven demand growth (structural tailwind):**
- LLM-generated HTML volume growing >100% YoY (proxy: Anthropic, OpenAI API call volume growth, 2024-2025)
- Every LLM-generated HTML file is an editing opportunity with no current solution

---

## 3. How They Solve It Today (Status Quo Audit)

| Method | How it works | Why it fails |
|---|---|---|
| Text editor (TextEdit, Notepad) | Open .html as a text file, edit raw HTML tags | Non-technical users can't read HTML; one syntax error breaks the page; no visual feedback until reopened in browser |
| Site builders (Wix, Webflow, Sparkle) | Import .html? | They can't. Proprietary project formats only. Cannot open a stranger's .html and save it back in place. |
| Code editors with preview (VS Code, Nova) | Split-pane: code + preview | Preview is read-only; editing requires typing in the code pane. Dev-focused UX with file trees, terminal, extensions. Overwhelming for non-technical users. |
| Ask an LLM (Claude, ChatGPT) | "Change the date in this HTML" → LLM regenerates the file | LLM rewrites everything, not just the change. Attribute order, whitespace, comments, inline scripts get scrambled. Each regeneration is a gamble. |
| Pinegrow (closest match) | Open .html, edit visually, save back | Dev-tool UX: Bootstrap grid panels, CSS class management, media query breakpoints. Non-technical users are lost. $120/yr. |
| Dreamweaver | Classic WYSIWYG HTML editor | $20.99/mo subscription, dated interface, dev-framed. Not built for document-style editing. |
| BlueGriffon | Free WYSIWYG editor (was the go-to) | Dead since March 2024. Built on deprecated Gecko/XUL engine. No longer maintained. |
| Just not editing it | Receive .html, can't edit, give up | The most common outcome. Content stays stale. Work doesn't get done. |

**The status quo has no working answer for "I just need to change one sentence in this HTML file."**

---

## 4. Why Status Quo Will Stay Broken Without This Product

**Structural reason 1 — The parse-tree trap:**
Every WYSIWYG editor that has ever existed normalizes HTML through a parse tree. The serializer reconstructs from the tree — losing attribute order, whitespace, comments, CDATA sections, and all "non-standard" markup. Any editor based on this model will corrupt arbitrary HTML on import. Building a faithful round-tripper requires a fundamentally different architecture (surgical text editing with DOM awareness), which nobody has productized for a consumer app.

**Structural reason 2 — Incentive misalignment:**
Site builder companies (Wix, Webflow, Squarespace) profit from lock-in — proprietary formats, hosting, subscriptions. They have zero incentive to build a tool that opens any .html and saves back in place. Code editor companies (Microsoft, Panic) profit from developer tooling — they have no incentive to simplify to "Word for HTML" because their paying users value complexity. The only actor with incentive to build this is an independent new entrant.

**Structural reason 3 — LLM adoption is creating the demand at scale:**
Before 2023, .html files were primarily authored by developers. Non-technical users rarely had HTML files to edit. LLMs (Claude Artifacts, ChatGPT canvas, Cursor) now generate HTML output for millions of users who have never written a line of code. Every one of those users encounters the editing gap within their first 5 LLM sessions. The demand has existed for a decade but the volume is now compounding — LLMs are making HTML a consumer file format for the first time.

**Structural reason 4 — Safari blocks the easy path:**
A pure browser-based editor using File System Access API would work for roughly half of Mac users (Chrome/Edge/Arc). Safari, the default Mac browser with ~50% market share on macOS, does not support it. Firefox called the API "harmful" and won't implement it. A web-only product permanently excludes half the Mac audience. This creates a natural barrier to purely web-based competition and makes a native Mac app the correct distribution model.

---

## 5. Our Core Belief (The Insight)

> "HTML is just a file format. People shouldn't need to read code to edit their own content."

The world treats HTML as a developer's domain. But an .html file is no different from a .docx — it's structured content that happens to be text. The fact that the structure is angle brackets instead of XML inside a ZIP archive is an implementation detail. Users edit content, not markup. PageSmith makes that true.

---

## 6. What We Are NOT Building

Documenting deferrals explicitly. If it's not listed below, it's in scope for consideration.

| Deferred | Why | When to revisit |
|---|---|---|
| Multi-file / project management | PageSmith edits one .html at a time. No "project" concept. | Post-v1 if users ask for site management |
| Site builder features (templates, hosting, deploy) | Different product category; site builders use proprietary formats | Never — this is explicitly what we're NOT |
| AI content generation | Claude/ChatGPT already do this. PageSmith refines their output, doesn't compete with it. | Never — AI generation is a different product |
| Collaboration / cloud sync | Requires backend infrastructure, user accounts, conflict resolution | Post-v1 if usage patterns show collaborative need |
| CSS class editor / visual style panel | Inline styles only for v0.1. Class management is dev territory. | Post-v1 with caution — don't become Pinegrow |
| Browser-based full product | Safari doesn't support File System Access API; Firefox won't. Half the Mac market locked out. | Web trial only (Chromium), never full replacement |
| Cross-platform (Windows/Linux) | Mac-only for v0.1. Tauri 2 enables cross-platform in future. | After Mac PMF is clear |
| Plugin / extension system | Platform ecosystems are v2+ territory | Post-PMF |
| Real-time preview in browser | Cmd+Tab to browser is the preview. No embedded browser pane. | Post-v1 if user feedback demands it |

---

## 7. Success Criteria

These are the conditions under which we declare this product is working. Each is measurable and time-bound.

### 7.1 Technical Validation (Pre-Build Gate — must hit before building UI)
| Metric | Target | How to measure |
|---|---|---|
| Round-trip faithfulness | 100% byte-identical for untouched regions; 100% test files pass | Automated test suite: open file → surgical edit → save → diff against expected |
| File load time (< 5 MB) | < 1 second from open to rendered view | Instrumentation |
| Binary size | < 15 MB (.dmg) | Build output measurement |

### 7.2 MVP Validation (Post-Launch Gate — must hit before investing in v1)
| Metric | Target | How to measure |
|---|---|---|
| Day-1 activation rate | > 80% of first sessions result in edit + save | Instrumentation |
| Default-handler adoption | > 40% of users set PageSmith as default .html handler within 7 days | OS file association API |
| App Store rating | >= 4.0 stars (first 30 days) | App Store Connect |
| Crash rate | < 0.1% of sessions | Crash reporter |
| Round-trip complaint rate | < 1% of users report file corruption | Support inbox / feedback form |

### 7.3 PMF Signal (3-Month Gate)
| Metric | Target | How to measure |
|---|---|---|
| Weekly active users | > 5,000 WAUs | Instrumentation (opt-in) |
| Sessions per user per week | > 3 average | Instrumentation |
| Organic discovery | > 50% of new installs from App Store search / browse (not direct link) | App Store Analytics |
| Return rate | > 60% of users return within 7 days of first session | Instrumentation |
| LLM tool usage (v1+) | > 20% of active users have LLM tooling enabled | Instrumentation |

### 7.4 North Star Metric
**Files saved per week.**
This metric captures actual editing behavior — every save is a user who successfully edited an HTML file. It's a leading indicator of both adoption and retention. Everything we build must move this number.

---

## 8. Launch Gates — Binary Go / No-Go

These are the non-negotiable thresholds. If any of these are NOT met, we do not launch (or we pause, fix, and re-evaluate).

### Pre-Launch Gates (must be true before public release)

| Gate | Condition | Status |
|---|---|---|
| L1 — Round-trip faithfulness | Automated test suite passes 100%: 50 diverse HTML files opened, edited, saved; untouched regions byte-identical | PENDING |
| L2 — Crash safety | 0 crashes in 100 automated edit sessions with varied HTML inputs (malformed, large, script-heavy) | PENDING |
| L3 — File system integrity | Save operations cannot produce zero-byte files or truncation. Every save path has atomic write (write to temp → rename) | PENDING |
| L4 — Empty state handled | App launches cleanly without a file; "Open an HTML file" prompt visible; File → Open and drag-and-drop both tested | PENDING |
| L5 — Undo integrity | Undo stack preserves source-model fidelity; 100 sequential undos/redos on a single file produces identical output to no edits | PENDING |
| L6 — Mac App Store ready | App passes App Store review guidelines; sandboxed; notarized; file associations registered | PENDING |

### Post-Launch Kill Switch Triggers (if these happen, pause and fix before continuing)

| Trigger | Condition | Response |
|---|---|---|
| K1 — Data corruption | > 10 confirmed reports of file corruption in any 7-day window | Pull from App Store; audit save pipeline; emergency patch |
| K2 — Critical crash | > 1% crash rate in any 7-day window | Pull affected version; fix; re-release |
| K3 — Zero adoption | < 100 installs in first 14 days on App Store | Marketing sprint; do not add features |
| K4 — Security vulnerability | Any vulnerability that allows arbitrary code execution via crafted HTML | Pull immediately; security audit; re-release after fix |

---

## 9. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Surgical edit engine fails on real-world HTML | Medium | Critical | Build engine first; test against 1,000+ diverse HTML files from Common Crawl before building UI |
| Tauri 2 limitations surface (WKWebView behavior differences from Safari) | Low | Medium | Test rendering fidelity against Safari during engine build phase; document known gaps |
| Users don't discover the app (App Store visibility) | Medium | High | Invest in App Store Optimization (title, keywords, screenshots); LLM community distribution (mentions in Claude/ChatGPT documentation) |
| Apple rejects app (sandbox concerns with file system access) | Low | Medium | Use Tauri's file APIs; test sandbox compatibility early; have appeal ready citing TextEdit/Pages precedent |
| Competitor ships similar product faster | Low | Medium | The surgical edit engine is the moat — copying the UI is easy; copying the round-trip architecture is not. Ship fast but don't skip the hard part. |
| User expects browser-like JS execution | High | Low | Set expectations: JS is disabled for safety and predictability. Show a "Preview in Browser" button that opens the file in the user's default browser. |

---

*Version: 1.0 — LOCKED*
*Owner: Utkarsh Kumar*
*Next review: 2026-08-11 (or when a launch gate is hit)*
