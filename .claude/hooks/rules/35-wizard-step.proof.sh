#!/bin/bash
# Proves 35-wizard-step.rule routes the three files that must agree about wizard order.
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
  payload=$(P="$path" T="$tool" S="wiz-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"file_path":os.environ["P"],"content":"describe(\"x\",()=>{});","new_string":"x"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-15s got=%-15s %s\n' "$label" "$expect" "$got" "$verdict"
}


echo "=== the three order-bearing files ==="
run "$ROOT/src/features/project-creation/config/wizard-steps.json"        "wizard-steps.json"          wizard-step Edit
run "$ROOT/src/features/project-creation/ui/steps/buildYourProjectAreas.ts" "buildYourProjectAreas.ts" wizard-step Edit
run "$ROOT/src/features/project-creation/ui/steps/commerceSections.ts"    "commerceSections.ts"        wizard-step Edit

echo
echo "=== a step BODY is ordinary work and is not interrupted ==="
run "$ROOT/src/features/project-creation/ui/steps/WelcomeStep.tsx"        "a step component"           -           Edit
run "$ROOT/src/features/project-creation/config/components.json"          "a different config"         -           Edit
