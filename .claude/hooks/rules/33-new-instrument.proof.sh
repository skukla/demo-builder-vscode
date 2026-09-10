#!/bin/bash
# Proves 33-new-instrument.rule DELIVERS the instrument registry before a new script joins scripts/.
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
  payload=$(P="$path" T="$tool" S="inst-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"file_path":os.environ["P"],"content":"describe(\"x\",()=>{});","new_string":"x"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-15s got=%-15s %s\n' "$label" "$expect" "$got" "$verdict"
}


echo "=== a NEW script: rule 33 answers ==="
run "$ROOT/scripts/brandNewScanner.mjs"  "a new .mjs"   new-instrument
run "$ROOT/scripts/brandNewThing.js"     "a new .js"    new-instrument

echo
echo "=== existing scripts and everything else stay silent ==="
run "$ROOT/scripts/sweep.mjs"                       "EXISTING script — an edit"      -
run "$ROOT/scripts/brandNewScanner.mjs"             "Edit of a new path — Write only" - Edit
run "$ROOT/src/features/eds/services/brandNew.ts"   "a source file"                  -

echo
echo "=== it must DELIVER the list, not point at it ==="
# The whole design: a rule that says "go and look" is one you can rationalise past.
payload=$(P="$ROOT/scripts/brandNewScanner.mjs" S="inst-msg-$RANDOM$$" python3 -c "import json,os;print(json.dumps({\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":os.environ[\"P\"],\"content\":\"x\"},\"session_id\":os.environ[\"S\"]}))")
msg=$(printf "%s" "$payload" | bash .claude/hooks/router.sh 2>&1)
n=$(printf "%s" "$msg" | grep -oE "[a-z-]+-scan|validate:[a-z-]+|dead-mock-scan" | sort -u | wc -l | tr -d " ")
if [ "$n" -ge 8 ]; then
  printf "%-58s expect=%-15s got=%-15s %s\n" "lists real instruments (>=8 named)" listed "listed($n)" OK
else
  printf "%-58s expect=%-15s got=%-15s %s\n" "lists real instruments (>=8 named)" listed "only($n)" "*** WRONG ***"
fi
