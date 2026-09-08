#!/bin/bash
# Proves 31-registry-dir.rule delivers a directory's contents before a NEW file
# joins it, and stays silent otherwise.
#
# Two things this pins that the rule got wrong while being written, both of which
# would have shipped a rule that looks fine and never fires:
#
#   1. `rule_message` takes NO arguments. The first draft used an invented
#      `$RULE_PATH`; the router exports $TOOL/$CMD/$FILE/$CONTENT/$SESSION and
#      calls `rule_message >&2` bare. The listing case below fails loudly if the
#      path variable is wrong, because the message would carry no file names.
#   2. The router's pre-filter admits `*.tsx*`, which is NOT a substring of a
#      plain `.ts` path. Without a `tests/sop/` token the rule is unreachable —
#      the failure three earlier rules already shipped with.
cd "$(git rev-parse --show-toplevel)" || exit 1

run() {
  local path="$1" label="$2" expect="$3"
  local payload out code got verdict
  payload=$(P="$path" python3 -c 'import json,os;print(json.dumps({"tool_name":"Write","tool_input":{"file_path":os.environ["P"],"content":"x"},"session_id":"proof"}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1); code=$?
  got="pass"; [ "$code" -ne 0 ] && got="BLOCK"
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-56s expect=%-5s got=%-5s %s\n' "$label" "$expect" "$got" "$verdict"
}

ROOT=$(git rev-parse --show-toplevel)

echo "=== a NEW file joining a curated directory: deliver the listing ==="
run "$ROOT/tests/sop/does-not-exist-yet.test.ts"   "new suite in tests/sop/"          BLOCK
run "$ROOT/tests/helpers/doesNotExistYet.ts"       "new fake in tests/helpers/"       BLOCK

echo
echo "=== everything else stays silent ==="
run "$ROOT/tests/sop/canonical-fakes.test.ts"      "EXISTING file — an edit, not a new member" pass
run "$ROOT/src/features/x/brandNewThing.ts"        "new file outside the curated dirs" pass
run "$ROOT/tests/features/eds/whatever.test.ts"    "new test outside tests/sop|helpers" pass

echo
echo "=== the message must actually NAME what is already there ==="
payload=$(P="$ROOT/tests/sop/does-not-exist-yet.test.ts" python3 -c 'import json,os;print(json.dumps({"tool_name":"Write","tool_input":{"file_path":os.environ["P"],"content":"x"},"session_id":"proof2"}))')
msg=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
# canonical-fakes.test.ts is a long-standing member; if the listing is empty the
# path variable is wrong and the rule is delivering nothing.
if printf '%s' "$msg" | grep -q 'canonical-fakes.test.ts'; then
  printf '%-56s expect=%-5s got=%-5s %s\n' "listing names an existing member" named named OK
else
  printf '%-56s expect=%-5s got=%-5s %s\n' "listing names an existing member" named empty '*** WRONG ***'
fi
