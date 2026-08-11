#!/usr/bin/env bash
#
# signals.sh — emit candidate POINTERS toward two code paths that must agree about
# one fact while nothing makes them. This is a GUIDED-REVIEW aid, not a scanner:
# it prints heuristic leads, NOT verdicts. Every hit needs judgment.
#
# CALIBRATION (2026-08-04). Six real instances shipped in one day. This script as
# it stood produced a lead for ZERO of them, and jscpd found zero cross-file
# clones for four of them even at thresholds six times more permissive than its
# configured floor. What is duplicated in this shape is a DECISION, not text — so
# sections 4-6 look for the decision, and the older sections were widened after
# each miss was traced to a file set or a whitelist.
#
# Sections:
#   1. Explicit markers — comments/ids that name a fork.
#   2. Singular-vs-keyed state twins.
#   3. Sibling verb twins.
#   4. One fact decided twice — a fact re-derived where a resolver already owns it.
#   5. Single-source claims — prose asserting a chokepoint; verify by counting callers.
#   6. Claims of AGREEMENT — "Mirrors X" and friends: a promise nothing enforces.
#
# Usage: bash signals.sh [ROOT=src]

set -uo pipefail
ROOT="${1:-src}"
INC=(--include='*.ts' --include='*.tsx')

echo "== 1. Explicit fork markers =="
grep -rniE 'model [ab]\b|slice-?1|superseded|parallel (impl|model|path)|legacy path|old path|two (models|paths|ways)' \
    "$ROOT" "${INC[@]}" \
    | grep -vE '\.(test|spec)\.tsx?:' \
    || echo "  (none)"
echo

# .tsx included. A duplicated model living in a component was previously invisible
# here — that is how a second status-dot implementation was missed.
echo "== 2. Singular-vs-keyed state twins (State / Components identifiers) =="
grep -rhoE '\b[a-z][a-zA-Z]+State\b|\b[a-z][a-zA-Z]+Components\b' "$ROOT" "${INC[@]}" \
    | sort | uniq -c | sort -rn | awk '$1 >= 5' | head -30
echo

# Whitelist widened: the six known instances needed get/list/record/persist/
# install/clone/resolve/write, none of which were here. A count FLOOR replaces the
# old `head -25` — this counts identifier OCCURRENCES, so hot local variables
# outrank real twins, and the true twin in one instance ranked ~30th and was
# truncated away before anyone could see it.
echo "== 3. Sibling verb twins =="
grep -rhoE '\b(add|remove|deploy|create|delete|ensure|get|list|record|persist|install|clone|resolve|write|derive|build)[A-Z][a-zA-Z]+\b' \
    "$ROOT" "${INC[@]}" \
    | sort | uniq -c | sort -rn | awk '$1 >= 5' | head -40
echo

# The highest-yield section. A resolver owns "which entry is the X", and some call
# site re-derives it inline — usually getting a subtlety wrong (a priority, a
# tie-break). Multiline (-U) is REQUIRED: in the real instance `.find(` and its
# arrow sat on separate lines, so a line-based grep missed it.
echo "== 4. One fact decided twice (inline re-derivation of an owned fact) =="
if command -v rg >/dev/null 2>&1; then
    rg -U -n --no-heading -g '*.ts' -g '*.tsx' \
      '\.(find|filter)\(\s*\n?\s*\(?[A-Za-z]+\)?\s*=>\s*[A-Za-z]+\.(kind|subType|type|status|id)\s*===' \
      "$ROOT" || echo "  (none)"
    echo
    echo "  -> For each fact above, find who OWNS it (a get*/resolve* returning that entity)."
    echo "     Every other site re-deriving the same fact is a lead. Compare tie-breaks and"
    echo "     priority order — that is where these diverge, not in the predicate."
else
    echo "  (ripgrep not installed — this section needs multiline matching)"
fi
echo

# Self-maintaining: the repo writes these claims itself. Note they are usually
# written BY the fix that created the chokepoint, so this is a LAGGING index — it
# finds bypasses added after a claim, not the duplication that motivated it.
echo "== 5. Single-source claims (verify each: count the callers) =="
grep -rniE '(the (one|only|single|canonical) [a-z-]* ?(writer|resolver|reader|source|owner|seam|place)|every [a-z ]*path (lands on|goes through|routes through)|MUST route through)' \
    "$ROOT" "${INC[@]}" --include='*.md' \
    | grep -vE '\.(test|spec)\.tsx?:' \
    || echo "  (none)"
echo
echo "  -> For each: grep the named symbol's callers. If a path that does that job"
echo "     is missing from the list, the claim is false and you have found a bypass."
echo

# The FORWARD-looking signal, and the one to run first on an unfamiliar area. A
# singularity claim (section 5) is written when a bug is fixed; an agreement claim
# is written when the second copy is BORN — the moment the drift risk is created.
# It also names both sides, which makes it checkable.
echo "== 6. Claims of agreement (a promise nothing enforces) =="
grep -rniE '(mirrors|same shape as|identical to|parallel to|matches .the|in lockstep|kept in sync)' \
    "$ROOT" "${INC[@]}" \
    | grep -vE '\.(test|spec)\.tsx?:' \
    || echo "  (none)"
echo
echo "  -> Each line claims two things agree. Open BOTH and check they still do."
echo "     Then ask what would fail if they diverged tomorrow. If the answer is"
echo "     'nothing', that IS the finding — extract, or write the contract test."
