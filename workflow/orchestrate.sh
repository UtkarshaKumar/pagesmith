#!/usr/bin/env bash
# =============================================================================
# orchestrate.sh — Multi-Agent SWE Workflow Orchestrator
# =============================================================================
# Implements the Builder/Reviewer loop with worktree isolation, quality gates,
# inner retry loop, structured review findings, and stacked PR support.
#
# Usage:
#   ./orchestrate.sh <spec-file.md> [options]
#
# Options:
#   --max-cycles N        Max outer review cycles (default: 3)
#   --max-retries N       Max inner fix retries per cycle (default: 5)
#   --stack               Enable stacked-PR mode (spec must define stack layers)
#   --base-branch NAME    Base branch to branch from (default: main)
#   --dry-run             Plan and validate only; no commits or PRs
#   --no-worktree         Skip worktree creation (use current dir as-is)
#   --provider PROVIDER   LLM CLI to use: claude|kimi|gemini (default: claude)
#   --model MODEL         Model name — only used when --provider claude (default: claude-opus-4-6)
#
# Examples:
#   ./orchestrate.sh specs/add-auth.md
#   ./orchestrate.sh specs/big-feature.md --stack --max-cycles 5
#   ./orchestrate.sh specs/quick-fix.md --dry-run
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${RESET} $*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
fail() { echo -e "${RED}✗${RESET} $*" >&2; }
sep()  { echo -e "${BOLD}────────────────────────────────────────────────────────${RESET}"; }

# ── Defaults ─────────────────────────────────────────────────────────────────
SPEC_FILE=""
MAX_CYCLES=3
MAX_RETRIES=5
STACK_MODE=false
BASE_BRANCH="main"
DRY_RUN=false
NO_WORKTREE=false
PROVIDER="claude"
MODEL="claude-opus-4-6"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_DIR=""
CURRENT_CYCLE=0
CURRENT_RETRY=0
SESSION_ID="$(date +%Y%m%d-%H%M%S)-$$"
ARTIFACTS_DIR=".workflow/sessions/${SESSION_ID}"

# ── Parse arguments ───────────────────────────────────────────────────────────
parse_args() {
  [[ $# -eq 0 ]] && { usage; exit 1; }
  SPEC_FILE="$1"; shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --max-cycles)   MAX_CYCLES="$2";   shift 2 ;;
      --max-retries)  MAX_RETRIES="$2";  shift 2 ;;
      --stack)        STACK_MODE=true;   shift   ;;
      --base-branch)  BASE_BRANCH="$2";  shift 2 ;;
      --dry-run)      DRY_RUN=true;      shift   ;;
      --no-worktree)  NO_WORKTREE=true;  shift   ;;
      --provider)     PROVIDER="$2";     shift 2 ;;
      --model)        MODEL="$2";        shift 2 ;;
      -h|--help)      usage; exit 0      ;;
      *) fail "Unknown option: $1"; exit 1 ;;
    esac
  done
}

usage() {
cat <<EOF
${BOLD}orchestrate.sh${RESET} — Multi-Agent SWE Workflow Orchestrator

${BOLD}USAGE${RESET}
  ./orchestrate.sh <spec-file.md> [options]

${BOLD}OPTIONS${RESET}
  --max-cycles N      Max outer review cycles (default: 3)
  --max-retries N     Max inner fix retries per cycle (default: 5)
  --stack             Stacked-PR mode (spec must define stack layers)
  --base-branch NAME  Base branch (default: main)
  --dry-run           Validate spec/gates only; no commits
  --no-worktree       Skip worktree isolation
  --provider PROVIDER LLM CLI: claude|kimi|gemini (default: claude)
  --model MODEL       Model name for claude provider (default: claude-opus-4-6)

${BOLD}SPEC FILE${RESET}
  A markdown file following workflow/spec-template.md.
  See workflow/WORKFLOW.md for full documentation.
EOF
}

# ── Preflight checks ──────────────────────────────────────────────────────────
preflight() {
  log "Running preflight checks…"

  # Resolve the LLM CLI binary for the chosen provider
  local provider_cli
  case "$PROVIDER" in
    claude) provider_cli="claude" ;;
    kimi)   provider_cli="kimi"   ;;
    gemini) provider_cli="gemini" ;;
    *) fail "Unknown provider: $PROVIDER — supported values: claude, kimi, gemini"; exit 1 ;;
  esac

  # Required tools
  local required=(git "$provider_cli")
  local optional=(gh jq)

  for cmd in "${required[@]}"; do
    command -v "$cmd" &>/dev/null || { fail "Required: $cmd not found"; exit 1; }
  done
  for cmd in "${optional[@]}"; do
    command -v "$cmd" &>/dev/null || warn "Optional tool not found: $cmd (some features disabled)"
  done

  # Spec file
  [[ -f "$SPEC_FILE" ]] || { fail "Spec file not found: $SPEC_FILE"; exit 1; }

  # Git repo
  git rev-parse --git-dir &>/dev/null || { fail "Not a git repository. Run 'git init' first."; exit 1; }

  # Uncommitted changes warning
  if ! git diff --quiet HEAD 2>/dev/null; then
    warn "You have uncommitted changes. These will NOT be in the worktree."
  fi

  ok "Preflight passed"
}

# ── Parse spec ────────────────────────────────────────────────────────────────
parse_spec() {
  log "Parsing spec: $SPEC_FILE"
  SPEC_TITLE=$(grep -m1 '^# ' "$SPEC_FILE" | sed 's/^# //' || echo "Untitled")
  SPEC_BRANCH=$(grep -m1 '^branch:' "$SPEC_FILE" | sed 's/branch: *//' || echo "")
  SPEC_STACK_LAYERS=$(grep '^  - layer:' "$SPEC_FILE" | sed 's/.*layer: *//' || echo "")

  if [[ -z "$SPEC_BRANCH" ]]; then
    # Derive branch name from spec title
    SPEC_BRANCH="feature/$(echo "$SPEC_TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-' | cut -c1-50)"
  fi

  log "Title: $SPEC_TITLE"
  log "Branch: $SPEC_BRANCH"
  if [[ "$STACK_MODE" == true ]]; then
    log "Stack layers: $(echo "$SPEC_STACK_LAYERS" | wc -l | tr -d ' ')"
  fi
}

# ── Worktree management ───────────────────────────────────────────────────────
setup_worktree() {
  if [[ "$NO_WORKTREE" == true ]]; then
    warn "Skipping worktree creation (--no-worktree)"
    return
  fi

  WORKTREE_DIR=".worktrees/${SPEC_BRANCH//\//-}"
  log "Creating worktree: $WORKTREE_DIR (branch: $SPEC_BRANCH)"

  if [[ -d "$WORKTREE_DIR" ]]; then
    warn "Worktree already exists at $WORKTREE_DIR — reusing"
  else
    git worktree add -b "$SPEC_BRANCH" "$WORKTREE_DIR" "$BASE_BRANCH"
    ok "Worktree created at $WORKTREE_DIR"
  fi

  # Copy workflow config into worktree
  cp -r "${SCRIPT_DIR}" "${WORKTREE_DIR}/workflow" 2>/dev/null || true
  mkdir -p "${WORKTREE_DIR}/${ARTIFACTS_DIR}"
}

teardown_worktree() {
  [[ -z "$WORKTREE_DIR" ]] && return
  local choice
  read -r -p $'\n'"Remove worktree at $WORKTREE_DIR? [y/N] " choice
  if [[ "${choice,,}" == "y" ]]; then
    git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
    git branch -d "$SPEC_BRANCH" 2>/dev/null || true
    ok "Worktree removed"
  fi
}

# ── Context generation ────────────────────────────────────────────────────────
generate_context() {
  log "Generating codebase context for agents…"
  local ctx_script="${SCRIPT_DIR}/context/generate-context.sh"
  local ctx_output="${ARTIFACTS_DIR}/codebase-context.md"
  local target_dir="${WORKTREE_DIR:-.}"

  if [[ -x "$ctx_script" ]]; then
    bash "$ctx_script" "$target_dir" > "$ctx_output" 2>/dev/null || true
    ok "Context written to $ctx_output"
  else
    warn "Context generator not found/executable — agents will use codebase directly"
  fi
}

# ── Agent invocation ──────────────────────────────────────────────────────────
# Calls claude CLI in print mode and captures output.
# $1 = prompt file path, $2 = user message, $3 = output file
invoke_agent() {
  local prompt_file="$1"
  local user_message="$2"
  local output_file="$3"
  local extra_flags="${4:-}"

  local system_prompt
  system_prompt=$(cat "$prompt_file")

  local combined_prompt
  combined_prompt="$(cat <<EOF
${system_prompt}

---
SPEC FILE CONTENTS:
$(cat "$SPEC_FILE")

---
CODEBASE CONTEXT:
$(cat "${ARTIFACTS_DIR}/codebase-context.md" 2>/dev/null || echo "(no context generated)")

---
USER MESSAGE:
${user_message}
EOF
)"

  mkdir -p "$(dirname "$output_file")"

  if [[ "$DRY_RUN" == true ]]; then
    log "[DRY RUN] Would invoke agent: $prompt_file"
    echo "[DRY RUN OUTPUT]" > "$output_file"
    return 0
  fi

  case "$PROVIDER" in
    claude)
      # shellcheck disable=SC2086
      claude --model "$MODEL" -p "$combined_prompt" $extra_flags > "$output_file" 2>&1
      ;;
    kimi)
      kimi -p "$combined_prompt" > "$output_file" 2>&1
      ;;
    gemini)
      gemini -p "$combined_prompt" > "$output_file" 2>&1
      ;;
  esac
}

# ── Phase 1 & 2b: BUILD / FIX ────────────────────────────────────────────────
run_builder() {
  local cycle=$1
  local findings="${2:-}"   # structured findings from previous review (empty on cycle 1)
  local output_file="${ARTIFACTS_DIR}/cycle-${cycle}/builder-output.md"

  sep
  log "PHASE 1 — BUILD  (cycle ${cycle}/${MAX_CYCLES})"

  local message
  if [[ -z "$findings" ]]; then
    message="Implement the feature as described in the spec. Use TDD: write failing tests first, then implementation. Follow the codebase conventions you studied."
  else
    message="PREVIOUS REVIEW FINDINGS (fix these before re-implementing):

${findings}

Address every finding systematically. Annotate each fix with the finding ID."
  fi

  invoke_agent \
    "${SCRIPT_DIR}/agents/builder.md" \
    "$message" \
    "$output_file"

  ok "Builder output → $output_file"
}

run_builder_fix() {
  local cycle=$1
  local retry=$2
  local gate_output="$3"
  local output_file="${ARTIFACTS_DIR}/cycle-${cycle}/fix-${retry}-output.md"

  log "PHASE 2b — FIX  (cycle ${cycle}, retry ${retry}/${MAX_RETRIES})"

  local message="QUALITY GATE FAILURES (fix all of these):

\`\`\`
${gate_output}
\`\`\`

Read each failure carefully. Make targeted fixes only — do not change unrelated code."

  invoke_agent \
    "${SCRIPT_DIR}/agents/builder.md" \
    "$message" \
    "$output_file"

  ok "Fix output → $output_file"
}

# ── Phase 2: VERIFY (quality gates) ──────────────────────────────────────────
run_quality_gates() {
  local cycle=$1
  local retry=$2
  local gate_output_file="${ARTIFACTS_DIR}/cycle-${cycle}/gates-${retry}.log"
  local gates_script="${SCRIPT_DIR}/quality-gates/run-gates.sh"

  log "PHASE 2 — VERIFY  (cycle ${cycle}, retry ${retry})"

  local target_dir="${WORKTREE_DIR:-.}"

  if [[ -x "$gates_script" ]]; then
    if bash "$gates_script" "$target_dir" > "$gate_output_file" 2>&1; then
      ok "All quality gates passed"
      return 0
    else
      warn "Quality gates failed — see $gate_output_file"
      LAST_GATE_OUTPUT=$(cat "$gate_output_file")
      return 1
    fi
  else
    warn "Quality gate runner not found/executable — skipping gates"
    return 0
  fi
}

# ── Phase 3: PUBLISH ──────────────────────────────────────────────────────────
publish() {
  local cycle=$1
  local target_dir="${WORKTREE_DIR:-.}"

  sep
  log "PHASE 3 — PUBLISH  (cycle ${cycle})"

  if [[ "$DRY_RUN" == true ]]; then
    log "[DRY RUN] Would commit and push to $SPEC_BRANCH"
    return 0
  fi

  (
    cd "$target_dir"
    git add -A
    git diff --cached --quiet && { warn "Nothing to commit"; return 0; }

    local commit_msg="feat: cycle ${cycle} — ${SPEC_TITLE}

Automated commit from workflow orchestrator.
Session: ${SESSION_ID}
Spec: $(basename "$SPEC_FILE")"

    git commit -m "$commit_msg"
    git push -u origin "$SPEC_BRANCH" || git push --set-upstream origin "$SPEC_BRANCH"
  )

  # Create or update PR
  if command -v gh &>/dev/null; then
    if gh pr view "$SPEC_BRANCH" &>/dev/null 2>&1; then
      ok "PR already open for $SPEC_BRANCH — updated via push"
    else
      gh pr create \
        --title "$SPEC_TITLE" \
        --body "$(generate_pr_body "$cycle")" \
        --base "$BASE_BRANCH" \
        --head "$SPEC_BRANCH"
      ok "PR created"
    fi
  else
    warn "gh CLI not found — create PR manually"
  fi
}

generate_pr_body() {
  local cycle=$1
  cat <<EOF
## Summary
$(grep -A5 '^## Summary' "$SPEC_FILE" 2>/dev/null | tail -n +2 | head -5 || echo "See spec: $(basename "$SPEC_FILE")")

## Workflow Metadata
- **Spec**: $(basename "$SPEC_FILE")
- **Cycle**: ${cycle}/${MAX_CYCLES}
- **Session**: ${SESSION_ID}
- **Model**: ${MODEL}

## Quality Gates
All gates passed before this commit was created.

## Test Plan
$(grep -A10 '^## Test Plan' "$SPEC_FILE" 2>/dev/null | tail -n +2 | head -10 || echo "See spec file for test plan.")

---
🤖 Generated with [workflow/orchestrate.sh](workflow/orchestrate.sh)
EOF
}

# ── Phase 4: REVIEW ──────────────────────────────────────────────────────────
run_reviewer() {
  local cycle=$1
  local output_file="${ARTIFACTS_DIR}/cycle-${cycle}/reviewer-output.md"
  local findings_file="${ARTIFACTS_DIR}/cycle-${cycle}/findings.md"

  sep
  log "PHASE 4 — REVIEW  (cycle ${cycle})"

  # Fetch PR diff for reviewer
  local pr_diff=""
  if command -v gh &>/dev/null && [[ "$DRY_RUN" == false ]]; then
    pr_diff=$(gh pr diff "$SPEC_BRANCH" 2>/dev/null || git diff "${BASE_BRANCH}..${SPEC_BRANCH}" 2>/dev/null || echo "(no diff available)")
  else
    pr_diff=$(git diff "${BASE_BRANCH}..${SPEC_BRANCH}" 2>/dev/null || echo "(dry run — no diff)")
  fi

  local message="REVIEW THIS PR DIFF (you may only read — you cannot modify code):

\`\`\`diff
${pr_diff}
\`\`\`

Evaluate against the spec and produce structured findings using the exact format specified in your instructions."

  invoke_agent \
    "${SCRIPT_DIR}/agents/reviewer.md" \
    "$message" \
    "$output_file"

  ok "Reviewer output → $output_file"

  # Extract VERDICT
  local verdict
  verdict=$(grep -m1 '^VERDICT:' "$output_file" 2>/dev/null | sed 's/VERDICT: *//' || echo "FAIL")

  # Extract structured findings block
  if grep -q '^FINDINGS:' "$output_file" 2>/dev/null; then
    sed -n '/^FINDINGS:/,/^END_FINDINGS/p' "$output_file" > "$findings_file"
  fi

  case "${verdict^^}" in
    PASS)
      ok "Reviewer: PASS — PR is ready for human review"
      return 0
      ;;
    *)
      warn "Reviewer: FAIL — findings written to $findings_file"
      return 1
      ;;
  esac
}

extract_findings() {
  local cycle=$1
  local findings_file="${ARTIFACTS_DIR}/cycle-${cycle}/findings.md"
  [[ -f "$findings_file" ]] && cat "$findings_file" || echo "(no structured findings)"
}

# ── Stacked PR mode ───────────────────────────────────────────────────────────
run_stacked_mode() {
  log "Running in STACKED PR mode"
  local stack_script="${SCRIPT_DIR}/stacked-pr/stacked-pr.sh"

  if [[ -x "$stack_script" ]]; then
    bash "$stack_script" "$SPEC_FILE" \
      --base-branch "$BASE_BRANCH" \
      --max-cycles "$MAX_CYCLES" \
      --max-retries "$MAX_RETRIES" \
      --provider "$PROVIDER" \
      --model "$MODEL" \
      ${DRY_RUN:+--dry-run}
  else
    fail "Stacked PR script not found: $stack_script"
    exit 1
  fi
}

# ── Main loop ─────────────────────────────────────────────────────────────────
run_main_loop() {
  local findings=""

  for (( cycle=1; cycle<=MAX_CYCLES; cycle++ )); do
    CURRENT_CYCLE=$cycle
    mkdir -p "${ARTIFACTS_DIR}/cycle-${cycle}"

    sep
    echo -e "${BOLD}CYCLE ${cycle}/${MAX_CYCLES}${RESET}"
    sep

    # ─ BUILD ─
    run_builder "$cycle" "$findings"

    # ─ VERIFY + FIX INNER LOOP ─
    LAST_GATE_OUTPUT=""
    for (( retry=1; retry<=MAX_RETRIES; retry++ )); do
      CURRENT_RETRY=$retry

      if run_quality_gates "$cycle" "$retry"; then
        ok "Inner loop complete after ${retry} attempt(s)"
        break
      fi

      if [[ $retry -eq $MAX_RETRIES ]]; then
        fail "Max retries (${MAX_RETRIES}) reached — quality gates still failing"
        fail "Last gate output:"
        echo "$LAST_GATE_OUTPUT" >&2
        exit 2
      fi

      run_builder_fix "$cycle" "$retry" "$LAST_GATE_OUTPUT"
    done

    # ─ PUBLISH ─
    publish "$cycle"

    # ─ REVIEW ─
    if run_reviewer "$cycle"; then
      sep
      ok "WORKFLOW COMPLETE"
      ok "PR for '${SPEC_TITLE}' is ready for human review."
      ok "Branch: ${SPEC_BRANCH}"
      ok "Session artifacts: ${ARTIFACTS_DIR}/"
      sep
      return 0
    fi

    # Reviewer failed — extract findings for next cycle
    findings=$(extract_findings "$cycle")
    log "Findings from cycle ${cycle} fed into cycle $((cycle+1))"
  done

  fail "Max cycles (${MAX_CYCLES}) reached without reviewer approval."
  fail "Review the artifacts at ${ARTIFACTS_DIR}/ and proceed manually."
  exit 3
}

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    warn "Orchestrator exited with code ${exit_code}"
    warn "Artifacts saved in: ${ARTIFACTS_DIR}/"
  fi
}
trap cleanup EXIT

# ── Entrypoint ────────────────────────────────────────────────────────────────
main() {
  parse_args "$@"

  sep
  echo -e "${BOLD}Multi-Agent SWE Orchestrator${RESET}  session=${SESSION_ID}"
  sep

  preflight
  parse_spec

  mkdir -p "$ARTIFACTS_DIR"

  # Record run metadata
  cat > "${ARTIFACTS_DIR}/run.json" <<EOF
{
  "session": "${SESSION_ID}",
  "spec": "${SPEC_FILE}",
  "branch": "${SPEC_BRANCH}",
  "base_branch": "${BASE_BRANCH}",
  "max_cycles": ${MAX_CYCLES},
  "max_retries": ${MAX_RETRIES},
  "stack_mode": ${STACK_MODE},
  "dry_run": ${DRY_RUN},
  "provider": "${PROVIDER}",
  "model": "${MODEL}",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  setup_worktree
  generate_context

  # ── Parallel agent initialisation ─────────────────────────────────────────
  # Both builder and reviewer study the codebase simultaneously
  sep
  log "SETUP — Initialising Builder + Reviewer agents in parallel…"

  invoke_agent \
    "${SCRIPT_DIR}/agents/builder.md" \
    "Study the codebase and the spec. Confirm you understand the conventions, architecture, and scope of work. Respond with a brief plan (do not write code yet)." \
    "${ARTIFACTS_DIR}/builder-init.md" &
  BUILDER_PID=$!

  invoke_agent \
    "${SCRIPT_DIR}/agents/reviewer.md" \
    "Study the codebase and the spec. Confirm you understand what a correct, high-quality implementation looks like. List the key review criteria you will apply." \
    "${ARTIFACTS_DIR}/reviewer-init.md" &
  REVIEWER_PID=$!

  wait $BUILDER_PID  && ok "Builder initialised"
  wait $REVIEWER_PID && ok "Reviewer initialised"

  # ── Run the main loop or stacked-PR mode ──────────────────────────────────
  if [[ "$STACK_MODE" == true ]]; then
    run_stacked_mode
  else
    run_main_loop
  fi
}

main "$@"
