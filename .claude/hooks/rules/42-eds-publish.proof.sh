#!/bin/bash
# Proves 42-eds-publish.rule covers all three EDS API surfaces and stops there.
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
  payload=$(P="$path" T="$tool" S="edsp-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"file_path":os.environ["P"],"content":"x","new_string":"x"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-20s got=%-20s %s\n' "$label" "$expect" "$got" "$verdict"
}

echo "=== the three surfaces whose writes lie about succeeding ==="
run "$ROOT/src/features/eds/services/helix/helixApiClient.ts"              "helix/"        eds-publish
run "$ROOT/src/features/eds/services/daLive/daLiveApiClient.ts"            "daLive/"       eds-publish
run "$ROOT/src/features/eds/services/configService/configServiceAccess.ts" "configService/" eds-publish

echo
echo "=== other EDS work is not this skill ==="
run "$ROOT/src/features/eds/services/storefront/storefrontProbe.ts"  "storefront/"   -
run "$ROOT/src/features/eds/handlers/edsGitHubHandlers.ts"           "an eds handler" -
