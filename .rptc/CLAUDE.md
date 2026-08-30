<!-- Last verified: 2026-07-03 -->
# RPTC Workflow — Project Configuration

Project-specific RPTC configuration for the Adobe Demo Builder VS Code
extension. The RPTC process itself (commands, agents, skills, templates) ships
with the `rptc` plugin — this file only records what is specific to this
project.

## Tech Stack

- **Language**: TypeScript
- **Platform**: VS Code Extension API
- **UI**: React + Adobe Spectrum
- **Build**: esbuild (`esbuild.config.js`) — NOT webpack
- **Testing**: Jest with ts-jest, @testing-library/react (~1,130 suites)
- **Database**: none

## Essential Commands

```bash
npm run watch:all        # Watch mode (extension + webviews) — run in background
npm run compile          # Full production build
npm run lint             # eslint over ALL of src/ + tests/ (matches CI)
npx tsc --noEmit         # Typecheck src/ (tsconfig.json excludes tests)
npm run typecheck:tests  # Typecheck tests/ (tsconfig.test.json) — CI gates on both
npx jest --no-coverage > "$SCRATCH/jest-output.txt" 2>&1   # Full suite (~20s, see below)
```

`$SCRATCH` is your session scratchpad directory (the harness names it at session
start). The redirect order and the destination are both load-bearing — see
Test-Command Gotchas below.

## Where RPTC Artifacts Live

`.rptc/` is **fully tracked in git** (only `.rptc/prompt.md` is gitignored).
Write working artifacts to these locations, never ad-hoc paths:

| Stage | Location | What goes there |
|---|---|---|
| Working research | `.rptc/research/<topic-slug>/research.md` | Exploratory, in-flight research generated during `/rptc:research` or equivalent |
| Working plans | `.rptc/plans/<feature-slug>/overview.md` + `step-NN.md` | Active implementation plans being executed via TDD |
| Completed work | `.rptc/complete/<feature-slug>/` | Plans whose implementation has shipped (move from `.rptc/plans/` when done) |
| Curated research | `docs/research/<date>-<topic>.md` | **Promoted only.** Landmark research cited by ADRs / CHANGELOG. Don't write here directly; promote from `.rptc/research/` once durable. |
| Backlog items | `.rptc/backlog/<slug>.md` or `.rptc/backlog/<feature>/` | Designed/proposed work that isn't active (index: `.rptc/backlog/README.md`) |

### Live-probe writeups: redact before committing

**This repo is PUBLIC and `.rptc/` is tracked**, so a writeup that probes an internal
service publishes whatever it quotes. Before committing a `spike-*.md` or any research
that hit a live endpoint, strip:

- **Names of people.** Never name a colleague — least of all beside a defect in their
  service. Write the role ("the service owner").
- **Internal / pre-release endpoints**, including Runtime namespace ids.
- **Record identifiers** from real responses — activation ids, datapack ids, tenant ids.
- **Infrastructure names** quoted out of error text — internal env vars, backing stores.

Keep the finding, drop the identifier: `<activation-id-A>` reads fine and the contract it
demonstrates is the durable part. Raw captures are gitignored (see `.gitignore`); the
redacted writeup is what gets tracked.

Recorded 2026-08-11 after a probe writeup reached the public remote carrying a colleague's
name, a stage Runtime endpoint and two live activation ids.

## Worktree Convention

- All worktrees live in the **visible sibling directory**
  `demo-builder-vscode.worktrees/<prefix>/` (prefixes: `claude/`, `feature/`,
  `fix/`) — NOT the hidden `.claude/worktrees/`.
- Most of `.claude/` is TRACKED — `skills/`, `hooks/`, and `settings.json` (the
  hook wiring) arrive with the checkout. A hook enforces a skill, so enforcement
  that lived in only one checkout was a gap.
- Still per-checkout and ignored: `settings.local.json` (personal permission
  allowlist). Copy it from the main checkout or expect permission prompts.

## Project SOPs — moved to [`docs/development/sop/`](../docs/development/sop/)

They left `.rptc/` on 2026-08-30. `.rptc/` holds RPTC WORK — research, plans,
backlog, completed records — all of which is transient. The SOPs are standing
guidance cited by five permanent enforcer suites, two skills and ADR-016, so
filing them here miscategorised them. It had a cost: the documentation reference
check excludes `.rptc/` precisely because it is work tracking, so 5,257 lines of
live guidance went unchecked and 31% of their file citations had rotted.

This section used to claim a resolution order — project SOPs "override the plugin
defaults", `.rptc/sop/` → global → plugin. **No such mechanism exists.** No RPTC
skill or command reads the project SOP directory at all; the order was prose
describing something nothing implements. Checked 2026-08-30.

What is true: the SOPs are procedure. The RULE each one asserts lives in
[the architecture handbook](../docs/development/handbook.md) with its enforcer
named; the SOP holds the worked examples and the refactoring steps.

| SOP | Covers |
|---|---|
| `code-patterns.md` | Mandatory code-clarity patterns: `TIMEOUTS.*` constants, no nested ternaries, helper extraction, etc. |
| `consistency-patterns.md` | Detecting the same operation implemented differently across the codebase |
| `god-file-decomposition.md` | Detection criteria and decomposition workflows for oversized multi-responsibility files |
| `testing-guide.md` | Optimized Jest execution for 5-10s TDD feedback loops (`test:watch`, `test:file`, `test:changed`) |

## Test-Command Gotchas

- **Never pipe jest through `tail`/`head`/`grep`** — output buffering makes
  the run look hung. Redirect to a file and read it:
  `npx jest --no-coverage > "$SCRATCH/jest-output.txt" 2>&1`
- **The redirect order is load-bearing: `> file 2>&1`, never `2>&1 > file`.**
  Jest writes its results to STDERR. `cmd 2>&1 > file` points stderr at the
  terminal *first*, then sends stdout to the file — so the file lands EMPTY and
  a `grep -c FAIL` on it returns a clean-looking `0`. These two lines carried the
  broken order for months, and 4 of 6 sessions measured on 2026-08-24 copied it
  from here. A PreToolUse rule (`.claude/hooks/rules/11-jest-redirect.rule`) now
  blocks it.
- **Write to the session scratchpad, not `/tmp`.** The scratchpad is per-session
  and cleaned up; `/tmp` is neither. This file used to say `/tmp`, which is why
  every measured session used it.
- The full suite takes **~20 seconds** (1,130 suites / ~14,850 tests as of 2026-08-23; measured over 10
  consecutive runs on 16 cores, 2026-08-13). It was 3-5 minutes before the worker and
  transform tuning landed; that figure survived in the docs long after it stopped
  being true, and it teaches you to walk away from a run that is already finished.
  `npm test` is the slow one — its `pretest` runs compile + lint first.
- **Never run two jest runs at once.** Measured 2026-08-13: one at a time failed 0 suites
  in 10 runs; two concurrently failed 4-6 suites in all 6 runs, on 10s timeouts, in
  different suites each time. A concurrent result is noise in both directions. A
  PreToolUse rule (`.claude/hooks/rules/15-jest-concurrent.rule`) blocks the second run;
  if it fires, wait rather than scoping the run down — a scoped run takes the same cores.
- **CI lints the whole repo** (`npm run lint` covers all of `src/` +
  `tests/`). A scoped/changed-files lint can pass locally while CI fails on a
  pre-existing error elsewhere. Before pushing: full `npm run lint` +
  `tsc --noEmit` + full jest.
- Fast iteration during TDD: `npm run test:watch -- <path>` or
  `npm run test:file -- <path>` (see `docs/development/sop/testing-guide.md` and
  `tests/README.md`).

## RPTC Configuration

- verification-agent-mode: **automatic**
