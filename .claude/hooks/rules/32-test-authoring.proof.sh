#!/bin/bash
# Proves 32-test-authoring.rule delivers the splitting playbook before a NEW non-webview test file, and never interrupts the inner loop.
#
# ATTRIBUTES BY MESSAGE, not exit code: fifteen rules share one router and any of
# them can exit 2, so "something blocked" says nothing about which one answered.
# Every case uses a FRESH session_id — these rules are `rule_once=1`, and a reused
# id spends the marker so later cases read as a dead matcher.
cd "$(git rev-parse --show-toplevel)" || exit 1
ROOT=$(git rev-parse --show-toplevel)

fired_rule() {
  case "$1" in
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
  payload=$(P="$path" T="$tool" S="test-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"file_path":os.environ["P"],"content":"describe(\"x\",()=>{});","new_string":"x"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-15s got=%-15s %s\n' "$label" "$expect" "$got" "$verdict"
}


echo "=== a NEW non-webview test: rule 32 answers ==="
run "$ROOT/tests/features/eds/services/brandNewSuite.test.ts"   "a new plain test suite"            test-authoring
run "$ROOT/tests/features/x/settingsSerializer-extract.test.ts" "a new SPLIT sibling — the 09-10 case" test-authoring
run "$ROOT/tests/core/state/newThing.testUtils.ts"              "a new .testUtils.ts"               test-authoring

echo
echo "=== the inner loop is never interrupted ==="
run "$ROOT/tests/sop/inline-styles.test.ts"    "EXISTING test — an edit, not a new file"  -
run "$ROOT/tests/features/x/brandNew.test.ts"  "Edit of a new path — Write only"          - Edit

echo
echo "=== rule 40 keeps the webview half; no double fire ==="
run "$ROOT/tests/features/dashboard/ui/Brand.test.tsx"      "a new webview test tsx"        webview-test
run "$ROOT/tests/core/ui/hooks/useThing.testUtils.tsx"      "a new webview testUtils tsx"   webview-test

echo
echo "=== non-test files are not its business ==="
run "$ROOT/src/features/eds/services/brandNew.ts"           "a source file"                 -

echo
echo "=== the message must carry the RULES, not a pointer ==="
payload=$(P="$ROOT/tests/features/x/brandNew.test.ts" S="test-msg-$RANDOM$$" python3 -c "import json,os;print(json.dumps({\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":os.environ[\"P\"],\"content\":\"x\"},\"session_id\":os.environ[\"S\"]}))")
msg=$(printf "%s" "$payload" | bash .claude/hooks/router.sh 2>&1)
if printf "%s" "$msg" | grep -q "part2" && printf "%s" "$msg" | grep -q "test count identical"; then
  printf "%-58s expect=%-15s got=%-15s %s\n" "names the -part2 trap AND the count check" named named OK
else
  printf "%-58s expect=%-15s got=%-15s %s\n" "names the -part2 trap AND the count check" named empty "*** WRONG ***"
fi
