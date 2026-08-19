# Two EDS services sit over the god-file threshold

**Filed:** 2026-08-15, from the `fix/leah-128-bugs` release prep.
**Severity:** low — a project guideline, not a gate. `eslint` does not flag these
and CI does not fail on them.

## The two files

Project CLAUDE.md sets the services threshold at **400 lines**. Both of these
were already over it before the branch that filed this item:

| File | at `develop` | after the branch | net |
|---|---|---|---|
| `src/features/eds/services/configurationService.ts` | 444 | 532 | +88 |
| `src/features/eds/services/edsResetService.ts` | 430 | 463 | +33 |

The branch's own additions were extracted back out before shipping, and the
extractions are the model for the rest:

- `siteGrantPreservation.ts` (109) — capture/restore of admin grants across the
  delete-and-re-register cycle, out of `configurationService`.
- `edsResetConfigStep.ts` (165) — reset steps 6-7, out of `edsResetService`.
- `siteConfigRegistrar.ts` (238) — the 409/401/403 registration protocol, out of
  `configServiceRegistration`.

Each was behaviour-preserving and proved it the same way: the existing suites
passed **untouched** (238 and 195 tests respectively). Any further split should
clear the same bar — if a test has to change, the extraction changed behaviour.

## Explicitly NOT in scope: `configServiceAccess.ts`

493 lines, and new on that branch, so it looks like the obvious third candidate.
It is not. Measured 2026-08-15: **207 of those lines are comments**, leaving ~286
of code, and its exports are one coherent contract — read the org roster, read
site access, probe, grant, revoke, restore, build the Code Sync setup link. The
`decompose-god-file` skill is for MULTI-RESPONSIBILITY files; this one fails that
test, and splitting it would scatter a single API across modules to satisfy a
line count that is mostly the documentation worth keeping.

Do not "fix" it without first re-checking the comment ratio and the export list.

## Why it was deferred rather than done

The branch that filed this ran a five-iteration verify loop, and three of those
iterations found regressions introduced by the previous iteration's fixes —
including one that aborted a half-completed reset after the repo had already been
wiped, and one that silently switched off three recovery paths. A structural
refactor with no user-visible benefit, at the end of that, on code that had just
been verified live, was the wrong bet.

## When to pick it up

At a release cut, via `codebase-sweep` — which is when that skill is designed to
run, and which will re-measure rather than trusting the numbers above.

## Kickoff prompt

> Read `.rptc/backlog/eds-services-over-size-threshold.md`. Re-measure both files
> first (they may have moved). Split `configurationService.ts` and
> `edsResetService.ts` along responsibility lines using `decompose-god-file`,
> following `siteGrantPreservation.ts` and `edsResetConfigStep.ts` as the model.
> The bar is that the existing suites pass UNTOUCHED — a test that has to change
> means the extraction changed behaviour. Leave `configServiceAccess.ts` alone
> unless its comment ratio and export list say otherwise; the item explains why.

## Also over threshold, measured 2026-08-19

`edsPipeline.ts` is **839 lines** — more than either service this item was filed
for — and `executeEdsPipeline` carries a **cyclomatic complexity of 27** against a
limit of 25, which eslint reports as a warning on every touch. Verified
pre-existing: 27 both before and after an unrelated edit that day, with only the
line number moving.

Named here rather than fixed in passing: absorbing an unrelated decomposition into
a bug fix is how a small change becomes unreviewable. It belongs to this item.
