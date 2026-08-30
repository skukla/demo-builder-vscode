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

**Redirect order matters.** Jest writes its results to STDERR. `cmd 2>&1 > file` points
stderr at the terminal *first*, then sends stdout to the file — so the file lands EMPTY
and every `grep -c FAIL` on it returns a clean-looking `0`. Write `> file 2>&1`. This
skill shipped the wrong order for months; on 2026-08-16 it produced a `FAIL_COUNT=0`
against a zero-byte file that read exactly like a green full-suite run.

```bash
# Scope to the tests for the changed areas (a path/pattern that covers them), e.g.:
npx jest --no-coverage <pattern> > "$SCRATCH/gate-jest.txt" 2>&1
# React-only components can use: --selectProjects react
# Full suite (only when warranted): npx jest --no-coverage > "$SCRATCH/gate-jest.txt" 2>&1
```

Use the session scratchpad directory, not `/tmp`.

Then read the file and extract the `Tests:` / `Test Suites:` lines and any `FAIL`.
Confirm it is non-empty before believing a zero count — `wc -c` on the file, or just
check that the `Test Suites:` line is present. An absent summary means the run did not
land, not that it passed.
Note: the `check-test-file-sizes` suite prints `❌ ... exceed 750-line limit` for its OWN
intentional fixtures (`tests/oversized.test.ts`, `tests/subdir/test.test.ts`) — that suite
PASSES; it's not a failure.

When production code changed, locate and run its complementary tests (test-code sync).

## 3. tsc — both configs

```bash
npx tsc --noEmit 2>&1 | tail -15          # src/ (tsconfig.json excludes tests)
npm run typecheck:tests 2>&1 | tail -15   # tests/ (tsconfig.test.json) — CI runs this too
```

**If the change ADDED or RENAMED any .ts/.tsx file, also run the blind-spot check** —
a green tsc is only as good as its file set, and tsc's include globs keep one file
per basename (.ts beats .tsx): an `index.tsx` beside an `index.ts` barrel is
silently NEVER typechecked. That gap hid a dead wire read in the dashboard entry
for months (fixed 20f45f8f). CI runs this on every push; locally it only matters
when the file set changed:

```bash
npm run validate:tsc-blindspots   # asserts both configs' file sets cover the disk
```

Whole-project typecheck (project references make per-file impossible). Both must be
exit 0. The second one exists because `tsconfig.json` excludes test files and
`@swc/jest` strips types — without it, nothing typechecks the test tree and fixtures
can invent shapes the suite then agrees with (the 2026-08-13 `prepareImport` bug).
NOT `test:typecheck` — that older script checks only `src/`.

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
npm run gate     # all six, in order, stopping at the first failure
```

**One command, deliberately.** This used to be the six commands below, listed for
you to run by hand — and a list of six is a memory test you eventually fail. The
2026-07-30 dream run found a whole feature shipped after someone hand-ran a scoped
lint and skipped the whole-repo one; on 2026-08-30 a session ran three of the six
all day and only noticed while auditing this skill. Both times the missing steps
would have passed. That is what makes it hard to catch: the failure is silent until
the day it is not.

What `npm run gate` runs, so you can read a failure without opening package.json:

| | | |
|---|---|---|
| 1 | `npm run lint` | whole repo — the one that is easy to miss |
| 2 | `npx tsc --noEmit` | `src/` (tsconfig.json excludes tests) |
| 3 | `npm run typecheck:tests` | the test tree; CI gates on this too |
| 4 | `npm run validate:tsc-blindspots` | files tsc silently skips (basename shadowing) |
| 5 | `npx jest --no-coverage` | full suite |
| 6 | `dead-code-scan/scan.sh src` | ~5s — cruft the compiler cannot see |

It stops at the first failure, so fix and re-run rather than reading ahead. Run
jest on its own if you need the output in a file — never pipe it through `tail`.

The scan is advisory, not a gate: ts-prune reports entry points and DI/config-registered
symbols as unused. Read it, do not obey it. What IS reliable is its doc-drift section —
docs naming a symbol that no longer exists, confirmed against `git log`. Treat a hit
there as a real finding.

Pre-push is the last honest moment for it. Everything the compiler and tests can see is
already covered above; this covers what they structurally cannot — a symbol nothing
imports, and a doc describing code that is gone.

## 7. After committing — let the record catch up

```bash
node .claude/skills/backlog-item/backlog.mjs unlogged --write
```

One command, nothing to type. It finds commits carrying a `Backlog:` trailer
whose sha never reached the item, writes the line, and flips a `backlog` item to
`active`. It refuses an unknown id or a finished item rather than guessing.

Skipping it is how eight commits landed unlogged on 2026-08-26.

## 7. Reading a CI failure (the two commands)

```bash
gh run list --limit 40 --json conclusion,displayTitle,name,headBranch,databaseId,createdAt \
  | python3 -c "import json,sys; [print(r['conclusion'],'|',r['name'],'|',r['headBranch'],'|',r['displayTitle'][:55],'| id',r['databaseId']) for r in json.load(sys.stdin) if r['conclusion']=='failure']"
gh run view <databaseId> --log-failed | grep -E "##\[error\]"   # the actual error lines
```

Then reproduce the failing check LOCALLY against current HEAD before concluding
anything — a red run tests the tree AS OF ITS COMMIT, and a fix may already have
landed. The 2026-08-28 case: three red runs were docs pushes inside the
minutes-wide window between a bad `responseCeilings.ts` shape and its fix; the
error was real, the alarm was stale. `conclusion` empty means still running,
not failed.

## Notes
- This is the inner loop. For agent-driven review use `/rptc:verify`; to ship use `/rptc:commit`.
- Never commit without explicit user approval; no Co-Authored-By footer (project convention).
