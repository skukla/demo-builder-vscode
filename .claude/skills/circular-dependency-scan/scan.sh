#!/usr/bin/env bash
#
# scan.sh — list import cycles under ROOT via `npx madge --circular`. Prints each
# circular chain (a -> b -> c -> a) it finds across .ts/.tsx modules, or reports
# "No circular dependency found".
#
# Reports RUNTIME value cycles only: the repo's .madgerc sets skipTypeImports, so
# `import type` edges (erased at compile — no init-order hazard) do not count.
# Calibrated 2026-08-23: the unfiltered scan showed 20 cycles of which 19 were
# type-only noise hiding the ONE real one (ProjectCreationHandlerRegistry
# importing the './' barrel that re-exports it). A planted value cycle is the
# control that proved the filter still detects the hazard class.
#
# Usage: bash scan.sh [ROOT=src]

set -uo pipefail
ROOT="${1:-src}"

npx madge --circular --extensions ts,tsx "$ROOT"
