#!/bin/bash
# Proves 36-ai-bundle.rule fires on the bundle writers, where the four-seam gate lives.
#
# ATTRIBUTES BY MESSAGE, not exit code: fifteen rules share one router and any of
# them can exit 2, so "something blocked" says nothing about which one answered.
# Every case uses a FRESH session_id — these rules are `rule_once=1`, and a reused
# id spends the marker so later cases read as a dead matcher.
cd "$(git rev-parse --show-toplevel)" || exit 1
ROOT=$(git rev-parse --show-toplevel)

fired_rule() {
  case "$1" in
    *"step or area ORDER"*)                 echo wizard-step ;;
    *"AI bundle"*)                          echo ai-bundle ;;
    *"MCP tool surface"*)                   echo mcp-tool ;;
    *"creating a NEW test file"*)           echo test-authoring ;;
    *"NEW script to scripts/"*)             echo new-instrument ;;
    *"changing a stylesheet"*)              echo css-baseline ;;
    *"creating a NEW UI component"*)        echo reuse-first ;;
    *"React+Spectrum webview test"*)        echo webview-test ;;
    *"about to look something up"*)         echo adobe-docs ;;
    *"already in this directory"*|*"curated"*) echo registry-dir ;;
    "")                                     echo - ;;
    *)                                      echo other ;;
  esac
}

run() {
  local path="$1" label="$2" expect="$3" tool="${4:-Write}"
  local payload out got verdict
  payload=$(P="$path" T="$tool" S="aib-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"file_path":os.environ["P"],"content":"describe(\"x\",()=>{});","new_string":"x"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-15s got=%-15s %s\n' "$label" "$expect" "$got" "$verdict"
}


echo "=== the bundle writers ==="
run "$ROOT/src/features/project-creation/services/aiBundle/aiToolingGate.ts"   "the gate itself"      ai-bundle Edit
run "$ROOT/src/features/project-creation/services/aiBundle/aiContextWriter.ts" "AGENTS.md writer"     ai-bundle Edit
run "$ROOT/src/features/project-creation/services/aiBundle/brandNew.ts"        "a NEW bundle writer"  ai-bundle

echo
echo "=== unrelated project-creation work stays silent ==="
run "$ROOT/src/features/project-creation/services/edsContentSetup.ts"          "a sibling service"    -         Edit
run "$ROOT/src/features/project-creation/ui/steps/WelcomeStep.tsx"             "a wizard step"        -         Edit

echo
echo "=== the message must name the FOUR SEAMS, which is the whole point ==="
payload=$(P="$ROOT/src/features/project-creation/services/aiBundle/aiToolingGate.ts" S="aib-msg-$RANDOM$$" python3 -c "import json,os;print(json.dumps({\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":os.environ[\"P\"],\"new_string\":\"x\"},\"session_id\":os.environ[\"S\"]}))")
msg=$(printf "%s" "$payload" | bash .claude/hooks/router.sh 2>&1)
n=0
for seam in buildMcpConfig installAiDefaultsMcpTools componentInstallationOrchestrator handleRegenerateAiFiles; do
  printf "%s" "$msg" | grep -q "$seam" && n=$((n+1))
done
if [ "$n" -eq 4 ]; then
  printf "%-58s expect=%-15s got=%-15s %s\n" "names all four seams" 4 "$n" OK
else
  printf "%-58s expect=%-15s got=%-15s %s\n" "names all four seams" 4 "$n" "*** WRONG ***"
fi
