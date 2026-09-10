#!/bin/bash
# Proves 30-reuse-first.rule interrupts a NEW UI component and stays silent otherwise.
#
# WHY A NUDGE RULE NEEDS A PROOF AT ALL. It was exempt until 2026-09-10, on the
# reasoning that `router.test.ts` proves reachability and only the mechanical rules'
# exact match shape matters. Reachability is not shape coverage, and this repo has
# twice shipped a rule ARM unreachable at the pre-filter while the rule looked
# healthy (rule 13's `grep -c`, rule 20's `sk-ant-`). A nudge rule whose path
# pattern drifts goes silent — and a silent nudge rule is indistinguishable from a
# session in which nobody rebuilt anything.
#
# IT ATTRIBUTES BY MESSAGE, NOT BY EXIT CODE. Twelve rules share one router and any
# of them can exit 2, so "something blocked" says nothing about WHICH. The first
# draft of this file checked the exit code and scored two false failures: a webview
# test tsx that rule 40 correctly claimed, and a path I believed existed. Both read
# as "rule 30 is broken".
#
# THREE TRAPS PINNED HERE, each of which yields a rule that looks fine and never fires:
#
#   1. `rule_once=1`. The marker is `$TMPDIR/.dbv-<rule_id>-<session>`, so a proof
#      reusing one session id sees the first case fire and every later one stay
#      silent — which reads as a broken matcher. Every case gets its own id.
#   2. The pattern has a LEADING `*/`, so a relative path never matches. Claude Code
#      sends absolute paths; a probe written with relative ones reports the rule
#      dead, which is exactly how the 2026-09-10 session first mis-measured it.
#   3. `[ -e "$3" ]` decides new-vs-edit, so the "existing file" case is only a real
#      case if the path REALLY exists. `src/core/ui/components/StatusDot.tsx` looks
#      plausible and does not exist — the file is under `components/ui/`.
cd "$(git rev-parse --show-toplevel)" || exit 1
ROOT=$(git rev-parse --show-toplevel)

# Which rule answered, by its message. `-` means none did.
fired_rule() {
  local out="$1"
  case "$out" in
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
  payload=$(P="$path" T="$tool" S="reuse-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"file_path":os.environ["P"],"content":"export function X(){return null;}"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-12s got=%-12s %s\n' "$label" "$expect" "$got" "$verdict"
}

echo "=== a NEW UI component: rule 30 answers ==="
run "$ROOT/src/core/ui/components/DoesNotExistYet.tsx"       "new component in core/ui"           reuse-first
run "$ROOT/src/features/dashboard/ui/components/Nope.tsx"    "new component in a feature's ui/"   reuse-first

echo
echo "=== rule 30 stays out of it ==="
run "$ROOT/src/core/ui/components/ui/StatusDot.tsx"          "EXISTING component — an edit"       -
run "$ROOT/src/core/ui/utils/classNames.ts"                  "a .ts, not a component"             -
run "$ROOT/src/features/eds/services/brandNewService.ts"     "a new service, not UI"              -
run "$ROOT/src/core/ui/components/DoesNotExistYet.tsx"       "Edit of a new path — not a Write"   - Edit
run "src/core/ui/components/DoesNotExistYet.tsx"             "relative path — never sent for real" -

echo
echo "=== a webview test tsx belongs to rule 40, not rule 30 ==="
run "$ROOT/tests/core/ui/components/BrandNew.test.tsx"       "new test tsx under tests/*/ui/"     webview-test

echo
echo "=== the message must actually ROUTE somewhere ==="
# FRESH session id. A fixed one is spent the first time this proof runs on a
# machine, and every run afterwards reads as "the rule delivered nothing" — the
# marker outlives the process in $TMPDIR.
payload=$(P="$ROOT/src/core/ui/components/DoesNotExistYet.tsx" S="reuse-msg-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":"Write","tool_input":{"file_path":os.environ["P"],"content":"x"},"session_id":os.environ["S"]}))')
msg=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
if printf '%s' "$msg" | grep -q 'reuse-first' && printf '%s' "$msg" | grep -q 'src/core/ui/components/CLAUDE.md'; then
  printf '%-58s expect=%-12s got=%-12s %s\n' "names the skill AND the job->component table" named named OK
else
  printf '%-58s expect=%-12s got=%-12s %s\n' "names the skill AND the job->component table" named empty '*** WRONG ***'
fi
