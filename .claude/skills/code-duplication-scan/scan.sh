#!/usr/bin/env bash
#
# scan.sh — report copy-paste LOGIC duplication under ROOT via `npx jscpd`. Prints
# each cloned block pair (the two locations + line span) to the console. Tests and
# specs are ignored (fixture/setup repetition is expected and not a target).
#
# Signal only, not a verdict: jscpd matches token sequences, so it flags structurally
# identical code regardless of intent. Some clones are fine (generated code, parallel
# test tables). Triage each per SKILL.md and apply the Rule of Three before extracting.
#
# Usage: bash scan.sh [ROOT=src] [MIN_LINES=8]

set -uo pipefail
ROOT="${1:-src}"
MIN_LINES="${2:-8}"

npx jscpd "$ROOT" \
    --min-lines "$MIN_LINES" \
    --min-tokens 60 \
    --reporters console \
    --ignore "**/*.test.*,**/*.spec.*"
