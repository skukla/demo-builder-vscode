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

set -euo pipefail

npm run lint
npx tsc --noEmit
npm run typecheck:tests
npm run validate:tsc-blindspots
npm run validate:test-file-sizes
npm run validate:source-duplication
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
