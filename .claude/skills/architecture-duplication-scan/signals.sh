#!/usr/bin/env bash
#
# signals.sh — emit candidate POINTERS toward competing / parallel implementations
# (two code paths doing the same job). This is a GUIDED-REVIEW aid: there is no clean
# scanner for "same job solved twice", so this prints heuristic leads, NOT verdicts.
# Every hit needs human judgment — most are false leads (similar names, unrelated twins).
#
# Three labelled sections:
#   1. Explicit markers — comments/ids that name a fork (model a/b, slice-1, "old path").
#   2. Singular-vs-keyed state twins — a `fooState` next to a `fooComponents` can signal
#      a singular model living beside a keyed one.
#   3. Sibling verb twins — repeated add/remove/deploy/create verbs may be two APIs for
#      the same action.
#
# Usage: bash signals.sh [ROOT=src]

set -uo pipefail
ROOT="${1:-src}"

echo "== 1. Explicit fork markers =="
grep -rniE 'model [ab]\b|slice-?1|superseded|parallel (impl|model|path)|legacy path|old path|two (models|paths|ways)' \
    "$ROOT" --include='*.ts' --include='*.tsx' \
    | grep -vE '\.(test|spec)\.tsx?:' \
    || echo "  (none)"
echo

echo "== 2. Singular-vs-keyed state twins (State / Components identifiers) =="
grep -rhoE '\b[a-z][a-zA-Z]+State\b|\b[a-z][a-zA-Z]+Components\b' "$ROOT" --include='*.ts' \
    | sort | uniq -c | sort -rn | head -20
echo

echo "== 3. Sibling verb twins (add/remove/deploy/create/delete/ensure) =="
grep -rhoE '\b(add|remove|deploy|create|delete|ensure)[A-Z][a-zA-Z]+\b' "$ROOT" --include='*.ts' \
    | sort | uniq -c | sort -rn | head -25
