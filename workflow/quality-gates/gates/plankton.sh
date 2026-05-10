#!/usr/bin/env bash
# Gate: plankton — Custom / organisation-specific quality gate
# =============================================================================
# This is a placeholder for your team's proprietary quality gate.
# Replace the body of this script with your specific tool invocation.
#
# Common uses:
#   - Architecture fitness functions (Deptrac, ArchUnit, dependency-cruiser)
#   - Contract test runners (Pact, Dredd)
#   - API schema validation (Spectral, swagger-cli)
#   - Compliance checks (license scanning, SBOM generation)
#   - Performance regression gates (k6, Lighthouse CI)
#   - Custom complexity metrics
#
# The script receives $1 = target directory.
# Exit 0 = pass, non-zero = fail.
# =============================================================================
set -euo pipefail

TARGET="${1:-.}"
cd "$TARGET"

source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.sh" 2>/dev/null \
  || source "$(dirname "${BASH_SOURCE[0]}")/../gates.config.example.sh"

# ── Option A: Dependency architecture check (dependency-cruiser) ──────────────
# if command -v depcruise &>/dev/null; then
#   depcruise --config .dependency-cruiser.js src
#   exit $?
# fi

# ── Option B: API schema lint (Spectral) ─────────────────────────────────────
# if command -v spectral &>/dev/null; then
#   spectral lint openapi.yaml
#   exit $?
# fi

# ── Option C: License compliance ─────────────────────────────────────────────
# if command -v license-checker &>/dev/null; then
#   license-checker --onlyAllow "MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause"
#   exit $?
# fi

# ── Option D: Custom shell script from config ─────────────────────────────────
if [[ -n "${PLANKTON_CMD:-}" ]]; then
  eval "$PLANKTON_CMD"
  exit $?
fi

# ── Default: gate is enabled but not yet configured ───────────────────────────
echo "Plankton gate is enabled (GATE_PLANKTON=true) but no command is configured."
echo "Edit quality-gates/gates/plankton.sh to wire up your custom gate."
echo "Or set PLANKTON_CMD in gates.config.sh."
exit 1
