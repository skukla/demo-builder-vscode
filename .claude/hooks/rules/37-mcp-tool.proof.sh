#!/bin/bash
# Proves 37-mcp-tool.rule fires on the descriptor rows and the registration facade.
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
  payload=$(P="$path" T="$tool" S="mcp-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"file_path":os.environ["P"],"content":"describe(\"x\",()=>{});","new_string":"x"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-15s got=%-15s %s\n' "$label" "$expect" "$got" "$verdict"
}


echo "=== the agent surface ==="
run "$ROOT/src/features/ai/server/toolDescriptors.ts"        "toolDescriptors"          mcp-tool Edit
run "$ROOT/src/features/ai/server/actionDescriptors.ts"      "actionDescriptors"        mcp-tool Edit
run "$ROOT/src/features/ai/server/statusDescriptors.ts"      "statusDescriptors"        mcp-tool Edit
run "$ROOT/src/mcp-server.ts"                                "the registration facade"  mcp-tool Edit

echo
echo "=== the server internals are not the tool surface ==="
run "$ROOT/src/features/ai/server/inExtensionMcpServer.ts"   "the server itself"        -        Edit
run "$ROOT/src/mcp/credentials.ts"                           "an mcp implementation"    -        Edit

echo
echo "=== the message must name the credential rule that FAILS THE BUILD ==="
payload=$(P="$ROOT/src/features/ai/server/toolDescriptors.ts" S="mcp-msg-$RANDOM$$" python3 -c "import json,os;print(json.dumps({\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":os.environ[\"P\"],\"new_string\":\"x\"},\"session_id\":os.environ[\"S\"]}))")
msg=$(printf "%s" "$payload" | bash .claude/hooks/router.sh 2>&1)
if printf "%s" "$msg" | grep -q "mcp-tool-authoring" && printf "%s" "$msg" | grep -q "needsAuth"; then
  printf "%-58s expect=%-15s got=%-15s %s\n" "names the skill AND needsAuth" named named OK
else
  printf "%-58s expect=%-15s got=%-15s %s\n" "names the skill AND needsAuth" named empty "*** WRONG ***"
fi
