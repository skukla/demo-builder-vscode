#!/bin/bash
# Proves 34-css-baseline.rule routes a stylesheet change to the visual-baseline instrument.
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
  payload=$(P="$path" T="$tool" S="css-$RANDOM$RANDOM$$" python3 -c 'import json,os;print(json.dumps({"tool_name":os.environ["T"],"tool_input":{"file_path":os.environ["P"],"content":"describe(\"x\",()=>{});","new_string":"x"},"session_id":os.environ["S"]}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1)
  got=$(fired_rule "$out")
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-58s expect=%-15s got=%-15s %s\n' "$label" "$expect" "$got" "$verdict"
}


echo "=== any src stylesheet, either tool: rule 34 answers ==="
run "$ROOT/src/core/ui/styles/index.css"                "Edit a core sheet"        css-baseline Edit
run "$ROOT/src/features/eds/ui/styles/eds-steps.css"    "Edit a feature sheet"     css-baseline Edit
run "$ROOT/src/core/ui/styles/brandNew.css"             "Write a NEW sheet"        css-baseline

echo
echo "=== outside src/, and non-CSS, stay silent ==="
run "$ROOT/tests/helpers/cssRules.ts"                   "a .ts about css"          -
run "$ROOT/docs/development/styling-guide.md"           "the styling doc"          -
run "$ROOT/.claude/skills/webview-visual-baseline/harness.html" "the harness itself" -

echo
echo "=== the message must name the SILENT failure it exists for ==="
payload=$(P="$ROOT/src/core/ui/styles/index.css" S="css-msg-$RANDOM$$" python3 -c "import json,os;print(json.dumps({\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":os.environ[\"P\"],\"new_string\":\"x\"},\"session_id\":os.environ[\"S\"]}))")
msg=$(printf "%s" "$payload" | bash .claude/hooks/router.sh 2>&1)
if printf "%s" "$msg" | grep -q "webview-visual-baseline" && printf "%s" "$msg" | grep -q "sentinel"; then
  printf "%-58s expect=%-15s got=%-15s %s\n" "names the skill AND the sentinel trap" named named OK
else
  printf "%-58s expect=%-15s got=%-15s %s\n" "names the skill AND the sentinel trap" named empty "*** WRONG ***"
fi
