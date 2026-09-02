# Mutation testing: what's in scope, what the targets are, and how we get there

**Status: PROPOSED.** The categorization is measured and controlled. The thresholds and
the plan need your ratification — nothing below is enforced yet.

Three questions, in order: which files are in this exercise, what score should each kind
of file reach and why, and how we get from 16 measured files to all of them.

---

## 1. The canonical set

**Decided by rules, not by a list.** `scripts/mutationScope.mjs` re-reads every file and
re-decides on each run. Every hand-maintained list in this repo has rotted — the backlog
index, the tool catalog, the convention index — so this one is generated, with a ledger
(`scripts/mutation-scope.ledger.json`) for the judgement calls rules cannot make.

859 source files, excluding ambient declarations.

### INCLUDE — 507 files, 68,017 code lines

Has decisions in it and a suite that can be re-run. Split by how much async it carries,
which is what decides the realistic target (see §2):

| Tier | Files | Code lines | Share of the weight |
|---|---|---|---|
| **pure** — no `await` at all | 191 | 14,611 | 21% |
| **mixed** — some async, thin | 99 | 15,038 | 22% |
| **orchestration** — async-heavy | 217 | 38,368 | **56%** |

More than half the code we would measure is the hardest kind to measure well. That is the
single most important number in this document.

### BLOCKED — 305 files

In scope in principle; cannot be measured today. Not excluded — "we have not got to it"
is a plan, not a category.

| Why | Files | What it needs |
|---|---|---|
| React (`.tsx`) | 115 | The focused runner uses the node Jest project; React tests need the react one. A tooling gap, and it hides `WizardContainer.tsx`, a Key File. |
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

### The cadence problem, and the fix

The existing instruments run "at release cuts". **We have not cut a release in two and a
half weeks**, so in practice that means never. Everything below is time- or change-based.

| When | What | Cost |
|---|---|---|
| **Every change** | Focused run on the modules the diff touches; the ratchet must hold | 1–3 min per module |
| **Weekly (cron)** | Sweep the whole pinned set | Long; unattended |
| **Once** | Baseline every included module | Hours; unattended |

The per-change gate is the one that matters and it is newly affordable: the focused runner
does one module in 1–3 minutes, so a PR touching two modules costs minutes, not hours. That
is a real gate on new work rather than a periodic audit that arrives after the fact.

### Steps

1. **Baseline the included set.** One long unattended run, pin every module at whatever it
   scores. Everything else is guesswork until this exists — which is exactly the mistake
   the last measurement found. *Estimate the cost on a 20-module slice first rather than
   guessing at the whole.*
2. **Add `--changed` to the focus switcher** so a change measures its own modules in one
   command, then wire it into the pre-push gate.
3. **Weekly sweep on a timer**, not on a release.
4. **Fix the React gap** — 115 files, a fifth of the codebase, otherwise invisible
   permanently.
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
