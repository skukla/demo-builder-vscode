#!/usr/bin/env bash
#
# Test the commit hooks in a THROWAWAY repository.
#
#   bash .githooks/dogfood.sh
#
# Run it after any change to `prepare-commit-msg` or `commit-msg`. A broken
# commit hook is the worst thing here to get wrong: it does not fail loudly at a
# convenient moment, it stops you committing — including the commit that would
# fix it.
#
# The cases that must NOT block matter more than the ones that must. A hook that
# refuses a merge, or dies halfway through a rebase over history that predates
# it, breaks work with nothing to do with the backlog.

set -uo pipefail
HOOKS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HOOKS/.." && pwd)"

SB="$(mktemp -d)"
trap 'rm -rf "$SB"' EXIT
mkdir -p "$SB/.rptc/backlog" "$SB/.claude/skills/backlog-item" "$SB/.githooks"
cp -R "$REPO/.rptc/backlog/." "$SB/.rptc/backlog/"
cp "$REPO/.claude/skills/backlog-item/backlog.mjs" "$SB/.claude/skills/backlog-item/"
cp "$HOOKS/prepare-commit-msg" "$HOOKS/commit-msg" "$SB/.githooks/"
cd "$SB" || exit 1
git init -q -b main .
git config user.email dogfood@example.com
git config user.name dogfood

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok      %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL    %s\n     %s\n' "$1" "$2"; }

# Two commits made BEFORE the hooks are switched on — the real situation, and
# what a later rebase has to replay.
git add -A >/dev/null
git commit -qm 'base, predates the hook'
echo a > f1; git add -A; git commit -qm 'legacy commit, no trailer'
git config core.hooksPath .githooks

# try <ok|blocked> <name> <message>
try() {
  local want="$1" name="$2" msg="$3"
  local got; if git commit -q -F - >/dev/null 2>&1 <<<"$msg"; then got=ok; else got=blocked; fi
  [[ "$got" == "$want" ]] && ok "$name" || bad "$name" "got $got, wanted $want"
  echo "x$RANDOM" >> f1; git add -A >/dev/null 2>&1   # keep something to commit
}

echo "MUST BLOCK"
try blocked "no trailer"                    "chore: something"
try blocked "unknown id"                    "feat: x

Backlog: ZZ-99"
try blocked "one bad id among good"         "feat: x

Backlog: AI-3a, ZZ-99"
try blocked "trailer only inside a comment" "feat: x

# Backlog: none"
try blocked "AI co-author trailer"          "feat: x

Backlog: none
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
try blocked "'Generated with' line"         "feat: x

Backlog: none
Generated with Claude Code"

echo
echo "MUST PASS"
try ok "Backlog: none"                      "chore: x

Backlog: none"
try ok "a real id"                          "feat: x

Backlog: AI-3a"
try ok "two real ids"                       "feat: x

Backlog: AI-3a, PL-1"
try ok "case-insensitive"                   "feat: x

backlog: none"
# The AI-trailer rule must not cost us real co-authorship. A human collaborator
# is exactly what the trailer is FOR, and a rule that blocked those would be
# worse than the drift it prevents.
try ok "a HUMAN co-author still passes"     "feat: x

Backlog: none
Co-Authored-By: Steve Kukla <stevenjkukla@gmail.com>"

echo
echo "MUST NOT BLOCK — the cases that break unrelated work"
git checkout -q -b side main
echo c > f3; git add -A
git commit -q -F - >/dev/null 2>&1 <<'M'
feat: side

Backlog: none
M
git checkout -q main
if git merge -q --no-ff side -m 'Merge branch side' >/dev/null 2>&1; then ok "a merge commit"; else bad "a merge commit" "the hook refused a merge"; fi

git checkout -q -b rb main~1
echo d > f4; git add -A
git commit -q -F - >/dev/null 2>&1 <<'M'
feat: rb

Backlog: none
M
if git rebase -q main >/dev/null 2>&1; then ok "a rebase over untrailered history"; else bad "a rebase over untrailered history" "rebase failed - this breaks real work"; fi
git rebase --abort >/dev/null 2>&1

if git commit -q --amend -F - >/dev/null 2>&1 <<'M'
feat: rb reworded

Backlog: none
M
then ok "an amend that keeps its trailer"; else bad "an amend that keeps its trailer" "refused"; fi

echo
echo "PRE-FILL"
echo e > f5; git add -A
GIT_EDITOR="cat > $SB/cap.txt" git commit -q >/dev/null 2>&1
grep -q '^Backlog: $' "$SB/cap.txt" && ok "the line is pre-filled" || bad "the line is pre-filled" "absent"
grep -q 'What you could be working on' "$SB/cap.txt" && ok "in-flight items are listed" || bad "in-flight items are listed" "absent"
# It must sit ABOVE git's comment block, or you scroll past a screen of status
# to reach the one line you have to fill in.
if [[ "$(awk '/^Backlog: $/{b=NR} /^# Please enter/{c=NR} END{print (b>0 && c>0 && b<c) ? "yes" : "no"}' "$SB/cap.txt")" == "yes" ]]; then
  ok "  ...above git own comments"
else bad "  ...above git own comments" "it landed below them"; fi

echo
echo "CONTROL — proves this harness can see a failure"
# Neuter the hook on purpose and require the suite to notice. Without this, a
# harness whose commits were failing for some unrelated reason would report a
# clean sweep of MUST BLOCK cases.
printf '#!/usr/bin/env bash\nexit 0\n' > .githooks/commit-msg
chmod +x .githooks/commit-msg
if git commit -q -F - >/dev/null 2>&1 <<<"no trailer at all"; then
  ok "a neutered hook lets an untrailered commit through"
else
  bad "control" "even a no-op hook blocked - this harness is not testing what it thinks"
fi

echo
echo "-----------------------------------------"
echo "  $PASS passed, $FAIL failed   (throwaway repo discarded)"
[[ "$FAIL" == 0 ]] || exit 1
