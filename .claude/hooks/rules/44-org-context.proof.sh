#!/bin/bash
# Proves 44-org-context.rule fires on the org/auth guard code.
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
  payload=$(P="$path" T="$tool" S="org-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"file_path":os.environ["P"],"content":"x","new_string":"x"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-20s got=%-20s %s\n' "$label" "$expect" "$got" "$verdict"
}

echo "=== the canonical org-context files ==="
run "$ROOT/src/features/authentication/services/ensureOrgContext.ts"          "ensureOrgContext"        org-context
run "$ROOT/src/features/authentication/services/detectProjectOrgMismatch.ts"  "detectProjectOrgMismatch" org-context
run "$ROOT/src/features/authentication/services/orgContextEnv.ts"             "orgContextEnv (feature)"  org-context
run "$ROOT/src/core/shell/orgContextEnv.ts"                                   "orgContextEnv (core)"     org-context

echo
echo "=== authenticationService is 856 lines; the ROUTE must still win ==="
run "$ROOT/src/features/authentication/services/authenticationService.ts"     "authenticationService"    org-context

echo
echo "=== other auth work stays silent ==="
run "$ROOT/src/features/authentication/services/adobeCliFallback.ts"          "adobeCliFallback"         -
