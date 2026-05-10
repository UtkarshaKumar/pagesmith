# PageSmith — Orchestration Plan

> How agents are deployed, monitored, and sequenced to build PageSmith.
> Uses: Forge CLI (forge/sage/muse) + Multi-Agent SWE Workflow + manual orchestration gates.

---

## Orchestration Architecture

```
                    ┌─────────────────────────────┐
                    │     ORCHESTRATOR (human)     │
                    │  Reviews gate outputs        │
                    │  Approves phase transitions  │
                    └──────────┬──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │  MUSE    │    │  FORGE   │    │  SAGE    │
        │ (plan)   │    │ (build)  │    │ (research)│
        │ Plans    │    │ Writes   │    │ Explores  │
        │ to plans/│    │ code,    │    │ codebase, │
        │ ADRs     │    │ tests    │    │ evaluates │
        └──────────┘    └──────────┘    └──────────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   SWE WORKFLOW       │
                    │  Quality gates       │
                    │  Reviewer agent      │
                    │  PR management       │
                    └─────────────────────┘
```

## Agent Invocation

### MUSE (architect/planner)
```bash
# Plan a feature before building
forge -p "@TASKS.md plan the implementation of P2-T1: Toolbar UI component.
Read designs/visual_mode_editor_text_editing/screen.png for reference.
Output plan to plans/p2-t1-toolbar.md" --agent muse

# Design an ADR for a decision
forge -p "Write ADR-008 for the contenteditable Enter key behavior.
Read CONSTITUTION.md and DECISIONS.md first." --agent muse
```

### SAGE (researcher)
```bash
# Evaluate Rust HTML parsing crates
forge -p "Evaluate html5ever, lol-html, and scraper crates for lossless HTML parsing.
For each: can it preserve comments? CDATA? attribute order? whitespace?
Output to plans/parser-evaluation.md" --agent sage

# Explore the Tauri 2 API surface for file I/O
forge -p "Explore Tauri 2's file system plugin APIs (@tauri-apps/plugin-fs).
Can we do atomic writes? What's the sandbox behavior?
Output findings." --agent sage
```

### FORGE (builder)
```bash
# Execute a specific task
:task P1-T1    # via ZSH plugin — reads TASKS.md, checks deps, builds

# Or via one-shot
forge -p "@TASKS.md execute task P1-T1: Scaffold Tauri 2 project.
Read CLAUDE.md and CONSTITUTION.md first." --agent forge
```

## Phase Execution Sequence

### Phase 1 — Engine (current)

```
Step 1: SAGE evaluates parser crates → plans/parser-evaluation.md
Step 2: MUSE designs source model API → plans/source-model-design.md
Step 3: FORGE executes P1-T1 (scaffold Tauri project)
Step 4: FORGE executes P1-T2 (source model + parser)
Step 5: FORGE executes P1-T3 (patch model) ─┐
Step 6: FORGE executes P1-T4 (file I/O)     ├─ parallel
Step 7: SAGE + FORGE execute P1-T5 (corpus) ─┘
Step 8: FORGE executes P1-T6 (test harness)
Step 9: ORCHESTRATOR runs gate check → P1-T7
        If PASS → Phase 2
        If FAIL → SAGE investigates, FORGE fixes, re-run gate
```

### Phase 2 — Core Editor

```
Step 1: MUSE designs toolbar → plans/p2-t1-toolbar.md
        (references designs/visual_mode_editor_text_editing/screen.png)
Step 2: FORGE executes P2-T1 (toolbar UI) ─┐
Step 3: FORGE executes P2-T2 (contenteditable bridge) ─┤ sequential
Step 4: FORGE executes P2-T3 (undo)          ─┤
Step 5: FORGE executes P2-T4 (open/save UI)  ─┤
Step 6: FORGE executes P2-T5 (formatting)    ─┤
Step 7: FORGE executes P2-T6 (font/color)    ─┘
Step 8: ORCHESTRATOR conducts 10-user test → P2-T7
```

### Phase 3 — Full v0.1

```
FORGE executes P3-T1 through P3-T6 in parallel (all deps on P2-T7):
  - P3-T1 (table editing)    ← designs/visual_mode_table_editing/screen.png
  - P3-T2 (link editing)     ← designs/link_editing_popover/screen.png
  - P3-T3 (image handling)
  - P3-T4 (source mode)      ← designs/source_mode_editor/screen.png
  - P3-T5 (recent files)     ← designs/empty_state_and_recent_files/screen.png
  - P3-T6 (HTML5 elements)   ← designs/html5_semantic_elements_view/screen.png

Then:
  FORGE executes P3-T7 (Mac polish) → sequential
  FORGE executes P3-T8 (App Store prep) → sequential
  ORCHESTRATOR verifies all L1-L6 gates
```

### Phase 4 — LLM Tooling

```
FORGE executes P4-T1 → P4-T2 → P4-T3 (sequential)
```

## Monitoring & Quality Gates

After every FORGE task completion:
1. `cargo build` must succeed
2. `cargo test` must pass (all existing tests)
3. Phase 1: `cargo test --test harness` must pass (round-trip test suite)
4. Format check: `cargo fmt --check` (when configured)
5. Clippy: `cargo clippy -- -D warnings` (when configured)

After every PR:
- SWE Workflow Reviewer agent evaluates diff against spec
- Quality gates run: format → lint → typecheck → tests → coverage → security

## Session Tracking

Every forge conversation is saved. Resume with:
```bash
forge conversation resume <id>
```

Key conversations to track:
| Task | Conversation ID | Status |
|------|----------------|--------|
| P1-T1 (scaffold) | — | Not started |
| Sage parser eval | — | Not started |
| Muse source model design | — | Not started |

---

*This plan is executed by the human orchestrator. Agents are invoked via forge CLI commands documented above.*
*Update status after each task completion.*
