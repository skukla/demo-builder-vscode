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
| 3b | Duplication lanes (PL-9) | **lane A DONE 2026-08-30**; lane C RE-PLANNED, not started | lane A: 15 reported self-clones = 12 real (extracted, unique assertion sets unchanged) + 3 FALSE POSITIVES proven by a synthetic control. Lane C measured: duplication is real (~5,486 lines) but only 4 of 44 families are mechanically extractable; the other 40 have divergent preambles and need per-file judgment. Splits into C1 (4, mechanical) and C2 (40, judgment) — see the finding below |
| 4 | Noise burn-down | **DONE 2026-08-29** | allowlist EMPTY (68 -> 0); act 226 -> 0, real 102 -> 0, prop 82 -> 0. Gate re-proven to fire with a planted `console.error` |
| 5 | Release-cut instruments | **DONE 2026-08-30** | `test-strategy-scan` skill (runs the three censuses + the verdict table saying which columns track defects) and the Stryker pilot (`npm run test:mutation`, baseline 93.37% over 166 mutants in 33s). Both registered and both reached by `npm run sweep` / `cut-release` |
| 6 | Craft + coverage follow-ups | **DONE 2026-08-30** | all three coverage gaps closed (mcp-proxy, projectDeletionService 16→84%, templateSyncService 18→82%); hollow suite fixed (theater 2→1, the remaining 1 is a detector gap not a hollow suite); logicInTests and throw-style MEASURED and found not to be defect metrics — see the three findings below |
| 7 | Impact snapshot | **DONE** | metrics-2026-08-29.json |
| 8 | Frontend architecture (PL-17) | **DONE 2026-08-29** | ADR-017 written + enforced (`webview-architecture-rules.test.ts`); ADR-015 scoped to the host; hook rule + ledger rehomed; WebviewClient's row retired by ratifying the singleton. Three positive controls, incl. one on the jurisdiction itself |

**6 of 9 done, 3 not started** (phase 8 was added after the original eight).

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

## Phase 6 — per-unit done criteria, written BEFORE each unit

Added 2026-08-29 after the owner named the real problem: *"You do a thing and
declare it done and then you take another look at it and you find what you think
are issues... everything you do doesn't really have a definition of done."*

The diagnosis that came out of examining it: in the `mcp-proxy` unit, BOTH later
findings were visible at the moment "done" was declared. Neither needed new
information. One was a design choice shipped with a justification that did not
survive being questioned; the other was a printed `0%` narrated as "now genuinely
just I/O" when the file still held the retry policy and the EMFILE guard. **The
narration was the check.**

So the gap is not that re-inspection finds new things forever — it is that the
unit work is declared done at a level with no stated criterion. Phases have one
(the "Done when" column). Items sometimes do (10 of 76). A BATCH — the thing
actually being called done — had none, and a green gate answers "did I break
anything", not "did I finish".

**The rule: write the criterion before starting the unit, check it explicitly in
the commit that closes it.** One line. The point is that it is written down
before the work can rationalise it.

### mcp-proxy — RETROSPECTIVE (what it should have said)

> No decision logic left in the entry point; anything still uncovered there is
> named and is genuinely I/O.

Would have failed on the first pass, before anyone had to ask.

### throw-style is not a defect either — measured 2026-08-30

Phase 6 lists "throw-style normalized". Measured before normalising anything.

**116 `throw new Error(...)` occurrences** live in suites that also use
`expect()`. What they are:

| What it is | Count |
|---|---|
| inside a mock implementation — a fake rejecting unexpected input | 74 |
| a fake THROWING to simulate a failure the SUT must handle | 24 |
| an assertion or guard after an `if` | 28 |
| module-scope helper | 11 |
| other | 3 |

**98 of 116 are SETUP, not assertions.** `onProgress: () => { throw new
Error('render blew up') }` is an input to the subject, not a claim about it.
Normalising those to `expect()` is not possible — there is nothing to assert.

The 28 that ARE assertions read like this:

    if (unknown.length > 0) {
        throw new Error(
            `stacks.json root has unknown fields: ${unknown.join(', ')}. ` +
            `Add to StacksConfig (src/types/stacks.ts) or remove from JSON.`
        );
    }

That fails the test exactly as `expect` would, and tells the reader which file to
edit and where the type lives. An `expect(unknown).toEqual([])` would print a
bare array diff. Normalising these makes the failure messages WORSE.

**What is actually true:** two instruments misread the style, not the tests.
`theater` greps for `expect(` and so calls a throw-asserting suite empty —
`type-json-alignment-stacks-components.test.ts` is flagged and is not hollow. That
is a detector gap, and it is the whole of the finding.

**Recommendation:** drop "throw-style normalized" from phase 6, and teach the
`theater` detector that a `throw` inside a test body is a verification. One
genuinely hollow suite existed and has been fixed (`componentUpdater-envMigration`
→ `envMerge.test.ts`); after it, `theater` should read 0 rather than 1.

Third finding of the same shape in two days — after the construction-boundary
rule and `logicInTests`. The pattern is worth naming: **a metric that counts
SYNTAX will keep finding work that is not there.** All three measured what the
code looks like rather than what it does.

### logicInTests is not a defect metric — measured 2026-08-30

Phase 6 lists "the logicInTests 161 -> 164 regression" as work, and its criterion
is "flags at zero". Measured before touching it, and the criterion is wrong for
this flag.

**What it detects:** `/^\s*(for|while)\s*\(/m` — a suite containing a loop.
That is a syntax count, not a defect class.

**What the 167 flagged suites actually contain** (358 loops across the tree):

| Shape | Loops |
|---|---|
| iterate a collection (`for..of`) | 229 |
| counted repetition (`for i = 0; i < N`) | 36 |
| everything else | 93 |

**230 of the 358 contain an `expect()`** — they are assertion loops. Sampling ten
of the unclassified suites found: iterating a named case list
(`INTEGRATION_IDS`, `CONTENT_PATCHES`), walking a mock's recorded calls, asserting
over rendered tiles, driving six requests at a rate limiter, and a brace-matcher
in a source-reading contract test. Every one idiomatic. 18 more are SOP scans,
which walk a file list by nature and cannot not loop.

**So the number moving 161 -> 164 -> 167 is not a quality regression.** It tracks
how many suites contain a loop, and this repo writes table-driven tests. Driving
it to zero would mean rewriting 229 collection loops into repetition — worse
tests, for a number.

**What a real version would measure:** a test that RECOMPUTES its expected value
rather than stating it — `expect(out).toBe(input.map(f))` reimplementing the
subject, so the test agrees with the bug. That is the defect "logic in tests"
names. It is not the same as containing a loop, and it is not cheap to detect
statically.

**Recommendation:** drop `logicInTests` from phase 6's "flags at zero" criterion
and from the craft census, or redefine it as above. Left in place for now — the
census is an owner-facing instrument and retiring one of its columns is a
decision, not a cleanup. The other three flags (`theater` 2, `nondeterminism` 26,
`realWaits` 16) are unaffected and remain real.

Same shape as the construction-boundary finding a day earlier: a metric aimed at
syntax rather than at the property that matters.

### jscpd's self-clone count is not a duplication count — measured 2026-08-30

The fourth instance of the same shape, and the first one caught BEFORE the work
rather than after.

Lane A began as 15 reported self-clones. Twelve were genuine and were extracted;
each was verified by locating the block with jscpd, replacing it by exact string
match, and diffing the UNIQUE assertion set before and after (unchanged in every
case). Lane A's remaining three were queued as "the large ones, likely whole-test-body
duplication needing care" — 251, 178 and 344 reported lines.

They are not duplication at all. Three measurements, in order of decisiveness:

1. **The ranges OVERLAP.** ProjectCard's pair is lines 24–274 against 14–171 in one
   484-line file. A genuine copy-paste pair cannot overlap itself, and cannot have
   two spans of different length (250 vs 157).
2. **The fragment appears ONCE**, whitespace normalised away. The positive control —
   `PrerequisitesStep-installation` before its fix — reports 3.
3. **A synthetic control reproduces the signature with zero copy-paste present.** A
   generated file of 30 tests sharing one skeleton, with every name, id and string
   literal distinct, produces exactly one self-clone with overlapping ranges and
   mismatched spans. Nothing in that file can be extracted, because nothing repeats.

So the cause is not a jscpd bug and no threshold fixes it: a file of uniform tests has
a *periodic* token stream, and a long window matches the same stream shifted by about
one test block. This fires on well-written uniform test files by design.

**Consequence for the metric:** "self-clones in `tests/`" over-reports, and it
over-reports worst on the biggest files — exactly the ones that look most alarming and
cost most to investigate. The detection rule and its confirming test are now written
into `.claude/skills/code-duplication-scan/SKILL.md` so the next sweep skips this class
in arithmetic instead of in judgment.

**Lane A is therefore DONE at 12 of 15.** The residual 3 are unfixable by design and
should not be carried as debt.

### Lane C is a DIVERGENCE problem, not an extraction problem — measured 2026-08-30

Lane C was scoped as "20 ranked family extractions": split test families that never
pulled their shared `jest.mock` preamble into a `.testUtils`, fixed by extracting it.
That framing is wrong for almost all of them, and working it as planned would have
silently changed what the tests test.

**The duplication is real.** Unlike lane A, these are genuine cross-file clones: 140
pairs, ~5,486 duplicated lines, and 119 verified at ≥95% shared text present in BOTH
files. (The verifier needs that tolerance — jscpd's fragment boundary is token-aligned,
so the reported text overshoots the true match by a few characters. A strict
whole-fragment test reported 6 of 140 and was simply wrong; one pair read by hand is
what caught it.)

**But much of it is not mechanically extractable.** Grouping the clone-linked spec
files into families and comparing each file's SET of `jest.mock(...)` calls
(balanced-paren extracted, whitespace-normalised):

- 44 families with ≥2 clone-linked spec files
- **18** share an identical mock set — safe to extract (lane C1)
- **26** have DIVERGENT mock sets — need judgment per file (lane C2)

*Measurement note, because the first attempt was wrong and the difference matters.*
An earlier pass defined "preamble" as everything up to the first `import {` and
reported 4 safe / 40 divergent. That definition cuts each file at a different place —
several files import a type before their mocks — so it compared unequal text and
overstated divergence more than tenfold. The corrected method extracts every
`jest.mock(...)` call wherever it sits, and carries two controls: the normaliser must
match a file against itself, and must still separate two `installHandler` files known
to differ. Both pass. **18/26 is the number to plan against, not 4/40.**

`installHandler` is the worked example: 11 clone-linked spec files, **9 distinct
preambles**, all naming the same four mocked modules. The differences are semantic,
not cosmetic:

- 7 files partially mock `handlers/shared` via `requireActual`; 5 fully automock it.
  Those are different subjects under test — automock replaces every export with a
  `jest.fn()` returning undefined.
- three different sets of named function mocks (one group adds `getNodeVersionKeys`)
- the `debugLogger` module mock carries `trace` in 4 files and not in the other 7

Collapsing them onto one canonical preamble would hand real implementations to files
that deliberately automocked, or automocks to files that deliberately did not. Every
suite would still be green, because a mock answers the same whatever it is handed.

**What CAUSED it is written down in the family's own helper.** The docblock at the top
of `installHandler.testUtils.ts` instructs every consumer to paste the preamble at the
top of their file. The duplication was not an oversight; it was the documented
procedure. That instruction has also drifted from what the files actually do — it shows
a bare `jest.mock('.../shared')` where 7 files use a `requireActual` factory — which is
the "a comment describing another module is a claim, not documentation" rule, in the
place best positioned to mislead.

**Not investigated:** whether the `trace` gap is reachable. It is not, for these tests —
the only `getLogger()` caller in the feature is `prerequisitesCacheManager`, and these
suites mock `@/core/di`. Checked before claiming a hazard.

**Recommended re-plan.** Lane C splits in two:

- **C1 (mechanical, 18 families)** — identical mock sets; extract to `.testUtils` using
  the testUtils-owns-the-SUT-import pattern (§3 of `webview-test-authoring`; 59
  precedents in this repo). Largest first: `blockCollectionHelpers` (6 files),
  `daLiveContentOperations` (4), `AdobeAuthStep` (4), then eleven 2–3 file families.
  This is the lane that matches the original "family extractions" plan.
- **C2 (judgment, 26 families)** — decide per file which mocking strategy is correct,
  THEN extract. This is `test-divergence-scan` work wearing a duplication hat. Worst
  first: `installHandler` (11 files / 5 mock sets), `dashboardHandlers` (6/6),
  `edsResetService` (5/5), `ComponentRegistryManager` (8/2), `helixService` (4/2).
  Do not start C2 without making that decision deliberately, family by family.

### templateSyncService — stated 2026-08-29, before the work

529 lines, 18% covered, and it PUSHES TO THE USER'S LIVE GITHUB REPO. The reset
strategy loses local customisations by design; a small set of files
(`fstab.yaml`, `config.json`) is meant to survive both strategies via a
backup/restore pair. That pair is the whole safety net, and nothing asserts it.

1. **The preserved files survive BOTH strategies.** Backed up before, restored
   after, content identical — on merge and on reset. If this breaks, a reset
   destroys a site's config and pushes the result.
2. **A failure at any git step does NOT push.** Clone, fetch, merge, commit and
   push each have a failure branch; none of them may end with a push of partial
   state to a live repo.
3. **Conflicts surface rather than resolve silently** — the merge path detects
   conflicts and must report them, not commit through them.
4. Every remaining uncovered line is NAMED in the commit and is shell I/O or a
   log — not a decision.

Clause 4 is the one that does the work, same as last time: it forbids narrating
the leftover.

### projectDeletionService — stated 2026-08-29, before the work

> 1. Cancelling the delete is proven to delete NOTHING, on both confirmation
>    paths (the EDS cleanup dialog and the plain warning modal).
> 2. The retry in `deleteDirectoryWithRetry` is covered: it retries, and it gives
>    up rather than looping.
> 3. Every remaining uncovered line in the file is NAMED in the commit and is a
>    `vscode.window` call or filesystem I/O — not a decision.

Clause 3 is the one that does the work: it forbids narrating the leftover.

#### Result — checked against the criterion, not against the diff

**Clause 1: MET, and the criterion was WRONG about its own scope.** It said "both
confirmation paths". There are three, because `cleanupBehavior` has three values:
`ask` (the resource dialog), `localOnly` (the plain modal), and `deleteAll` (no
confirmation at all — it removes the GitHub repo and the DA.live site without
asking). All three are now pinned, `deleteAll` deliberately so: that test is what
stops silent-delete becoming true of the default. A fourth case was added on the
same reasoning — unticking a resource row is a quieter way of saying no than
cancelling, and honouring it is what keeps a repo the user declined to delete.

**Clause 2: MET.** Retries, gives up, refuses to retry a permanent error, and
keeps the underlying reason in the message.

**Clause 3: FAILED AS WRITTEN — and that is the whole reason it exists.** At 83%
the leftover was NOT all I/O: the EDS cloud-cleanup branch that decides *which*
remote resources get destroyed was uncovered, decisions included. Under the old
habit that number would have been reported with a sentence about the rest being
vscode calls. Instead the branch got tested. What remains uncovered now is
`if (!configDeleteResult.success)` — a debug log on a non-fatal config-cleanup
miss — plus progress-reporting and error-formatting lines.

**Evidence, since green tests are not evidence.** Twelve defects were planted in
the production file one at a time; every one was caught by a named test:
cancel-proceeds on all three confirmations, the two dialog cancel routes,
delete-all starting to prompt, never-retrying, retrying-forever, ignoring an
unticked GitHub row, ignoring an unticked DA.live row, dropping the DA.live skip
guard, and deleting each resource without auth.

**Two defects in the tests themselves, both caught by this process, neither by a
passing suite.** The first EDS fixture keyed off `componentSelections`, but
`isEdsProject` reads `componentInstances` — so the "EDS path" tests were
exercising the plain path and passing. A `CONTROL:` test now asserts the branch
is actually entered. The `ensureDaLiveAuth` mock invented `{ success, authService }`;
the real helper returns `{ authenticated }`, which silently skipped the DA.live
cleanup. Both are the shape the repo already has a rule about — a shape written
where the compiler cannot read it.

**One fix outside the file.** `createMockHandlerContext` cast `context` to
`{ extensionPath }`, so any handler reaching `globalState` (via `showOneTimeTip`)
died with a TypeError that reads like a bug in the code under test. It now gets
methods, for the same reason `stateManager` does — the note beside it says so.

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

**SHIPPED 2026-08-29** — see the status table. Note the scope below said
"props/context"; research found there is NO context in the frontend
(`createContext`: zero occurrences), so ADR-017 rules props and records why a
context would be symmetry for its own sake.

Tracked as **PL-17**. Scope: declare ADR-015's scope as the extension host,
write the frontend ADR (composition root = the bundle entries; dependencies
arrive as props/context; rehome the hook rule), and split the enforcement so a
frontend violation is not reported as an ADR-015 one.

Sequenced AFTER the construction-boundary work, because that work is what keeps
turning up the evidence for it.
