#!/usr/bin/env bash
#
# scan.sh — list import cycles under ROOT via `npx madge --circular`. Prints each
# circular chain (a -> b -> c -> a) it finds across .ts/.tsx modules, or reports
# "No circular dependency found".
#
# Signal only, not a verdict: madge follows static import edges regardless of whether
# the cycle is type-only (low risk) or a runtime value cycle (fragile init order).
# Inspect each cycle per SKILL.md before deciding how to break it.
#
# Usage: bash scan.sh [ROOT=src]

set -uo pipefail
ROOT="${1:-src}"

npx madge --circular --extensions ts,tsx "$ROOT"
