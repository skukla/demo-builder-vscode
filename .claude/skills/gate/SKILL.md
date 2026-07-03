---
name: gate
description: Run the fast inner-loop quality gate for the Demo Builder project — scoped Jest (redirected to a file, NEVER piped through tail), tsc --noEmit, and eslint on changed files — then report a compact PASS/FAIL summary. Use after making code changes and before committing.
---

# gate — Demo Builder inner-loop quality gate

Run the three checks this project gates on, in order, and report a tight summary.
Default scope is **changed files**; widen to the full suite only when asked or when
many files across features changed.

## 1. Determine changed files

```bash
{ git diff --name-only --diff-filter=ACMR; git diff --cached --name-only --diff-filter=ACMR; } | sort -u
```

Split into:
- **TS/TSX** (`*.ts`, `*.tsx`) → drive eslint + the jest scope.
- **CSS** → no eslint/jest, but note that webview CSS changes need a window reload to see live.

If nothing changed, say so and stop.

## 2. Jest (scoped) — NEVER pipe through tail/head/grep

Jest emits huge output; piping buffers it and looks hung. ALWAYS redirect to a file, then read it.

```bash
# Scope to the tests for the changed areas (a path/pattern that covers them), e.g.:
npx jest --no-coverage <pattern> 2>&1 > /tmp/gate-jest.txt
# React-only components can use: --selectProjects react
# Full suite (only when warranted): npx jest --no-coverage 2>&1 > /tmp/gate-jest.txt
```

Then read `/tmp/gate-jest.txt` and extract the `Tests:` / `Test Suites:` lines and any `FAIL`.
Note: the `check-test-file-sizes` suite prints `❌ ... exceed 750-line limit` for its OWN
intentional fixtures (`tests/oversized.test.ts`, `tests/subdir/test.test.ts`) — that suite
PASSES; it's not a failure.

When production code changed, locate and run its complementary tests (test-code sync).

## 3. tsc

```bash
npx tsc --noEmit 2>&1 | tail -15   # tsc output is small; tail is fine here
```

Whole-project typecheck (project references make per-file impossible). Must be exit 0.

## 4. eslint — changed files only

```bash
echo "<changed ts/tsx files>" | xargs npx eslint
```

Target **0 errors AND 0 warnings** on changed files (this project treats lint-clean as
the bar — complexity/import-order warnings count). Auto-fixable issues: `npx eslint --fix <files>`.

## 5. Report

Give a compact summary, e.g.:

```
gate: jest <suites>/<tests> ✓ · tsc ✓ · eslint ✓ (N files)
```

If anything fails, show the specific failure (failing test name + assertion, tsc error
line, or eslint rule + location) and stop for a fix — do not claim green.

## Notes
- This is the inner loop. For agent-driven review use `/rptc:verify`; to ship use `/rptc:commit`.
- Never commit without explicit user approval; no Co-Authored-By footer (project convention).
