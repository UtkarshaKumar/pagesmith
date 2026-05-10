#!/usr/bin/env bash
# Gate: lint — Static analysis
set -euo pipefail
TARGET="${1:-.}"
cd "$TARGET"

source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.sh" 2>/dev/null \
  || source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.example.sh"

detect_lang() {
  [[ "${PROJECT_LANG:-auto}" != "auto" ]] && { echo "$PROJECT_LANG"; return; }
  [[ -f package.json ]]    && echo "node"   && return
  [[ -f pyproject.toml || -f setup.py || -f requirements.txt ]] && echo "python" && return
  [[ -f go.mod ]]          && echo "go"     && return
  echo "unknown"
}

LANG=$(detect_lang)
case "$LANG" in
  node)   eval "${NODE_LINT_CMD:-npx eslint . --max-warnings=0}" ;;
  python) eval "${PY_LINT_CMD:-python -m pylint src/ --fail-under=8.0}" ;;
  go)     eval "${GO_LINT_CMD:-golangci-lint run}" ;;
  rust)   cargo clippy -- -D warnings ;;
  *)      echo "Lint: no command configured for lang=$LANG"; exit 1 ;;
esac
