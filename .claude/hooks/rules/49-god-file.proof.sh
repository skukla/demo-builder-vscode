#!/bin/bash
# Proves 49-god-file.rule measures the file and fires only when it is over its limit.
#
# ATTRIBUTES BY MESSAGE, not exit code: nineteen rules share one router and any of
# them can exit 2. Every case uses a FRESH session_id — a reused one spends the
# once-per-session marker and later cases read as a dead matcher.
cd "$(git rev-parse --show-toplevel)" || exit 1
ROOT=$(git rev-parse --show-toplevel)

fired_rule() {
  case "$1" in
    *"skips the pre-push gate"*)            echo push-no-verify ;;
    *"webview message contract"*)           echo webview-handler ;;
    *"App Builder catalog"*)                echo appbuilder-component ;;
    *"Helix / DA.live / Config Service"*)   echo eds-publish ;;
    *"storefront config / dropin"*)         echo eds-dropin ;;
    *"Adobe org/auth handling"*)            echo org-context ;;
    *"line limit for its kind"*)            echo god-file ;;
    *"creating a NEW test file"*)           echo test-authoring ;;
    *"NEW script to scripts/"*)             echo new-instrument ;;
    *"changing a stylesheet"*)              echo css-baseline ;;
    *"step or area ORDER"*)                 echo wizard-step ;;
    *"AI bundle"*)                          echo ai-bundle ;;
    *"MCP tool surface"*)                   echo mcp-tool ;;
    *"creating a NEW UI component"*)        echo reuse-first ;;
    *"React+Spectrum webview test"*)        echo webview-test ;;
    *"about to look something up"*)         echo adobe-docs ;;
    *"already in this directory"*|*"curated"*) echo registry-dir ;;
    "")                                     echo - ;;
    *)                                      echo other ;;
  esac
}

run() {
  local path="$1" label="$2" expect="$3" tool="${4:-Edit}"
  local payload out got verdict
  payload=$(P="$path" T="$tool" S="god-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"file_path":os.environ["P"],"content":"x","new_string":"x"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-20s got=%-20s %s\n' "$label" "$expect" "$got" "$verdict"
}

echo "=== over the limit for its kind ==="
run "$ROOT/src/features/app-builder/services/appBuilderComponentRunner.ts"  "1121-line service (>400)"  god-file
run "$ROOT/src/features/projects-dashboard/handlers/dashboardHandlers.ts"   "928-line handler (>500)"   god-file
run "$ROOT/src/features/dashboard/ui/components/ActionGrid.tsx"             "660-line component (>350)" god-file

echo
echo "=== under the limit: silent ==="
run "$ROOT/src/core/ui/utils/classNames.ts"                                 "a small util"              -
run "$ROOT/src/features/authentication/services/detectProjectOrgMismatch.ts" "95-line service"          org-context

echo
echo "=== Agent 11's exclusions are honoured ==="
run "$ROOT/src/features/eds/services/types.ts"        "types.ts — a type definition file"  -
run "$ROOT/src/types/messages.ts"                     "a barrel-ish types file"            webview-handler

echo
echo "=== the message must state the MEASUREMENT, not just scold ==="
payload=$(P="$ROOT/src/features/app-builder/services/appBuilderComponentRunner.ts" S="god-msg-$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":"Edit","tool_input":{"file_path":os.environ["P"],"new_string":"x"},"session_id":os.environ["S"]}))')
msg=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
if printf '%s' "$msg" | grep -q '1121 lines' && printf '%s' "$msg" | grep -q '400-line limit'; then
  printf '%-58s expect=%-20s got=%-20s %s\n' "names the real line count and the limit" measured measured OK
else
  printf '%-58s expect=%-20s got=%-20s %s\n' "names the real line count and the limit" measured vague '*** WRONG ***'
fi
