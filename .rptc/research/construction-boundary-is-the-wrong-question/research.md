# The construction-boundary rule measures the wrong property

**Date:** 2026-08-29
**Question:** the ADR-015 construction queue reached 47 rows and the work on it kept
producing corrections rather than fixes. Is the rule that produced the queue the
right rule?

**Answer: no.** It asks *where did you construct this?* The two things that
actually cost us are *does rebuilding lose something?* and *does constructing it
here force tests to mock a module?* The rule is a proxy for both and measures
neither well — which is why working the queue kept surfacing rows that turned out
to be nothing.

## How the queue got to 47

The rule was implemented as "construct anywhere you may fetch, plus `*Deps`
files". ADR-015's text says the opposite: `create...Deps` builders "plus
`extension.ts`, are the only places that construct services". Tightening the
predicate to the document (2026-08-29) took the ledger from 31 rows to 55, later
47 after conversions and composition-point rulings.

That tightening was correct as a matter of matching law to enforcement. It was
also how we learned the law is aimed at the wrong thing.

## What the 47 rows actually are

Two properties measured per row: does the constructed class **accumulate state
after construction** (a field written outside the constructor, or a Map/Set/array
field mutated in a method), and how many test suites **module-mock** that class.

| Group | Rows | What it costs |
|---|---|---|
| **A** — builds a stateful class | **15** | real: rebuilding drops a cache or a session |
| **B** — stateless, module-mocked by 10+ suites | **13** | real but different: a testability wall, not a correctness bug |
| **C** — stateless, barely mocked | **19** | nothing |

Nineteen of forty-seven rows protect nothing at all.

## The rule that would have been right, validated against ground truth

**A class that accumulates state must come from one place. A stateless class may
be built where it is used.**

Checked against the three cases this repo learned the hard way, at cost:

| Case | Stateful rule says | What we found the hard way |
|---|---|---|
| `GitHubTokenService` | FLAG — holds `validationCache` | D-2: 13 files re-validated tokens against GitHub. Real. |
| `ComponentRegistryManager` | FLAG — holds `transformedRegistry` | Converted 2026-08-29; 18-suite wall. Real. |
| `HelixService` | do not flag — stateless | D-3 chased it for two rounds and it was a non-problem. |

Three for three, including the one where the current rule pointed us at a hazard
that had been fixed on 2026-08-15 and cost two wrong designs to rule out.

## Why the current rule mis-fired on HelixService specifically

`HelixService` appears in 13 rows — the single largest cluster in the queue — and
is stateless. Its credentials arrive at construction and are never mutated. The
"missing credential" hazard D-3 built its case on does not exist in production:
`extension.ts` registers one DA.live token source at activation (`cbcb927db`,
the day of the incident) and every instance falls back to it.

So the biggest cluster in the queue was the one with the least to fix, and the
rule had no way to say so.

## What the mock-wall group (B) really is

Group B is a genuine cost, but it belongs to ADR-016 (test strategy), not
ADR-015. "Constructing this inline forces 26 suites to module-mock it" is a
statement about test design. Filing it under a dependency-architecture rule
conflates two goals and makes both harder to reason about — which is exactly what
happened here.

## Recommendation

1. **Re-aim the ADR-015 check at state.** Flag construction of a class that
   accumulates state outside `extension.ts`, a `create...Deps` builder, or a
   documented cache (`edsServiceCache`). Detector is mechanical: a field written
   outside the constructor, or a container field mutated in a method. Both
   conditions are needed — a `this.x =` scan alone misses
   `PrerequisitesCacheManager`, which mutates a Map it never reassigns.
2. **Move the mock-wall concern to ADR-016** as its own measure, with its own
   ledger, ranked by suite count. It is real; it is not this rule's job.
3. **Close group C — 19 rows.** They protect nothing, and every one of them is an
   invitation to spend a session proving that.

Remaining real work under the re-aimed rule: **15 rows, 5 distinct classes**, and
6 of the 15 are `GitHubTokenService` in services that hold only `secrets` — the
"hand it in" case D-2 already named.

## What this episode cost, and the cheap check that would have prevented it

Three traces of `HelixService`, two wrong. A regex over method bodies missed a
private hop; the corrected trace never asked whether the hazard still existed. It
had been fixed thirteen days before the decision that proposed fixing it.

`git log -S` on the credential was one command and settled what two rounds of
tracing did not. **Before designing a fix for an incident, read the incident's
fix.**
