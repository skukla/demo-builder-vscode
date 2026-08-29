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

## VALIDATED STATUS — 2026-08-29

Checked against reality, not recall, after the owner said "I'm not convinced
it's completely done." They were right: I had been reporting phase 3 as though
it were the program.

| # | Phase | Status | Evidence |
|---|---|---|---|
| 1 | Gates | **DONE** | all four present and running |
| 2 | Strengthen 7 weak witnesses | **DONE 2026-08-29** | the blind one is closed: `prerequisitesCacheManager-collaborators.test.ts` pins both seams, and BOTH were proven to fire by planting the defect — see below |
| 3 | Conversion batches | **DONE** | fetch ledger 23 to 0 |
| 3b | Duplication lanes (PL-9) | **NOT STARTED** | lane A (16 self-repeating suites), lane C (20 family extractions) untouched; clones moved only 160 to 158, as a side effect |
| 4 | Noise burn-down | **DONE 2026-08-29** | allowlist EMPTY (68 -> 0); act 226 -> 0, real 102 -> 0, prop 82 -> 0. Gate re-proven to fire with a planted `console.error` |
| 5 | Release-cut instruments | **NOT STARTED** | no test-strategy-scan skill, no Stryker config. (test-divergence-scan was built, but answers a different question) |
| 6 | Craft + coverage follow-ups | **NOT STARTED** | hollow suite, throw-style, and three named coverage gaps untouched |
| 7 | Impact snapshot | **DONE** | metrics-2026-08-29.json |

**5 of 8 done, 3 not started.**

Phase 2's close is worth recording because passing was not the criterion —
"would FAIL if the conversion broke its collaborator calls" was. Both defects
were planted and the source restored:

- **discard the jitter result, use the raw TTL** → the one test written for it
  failed; the other five passed. Precise.
- **constructor ignores its logger and fetches one** → first attempt failed all
  six, but for the WRONG REASON: `getLogger()` throws "Logger not initialized"
  in tests, so the suite died on the throw, not the assertion. That is a pass
  for the wrong reason and would have been recorded as proof. Stubbing the
  fallback to a WORKING logger re-ran it: exactly the three logger-seam tests
  failed, by assertion.

The second is the lesson: a planted defect that fails the suite is not proof the
ASSERTION caught it. Check which test failed and why.

### Measured impact so far

    architecture exemptions   75 to 45  (-30)
      of which fetch          23 to 0   (-23)
      of which construction   39 to 32  (-7)
    module-mock-wall suites   83 to 74  (-9)
    test clones              160 to 158 (-2)

Two numbers moved the WRONG way and are recorded rather than omitted:
light-mocks doubles 532 to 544, and logicInTests 161 to 164. The first is
expected — a converted suite trades a module wall for light fakes — but it
means the double count REDISTRIBUTED rather than fell. The second is a small
regression nobody asked for; phase 6 should look at it.

### Work done outside this plan

Not tracked by any phase above: the canonical fixture consolidation (PL-16,
43 redundant builders to 0), the merge of the second test tree, the
builder-uniqueness ratchet, the placement rule, and PL-17's filing.

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

- **START SIGNAL, not a plan** (owner, 2026-08-28: "when you start the next
  step of a loop, give me feedback that lets me know you've STARTED it —
  sometimes your verb language freezes"). Say **"Starting X now"** as the step
  begins, in the present tense. Ending a turn with "next is X" and opening the
  following turn with X's RESULTS looks, from the owner's side, like nothing
  happened in between. One or two sentences: what I'm doing, WHY, and what
  would change my mind.
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

---

## Phase 8 (added 2026-08-28) — the frontend half of the architecture

The owner's observation after phases 1–7: the architecture we wrote and enforced
is the BACKEND architecture. The extension is two programs — an extension host
(608 files) and eight webview bundles (291 files) — and only one of them is
written down.

This is not speculative. ADR-015 mentions React, hooks, webviews and browsers
zero times, yet one of the six checks enforced under its name is a pure React
rule (custom hooks must not take inline `[]`/`{}`, the re-render trap) with five
files on its ledger. Frontend rules already exist and are already enforced —
under a document that does not claim them.

Tracked as **PL-17**. Scope: declare ADR-015's scope as the extension host,
write the frontend ADR (composition root = the bundle entries; dependencies
arrive as props/context; rehome the hook rule), and split the enforcement so a
frontend violation is not reported as an ADR-015 one.

Sequenced AFTER the construction-boundary work, because that work is what keeps
turning up the evidence for it.
