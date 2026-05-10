#!/usr/bin/env bash
# =============================================================================
# stacked-pr.sh — Stacked PR Workflow Manager
# =============================================================================
# Manages a chain of PRs where each layer builds on the previous.
# Each stack layer runs through the full BUILD → VERIFY → PUBLISH → REVIEW loop.
#
# Stack definition in spec file:
#
#   stack:
#     - layer: data-model
#       description: Add database schema and migrations
#       branch: feature/auth-data-model
#     - layer: service
#       description: Business logic layer
#       branch: feature/auth-service
#     - layer: api
#       description: REST endpoints
#       branch: feature/auth-api
#     - layer: ui
#       description: Frontend components
#       branch: feature/auth-ui
#
# Usage:
#   ./stacked-pr.sh <spec-file.md> [options]
#   (Called by orchestrate.sh when --stack is set; can also be called directly)
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[stacked-pr]${RESET} $*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
fail() { echo -e "${RED}✗${RESET} $*" >&2; }

SPEC_FILE="$1"; shift

MAX_CYCLES=3
MAX_RETRIES=5
BASE_BRANCH="main"
DRY_RUN=false
PROVIDER="claude"
MODEL="claude-opus-4-6"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_ID="$(date +%Y%m%d-%H%M%S)-stack-$$"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-cycles)   MAX_CYCLES="$2";  shift 2 ;;
    --max-retries)  MAX_RETRIES="$2"; shift 2 ;;
    --base-branch)  BASE_BRANCH="$2"; shift 2 ;;
    --provider)     PROVIDER="$2";    shift 2 ;;
    --model)        MODEL="$2";       shift 2 ;;
    --dry-run)      DRY_RUN=true;     shift   ;;
    *) fail "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Parse stack layers from spec ──────────────────────────────────────────────
parse_stack_layers() {
  # Extracts layers from the spec's YAML-like stack: block
  # Returns one "layer_name|branch_name|description" per line
  python3 - "$SPEC_FILE" <<'EOF'
import sys, re

spec = open(sys.argv[1]).read()
# Find the stack: block
match = re.search(r'^stack:\s*\n((?:  - layer:.*\n(?:    .*\n)*)*)', spec, re.MULTILINE)
if not match:
    print("ERROR: No 'stack:' block found in spec", file=sys.stderr)
    sys.exit(1)

layers = []
block = match.group(1)
entries = re.findall(
    r'- layer:\s*(\S+).*?\n'
    r'(?:    description:\s*(.*?)\n)?'
    r'(?:    branch:\s*(\S+))?',
    block
)
for name, desc, branch in entries:
    branch = branch or f"feature/{name}"
    print(f"{name}|{branch}|{desc.strip()}")
EOF
}

# ── Print stack summary ───────────────────────────────────────────────────────
print_stack() {
  local i=1
  echo ""
  echo -e "${BOLD}Stack layers:${RESET}"
  while IFS='|' read -r name branch desc; do
    echo -e "  ${i}. ${BOLD}${name}${RESET}  branch=${branch}  ${desc}"
    ((i++))
  done <<< "$STACK_LAYERS"
  echo ""
}

# ── Run one layer through the orchestrator ────────────────────────────────────
run_layer() {
  local layer_name="$1"
  local layer_branch="$2"
  local layer_base="$3"    # previous layer's branch (or BASE_BRANCH for first)
  local layer_num="$4"
  local total_layers="$5"

  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  Stack layer ${layer_num}/${total_layers}: ${layer_name}${RESET}"
  echo -e "${BOLD}  Branch: ${layer_branch}  ←  ${layer_base}${RESET}"
  echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"

  # Create a temporary per-layer spec that scopes to this layer only
  local layer_spec="/tmp/layer-spec-${layer_name}-${SESSION_ID}.md"
  create_layer_spec "$SPEC_FILE" "$layer_name" "$layer_spec"

  local dry_flag=""
  [[ "$DRY_RUN" == true ]] && dry_flag="--dry-run"

  bash "${SCRIPT_DIR}/orchestrate.sh" "$layer_spec" \
    --base-branch "$layer_base" \
    --max-cycles "$MAX_CYCLES" \
    --max-retries "$MAX_RETRIES" \
    --provider "$PROVIDER" \
    --model "$MODEL" \
    $dry_flag

  local exit_code=$?
  rm -f "$layer_spec"
  return $exit_code
}

# ── Create a scoped spec for one layer ───────────────────────────────────────
create_layer_spec() {
  local full_spec="$1"
  local layer_name="$2"
  local output="$3"

  python3 - "$full_spec" "$layer_name" "$output" <<'EOF'
import sys, re

full_spec = open(sys.argv[1]).read()
layer_name = sys.argv[2]
output_path = sys.argv[3]

# Extract global header (everything before stack:)
header_match = re.split(r'^stack:', full_spec, 1, flags=re.MULTILINE)
header = header_match[0] if header_match else full_spec

# Extract this layer's section if it exists
layer_match = re.search(
    r'#+\s+Layer:\s+' + re.escape(layer_name) + r'\s*\n(.*?)(?=\n#+\s+Layer:|$)',
    full_spec, re.DOTALL | re.IGNORECASE
)
layer_section = layer_match.group(1).strip() if layer_match else ""

with open(output_path, 'w') as f:
    f.write(f"# {layer_name} (Stack Layer)\n\n")
    f.write(f"branch: feature/{layer_name}\n\n")
    f.write("<!-- Auto-generated layer spec -->\n\n")
    f.write(header.strip() + "\n\n")
    if layer_section:
        f.write(f"## Layer-specific requirements\n\n{layer_section}\n")
EOF
}

# ── Generate stack PR description ────────────────────────────────────────────
create_stack_pr_description() {
  local layer_name="$1"
  local layer_num="$2"
  local total="$3"
  local base_branch="$4"

  cat <<EOF
## Stack Layer ${layer_num}/${total}: ${layer_name}

This PR is part of a stacked PR chain. Merge in order:
$(
  local i=1
  while IFS='|' read -r n b _; do
    [[ $i -eq $layer_num ]] && echo "  → **${i}. ${n}** ← this PR" || echo "  - ${i}. ${n} (\`${b}\`)"
    ((i++))
  done <<< "$STACK_LAYERS"
)

**Base branch:** \`${base_branch}\`

---
🤖 Generated with [workflow/stacked-pr/stacked-pr.sh](workflow/stacked-pr/stacked-pr.sh)
EOF
}

# ── Update stacked PR list in parent PR ──────────────────────────────────────
update_stack_index() {
  # If gh CLI is available, post a comment on the first PR with stack status
  command -v gh &>/dev/null || return 0
  [[ "$DRY_RUN" == true ]] && return 0

  local first_branch
  first_branch=$(echo "$STACK_LAYERS" | head -1 | cut -d'|' -f2)

  local pr_number
  pr_number=$(gh pr view "$first_branch" --json number -q '.number' 2>/dev/null || echo "")
  [[ -z "$pr_number" ]] && return 0

  local body="## Stack Status\n"
  local i=1
  while IFS='|' read -r name branch _; do
    local status
    if gh pr view "$branch" --json state -q '.state' 2>/dev/null | grep -q "MERGED"; then
      status="✅ merged"
    elif gh pr view "$branch" &>/dev/null 2>&1; then
      status="🔵 open"
    else
      status="⏳ pending"
    fi
    body+="- Layer ${i}: \`${name}\` (${branch}) — ${status}\n"
    ((i++))
  done <<< "$STACK_LAYERS"

  gh pr comment "$pr_number" --body "$(printf "%b" "$body")" --edit-last 2>/dev/null \
    || gh pr comment "$pr_number" --body "$(printf "%b" "$body")" || true
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  log "Session: $SESSION_ID"
  log "Spec: $SPEC_FILE"

  STACK_LAYERS=$(parse_stack_layers) || exit 1
  local total_layers
  total_layers=$(echo "$STACK_LAYERS" | wc -l | tr -d ' ')

  print_stack

  local prev_branch="$BASE_BRANCH"
  local layer_num=0
  local failed_layers=()

  while IFS='|' read -r name branch desc; do
    ((layer_num++))
    if run_layer "$name" "$branch" "$prev_branch" "$layer_num" "$total_layers"; then
      ok "Layer ${layer_num}/${total_layers} complete: ${name}"
      prev_branch="$branch"
    else
      fail "Layer ${layer_num}/${total_layers} failed: ${name}"
      failed_layers+=("$name")
      # Stop the stack on failure — layers are dependent
      break
    fi
    update_stack_index
  done <<< "$STACK_LAYERS"

  echo ""
  if [[ ${#failed_layers[@]} -eq 0 ]]; then
    ok "ALL ${total_layers} STACK LAYERS COMPLETE"
    ok "Open PRs are ready for human review in merge order."
  else
    fail "Stack stopped at layer: ${failed_layers[*]}"
    fail "Fix the failing layer and re-run from that layer."
    exit 1
  fi
}

main
