#!/usr/bin/env bash
# =============================================================================
# generate-context.sh — Codebase Context Generator
# =============================================================================
# Produces a structured context document consumed by Builder and Reviewer agents.
# Outputs to stdout — pipe to a file or let the orchestrator capture it.
#
# Usage:
#   ./generate-context.sh [target-dir]
#
# The context document includes:
#   1. Project identity (language, framework, test framework)
#   2. Directory map (depth-limited tree)
#   3. Entry points and public API surface
#   4. Key conventions extracted from existing code
#   5. Test patterns (how tests are written)
#   6. Dependency summary
#   7. Git context (recent commits, active branches)
#   8. CLAUDE.md / project instructions (if present)
# =============================================================================

set -euo pipefail

TARGET="${1:-.}"
TARGET="$(cd "$TARGET" && pwd)"

MAX_TREE_DEPTH=4
MAX_FILE_LINES=60          # Lines to sample from key files
MAX_EXAMPLE_FILES=3        # How many code files to sample per pattern search

# ── Helpers ───────────────────────────────────────────────────────────────────
hr()    { echo ""; echo "────────────────────────────────────────────────────"; }
head2() { echo ""; echo "## $*"; }
head3() { echo ""; echo "### $*"; }

# ── Language detection ────────────────────────────────────────────────────────
detect_language() {
  cd "$TARGET"
  if [[ -f tsconfig.json ]] || find . -name "*.ts" -not -path "*/node_modules/*" | head -1 | grep -q .; then
    echo "typescript"
  elif [[ -f package.json ]]; then
    echo "javascript"
  elif [[ -f pyproject.toml ]] || [[ -f setup.py ]] || find . -name "*.py" | head -1 | grep -q .; then
    echo "python"
  elif [[ -f go.mod ]]; then
    echo "go"
  elif [[ -f Cargo.toml ]]; then
    echo "rust"
  elif [[ -f pom.xml ]] || [[ -f build.gradle ]]; then
    echo "java"
  elif [[ -f Gemfile ]]; then
    echo "ruby"
  else
    echo "unknown"
  fi
}

# ── Framework detection ───────────────────────────────────────────────────────
detect_framework() {
  cd "$TARGET"
  local lang="$1"
  case "$lang" in
    typescript|javascript)
      [[ -f package.json ]] || { echo "unknown"; return; }
      if grep -q '"next"' package.json 2>/dev/null; then echo "Next.js"
      elif grep -q '"react"' package.json 2>/dev/null; then echo "React"
      elif grep -q '"express"' package.json 2>/dev/null; then echo "Express"
      elif grep -q '"fastify"' package.json 2>/dev/null; then echo "Fastify"
      elif grep -q '"nestjs"' package.json 2>/dev/null; then echo "NestJS"
      else echo "Node"
      fi ;;
    python)
      if [[ -f requirements.txt ]] || [[ -f pyproject.toml ]]; then
        if grep -qi "django" requirements.txt pyproject.toml 2>/dev/null; then echo "Django"
        elif grep -qi "fastapi" requirements.txt pyproject.toml 2>/dev/null; then echo "FastAPI"
        elif grep -qi "flask" requirements.txt pyproject.toml 2>/dev/null; then echo "Flask"
        else echo "Python"
        fi
      else echo "Python"
      fi ;;
    go)  grep -q "gin-gonic" go.mod 2>/dev/null && echo "Gin" || echo "Go stdlib" ;;
    *)   echo "unknown" ;;
  esac
}

detect_test_framework() {
  cd "$TARGET"
  local lang="$1"
  case "$lang" in
    typescript|javascript)
      if grep -q '"jest"' package.json 2>/dev/null; then echo "Jest"
      elif grep -q '"vitest"' package.json 2>/dev/null; then echo "Vitest"
      elif grep -q '"mocha"' package.json 2>/dev/null; then echo "Mocha"
      else echo "unknown"
      fi ;;
    python) echo "pytest" ;;
    go)     echo "testing (stdlib)" ;;
    rust)   echo "cargo test" ;;
    *)      echo "unknown" ;;
  esac
}

# ── Directory tree ────────────────────────────────────────────────────────────
print_tree() {
  cd "$TARGET"
  if command -v tree &>/dev/null; then
    tree -L "$MAX_TREE_DEPTH" \
      --ignore ".git" \
      -I "node_modules|.venv|venv|__pycache__|*.pyc|.mypy_cache|dist|build|coverage|.next|target" \
      2>/dev/null | head -100
  else
    # Fallback: find-based tree
    find . -maxdepth "$MAX_TREE_DEPTH" \
      -not -path '*/.git/*' \
      -not -path '*/node_modules/*' \
      -not -path '*/__pycache__/*' \
      -not -path '*/dist/*' \
      -not -path '*/build/*' \
      | sort | sed 's|[^/]*/|  |g' | head -80
  fi
}

# ── Sample source files ───────────────────────────────────────────────────────
sample_source_files() {
  local lang="$1"
  local pattern=""
  case "$lang" in
    typescript) pattern="*.ts"  ;;
    javascript) pattern="*.js"  ;;
    python)     pattern="*.py"  ;;
    go)         pattern="*.go"  ;;
    rust)       pattern="*.rs"  ;;
    *)          pattern="*"     ;;
  esac

  cd "$TARGET"
  find . -name "$pattern" \
    -not -path '*/node_modules/*' \
    -not -path '*/.git/*' \
    -not -path '*/dist/*' \
    -not -path '*/build/*' \
    -not -name "*.test.*" \
    -not -name "*.spec.*" \
    -not -name "*.min.*" \
    | head -"$MAX_EXAMPLE_FILES" | while read -r f; do
      echo ""
      echo "\`\`\`  FILE: $f"
      head -"$MAX_FILE_LINES" "$f" 2>/dev/null
      echo "\`\`\`"
    done
}

# ── Sample test files ─────────────────────────────────────────────────────────
sample_test_files() {
  local lang="$1"
  cd "$TARGET"
  find . \( -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.js" \
    -o -name "test_*.py" -o -name "*_test.go" \) \
    -not -path '*/node_modules/*' \
    -not -path '*/.git/*' \
    | head -2 | while read -r f; do
      echo ""
      echo "\`\`\`  TEST FILE: $f"
      head -"$MAX_FILE_LINES" "$f" 2>/dev/null
      echo "\`\`\`"
    done
}

# ── Git context ────────────────────────────────────────────────────────────────
git_context() {
  cd "$TARGET"
  git rev-parse --git-dir &>/dev/null || { echo "(not a git repo)"; return; }

  echo "Current branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
  echo ""
  echo "Recent commits:"
  git log --oneline -10 2>/dev/null || echo "(no commits)"
  echo ""
  echo "Active branches:"
  git branch -a 2>/dev/null | head -10 || echo "(no branches)"
}

# ── Dependency summary ────────────────────────────────────────────────────────
dependency_summary() {
  local lang="$1"
  cd "$TARGET"
  case "$lang" in
    typescript|javascript)
      if [[ -f package.json ]]; then
        echo "Dependencies (from package.json):"
        python3 -c "
import json, sys
pkg = json.load(open('package.json'))
deps = {**pkg.get('dependencies',{}), **pkg.get('devDependencies',{})}
for k,v in list(deps.items())[:20]: print(f'  {k}: {v}')
if len(deps) > 20: print(f'  ... and {len(deps)-20} more')
" 2>/dev/null || cat package.json | head -30
      fi ;;
    python)
      [[ -f requirements.txt ]] && head -20 requirements.txt \
        || (command -v pip &>/dev/null && pip list --format=columns 2>/dev/null | head -20) ;;
    go)
      [[ -f go.mod ]] && cat go.mod ;;
    rust)
      [[ -f Cargo.toml ]] && head -30 Cargo.toml ;;
  esac
}

# ── CLAUDE.md ─────────────────────────────────────────────────────────────────
claude_md() {
  cd "$TARGET"
  local f
  for f in CLAUDE.md .claude/CLAUDE.md claude.md; do
    if [[ -f "$f" ]]; then
      echo "Found: $f"
      echo ""
      head -100 "$f"
      return
    fi
  done
  echo "(no CLAUDE.md found)"
}

# ── Main output ───────────────────────────────────────────────────────────────
LANG=$(detect_language)
FRAMEWORK=$(detect_framework "$LANG")
TEST_FRAMEWORK=$(detect_test_framework "$LANG")

cat <<EOF
# Codebase Context
Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Target: $TARGET

EOF

head2 "Project Identity"
echo "| Property       | Value         |"
echo "|----------------|---------------|"
echo "| Language       | $LANG         |"
echo "| Framework      | $FRAMEWORK    |"
echo "| Test framework | $TEST_FRAMEWORK |"
echo "| Platform       | $(uname -s) $(uname -m) |"
[[ -f "$TARGET/package.json" ]] && echo "| Node version   | $(node --version 2>/dev/null || echo 'n/a') |"

head2 "Directory Structure"
echo '```'
print_tree
echo '```'

head2 "Source File Samples"
echo "*(First ${MAX_EXAMPLE_FILES} non-test files, first ${MAX_FILE_LINES} lines each)*"
sample_source_files "$LANG"

head2 "Test File Samples"
echo "*(Patterns show how tests are written in this codebase)*"
sample_test_files "$LANG"

head2 "Dependencies"
dependency_summary "$LANG"

head2 "Git Context"
git_context

head2 "Project Instructions (CLAUDE.md)"
claude_md

hr
echo ""
echo "*End of context document.*"
