#!/usr/bin/env bash
#
# Test the pre-push hook in a THROWAWAY repository.
#
#   bash .githooks/pre-push.test.sh
#
# Run it after any change to `pre-push`. Moved out of the old dogfood.sh when the
# commit-message hooks it also tested retired (the dev-pipeline plugin checks the
# Backlog: line now); these cases are unchanged.

set -uo pipefail
HOOKS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SB="$(mktemp -d)"
trap 'rm -rf "$SB"' EXIT
cd "$SB" || exit 1
git init -q -b main .
git config user.email pre-push-test@example.com
git config user.name pre-push-test
git commit -q --allow-empty -m 'base'

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok      %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL    %s\n     %s\n' "$1" "$2"; }

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
before=$(git rev-parse HEAD)
mkdir -p docs .rptc; echo n > docs/note.md; echo n > .rptc/item.md; echo n > README.md
# Named paths on BOTH add and commit: the stubs above live in this repo's directory.
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
echo "-----------------------------------------"
echo "  $PASS passed, $FAIL failed   (throwaway repo discarded)"
[[ "$FAIL" == 0 ]] || exit 1
