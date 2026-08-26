#!/usr/bin/env bash
#
# Dogfood the backlog tool against a COPY of the real backlog.
#
#   bash .claude/skills/backlog-item/dogfood.sh
#
# Why a copy, and why this is the whole point:
#
# The first dogfooding pass on 2026-08-26 ran the write commands against the real
# `.rptc/backlog/`, then reverted with `git checkout`. That destroyed uncommitted
# work TWICE in twenty minutes — a 69KB prose migration and a frontmatter field,
# both of which had to be reconstructed from a scratch backup. `git checkout` does
# not know which of your uncommitted changes were the test's.
#
# So the harness copies the backlog to a temp dir and runs there. Nothing it does
# can reach the real files, which means the destructive cases (the ones that
# actually find bugs) can be run without a revert step at all.
#
# It is written in bash, not jest, deliberately: the thing under test is a CLI
# and its exit codes, and the failures that mattered were all "what is on disk
# after this command" — which is what this asserts directly.

set -uo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
TOOL_SRC="$(dirname "$SELF")/backlog.mjs"
REAL_BACKLOG="${1:-.rptc/backlog}"

if [[ ! -f "$TOOL_SRC" ]]; then echo "no backlog.mjs beside this script"; exit 1; fi
if [[ ! -d "$REAL_BACKLOG" ]]; then echo "no backlog at $REAL_BACKLOG (run from the repo root)"; exit 1; fi

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
mkdir -p "$SANDBOX/.rptc/backlog" "$SANDBOX/.rptc/complete"
cp -R "$REAL_BACKLOG/." "$SANDBOX/.rptc/backlog/"
cp "$TOOL_SRC" "$SANDBOX/backlog.mjs"
cd "$SANDBOX" || exit 1

# ── Self-check: no pipefail-unsafe assertions ─────────────────────────────────
#
# `if cmd | grep -q x` reports the PIPELINE's worst exit code under `set -o
# pipefail`, so a command that legitimately exits non-zero reads as "grep did not
# match" — the harness then blames working code. It cost two false FAILs on
# 2026-08-26 and the rules against it were already written down in CLAUDE.md.
#
# Prose did not stop it. This does. Use `says`/`denies`, which capture first.
# `$SELF` is ABSOLUTE and resolved before any cd. The first version used
# `${BASH_SOURCE[0]}` verbatim, which is relative — the script had already cd'd
# into its sandbox, grep failed with "No such file", `|| true` swallowed it, and
# the guard reported nothing while checking nothing. A check that cannot fail is
# not a check, which is the rule this guard exists to enforce.
if [[ ! -r "$SELF" ]]; then
    echo "ABORT: cannot read $SELF to self-check"; exit 2
fi
UNSAFE="$(grep -nE '^[[:space:]]*if .*\| *grep -q' "$SELF" | grep -v '^[0-9]*:#' || true)"
if [[ -n "$UNSAFE" ]]; then
    echo "ABORT: pipefail-unsafe assertion(s) in this harness — use says/denies:"
    echo "$UNSAFE"
    exit 2
fi

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

# exits <expected-code> <name> -- <command...>
exits() {
  local want="$1" name="$2"; shift 3
  local out; out="$("$@" 2>&1)"; local got=$?
  if [[ "$got" == "$want" ]]; then ok "$name"; else bad "$name" "exit $got, wanted $want: $(head -1 <<<"$out")"; fi
}

# unchanged <file> <name> -- <command...>   asserts the command did not alter the file
unchanged() {
  local f="$1" name="$2"; shift 3
  local before after; before="$(md5 -q "$f" 2>/dev/null || md5sum "$f" | cut -d' ' -f1)"
  "$@" >/dev/null 2>&1
  after="$(md5 -q "$f" 2>/dev/null || md5sum "$f" | cut -d' ' -f1)"
  if [[ "$before" == "$after" ]]; then ok "$name"; else bad "$name" "$f was modified"; fi
}

# says <name> <pattern> -- <command...>   the command's OUTPUT must contain the pattern.
# Captures BEFORE grepping on purpose. `if cmd | grep -q x` is wrong here: with
# `set -o pipefail` the pipeline reports the WORST exit code, so a command that
# legitimately exits 1 (like `unlogged` when it finds something) reads as "no
# match" even when the match is exact. That cost two false FAILs on 2026-08-26 —
# the harness accusing a tool that was working.
says() {
  local name="$1" pat="$2"; shift 3
  local out; out="$("$@" 2>&1)" || true
  if grep -q -- "$pat" <<<"$out"; then ok "$name"; else bad "$name" "output did not contain: $pat"; fi
}
# denies <name> <pattern> -- <command...>   the command's output must NOT contain it.
denies() {
  local name="$1" pat="$2"; shift 3
  local out; out="$("$@" 2>&1)" || true
  if grep -q -- "$pat" <<<"$out"; then bad "$name" "output unexpectedly contained: $pat"; else ok "$name"; fi
}

T=(node backlog.mjs)
PL4=".rptc/backlog/2026-08-25-claude-code-disk-footprint.md"
EPIC=".rptc/backlog/epic-ai-surface-good-enough.md"

echo "sandbox: $SANDBOX"
echo
echo "READ"
exits 0 "check passes on the real backlog"            -- "${T[@]}" check
exits 0 "list"                                        -- "${T[@]}" list
exits 0 "next"                                        -- "${T[@]}" next
exits 0 "show resolves a real id"                     -- "${T[@]}" show PL-4
exits 1 "show rejects an unknown id"                  -- "${T[@]}" show NOPE
exits 0 "--json parses as JSON"                       -- bash -c '"$@" list --json | node -e "JSON.parse(require(\"fs\").readFileSync(0))"' _ "${T[@]}"

echo
echo "NEXT is honest about what you can start"
# `gated`/`blocked` mean waiting on a NAMED thing. Listing one as startable is the
# single answer this command must never give. EDS-5 is gated in the real backlog.
denies "gated/blocked excluded from next" " gated \| blocked " -- "${T[@]}" next
denies "questions excluded from next" " open " -- "${T[@]}" next

echo
echo "WRITE rejects invalidity WITHOUT touching disk"
# The bug this file exists for: `set` used to write first and validate second, so a
# rejected value landed on disk and exit 1 left the backlog broken.
exits 1    "set rejects an unknown status"            -- "${T[@]}" set PL-4 status=nonsense
unchanged "$PL4" "  ...and does not write it"         -- "${T[@]}" set PL-4 status=nonsense
exits 1    "set rejects an unknown area"              -- "${T[@]}" set PL-4 area=notanarea
unchanged "$PL4" "  ...and does not write it"         -- "${T[@]}" set PL-4 area=notanarea
exits 1    "set rejects epic shipped w/ open children" -- "${T[@]}" set AI-1 status=shipped
unchanged "$EPIC" "  ...and does not write it"        -- "${T[@]}" set AI-1 status=shipped
exits 1    "set rejects a malformed assignment"       -- "${T[@]}" set PL-4 nokeyvalue
# A `gated`/`blocked` item must name what it waits on. Found by USING the tool:
# EDS-5 was gated with an empty `needs`, so "gated by what?" was unanswerable.
exits 1    "set rejects gated with no blocker named"   -- "${T[@]}" set PL-4 status=gated
exits 0    "  ...but accepts it with waiting-on"       -- "${T[@]}" set PL-4 status=gated "waiting-on=a named thing"
exits 0    "check passes with waiting-on set"          -- "${T[@]}" check
exits 0    "  ...restore"                              -- "${T[@]}" set PL-4 status=backlog
exits 1    "new refuses a taken id"                   -- "${T[@]}" new whatever --id AI-1c
exits 1    "log without text is a usage error"        -- "${T[@]}" log PL-4

echo
echo "WRITE succeeds when valid"
exits 0 "set a valid value"                           -- "${T[@]}" set PL-4 value=high
says "  ...and it landed" "value   high" -- "${T[@]}" show PL-4
exits 0 "check still passes after a valid set"        -- "${T[@]}" check
exits 0 "log appends"                                 -- "${T[@]}" log PL-4 "dogfood line"
if grep -q 'dogfood line' "$PL4"; then ok "  ...and it landed"; else bad "  ...and it landed" "no line appended"; fi
if [[ "$(grep -c '## Shipped so far' "$PL4")" == 1 ]]; then ok "log twice keeps ONE section"; else bad "log twice keeps ONE section" "duplicate section"; fi
"${T[@]}" log PL-4 "second line" >/dev/null 2>&1
if [[ "$(grep -c '## Shipped so far' "$PL4")" == 1 ]]; then ok "  ...still one after a second log"; else bad "  ...still one after a second log" "duplicated"; fi

echo
echo "SYNC is idempotent"
"${T[@]}" sync >/dev/null 2>&1
cp .rptc/backlog/README.md /tmp/dogfood-r1.$$ 2>/dev/null
"${T[@]}" sync >/dev/null 2>&1
if diff -q /tmp/dogfood-r1.$$ .rptc/backlog/README.md >/dev/null 2>&1; then ok "sync twice is byte-identical"; else bad "sync twice is byte-identical" "second run changed the file"; fi
rm -f /tmp/dogfood-r1.$$
# A sync that silently skipped its span would also be "idempotent". Prove it WROTE.
if grep -q 'BEGIN GENERATED registry' .rptc/backlog/README.md && \
   grep -qE '^\| `[A-Z]+-[0-9]' .rptc/backlog/README.md; then ok "  ...and the span has rows in it"; else bad "  ...and the span has rows in it" "span empty — sync may be a no-op"; fi

echo
echo "STALE is advisory, and can actually fire"
exits 0 "stale runs"                                  -- "${T[@]}" stale
# POSITIVE CONTROL. A `stale` that reports nothing because it is broken and one
# that reports nothing because the backlog is tidy print the same zero. Make an
# item stale on purpose and require it to be named.
"${T[@]}" set EDS-3 status=active >/dev/null 2>&1
python3 - <<'PYEOF'
import re, pathlib
p = pathlib.Path('.rptc/backlog/2026-05-28-eds-site-scraping.md')
t = p.read_text()
i = t.find('## Shipped so far')
if i >= 0:
    nxt = t.find('\n## ', i + 5)
    p.write_text(t[:i] + (t[nxt+1:] if nxt >= 0 else ''))
PYEOF
says "positive control: stale NAMES a logless WIP item" "EDS-3" -- "${T[@]}" stale
# Epics must NOT be reported: an epic is active because a CHILD is, and ships nothing.
"${T[@]}" set AI-2 status=active >/dev/null 2>&1
denies "epics excluded from stale" "AI-2 " -- "${T[@]}" stale
"${T[@]}" set EDS-3 status=backlog >/dev/null 2>&1

echo
echo "UNLOGGED — commits that name an item but never reached its record"
# This needs a REAL git repo, so the sandbox becomes one. Mocking git here would
# test the mock: the thing under test is trailer parsing against `git log` output.
git init -q . 2>/dev/null
git config user.email dogfood@example.com; git config user.name dogfood
git add -A >/dev/null 2>&1; git commit -qm "base" >/dev/null 2>&1

# (a) a commit that names an item and IS logged -> silent
echo "x" >> "$PL4"; git add -A >/dev/null 2>&1
git commit -qm "work on PL-4

Backlog: PL-4" >/dev/null 2>&1
SHA_LOGGED="$(git rev-parse HEAD)"
"${T[@]}" log PL-4 "landed (${SHA_LOGGED:0:9})" >/dev/null 2>&1
git add -A >/dev/null 2>&1; git commit -qm "record it" >/dev/null 2>&1
denies "a logged commit is not reported" "${SHA_LOGGED:0:9}" -- "${T[@]}" unlogged

# (b) a commit that names an item and is NOT logged -> reported, exit 1
echo "y" >> "$PL4"; git add -A >/dev/null 2>&1
git commit -qm "more PL-4 work

Backlog: PL-4" >/dev/null 2>&1
SHA_MISSING="$(git rev-parse HEAD)"
says "POSITIVE CONTROL: an unlogged commit IS named" "${SHA_MISSING:0:9}" -- "${T[@]}" unlogged
exits 1 "  ...and it exits non-zero"                  -- "${T[@]}" unlogged

# (c) a trailer naming an id that does not exist
echo "z" >> "$PL4"; git add -A >/dev/null 2>&1
git commit -qm "typo in the trailer

Backlog: ZZ-9" >/dev/null 2>&1
says "a trailer with an unknown id is caught" "no such item" -- "${T[@]}" unlogged

# (d) logging it clears the report
"${T[@]}" log PL-4 "second landing (${SHA_MISSING:0:9})" >/dev/null 2>&1
denies "logging clears the report" "${SHA_MISSING:0:9}" -- "${T[@]}" unlogged

# (e) NEGATIVE CONTROL: an untagged commit is invisible, and the tool SAYS so
echo "w" >> "$PL4"; git add -A >/dev/null 2>&1
git commit -qm "no trailer at all" >/dev/null 2>&1
denies "untagged commits are invisible (the stated limit)" "no trailer at all" -- "${T[@]}" unlogged

echo
echo "UNLOGGED --write — the report becomes the fix"
# A backlog item, a commit naming it, nothing recorded.
"${T[@]}" set EDS-3 status=backlog >/dev/null 2>&1
echo "q" >> f1; git add -A >/dev/null 2>&1
git commit -q -F - >/dev/null 2>&1 <<'M'
feat(eds): scraping spike

Backlog: EDS-3
M
SHA_W="$(git rev-parse HEAD)"
"${T[@]}" unlogged --write >/dev/null 2>&1
EDS3=".rptc/backlog/2026-05-28-eds-site-scraping.md"
if grep -q "${SHA_W:0:9}" "$EDS3"; then ok "the commit sha is written into the item"; else bad "the commit sha is written into the item" "not found"; fi
says "  ...and status flipped backlog -> active" "active" -- "${T[@]}" show EDS-3

# FILING an item is not STARTING it. A commit touching only `.rptc/` is the
# record moving, not the work — both sign-in items were flipped to `active` on
# 2026-08-26 by the very commit that created them.
"${T[@]}" set EDS-4 status=backlog >/dev/null 2>&1
echo "x" >> .rptc/backlog/README.md; git add -A >/dev/null 2>&1
git commit -q -F - >/dev/null 2>&1 <<'M'
docs(backlog): file it

Backlog: EDS-4
M
"${T[@]}" unlogged --write >/dev/null 2>&1
denies "an .rptc-only commit does NOT flip to active" "active" -- "${T[@]}" show EDS-4
# NOT "unlogged is clean" — an earlier case deliberately left a `Backlog: ZZ-9`
# commit in history, and the tool is right to keep reporting it. Assert the
# SPECIFIC sha is gone, or the test asserts the wrong thing and blames the tool.
denies "  ...and that sha is no longer reported" "${SHA_W:0:9}" -- "${T[@]}" unlogged
exits 0 "check still passes"                    -- "${T[@]}" check
# `Backlog: none` is a valid answer, not an id. Every commit this harness makes
# uses it, so treating it as an id made every such commit an unresolvable REFUSED
# on the real repository and `unlogged` could never exit 0 there again.
#
# Assert the ABSENCE of a `none` refusal, NOT a clean exit: an earlier case in
# this file deliberately plants a `Backlog: ZZ-9` commit, so exit 0 is impossible
# here by design and asserting it blames the tool for the harness. That exact
# mistake was made twice in this file before it was written down.
denies "never reports 'none' as an item" "none — no such item" -- "${T[@]}" unlogged --write
denies "  ...nor in the plain report" "none — no such item" -- "${T[@]}" unlogged

# REFUSALS. Both are judgement calls the tool must not make silently.
echo "r" >> f1; git add -A >/dev/null 2>&1
git commit -q -F - >/dev/null 2>&1 <<'M'
chore: trailer typo

Backlog: EDS-3
M
"${T[@]}" set EDS-3 status=shipped >/dev/null 2>&1
says "refuses to log into a shipped item" "REFUSED" -- "${T[@]}" unlogged --write
exits 1 "  ...and exits non-zero"                  -- "${T[@]}" unlogged --write
"${T[@]}" set EDS-3 status=active >/dev/null 2>&1

# NEGATIVE CONTROL: with nothing unlogged, --write must write NOTHING.
"${T[@]}" unlogged --write >/dev/null 2>&1
BEFORE="$(md5 -q "$EDS3" 2>/dev/null || md5sum "$EDS3" | cut -d" " -f1)"
"${T[@]}" unlogged --write >/dev/null 2>&1
AFTER="$(md5 -q "$EDS3" 2>/dev/null || md5sum "$EDS3" | cut -d" " -f1)"
[[ "$BEFORE" == "$AFTER" ]] && ok "NEGATIVE CONTROL: a second --write is a no-op" || bad "NEGATIVE CONTROL: a second --write is a no-op" "it appended twice"

echo
echo "CONTROLS — these prove the harness can actually see a failure"
exits 1 "a deliberately bad command fails"            -- "${T[@]}" notacommand
printf 'x' >> "$PL4"
unchanged "$PL4" "negative control: unchanged() catches a write" -- bash -c "printf 'y' >> '$PL4'"
if [[ "$FAIL" -ge 1 ]]; then
  echo "  (the FAIL immediately above is EXPECTED — it is the control)"
  FAIL=$((FAIL-1)); PASS=$((PASS+1))
else
  echo "  CONTROL DID NOT FIRE — unchanged() cannot detect writes; every 'ok' above is suspect"
  FAIL=$((FAIL+1))
fi

echo
echo "─────────────────────────────────────────"
echo "  $PASS passed, $FAIL failed   (sandbox discarded; the real backlog was never touched)"
[[ "$FAIL" == 0 ]] || exit 1
