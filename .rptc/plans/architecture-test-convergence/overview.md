# Architecture + test convergence — the consolidated program plan

One program, two ratified laws, one repeating batch. Written 2026-08-28 after
the owner asked for a consolidated plan and loop-readiness.

- **Law**: ADR-015 (fetch at the boundary, inject below, construct in the root
  or a `create...Deps` file) and ADR-016 (three test tiers, Jest retained,
  noise to zero, effectiveness measured).
- **Map**: `docs/architecture/where-code-goes.md`.
- **Scoreboard**: `.rptc/plans/pattern-conformance-audit/harness/metrics-baseline-2026-08-28.json`
  — impact is the diff between this and a later snapshot, never a narrative.
- **Backlog**: PL-11 (epic) with PL-9/PL-14/PL-15; PL-13 (convergence queue).
  PL-13 and PL-11's execution are ONE stream — the batch below pays both.

## Phases, in dependency order

| # | Phase | Done when | Item |
|---|---|---|---|
| 1 | **Gates first** — fail-on-console setup gate (allowlist seeded at today's noise = PL-15's ledger), eslint-plugin-jest at warn, family-testUtils check, tests-clone ratchet pinned into the sweep skill | all four run in CI; new drift fails; no existing test newly broken | PL-14 (A) |
| 2 | **Strengthen the 7 weak witnesses** — 1 blind (prerequisitesCacheManager, 7 suites, no call assertions), 4 untested, 2 indirect (confirm the parent suites watch the seam) | each has a suite that would FAIL if the conversion broke its collaborator calls | PL-11 |
| 3 | **Conversion batches** — the ~54 queue files, ~5 per batch | ledger rows deleted per batch; exemption total → adjudicated floor | PL-13 + PL-11 |
| 3b | **Duplication lanes (PL-9)** — lane A (16 self-repeating suites) fixed outright; lane B melts inside the phase-3 conversions; lane C's 20 ranked family extractions | ratchet at its adjudicated floor; the 42 legitimate splits carry written reasons | PL-9 |
| 4 | **Noise burn-down** — act() awaits, mock prop-spreading, expected-error absorption; opportunistic in batches + dedicated passes for top emitters | allowlist empty; gate frozen at zero | PL-15 |
| 5 | **Release-cut instruments** — `test-strategy-scan` skill (censuses promoted from one-off scripts), Stryker pilot config + runner skill | both run at a release cut and produce reconciled output | PL-14 (B) |
| 6 | **Craft + coverage follow-ups** — hollow suite characterized, throw-style normalized, coverage gaps (mcp-proxy 0%, projectDeletionService 16%, templateSyncService 18%) | flags at zero; named coverage gaps closed or reasoned | PL-11 |
| 7 | **Impact snapshot** — re-run `program-metrics.mjs --label <cut>` | the diff is the impact report | PL-11 |

## The batch recipe (the repeating unit — phases 2–4)

Per file, in this order (reversing it ratifies silent breakage as the baseline):

1. **Witness check** — does its suite assert the collaborator calls the
   conversion will move? If not, strengthen FIRST against current behavior.
2. **Convert** — dependencies become parameters; construction moves to the
   feature's `create...Deps` (create one if the feature has none).
3. **Simplify the suite** — module-mock wall → plain deps-object fakes.
4. **Delete the ledger rows** (the test FAILS if a fixed row lingers).
5. **Gate**: scoped jest + `tsc --noEmit` + `typecheck:tests` + eslint on
   changed files, exit codes captured into variables, never read through a
   pipe. Green → commit; red → fix before the next file.
6. Every 3rd batch: full suite + whole-repo lint (CI parity).

## What the loop may decide vs what the owner rules

**Loop decides unattended**: every mechanical conversion, test strengthening,
noise fix, ledger bookkeeping, ratchet lowering, and the tooling builds.

**Owner rules (collected as slates, never guessed)**:
- the 39 construction-boundary entries: "constructs its own subordinate"
  (ratify, amend the allowed list) vs "converge to a deps builder"
- the 6 types-purity entries: move the runtime code out vs ratify
  colocation (typeGuards is the standing candidate)
- the 5 hook flags: legitimate default vs unstable reference
- after the Stryker pilot: whether a pruning pass is worth running

Slates are presented in plain English with a recommendation per row; the loop
keeps converging everything else while they wait.

## Stop conditions

- A conversion that cannot keep its tests green without changing assertions →
  STOP, report; that is a behavior change, not a refactor.
- A ratchet that would rise → STOP; the batch regressed something.
- Anything needing a cloud write, a sign-in, or a UI decision → park it in the
  walkthrough queue (this program should need none of them).

## Report contract

**ATTENDED MODE (owner present — the default for this program; set
2026-08-28, 1:13pm ET, "priority number one, constant updates").** The owner
is watching, so narration is continuous, not end-of-session:

- **Before each step**: one or two sentences — what I'm about to do, WHY, and
  what would change my mind. Never a bare tool call into silence.
- **After each step**: what actually happened, in plain English, including
  when it failed or surprised me. A step that found nothing says so.
- **Per batch**: the one-line score — files converted, ledger rows deleted,
  ratchets moved, gate result.
- **No invented vocabulary.** A term coined during the work either gets a
  plain-word replacement or a plain-word definition in the same sentence.
  Summaries open with what it MEANS, not with what was built.
- **Surprises surface immediately**, not at the end — a blocked file, a test
  that should have caught something and didn't, a number moving the wrong
  way.

**UNATTENDED MODE** (owner away): the standard loop contract — per-item
reports, the walkthrough queue, the handoff file, sleep guard on.

Either mode: the impact report is always a snapshot diff, never a narrative.
