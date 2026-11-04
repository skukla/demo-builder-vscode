#!/usr/bin/env bash
#
# The pre-push gate for a push that changes code: everything `npm run gate` checks across
# the WHOLE repo, except the full jest run, which CI does on every push anyway.
#
#   - lint, both typecheckers, the tsc blind-spot check, test file sizes and the
#     duplication pin: whole repo, exactly as `gate` runs them. These are the checks that
#     twice passed a narrower local run and failed CI (the 2026-09-02 breaks), so they stay.
#   - the repo-rule enforcers (`gate:docs`: tests/sop, the hook tests, the template checks,
#     tool-prompt coverage), because a rule can be broken by any file.
#   - the tests jest itself says depend on the changed files (`--findRelatedTests`).
#
# Usage: gate-push.sh <changed file>...   (the hook passes them)
#
# Not here: the dead-code scan. It is advisory, never a gate, and its doc-drift pass alone
# takes minutes. `npm run gate` still runs it.
#
# Owner, 2026-10-28: nine minutes to push a one-line fix is the wrong trade when CI runs
# the full suite on the same push.
#
# The six static checks only READ the code, so they run side by side (owner, 2026-11-04):
# measured on an idle 16-core machine they took 47s one after another, and finish in about
# the time of the slowest (lint, 17s, a few seconds with its cache warm; its cache is kept in
# node_modules/.cache/eslint/, because an eslint run WITHOUT --cache deletes one at the
# default .eslintcache, and tests/sop/eslint-type-aware.test.ts runs exactly that). Each one's output
# is kept apart and printed whole, in order, so a failure reads as it did when they ran in
# turn. The jest runs below stay one at a time: two jest runs at once fail suites at random.

set -euo pipefail

# Both typechecks keep a record of the last run (`--incremental`), so a second push rechecks
# only what changed. One record per checkout: node_modules is shared by every worktree, and
# two checkouts writing one record would each throw the other's away.
tsc_cache="node_modules/.cache/tsc/$(git rev-parse --show-toplevel | shasum | cut -c1-12)"
mkdir -p "$tsc_cache"

static=(
    "npm run lint"
    "npx tsc --noEmit --incremental --tsBuildInfoFile $tsc_cache/src.tsbuildinfo"
    "npx tsc -p tsconfig.test.json --noEmit --incremental --tsBuildInfoFile $tsc_cache/tests.tsbuildinfo"
    "npm run validate:tsc-blindspots"
    "npm run validate:test-file-sizes"
    "npm run validate:source-duplication"
)
logs=$(mktemp -d)
pids=()
for i in "${!static[@]}"; do
    bash -c "${static[$i]}" > "$logs/$i.log" 2>&1 &
    pids+=("$!")
done
failed=()
for i in "${!static[@]}"; do
    if ! wait "${pids[$i]}"; then failed+=("${static[$i]}"); fi
    cat "$logs/$i.log"
done
rm -rf "$logs"
if [ "${#failed[@]}" -gt 0 ]; then
    printf 'gate-push: FAILED: %s\n' "${failed[@]}"
    exit 1
fi

npm run gate:docs

# Only files jest can follow through the module graph. A deleted file is not passed: it
# was filtered out by the hook (--diff-filter=ACMR).
related=()
for f in "$@"; do
    case "$f" in
        *.ts|*.tsx|*.js|*.mjs|*.cjs|*.json) [ -f "$f" ] && related+=("$f") ;;
    esac
done

if [ "${#related[@]}" -eq 0 ]; then
    echo "gate-push: no changed file jest can trace, so no related tests to run"
    exit 0
fi

echo "gate-push: running the tests related to ${#related[@]} changed file(s)"
npx jest --no-coverage --passWithNoTests --findRelatedTests "${related[@]}"
