#!/usr/bin/env bash
# Gate: tests — Run the test suite
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
  [[ -f Cargo.toml ]]      && echo "rust"   && return
  [[ -f pom.xml || -f build.gradle ]] && echo "java" && return
  echo "unknown"
}

LANG=$(detect_lang)
case "$LANG" in
  node)   eval "${NODE_TEST_CMD:-npm test}" ;;
  python) eval "${PY_TEST_CMD:-python -m pytest -v}" ;;
  go)     eval "${GO_TEST_CMD:-go test ./... -v}" ;;
  rust)   cargo test ;;
  java)   mvn test -q 2>/dev/null || gradle test ;;
  *)      echo "Cannot auto-detect test command. Set NODE_TEST_CMD / PY_TEST_CMD / etc. in gates.config.sh"; exit 1 ;;
esac
