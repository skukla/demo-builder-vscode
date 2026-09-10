#!/bin/bash
# Proves 14-commit-backtick.rule blocks the double-quoted commit that eats a word,
# and leaves the safe spellings alone.
#
# What it guards is the quietest failure in the whole rule set. Inside double quotes
# bash treats a backticked word as a command to run, so writing a commit body with
# a markdown code span DELETES that word and runs it. The commit still succeeds.
# Nothing fails. The damage is visible only if you re-read the message afterwards,
# and on 2026-08-24 it cost a word out of a pushed commit, where the fix is a
# force-push nobody wants for one word.
#
# Written 2026-09-08, having fired on a real commit in that session — so this pins
# behaviour already known to work, which is the point: nothing was checking it.
#
# TWO THINGS ABOUT THIS FILE. It is written with the Write tool, not a shell
# heredoc, because a heredoc carrying these cases contains all three tokens the
# rule matches and trips the rule under test. That is the accepted false positive
# the rule's own docblock names, and the escape it recommends. And the cases live
# in single-quoted variables, where a backtick is inert.
cd "$(git rev-parse --show-toplevel)" || exit 1

run() {
  local cmd="$1" label="$2" expect="$3"
  local payload out code got verdict
  payload=$(CMD="$cmd" python3 -c 'import json,os;print(json.dumps({"tool_name":"Bash","tool_input":{"command":os.environ["CMD"]},"session_id":"proof"}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1); code=$?
  got="pass"; [ "$code" -ne 0 ] && got="BLOCK"
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-56s expect=%-5s got=%-5s %s\n' "$label" "$expect" "$got" "$verdict"
}

# --- the shape that silently loses a word: must BLOCK ---
DQ_SPAN='git commit -m "the `why` field states the basis"'
DQ_MULTI='git commit -m "fix `a` and `b` together"'
DQ_SPACED='git commit -m   "names `parseConfig` in the body"'
DQ_AMEND='git commit --amend -m "restore the `payload` wording"'

# --- safe spellings, or out of scope: must PASS ---
SQ_SPAN="git commit -m 'the \`why\` field is safe in single quotes'"
HEREDOC='git commit -F - <<MSG'
DQ_PLAIN='git commit -m "a message with no code spans"'
DQ_SUBST='git commit -m "release $(node -p 1)"'
NO_COMMIT='echo "today is `date`"'

# --- the KNOWN, ACCEPTED false positive, pinned so nobody "fixes" it by accident ---
# The rule sees a whole Bash command, so anything containing a git commit, a
# double-quoted -m and a backtick fires — including a script that merely writes
# ABOUT commit messages. Narrowing it to "backtick after the -m" was judged not
# worth the regex fragility. Recorded as BLOCK because that is the ruling, not a bug.
ABOUT_COMMITS='python3 -c "print(1)"  # docs: git commit -m "x" eats `y`'

echo "=== a double-quoted commit body carrying a code span ==="
run "$DQ_SPAN"   'git commit -m "… `word` …"'                      BLOCK
run "$DQ_MULTI"  'two code spans in one message'                   BLOCK
run "$DQ_SPACED" 'extra spacing between -m and the quote'          BLOCK
run "$DQ_AMEND"  '--amend carries the same hazard'                 BLOCK

echo
echo "=== spellings where the shell expands nothing ==="
run "$SQ_SPAN"   "single-quoted -m — backtick is inert"            pass
run "$HEREDOC"   'git commit -F - <<MSG — no -m at all'            pass
run "$DQ_PLAIN"  'double-quoted with no backtick'                  pass
run "$DQ_SUBST"  '$(…) is deliberately NOT matched'                pass
run "$NO_COMMIT" 'backticks, but not a commit'                     pass

echo
echo "=== accepted false positive, pinned deliberately ==="
run "$ABOUT_COMMITS" 'a command merely ABOUT commit messages'      BLOCK
