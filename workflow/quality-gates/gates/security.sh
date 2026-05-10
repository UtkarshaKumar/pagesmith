#!/usr/bin/env bash
# Gate: security — Security vulnerability scanning
set -euo pipefail
TARGET="${1:-.}"
cd "$TARGET"

source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.sh" 2>/dev/null \
  || source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.example.sh"

detect_lang() {
  [[ "${PROJECT_LANG:-auto}" != "auto" ]] && { echo "$PROJECT_LANG"; return; }
  [[ -f package.json ]] && echo "node" && return
  [[ -f pyproject.toml || -f setup.py || -f requirements.txt ]] && echo "python" && return
  [[ -f go.mod ]] && echo "go" && return
  echo "unknown"
}

LANG=$(detect_lang)
EXIT_CODE=0

case "$LANG" in
  node)
    if command -v npm &>/dev/null; then
      # Fail only on high/critical
      npm audit --audit-level=high || EXIT_CODE=$?
    fi
    # Also check for hardcoded secrets if gitleaks is available
    if command -v gitleaks &>/dev/null; then
      gitleaks detect --no-git --source . || EXIT_CODE=$?
    fi
    ;;
  python)
    if command -v bandit &>/dev/null; then
      bandit -r src/ -ll || EXIT_CODE=$?   # -ll = only HIGH severity
    else
      echo "bandit not installed — pip install bandit"
      exit 1
    fi
    ;;
  go)
    if command -v gosec &>/dev/null; then
      gosec ./... || EXIT_CODE=$?
    else
      echo "gosec not installed — go install github.com/securego/gosec/v2/cmd/gosec@latest"
      exit 1
    fi
    ;;
  *)
    echo "Security: no scanner configured for lang=$LANG"
    exit 1
    ;;
esac

exit $EXIT_CODE
