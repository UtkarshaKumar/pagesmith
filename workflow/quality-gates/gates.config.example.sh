#!/usr/bin/env bash
# =============================================================================
# gates.config.example.sh — Quality Gate Configuration Template
# =============================================================================
# Copy this file to gates.config.sh and fill in for your project.
# Only committed values take effect — gates.config.sh is gitignored by default.
# =============================================================================

# ── Enable/disable gates ──────────────────────────────────────────────────────
GATE_FORMAT="true"       # e.g., prettier --check, black --check
GATE_LINT="true"         # e.g., eslint, pylint, golangci-lint
GATE_TYPECHECK="true"    # e.g., tsc --noEmit, mypy
GATE_TESTS="true"        # e.g., jest, pytest, go test
GATE_COVERAGE="true"     # enforce coverage threshold
GATE_SECURITY="false"    # e.g., npm audit, bandit, gosec (enable when set up)
GATE_PLANKTON="false"    # plug your custom/org-specific gate here

# ── Coverage threshold ────────────────────────────────────────────────────────
COVERAGE_THRESHOLD=80    # minimum % lines covered

# ── Plankton gate ─────────────────────────────────────────────────────────────
# "Plankton" is the placeholder for your custom quality gate —
# replace with your organisation's specific tool or CI check.
#
# To wire it up, edit quality-gates/gates/plankton.sh to call your tool.
# Example tools it might wrap:
#   - A proprietary linter
#   - An architecture fitness function (ArchUnit, Deptrac, etc.)
#   - A compliance check script
#   - A contract test runner (Pact, Dredd)
#   - Any bash-invocable CI gate

# ── Custom gates ──────────────────────────────────────────────────────────────
# List absolute or relative paths to additional gate scripts.
# Each must exit 0 for pass, non-zero for fail. Receives $1=target_dir.
CUSTOM_GATES=(
  # "${SCRIPT_DIR}/gates/contract-tests.sh"
  # "${SCRIPT_DIR}/gates/api-schema-check.sh"
)

# ── Tool-specific settings ────────────────────────────────────────────────────
# These are read by the individual gate scripts in ./gates/

# Node / TypeScript
NODE_TEST_CMD="npm test"
NODE_LINT_CMD="npx eslint . --ext .ts,.tsx,.js,.jsx"
NODE_TYPECHECK_CMD="npx tsc --noEmit"
NODE_FORMAT_CMD="npx prettier --check ."
NODE_COVERAGE_CMD="npm run test:coverage"
NODE_COVERAGE_REPORT="coverage/coverage-summary.json"

# Python
PY_TEST_CMD="python -m pytest"
PY_LINT_CMD="python -m pylint src/"
PY_TYPECHECK_CMD="python -m mypy src/"
PY_FORMAT_CMD="python -m black --check ."
PY_COVERAGE_CMD="python -m pytest --cov=src --cov-report=json"
PY_COVERAGE_REPORT="coverage.json"

# Go
GO_TEST_CMD="go test ./..."
GO_LINT_CMD="golangci-lint run"
GO_FORMAT_CMD="gofmt -l ."
GO_COVERAGE_CMD="go test -coverprofile=coverage.out ./..."

# ── Language auto-detection ───────────────────────────────────────────────────
# Gate scripts will auto-detect language from project files if not overridden.
# Override here to force a specific set:
# PROJECT_LANG="node"   # node | python | go | java | ruby | rust | auto
PROJECT_LANG="auto"
