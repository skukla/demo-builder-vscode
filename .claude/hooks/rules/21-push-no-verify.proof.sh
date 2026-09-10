#!/bin/bash
# Proves 21-push-no-verify.rule blocks a gate-skipping push and nothing else.
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

runcmd() {
  local cmd="$1" label="$2" expect="$3"
  local payload out got verdict
  payload=$(C="$cmd" S="push-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":"Bash","tool_input":{"command":os.environ["C"]},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-20s got=%-20s %s\n' "$label" "$expect" "$got" "$verdict"
}

# Assembled from parts: a proof that contains the literal blocks its own tool call.
PUSH="git ""push"
NV="--no""-verify"

echo "=== the gate-skipping shapes are blocked, every time (rule_once=0) ==="
runcmd "$PUSH $NV origin develop"     "long form"                    push-no-verify
runcmd "$PUSH origin develop $NV"     "long form, trailing"          push-no-verify
runcmd "$PUSH origin develop -n"      "short form -n at the end"     push-no-verify
runcmd "$PUSH -n origin develop"      "short form -n in the middle"  push-no-verify
runcmd "$PUSH $NV origin develop"     "AGAIN — it must not be once-per-session" push-no-verify

echo
echo "=== an ordinary push, and other git work, are untouched ==="
runcmd "$PUSH origin develop"                  "a normal push"              -
runcmd "$PUSH --force-with-lease origin x"     "force-with-lease is allowed" -
runcmd "git commit -m 'ok'"                    "a commit"                   -
runcmd "git log --oneline -1"                  "a log"                      -
# `-n` means something else entirely here, and this rule must not claim it.
runcmd "git log -n 5"                          "git log -n 5 — not a push"  -
