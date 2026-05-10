#!/usr/bin/env bash
# =============================================================================
# run-gates.sh — Quality Gate Runner
# =============================================================================
# Runs all configured quality gates in order. Exits 0 only if all gates pass.
#
# Usage:
#   ./run-gates.sh [target-dir]
#
# Configuration:
#   Copy gates.config.example.sh → gates.config.sh and fill in your project.
#   Each gate is a small script in ./gates/ that exits 0 (pass) or non-zero (fail).
#
# Gates run in this order (skip if not enabled in config):
#   1. format    — Code formatting check (prettier, black, gofmt, etc.)
#   2. lint      — Static analysis (eslint, pylint, golangci-lint, etc.)
#   3. typecheck — Type safety (tsc, mypy, etc.)
#   4. tests     — Unit + integration test suite
#   5. coverage  — Coverage threshold enforcement
#   6. security  — Security scanning (bandit, npm audit, gosec, etc.)
#   7. plankton  — Custom / project-specific gate (plug your tool here)
#   8. custom    — Any extra scripts listed in CUSTOM_GATES array
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RESET='\033[0m'
BOLD='\033[1m'

TARGET_DIR="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/gates.config.sh"
GATES_DIR="${SCRIPT_DIR}/gates"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
FAILED_GATES=()

# ── Load config ───────────────────────────────────────────────────────────────
if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
else
  echo -e "${YELLOW}⚠ No gates.config.sh found — using example config${RESET}"
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/gates.config.example.sh" 2>/dev/null || true
fi

# ── Defaults (overridden by config) ──────────────────────────────────────────
GATE_FORMAT="${GATE_FORMAT:-false}"
GATE_LINT="${GATE_LINT:-false}"
GATE_TYPECHECK="${GATE_TYPECHECK:-false}"
GATE_TESTS="${GATE_TESTS:-true}"
GATE_COVERAGE="${GATE_COVERAGE:-false}"
GATE_SECURITY="${GATE_SECURITY:-false}"
GATE_PLANKTON="${GATE_PLANKTON:-false}"

COVERAGE_THRESHOLD="${COVERAGE_THRESHOLD:-80}"
CUSTOM_GATES=("${CUSTOM_GATES[@]:-}")

# ── Gate runner ───────────────────────────────────────────────────────────────
run_gate() {
  local name="$1"
  local enabled="$2"
  local gate_script="${GATES_DIR}/${name}.sh"

  printf "${BOLD}%-12s${RESET} " "[$name]"

  if [[ "${enabled}" != "true" ]]; then
    echo -e "${YELLOW}SKIP${RESET}"
    ((SKIP_COUNT++))
    return 0
  fi

  if [[ ! -x "$gate_script" ]]; then
    echo -e "${YELLOW}SKIP (script not found: ${gate_script})${RESET}"
    ((SKIP_COUNT++))
    return 0
  fi

  local output
  local exit_code=0
  output=$(bash "$gate_script" "$TARGET_DIR" 2>&1) || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    echo -e "${GREEN}PASS${RESET}"
    ((PASS_COUNT++))
  else
    echo -e "${RED}FAIL${RESET}"
    echo -e "${RED}┌── Output ─────────────────────────────────────${RESET}"
    echo "$output" | sed 's/^/│ /'
    echo -e "${RED}└───────────────────────────────────────────────${RESET}"
    ((FAIL_COUNT++))
    FAILED_GATES+=("$name")
  fi
}

# ── Run all gates ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Quality Gates${RESET}  target=$(realpath "$TARGET_DIR")"
echo "──────────────────────────────────────────────────"

run_gate "format"    "$GATE_FORMAT"
run_gate "lint"      "$GATE_LINT"
run_gate "typecheck" "$GATE_TYPECHECK"
run_gate "tests"     "$GATE_TESTS"
run_gate "coverage"  "$GATE_COVERAGE"
run_gate "security"  "$GATE_SECURITY"
run_gate "plankton"  "$GATE_PLANKTON"

# Custom gates
for custom in "${CUSTOM_GATES[@]}"; do
  [[ -z "$custom" ]] && continue
  printf "${BOLD}%-12s${RESET} " "[$(basename "$custom")]"
  if [[ -x "$custom" ]]; then
    output=$(bash "$custom" "$TARGET_DIR" 2>&1) && {
      echo -e "${GREEN}PASS${RESET}"; ((PASS_COUNT++))
    } || {
      echo -e "${RED}FAIL${RESET}"
      echo "$output" | sed 's/^/│ /'
      ((FAIL_COUNT++))
      FAILED_GATES+=("$(basename "$custom")")
    }
  else
    echo -e "${YELLOW}SKIP (not executable)${RESET}"; ((SKIP_COUNT++))
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo "──────────────────────────────────────────────────"
echo -e "Pass: ${GREEN}${PASS_COUNT}${RESET}  Fail: ${RED}${FAIL_COUNT}${RESET}  Skip: ${YELLOW}${SKIP_COUNT}${RESET}"

if [[ $FAIL_COUNT -gt 0 ]]; then
  echo -e "${RED}FAILED GATES: ${FAILED_GATES[*]}${RESET}"
  exit 1
fi

echo -e "${GREEN}All quality gates passed.${RESET}"
exit 0
