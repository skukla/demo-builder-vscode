#!/bin/bash
# Markers this run's router drops go to a folder of its own, removed on exit (PL-86).
PROOF_TMP="$(mktemp -d)"; export TMPDIR="$PROOF_TMP"; trap 'rm -rf "$PROOF_TMP"' EXIT
# Proves 22-gate-via-checks.rule stops a hand-typed `npm run gate` once per session,
# points at the `checks` tool, and touches nothing else.
#
# ATTRIBUTES BY MESSAGE, not exit code: every rule shares one router and any of them
# can exit 2. Each case uses a FRESH session_id unless it tests the once-per-session
# marker, which reuses one on purpose.
cd "$(git rev-parse --show-toplevel)" || exit 1

fired_rule() {
  case "$1" in
    *"typed \`npm run gate\` by hand"*)    echo gate-via-checks ;;
    *"skips the pre-push gate"*)            echo push-no-verify ;;
    "")                                     echo - ;;
    *)                                      echo other ;;
  esac
}

runcmd() {
  local cmd="$1" label="$2" expect="$3" session="${4:-gate-$RANDOM$RANDOM$$}"
  local payload out got verdict
  payload=$(C="$cmd" S="$session" python3 -c 'import json,os;print(json.dumps({"tool_name":"Bash","tool_input":{"command":os.environ["C"]},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-20s got=%-20s %s\n' "$label" "$expect" "$got" "$verdict"
}

# Assembled from parts: a proof that contains the literal fires on its own tool call.
GATE="npm run ""gate"

echo "=== a hand-typed gate is pointed at the checks tool ==="
runcmd "$GATE"                                   "the bare command"                gate-via-checks
runcmd "$GATE > out.txt 2>&1"                    "redirected to a file"            gate-via-checks
runcmd "cd repo && $GATE"                        "after cd &&"                     gate-via-checks
runcmd "($GATE > g.txt 2>&1; echo exit=\$?)"     "inside a subshell"               gate-via-checks
runcmd "$GATE; echo done"                        "before ;"                        gate-via-checks

echo
echo "=== once per session: the repeat runs ==="
S="gate-once-$RANDOM$$"
runcmd "$GATE"                                   "first in a session"              gate-via-checks "$S"
runcmd "$GATE"                                   "the same session again"          -               "$S"

echo
echo "=== other commands are untouched ==="
runcmd "${GATE}:docs"                            "gate:docs is another command"    -
runcmd "npm run gateway"                         "a longer script name"            -
runcmd "npm run compile"                         "compile"                         -
runcmd "grep -n 'gate' package.json"             "the word in a grep"              -
