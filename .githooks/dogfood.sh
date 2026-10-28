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
echo "PRE-PUSH — the gate runs before a push, not after"
# Not run against the REAL gate here: this harness works in a throwaway repo with no
# node_modules, and a two-minute suite has no place in a hook test. What is asserted is
# the hook's own logic — that it skips a delete-only push, and that a failing gate stops
# the push — with the gate itself stubbed.
PP="$SB/pre-push"
# gate:docs FIRST: `npm run gate` is a prefix of it, and swapping that first would
# leave `"$GATE_STUB":docs` behind. The push script is stubbed with a `--` first, the
# argument the stub shifts off.
sed -e 's|bash scripts/gate-push.sh|"$PUSH_STUB" --|' -e 's|npm run gate:docs|"$DOCS_STUB"|' \
    -e 's|npm run gate|"$GATE_STUB"|' "$HOOKS/pre-push" > "$PP"
chmod +x "$PP"

GATE_STUB="$SB/gate-ok"; printf '#!/usr/bin/env bash\nexit 0\n' > "$GATE_STUB"; chmod +x "$GATE_STUB"
PUSH_STUB="$GATE_STUB"; DOCS_STUB="$GATE_STUB"
export GATE_STUB PUSH_STUB DOCS_STUB
if printf 'refs/heads/x 0000000000000000000000000000000000000000 refs/heads/x abc\n' | "$PP" >/dev/null 2>&1; then
  ok "a delete-only push skips the gate"
else bad "a delete-only push skips the gate" "it ran anyway"; fi

if printf 'refs/heads/x deadbeef refs/heads/x abc\n' | "$PP" >/dev/null 2>&1; then
  ok "a real push with a passing gate is allowed"
else bad "a real push with a passing gate is allowed" "it was blocked"; fi

GATE_STUB="$SB/gate-fail"; printf '#!/usr/bin/env bash\nexit 1\n' > "$GATE_STUB"; chmod +x "$GATE_STUB"
export GATE_STUB
if printf 'refs/heads/x deadbeef refs/heads/x abc\n' | "$PP" >/dev/null 2>&1; then
  bad "a failing gate REFUSES the push" "the push was allowed"
else ok "a failing gate REFUSES the push"; fi

# Which gate a push runs is decided by what it CHANGES: only Markdown, docs/ or .rptc/
# runs the docs checks (2026-10-16); code runs the whole-repo checks plus the related
# tests (scripts/gate-push.sh, 2026-10-28); config every test depends on runs the full gate. Real
# commits, because the hook reads the range with `git diff --name-only`. Each stub
# records that it ran, so the cases see WHICH gate ran rather than only that the push
# was allowed; the push stub also records the files it was handed.
GATE_STUB="$SB/gate-mark"; printf '#!/usr/bin/env bash\necho full >> "%s/ran"\nexit 0\n' "$SB" > "$GATE_STUB"; chmod +x "$GATE_STUB"
DOCS_STUB="$SB/docs-mark"; printf '#!/usr/bin/env bash\necho docs >> "%s/ran"\nexit 0\n' "$SB" > "$DOCS_STUB"; chmod +x "$DOCS_STUB"
PUSH_STUB="$SB/push-mark"; printf '#!/usr/bin/env bash\nshift\necho "push $*" >> "%s/ran"\nexit 0\n' "$SB" > "$PUSH_STUB"; chmod +x "$PUSH_STUB"
export GATE_STUB DOCS_STUB PUSH_STUB
# The commits skip this harness's own commit hooks; the hooks path is put BACK to what
# it was, because the control below depends on it.
hooks_was=$(git config core.hooksPath)
git config core.hooksPath /dev/null
before=$(git rev-parse HEAD)
mkdir -p docs .rptc; echo n > docs/note.md; echo n > .rptc/item.md; echo n > README.md
# Named paths on BOTH add and commit: the stubs above live in this repo's directory, and
# an earlier case leaves a file staged that the control below commits.
git add docs/note.md .rptc/item.md README.md; git commit -qm 'docs only' -- docs/note.md .rptc/item.md README.md
docs_sha=$(git rev-parse HEAD)
echo code > code.ts; git add code.ts; git commit -qm 'code too' -- code.ts
code_sha=$(git rev-parse HEAD)
echo '{}' > package.json; git add package.json; git commit -qm 'config' -- package.json
config_sha=$(git rev-parse HEAD)
# A branch cut from develop, which is ahead of master by code.ts: its own change is
# other.ts only. remotes are written by hand; the sandbox has no origin.
git checkout -q -b from-develop "$code_sha"
echo other > other.ts; git add other.ts; git commit -qm 'branch work' -- other.ts
branch_sha=$(git rev-parse HEAD)
git checkout -q -
git update-ref refs/remotes/origin/master "$before"
git update-ref refs/remotes/origin/develop "$code_sha"
git config core.hooksPath "$hooks_was"

rm -f "$SB/ran"
printf 'refs/heads/x %s refs/heads/x %s\n' "$docs_sha" "$before" | "$PP" >/dev/null 2>&1
[[ "$(cat "$SB/ran" 2>/dev/null)" == "docs" ]] && ok "a docs-only push runs only the docs checks" \
  || bad "a docs-only push runs only the docs checks" "ran: $(cat "$SB/ran" 2>/dev/null)"

rm -f "$SB/ran"
printf 'refs/heads/x %s refs/heads/x %s\n' "$code_sha" "$docs_sha" | "$PP" >/dev/null 2>&1
[[ "$(cat "$SB/ran" 2>/dev/null)" == "push code.ts" ]] \
  && ok "a code push runs gate-push.sh, handed the changed code file" \
  || bad "a code push runs gate-push.sh, handed the changed code file" "ran: $(cat "$SB/ran" 2>/dev/null)"

rm -f "$SB/ran"
printf 'refs/heads/x %s refs/heads/x %s\n' "$config_sha" "$code_sha" | "$PP" >/dev/null 2>&1
[[ "$(cat "$SB/ran" 2>/dev/null)" == "full" ]] && ok "a push touching package.json runs the full gate" \
  || bad "a push touching package.json runs the full gate" "ran: $(cat "$SB/ran" 2>/dev/null)"

# 2026-10-28: a new branch was measured against master, so develop's own changes counted
# as the branch's. Its base is now the nearer of develop and master.
rm -f "$SB/ran"
printf 'refs/heads/from-develop %s refs/heads/from-develop %s\n' "$branch_sha" 0000000000000000000000000000000000000000 | "$PP" >/dev/null 2>&1
[[ "$(cat "$SB/ran" 2>/dev/null)" == "push other.ts" ]] \
  && ok "a new branch is measured from develop, not master" \
  || bad "a new branch is measured from develop, not master" "ran: $(cat "$SB/ran" 2>/dev/null)"

# A gate step that writes the shared git config (the GIT_DIR leak) is put back and the
# push refused.
bare_was=$(git config --get core.bare)
PUSH_STUB="$SB/push-leaks"; printf '#!/usr/bin/env bash\ngit config core.bare true\nexit 0\n' > "$PUSH_STUB"; chmod +x "$PUSH_STUB"
export PUSH_STUB
if printf 'refs/heads/x %s refs/heads/x %s\n' "$code_sha" "$before" | "$PP" >/dev/null 2>&1; then
  bad "a gate that changes the git config REFUSES the push" "the push was allowed"
else ok "a gate that changes the git config REFUSES the push"; fi
[[ "$(git config --get core.bare)" == "$bare_was" ]] && ok "  ...and the config is put back" \
  || bad "  ...and the config is put back" "core.bare is $(git config --get core.bare)"
PUSH_STUB="$SB/push-mark"; export PUSH_STUB

DOCS_STUB="$SB/docs-fail"; printf '#!/usr/bin/env bash\nexit 1\n' > "$DOCS_STUB"; chmod +x "$DOCS_STUB"
export DOCS_STUB
if printf 'refs/heads/x %s refs/heads/x %s\n' "$docs_sha" "$before" | "$PP" >/dev/null 2>&1; then
  bad "failing docs checks REFUSE a docs-only push" "the push was allowed"
else ok "failing docs checks REFUSE a docs-only push"; fi

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
