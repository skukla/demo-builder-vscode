#!/usr/bin/env bash
#
# scan.sh — shortlist dead / abandoned code under ROOT. Two labelled sections:
#   1. Unused exports (via `npx ts-prune`, filtered to ROOT). A `(used in module)`
#      suffix means the symbol is referenced internally but never imported elsewhere
#      — a candidate to un-export, not necessarily to delete.
#   2. Abandonment markers — comments/identifiers that self-declare code as obsolete
#      (deprecated, legacy, superseded, "to be removed", …). Tests are excluded.
#
# Signal only, not a verdict: ts-prune reports entry points (extension.ts,
# mcp-server.ts), dynamic-import / DI-registered / config-registered symbols as
# "unused" though they are live. Triage each per SKILL.md before deleting.
#
# Usage: bash scan.sh [ROOT=src]

set -uo pipefail
ROOT="${1:-src}"

echo "== Unused exports (ts-prune, filtered to ${ROOT}/) =="
npx ts-prune 2>/dev/null | grep -E "^${ROOT}/" || echo "  (none)"
echo

echo "== Abandonment markers (deprecated / legacy / superseded / to be removed) =="
grep -rniE '\b(deprecated|superseded|legacy|obsolete|no longer used|dead code|to be removed|kept for now)\b' \
    "$ROOT" --include='*.ts' --include='*.tsx' \
    | grep -vE '\.(test|spec)\.tsx?:' \
    || echo "  (none)"
