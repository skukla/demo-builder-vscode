#!/usr/bin/env bash
#
# sweep.sh — the release-cut FULL-COVERAGE run (AI-1q's third done-condition).
#
# Runs every unattended-safe prompt: the full tier-1/skills set (read-only
# allowlist), then the tier-2 batch (scratch project + pointer choreography).
# Tier 3 never runs here BY DESIGN — the named floor in
# unprompted-baseline.json documents each exclusion, and the coverage test
# enforces that every floor entry stays reasoned.
#
# Usage: bash sweep.sh          (a live dev host must be serving the socket —
#                                see mcp-live-probe for the relaunch recipe)
set -uo pipefail
AB="$(cd "$(dirname "$0")" && pwd)"

echo "== sweep: tier 1 + skills (read-only) =="
node "$AB/run.mjs" || exit 1

echo
echo "== sweep: tier 2 (scratch writes) =="
TIER2_IDS=$(python3 -c "
import json
d = json.load(open('$AB/prompts.json'))
print(','.join(p['id'] for p in d if p.get('tier') == 2))
")
node "$AB/run.mjs" --tier2 --only "$TIER2_IDS" || exit 1

echo
echo "== sweep: coverage gates =="
# Never pipe jest (buffering reads as a hang) — redirect, then read the file.
GATE_OUT="$(mktemp -t battery-sweep-gate)"
(cd "$AB/../../../.." && npx jest --no-coverage tests/features/ai/server/toolPromptCoverage.test.ts > "$GATE_OUT" 2>&1)
GATE=$?
tail -3 "$GATE_OUT"
rm -f "$GATE_OUT"
exit $GATE
