#!/bin/bash
# The audit's DENOMINATORS — the totals every ledger must reconcile against.
# Each is a single command whose output the owner can re-run; no pipes feed
# exit-code claims (counts land in variables and print labeled).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SRC_FILES=$(git ls-files 'src/**/*.ts' 'src/**/*.tsx' | wc -l | tr -d ' ')
HANDLER_MAPS=$(grep -rln "defineHandlers\|: MessageHandler" src --include="*.ts" | grep -c "andlers" || true)
SERVICE_CLASSES=$(grep -rln "^export class.*Service\|^export class.*Manager" src --include="*.ts" | wc -l | tr -d ' ')
TOOL_REGISTRARS=$(grep -rln "registerTool(" src --include="*.ts" | wc -l | tr -d ' ')
LOCATOR_SITES=$(grep -rn "ServiceLocator\.get" src --include="*.ts" | wc -l | tr -d ' ')
NEW_SERVICE_SITES=$(grep -rnE "new [A-Z][A-Za-z]*(Service|Manager|Client)\(" src --include="*.ts" | wc -l | tr -d ' ')

echo "src_files=$SRC_FILES"
echo "handler_map_files=$HANDLER_MAPS"
echo "service_class_files=$SERVICE_CLASSES"
echo "tool_registrar_files=$TOOL_REGISTRARS"
echo "locator_reach_in_sites=$LOCATOR_SITES"
echo "direct_construction_sites=$NEW_SERVICE_SITES"

# POSITIVE CONTROL: a denominator of zero for a thing known to exist means the
# COMMAND is broken, not the codebase clean.
for pair in "src_files:$SRC_FILES" "service_class_files:$SERVICE_CLASSES" "tool_registrar_files:$TOOL_REGISTRARS"; do
    name="${pair%%:*}"; val="${pair##*:}"
    if [ "$val" -eq 0 ]; then
        echo "CONTROL FAILED: $name is 0 — the denominator command is broken" >&2
        exit 2
    fi
done
echo "controls: ok"
