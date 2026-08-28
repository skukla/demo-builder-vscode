#!/bin/bash
# ERP round-trip journey — unattended runner (owner-authorized 2026-08-28,
# "I can't be present while you run it").
#
# Allowlist = the battery's read surface + the EXACT write set this journey
# needs. Deliberate caps, stated per the no-silent-caps rule:
#   - NO create_adobe_project / create_adobe_workspace / delete_adobe_project:
#     the journey uses bodea's EXISTING Console project (the extension's
#     model). A denial on these steers to the existing project; it does not
#     invalidate the run — the in-project route is the product's happy path.
#   - NO mesh/EDS/DA.live writes, NO sign_in: out of this journey's scope.
#   - Write/Edit ARE allowed (building an app writes code), unlike the battery.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
AB="$REPO/.rptc/plans/evaluation-mode/battery"
BODEA="$HOME/.demo-builder/projects/bodea"
OUT="${1:?usage: run-erp-roundtrip.sh <output-dir> [journey-doc]}"
DOC="${2:-$REPO/.rptc/plans/evaluation-mode/journeys/erp-roundtrip.md}"
mkdir -p "$OUT"

PROMPT="$(sed -n '/^> /s/^> //p' "$DOC" | tr '\n' ' ')"
[ -n "$PROMPT" ] || { echo "RED: could not extract the prompt from erp-roundtrip.md"; exit 2; }
echo "prompt: $PROMPT"

READS=$(node "$AB/enumerate-tools.mjs" "$BODEA/.mcp.json")
TP=$(grep -v '^#' "$AB/third-party-reads.txt" | sed '/^$/d')
WRITES="add_integration install_integration deploy_integration redeploy_integration remove_integration configure_project set_console_apis set_project_destination get_integration_install_status create_event_provider create_event_registration delete_event_provider delete_event_registration"
WRITES_PREFIXED=$(for w in $WRITES; do echo "mcp__demo-builder__$w"; done)
NATIVE="Read Write Edit Bash Glob Grep ToolSearch WebFetch TodoWrite"

cd "$BODEA"   # the journey runs INSIDE the project — real environment, project AGENTS.md
EXIT=0
# shellcheck disable=SC2086
claude -p "$PROMPT" \
    --mcp-config "$BODEA/.mcp.json" \
    --strict-mcp-config \
    --allowed-tools $READS $TP $WRITES_PREFIXED $NATIVE \
    --disallowed-tools NotebookEdit \
    --permission-mode dontAsk \
    --output-format stream-json --verbose \
    > "$OUT/stream.jsonl" 2> "$OUT/stderr.txt" || EXIT=$?
echo "claude exit: $EXIT"
# The session id, for the journey scan afterwards.
python3 - "$OUT/stream.jsonl" <<'EOF'
import json,sys
for line in open(sys.argv[1]):
    try: d=json.loads(line)
    except: continue
    if d.get('session_id'): print('session:', d['session_id']); break
EOF

# ── ZERO CHECK (journey measurement rule 6): what did this run leave behind? ──
# Manifest components + live event entities, printed so the report never
# relies on the agent's own account. Runtime-package verification now lives
# INSIDE remove_integration itself (AB-7) and surfaces on its response.
echo "=== ZERO CHECK ==="
python3 - <<'PY'
import json
d = json.load(open('.demo-builder.json'))
print('components:', sorted((d.get('componentInstances') or {}).keys()))
print('appBuilder selections:', d.get('componentSelections', {}).get('appBuilder'))
PY
node "$REPO/.claude/skills/mcp-live-probe/probe.mjs" call list_event_providers '{}' 2>/dev/null | tail -1
exit $EXIT
