#!/usr/bin/env bash
# Gate: format — Code formatting check (read-only; does not auto-fix)
set -euo pipefail
TARGET="${1:-.}"
cd "$TARGET"

source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.sh" 2>/dev/null \
  || source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.example.sh"

detect_lang() {
  [[ "${PROJECT_LANG:-auto}" != "auto" ]] && { echo "$PROJECT_LANG"; return; }
  [[ -f package.json || -f .prettierrc* ]] && echo "node" && return
  [[ -f pyproject.toml || -f .black* ]] && echo "python" && return
  [[ -f go.mod ]] && echo "go" && return
  echo "unknown"
}

LANG=$(detect_lang)
case "$LANG" in
  node)   eval "${NODE_FORMAT_CMD:-npx prettier --check .}" ;;
  python) eval "${PY_FORMAT_CMD:-python -m black --check .}" ;;
  go)
    unformatted=$(gofmt -l .)
    if [[ -n "$unformatted" ]]; then
      echo "Unformatted files:"
      echo "$unformatted"
      exit 1
    fi
    ;;
  rust)   cargo fmt -- --check ;;
  *)      echo "Format: no command for lang=$LANG"; exit 1 ;;
esac
