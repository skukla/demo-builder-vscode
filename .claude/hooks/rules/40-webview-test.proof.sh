#!/bin/bash
# Proves 40-webview-test.rule routes React+Spectrum webview test authoring to its
# skill, and stays out of every other test.
#
# ATTRIBUTES BY MESSAGE, not by exit code: twelve rules share one router and any of
# them can exit 2, so "something blocked" says nothing about which one answered.
#
# THE SHAPE THAT MATTERS MOST IS THE ONE IT DOES NOT MATCH. This rule covers
# `.test.tsx` under a `ui/` directory. A plain `.test.ts` — the majority of this
# suite — reaches no rule at all, which is how the 2026-09-10 session came to invent
# a test-file splitter while `docs/testing/test-file-splitting-playbook.md` sat
# unread. The `.test.ts` cases below are pinned as `-` deliberately: they record the
# CURRENT boundary, so widening coverage has to move this file too rather than
# happening by accident.
cd "$(git rev-parse --show-toplevel)" || exit 1
ROOT=$(git rev-parse --show-toplevel)

fired_rule() {
  case "$1" in
    *"React+Spectrum webview test"*)        echo webview-test ;;
    *"creating a NEW test file"*)           echo test-authoring ;;
    *"creating a NEW UI component"*)        echo reuse-first ;;
    *"about to look something up"*)         echo adobe-docs ;;
    *"already in this directory"*|*"curated"*) echo registry-dir ;;
    "")                                     echo - ;;
    *)                                      echo other ;;
  esac
}

run() {
  local path="$1" label="$2" expect="$3" tool="${4:-Write}"
  local payload out got verdict
  payload=$(P="$path" T="$tool" S="wv-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"file_path":os.environ["P"],"content":"render(<Foo />);"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-12s got=%-12s %s\n' "$label" "$expect" "$got" "$verdict"
}

echo "=== a webview test: rule 40 answers, on BOTH tools ==="
run "$ROOT/tests/features/dashboard/ui/Foo.test.tsx"        "Write a new webview test"        webview-test
run "$ROOT/tests/features/dashboard/ui/Foo.test.tsx"        "Edit one — not just new files"   webview-test Edit
run "$ROOT/tests/core/ui/hooks/useThing.testUtils.tsx"      "the .testUtils.tsx half"         webview-test
run "$ROOT/tests/webview-ui/Standalone.test.tsx"            "the tests/webview-ui/ arm"       webview-test

echo
echo "=== rule 40 stays out of it — .ts belongs to rule 32 ==="
run "$ROOT/src/core/ui/components/ExistingThing.tsx"        "a component, not its test"       reuse-first
run "$ROOT/tests/features/eds/services/helix.test.ts"       "a service test — rule 32's"    test-authoring
run "$ROOT/tests/features/dashboard/ui/Foo.test.ts"         "a .ts under ui/ — NOT tsx"       test-authoring

echo
echo "=== THE GAP IS CLOSED: a plain .test.ts now reaches rule 32 ==="
# These two rows read `-` when this proof was written, hours before rule 32 existed,
# and they were labelled "the gap, pinned on purpose" — a statement of where
# coverage ended. Rule 32 closed it the same day, and this file is the record that
# it did. If these ever go back to `-`, the non-webview half is unrouted again.
run "$ROOT/tests/features/projects-dashboard/services/thing-extract.test.ts" \
                                                            "a NEW split test file"    test-authoring
run "$ROOT/tests/core/state/brandNewSuite.test.ts"          "a NEW plain test suite"   test-authoring

echo
echo "=== the message must actually ROUTE somewhere ==="
payload=$(P="$ROOT/tests/features/dashboard/ui/Foo.test.tsx" S="wv-msg-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":"Write","tool_input":{"file_path":os.environ["P"],"content":"x"},"session_id":os.environ["S"]}))')
msg=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
if printf '%s' "$msg" | grep -q 'webview-test-authoring'; then
  printf '%-58s expect=%-12s got=%-12s %s\n' "names the skill to invoke" named named OK
else
  printf '%-58s expect=%-12s got=%-12s %s\n' "names the skill to invoke" named empty '*** WRONG ***'
fi
