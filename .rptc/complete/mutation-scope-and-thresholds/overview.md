# Mutation testing: what's in scope, what the targets are, and how we get there

**Status: RATIFIED 2026-09-03** (owner), in this shape and no other:

1. **The tiers** — pure / mixed / orchestration, assigned mechanically by `tierOf()` in
   `scripts/mutationScope.mjs` from async density. Ratified as measured: the order holds
   across all 610 modules.
2. **The floors** — 90 / 80 / 70 — are **targets**: what a properly worked module of that
   tier should reach. They are not a pass/fail gate, and no enforcer compares a score
   to them. Fitted to sixteen well-tested modules, they sit above the real medians
   (79.6 / 65.5 / 63.4) and disagree with "done" on 126 of 610.
3. **The gate is `openGaps`** — a module is finished when its open-gap count is zero:
   every surviving or uncovered behavioural mutant either killed or recorded in
   `scripts/mutation-equivalents.ledger.json` with a reason. Recorded per row in
   `reports/mutation/baseline.json`.
4. **The per-change ratchet is unchanged** — score may not fall, behavioural survivors
   may not rise while the score rises, uncovered may not rise. It gates on those, never
   on `openGaps`, so a ledger entry can never be what makes a run pass.

The categorization below was measured and controlled; §2's sixteen-module table is kept
as the record of how the targets were first fitted, with the 610-module re-read beneath
it.

Three questions, in order: which files are in this exercise, what score should each kind
of file reach and why, and how we get from 16 measured files to all of them.

---

## 1. The canonical set

**Decided by rules, not by a list.** `scripts/mutationScope.mjs` re-reads every file and
re-decides on each run. Every hand-maintained list in this repo has rotted — the backlog
index, the tool catalog, the convention index — so this one is generated, with a ledger
(`scripts/mutation-scope.ledger.json`) for the judgement calls rules cannot make.

859 source files, excluding ambient declarations.

### INCLUDE — 622 files

> **Updated 2026-09-03.** Was 507. The React gap in the table below is CLOSED — the
> focused runner now picks its jest project from the module's own suites — so the 115
> `.tsx` files and 41 `.ts` files whose suites are React suites moved from BLOCKED into
> here. Tier split and code-line total below predate that move.

Has decisions in it and a suite that can be re-run. Split by how much async it carries,
which is what decides the realistic target (see §2):

| Tier | Files | Code lines | Share of the weight |
|---|---|---|---|
| **pure** — no `await` at all | 191 | 14,611 | 21% |
| **mixed** — some async, thin | 99 | 15,038 | 22% |
| **orchestration** — async-heavy | 217 | 38,368 | **56%** |

More than half the code we would measure is the hardest kind to measure well. That is the
single most important number in this document.

### BLOCKED — 190 files

In scope in principle; cannot be measured today. Not excluded — "we have not got to it"
is a plan, not a category.

| Why | Files | What it needs |
|---|---|---|
| ~~React (`.tsx`)~~ | ~~115~~ | **CLOSED 2026-09-03.** `focusModule.mjs` picks the jest project from the suites rather than always using the node one, and runs a module with suites in both environments under jsdom. Verified: `useSelection.ts` 90.00%, `BrandGallery.tsx` 27.59%, zero errors. A further 41 `.ts` files whose suites are all React suites were blocked by the same gap and were never counted in this table. |
| No suite of its own, but other tests mention it | 118 | A look each. Some are genuinely covered through their callers; some are not. |
| No tests at all — nothing in the suite mentions it | 72 | Tests, before mutation can say anything. This is a coverage question, not a mutation one. |

### EXCLUDE — 47 files

Nothing a mutation could meaningfully change: 32 type-only declarations, 10 constant
tables, 5 barrels. Deliberately narrow — the temptation is to exclude anything awkward,
and that is how a coverage number stops meaning anything.

### Where we are

16 modules pinned. That is **3.2% of the included set**, and it is the number I would
track rather than any average score.

### How the census is checked

Two controls, both run:

- All 16 already-measured modules must classify as `include`. They do.
- The exclusions were read by hand — they really are type declarations.

The first control caught a real bug: the census originally used the strict path mirror and
reported 232 files as untested, including `spectrumTokens.ts`, which has a suite and a
pinned mutation score. The tests do not mirror `src` — everything under `src/core/ui` is
tested from `tests/webview-ui/shared`, and dozens of handlers are tested from a sibling
feature's folder.

**Read the blocked buckets with that in mind.** "No suite names it" is a strong signal, not
proof: `meshStatusDisplay.ts` has no same-named suite and is referenced by four, because it
is exercised through the components that use it.

---

## 2. Thresholds, and why they differ

**One number cannot fit.** Across the 16 measured modules, score correlates with async
density at **r = −0.72**.

| Tier | Observed (n) | Median | Proposed floor |
|---|---|---|---|
| pure | 77.8 · 91.9 · 94.4 · 100 · 100 (5) | 94.4% | **90%** |
| mixed | 69.2 · 84.5 (2) | 76.9% | **80%** |
| orchestration | 43.8 · 46.3 · 51.4 · 66.9 · 71.2 · 82.6 · 83.3 · 95.7 (8) | 69.0% | **70%** |

> **Re-read at 610 modules, 2026-09-03.** The rows above were fitted to sixteen
> deliberately chosen, already-worked modules. The full measurable set looks different:
>
> | Tier | n | Median | 25th–75th | Pass the proposed floor |
> |---|---|---|---|---|
> | pure | 286 | 79.6% | 58.7–93.0 | 34% |
> | mixed | 109 | 65.5% | 52.2–77.5 | 21% |
> | orchestration | 215 | 63.4% | 44.1–73.5 | 32% |
>
> The tier ORDER holds — pure above mixed above orchestration, as the async argument
> predicts — so the model is right. The floors sit far above where the code actually
> is, and they still answer the wrong question: across 610 modules the floor verdict and
> "zero open gaps" disagree on 126. Ratify the tiers; treat the floors as targets;
> gate on `openGaps`. Detail and per-area figures in [[PL-22]].

### Why the gap is structural, not effort

A pure function maps inputs to outputs; almost every mutation changes an output, so almost
every mutant is killable.

Async orchestration runs against mocked collaborators, and **a mock cannot see a malformed
call** — it answers the same however it is invoked. So a mutant in *how* a collaborator is
called survives unless the test asserts the ARGUMENTS. That is not a style preference here:
four production defects hid behind exactly that gap, and twelve tests stayed green across
all four.

The second cause is deliberate error handling. `updateManager` funnels 404, 403, 5xx and
everything else into one swallowed log line and reports "no update available" — by design,
so a transient GitHub blip does not alarm anyone. All four branches produce an identical
outcome, so 17 of its misses can only be killed by asserting log text, which the ratchet
exists to refuse to reward.

### Three caveats, stated rather than buried

1. **`mixed` rests on two data points.** Treat 80% as provisional until more of that tier
   is measured. `pure` and `orchestration` are better grounded.
2. **A third of included files are under 60 code lines.** Few mutants means one survivor
   swings the score a long way — `mcpSocketPath.ts` is 51 lines and scores 77.8% on a
   handful of mutants. Below that size the number is coarse and the survivor list is the
   better read.
3. **High async makes a good score harder, not impossible.** `commerceCredentialStore.ts`
   is orchestration-tier and scores 95.7%. The floor is a floor, not an excuse.

### What "done" actually means

**Not the threshold, and not zero survivors.** A module is finished when every remaining
survivor is either recorded as equivalent with evidence, or is wording-only.

`siteTools.ts` sits at 69.2% with one survivor left and is complete. `updateManager.ts` at
51.4% has 17 misses that are one log line. A file at 69% can be done and a file at 85% can
be neglected — the score alone does not say which.

The threshold is what you expect to reach when a module is worked properly. The survivor
triage is what says you are finished.

### A higher bar for new code

Retrofitting tests onto async code is expensive; writing it testably is not. New modules
should land at their tier's floor on first measurement, rather than being added at
whatever they score and ratcheted later.

---

## 3. The plan

### Cadence: different while we burn it down, different once we have

This was the confusing part of the first draft, so it is stated as two phases.

**While the burn-down runs — measure as we work.** Not at release cuts: no release has been
cut in two and a half weeks, so anything hung on one would run never, and the burn-down
needs feedback in minutes rather than at some future tag.

| When | What | Cost |
|---|---|---|
| **Every change** | Focused run on the modules the diff touches; the ratchet must hold | 1–3 min per module |
| **Weekly (cron)** | Sweep the pinned set | Long; unattended |
| **Once, up front** | Baseline every included module | Hours; unattended |

The per-change gate is the one that matters and it is newly affordable: the focused runner
does one module in 1–3 minutes, so a change touching two modules costs minutes.

**Once every included module is measured and ratcheted — release cuts are the right
cadence**, and [[PL-22]] closes. At that point the ratchet is doing the work continuously
and the periodic sweep is a check on the instrument rather than on the code: it catches a
module that stopped being measured, not a module that got worse. Release cuts are exactly
the right rhythm for that, and the burn-down phase is what earns the right to slow down.

### Steps

1. **Baseline the included set.** One long unattended run, pin every module at whatever it
   scores. Everything else is guesswork until this exists — which is exactly the mistake
   the last measurement found. *Estimate the cost on a 20-module slice first rather than
   guessing at the whole.*
2. **Add `--changed` to the focus switcher** so a change measures its own modules in one
   command, then wire it into the pre-push gate.
3. **Weekly sweep on a timer**, not on a release.
4. ~~**Fix the React gap**~~ — **DONE 2026-09-03.** It was 156 files, not 115: the 115
   `.tsx` sources plus 41 `.ts` sources whose suites are React suites, which no count had
   ever included. Stryker's jest runner ignores a `projects` array — it collapses to one
   environment and every React suite dies on `document is not defined` — so a module with
   suites in both runs under jsdom, which is a superset.
5. **Triage the 72 files nothing tests.** A coverage question, answered first by deciding
   which of them matter.
6. **Work the queue by consequence, not by score** — what breaks a consultant's existing
   work: updates and rollback, auth, project state. That ordering comes from the finding
   that importance-selected files scored about half what the convenience-selected sample
   did.

### What is deliberately NOT proposed

- **A global average.** It would be dominated by the 191 pure files, which score well for
  free, and would hide the 217 orchestration files that are 56% of the code.
- **Mutation testing on every PR for the whole set.** Hours per run. The per-change
  focused gate gets most of the value for minutes.
- **A hard CI gate on the thresholds.** The ratchet (shrink-only per module) is the gate.
  Thresholds are targets; a module can be complete below its threshold, and blocking on a
  number is what makes people assert log strings.
