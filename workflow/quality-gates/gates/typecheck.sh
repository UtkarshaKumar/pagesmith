#!/usr/bin/env bash
# Gate: typecheck — Type safety verification
set -euo pipefail
TARGET="${1:-.}"
cd "$TARGET"

source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.sh" 2>/dev/null \
  || source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.example.sh"

detect_lang() {
  [[ "${PROJECT_LANG:-auto}" != "auto" ]] && { echo "$PROJECT_LANG"; return; }
  [[ -f tsconfig.json ]] && echo "node" && return
  [[ -f pyproject.toml || -f mypy.ini || -f setup.cfg ]] && echo "python" && return
  [[ -f go.mod ]] && echo "go" && return
  echo "unknown"
}

LANG=$(detect_lang)
case "$LANG" in
  node)   eval "${NODE_TYPECHECK_CMD:-npx tsc --noEmit}" ;;
  python) eval "${PY_TYPECHECK_CMD:-python -m mypy src/ --strict}" ;;
  go)     go build ./... ;;   # Go's compiler IS the type checker
  rust)   cargo check ;;
  *)      echo "Typecheck: no command configured for lang=$LANG. Set PROJECT_LANG in gates.config.sh"; exit 1 ;;
esac
