# The 1,957 `!important`s are compensating for our own layer wrapper

**Question, asked by the owner 2026-08-29:** *"Are we absolutely confident that
`!important` rules are necessary at all? Why should we have any?"*

**Answer: they are not necessary. They exist because we put our CSS in
`@layer theme` and Spectrum's CSS is unlayered — which makes our normal rules
LOSE to Spectrum's. `!important` is the workaround for a problem we created.**

Measured, not reasoned.

## The received wisdom, and why it looked true

`docs/development/ui-patterns.md` states:

> Applied styles use high specificity with `!important` to override React
> Spectrum defaults.

That is a true description of what works TODAY. It is not a true statement about
what is necessary, and the difference is 1,957 declarations.

## What the cascade actually does here

Spectrum's CSS declares **no layers**. Every `@layer` in a built bundle is ours
(`theme`, `overrides`, `reset` — counts match `src/` exactly).

CSS cascade rules:

- for NORMAL declarations, **unlayered beats layered**
- for `!important` declarations, the order **reverses** — layered beats unlayered

So wrapping our stylesheet in `@layer theme` put every one of our normal
declarations BELOW Spectrum's. The only way a layered rule can beat an unlayered
one is `!important`. Hence 1,957 of them.

The wrapper was added deliberately — `custom-spectrum.css` says "Wrapped in
@layer theme for cascade control". It achieved the opposite of its intent.

## Isolated proof

Four cases on a synthetic page: vendor rule unlayered and first; ours second.

| case | rules in play | winner |
|---|---|---|
| a | ours layered normal vs vendor unlayered normal | **vendor** |
| b | ours UNLAYERED normal vs vendor unlayered normal | **ours** |
| c | ours layered `!important` vs vendor normal | ours |
| d | ours layered `!important` vs ours unlayered `!important` | **layered** |

Case (a) is the disease. Case (b) is the cure — **no `!important` involved**.
Case (d) is why appending an override at the bottom of `custom-spectrum.css`
does nothing even when marked important.

## Proof in the real application

Two probe rules added to `custom-spectrum.css`, identical except for placement,
then applied to a real Spectrum Button in the running dashboard bundle:

    Spectrum's own padding-left            14px
    our LAYERED normal rule (wants 41px)   14px   <- lost
    our UNLAYERED normal rule (wants 42px) 42px   <- won, no !important

A plain, unlayered, single-class rule beats Spectrum. That is the whole
requirement, and it needs no `!important` at all.

## What this changes

**The `!important` policy can be written NOW**, not after an audit. The earlier
plan said the rule had to wait until the refactor measured which of the 1,957
were load-bearing. That framing assumed they were each an individual judgement.
They are not — they are one systemic workaround with one cause.

Revised: fix the cause, then the vast majority of them become removable
mechanically, each verified by the snapshot workflow (empty diff = it was cargo).

## Two ways to fix the cause

**Option A — stop layering our CSS.** Ours then wins on source order, since our
styles load after Spectrum's. Simplest, but it also flattens our own internal
precedence: `reset`, `theme` and `overrides` currently order our rules against
each other, and that would be lost.

**Option B — put Spectrum in a lower layer (RECOMMENDED).** Declare the order
explicitly and wrap vendor CSS:

    @layer vendor, reset, theme, overrides;

`cssInjectionPlugin` in `esbuild.config.js` already intercepts every `.css`
import and turns it into a style tag, so it can wrap `node_modules` CSS in
`@layer vendor` at build time — a few lines, one place. This keeps our internal
layering intact AND puts vendor below us, which is what layers are for.

Option B is the modern, intended use of cascade layers: vendor first, ours after,
no specificity war. It is what the `@layer theme` wrapper was reaching for.

**Not yet verified.** The plugin change is small and the mechanism is confirmed,
but the change itself has not been made or measured. Do it behind the snapshot
workflow: it will move baselines everywhere, and every move needs adjudicating —
this is the highest-risk change in the whole CSS programme precisely because it
flips precedence globally.

## Sequencing consequence

The refactor order in PL-21 phase 4 had `!important` reduction at step 4 and
layer normalisation at step 5, last, as the riskiest. That order is now wrong:
**the layer fix is a PREREQUISITE for the `!important` reduction**, not a
follow-on. Removing `!important`s while our rules are still layered would break
them, because without the `!important` a layered rule loses.

Corrected order: fix the layering first (highest risk, done under the snapshot
with full adjudication), then sweep the `!important`s mechanically.

## Caveat worth keeping

This does not mean zero `!important` forever. Some may still be needed for
genuinely stubborn cases — inline styles set by Spectrum's JS, for instance,
which no stylesheet rule can beat. The claim is narrower and stronger: **the
default reason given for using them here — "to override Spectrum" — is not a
reason**, and the count should collapse toward the handful that have a real
justification.
