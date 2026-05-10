#!/usr/bin/env bash
# Gate: coverage — Enforce minimum test coverage threshold
set -euo pipefail
TARGET="${1:-.}"
cd "$TARGET"

source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.sh" 2>/dev/null \
  || source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.example.sh"

THRESHOLD="${COVERAGE_THRESHOLD:-80}"

detect_lang() {
  [[ "${PROJECT_LANG:-auto}" != "auto" ]] && { echo "$PROJECT_LANG"; return; }
  [[ -f package.json ]] && echo "node" && return
  [[ -f pyproject.toml || -f setup.py ]] && echo "python" && return
  [[ -f go.mod ]] && echo "go" && return
  echo "unknown"
}

check_coverage_node() {
  eval "${NODE_COVERAGE_CMD:-npm run test:coverage -- --coverage}"
  local report="${NODE_COVERAGE_REPORT:-coverage/coverage-summary.json}"
  if [[ -f "$report" ]] && command -v jq &>/dev/null; then
    local pct
    pct=$(jq '.total.lines.pct' "$report")
    echo "Line coverage: ${pct}%  (threshold: ${THRESHOLD}%)"
    awk "BEGIN { exit ($pct < $THRESHOLD) ? 1 : 0 }"
  fi
}

check_coverage_python() {
  eval "${PY_COVERAGE_CMD:-python -m pytest --cov=src --cov-report=json --cov-fail-under=${THRESHOLD}}"
}

check_coverage_go() {
  eval "${GO_COVERAGE_CMD:-go test -coverprofile=coverage.out ./...}"
  local pct
  pct=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | tr -d '%')
  echo "Go coverage: ${pct}%  (threshold: ${THRESHOLD}%)"
  awk "BEGIN { exit ($pct < $THRESHOLD) ? 1 : 0 }"
}

LANG=$(detect_lang)
case "$LANG" in
  node)   check_coverage_node ;;
  python) check_coverage_python ;;
  go)     check_coverage_go ;;
  *)      echo "Coverage: no command configured for lang=$LANG"; exit 1 ;;
esac
