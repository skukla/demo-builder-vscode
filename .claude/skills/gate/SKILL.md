---
name: gate
description: Run the fast inner-loop quality gate for the Demo Builder project — scoped Jest (redirected to a file, NEVER piped through tail), tsc --noEmit, and eslint on changed files — then report a compact PASS/FAIL summary. INVOKE this skill rather than re-running its commands by hand; hand-running skips §6, the whole-repo lint that CI actually enforces. Use after making code changes, before committing or pushing, and whenever a plan step or doc says to run the gate.
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

## 6. Before pushing a PR — widen to match CI (the scoped gate is NOT enough)

The steps above lint **changed files only**. CI (the "Typecheck · Lint · Test" job) runs
`npm run lint` = `eslint "src/**/*.{ts,tsx}" "tests/**/*.{ts,tsx}"` over the **whole repo** and
fails on ANY error (warnings allowed; one `error` exits 1). A PR can pass the scoped gate yet
fail CI on a pre-existing error in a file you never touched — and CI tests the **merge against
base**, so errors inherited from the base branch or sibling worktree work surface too. Before
pushing, match CI exactly:

```bash
npm run lint                                  # whole repo — the one that's easy to miss
npx tsc --noEmit
npx jest --no-coverage 2>&1 > /tmp/gate-jest.txt   # full suite; never pipe through tail
bash .claude/skills/dead-code-scan/scan.sh src     # ~5s — cruft the compiler cannot see
```

The scan is advisory, not a gate: ts-prune reports entry points and DI/config-registered
symbols as unused. Read it, do not obey it. What IS reliable is its doc-drift section —
docs naming a symbol that no longer exists, confirmed against `git log`. Treat a hit
there as a real finding.

Pre-push is the last honest moment for it. Everything the compiler and tests can see is
already covered above; this covers what they structurally cannot — a symbol nothing
imports, and a doc describing code that is gone.

## Notes
- This is the inner loop. For agent-driven review use `/rptc:verify`; to ship use `/rptc:commit`.
- Never commit without explicit user approval; no Co-Authored-By footer (project convention).
