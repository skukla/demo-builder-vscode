# Ask to reset only when there is something to lose

> ## ✅ SHIPPED — archived 2026-08-13
>
> The **"UI wiring outstanding"** status below is stale; the wiring landed. Found on
> 2026-08-13 during a validation pass, verified against source.
>
> The three-state model is live as a four-kind classifier in
> `src/features/eds/services/repoStorefrontReadiness.ts`:
>
> | Kind | Behaviour | Where |
> |---|---|---|
> | `empty` | auto-reset, nothing to lose | `shouldAskBeforeReset()` |
> | `storefront` | normal path, no prompt | `computeRepoValid()` returns true |
> | `not-a-storefront` | **refuses** — `resetToTemplate` is required, not offered | `computeRepoValid()` returns `resetToTemplate === true` |
> | `undetermined` | does not block over a GitHub blip — withholds the destructive default, not the user's ability to continue | `computeRepoValid()` |
>
> The refusal branch carries the reasoning this item argued for: *"A populated repo that is
> not a storefront cannot complete setup: the steps that need scripts/scripts.js and
> scripts/delayed.js skip themselves, and the run still reports Complete. Reset is the remedy,
> so it is required rather than offered."*

**Filed:** 2026-07-29
**Origin:** Design question during the beta.122 test pass — why must the user tick
"Reset to template" for a repo that is empty, when there is nothing to preserve?
**Status:** In progress — classifier landed on `develop`; UI wiring outstanding.
**Severity:** Medium — the default path produces a storefront that cannot work, and
says `Complete`.
**Present in:** `v1.0.0-beta.121`. Not a hotfix regression.

## Provenance

Live run 2026-07-29 12:53, existing repo `skukla/demo-builder-test`, reset unticked:

    [Inspector Tagging] scripts/delayed.js not found — skipping loader snippet
    [PDP404]            scripts/delayed.js not found — skipping smart 404 install
    [QuickEdit]         scripts/scripts.js not found — skipping Quick Edit scripts wiring
    [Storefront Setup]  Complete: https://github.com/skukla/demo-builder-test

`scripts/scripts.js` is the core EDS storefront script. Three subsystems opted out,
and setup reported success.

## Current behavior (verified)

| Path | Pin + canonical patches | Gate |
|---|---|---|
| New repo, created in Phase 1 | **always** | none — `storefrontSetupPhase1.ts:253` |
| New repo, pre-created by the wizard button | **always** | none — `storefrontSetupPhase1.ts:59` |
| Existing repo | only on reset | `if (edsConfig.resetToTemplate)` in `executePhaseExistingRepo` |

Both new-repo branches already do this unconditionally under ADR-006 Step 4b, whose
comment states the stakes plainly: `generate-from-template` lands at canonical HEAD,
so without the follow-up pin the canonical-phase patches
(`product-link-sku-encoding`, `product-link-sku-slash-encoding`,
`aem-assets-sku-sanitization`) "silently do NOT apply."

So the new-repo case needs nothing. Only the existing-repo path asks.

## The principle

The toggle exists to obtain consent for a **destructive** action. An empty repo has
nothing to destroy. Requiring consent there asks the user to authorize a risk that
does not exist, while the cost of declining is a storefront missing its template,
its LKG pin, and its canonical patches.

Consent should be requested exactly when the answer could destroy something.

## Path corrections (2026-07-29)

Written against the beta.122 line. On `develop` the repo-selection UI has moved:
`GitHubRepoSelectionStep.tsx` is now `RepoSelectionInline.tsx` (504 lines) plus
`repoSelectionInline.helpers.tsx` (409). The `resetToTemplate` mechanism is
unchanged — `RepoSelectionInline.tsx:224` still flips it from one checkbox.

## Progress

`repoStorefrontReadiness.ts` implements the classification: empty / storefront /
not-a-storefront / **undetermined**, plus `shouldAskBeforeReset`. The fourth
state is load-bearing — an unreachable GitHub read as `empty` would authorize a
destructive reset on a repo we could not see.

Remaining: wire it into `RepoSelectionInline`, replacing the single checkbox
with the three states, and add the backend handler that runs the classifier.

## Goal / scope

Three states at repo selection, replacing one checkbox that defaults to off:

1. **Empty repo** → set up from template automatically. State it, don't ask:
   *"This repository is empty and will be set up from the template."* Detect via the
   contents 409 (`Git Repository is empty`) or `size: 0`.
2. **Populated, but not an EDS storefront** → refuse to proceed. Missing canonical
   files (`scripts/scripts.js`, `scripts/delayed.js`, `head.html`) is a failed
   precondition, not a warning to skip past. Offer reset as the remedy.
3. **Populated storefront** → keep the checkbox, keep the warning. This is the only
   case where the user has something to lose.

State 2 is the larger half and the more common one: `demo-builder-test` was not
empty — it had 53 blocks — it simply lacked `scripts/scripts.js`. Emptiness
detection alone would not have caught the run that prompted this item.

## Constraints

- Do not auto-reset a populated repo under any circumstance, however unlike a
  storefront it looks. Destructive-by-inference is worse than the current bug.
- The canonical-file check must be cheap enough for repo selection (a few contents
  HEADs), not a clone.
- Preserve the existing explicit-reset path unchanged for state 3.

## Related

Same family as the selection-time App check
(`.rptc/research/github-app-installation-visibility/research.md`): both move a
discoverable precondition from mid-pipeline, after the extension has written to the
user's repo, back to selection where the fix is free. Worth building together.

Also related: [2026-07-29-code-patches-not-rehydrated-in-edit-mode.md](2026-07-29-code-patches-not-rehydrated-in-edit-mode.md)
and [2026-07-29-pdp404-stale-sha-conflict.md](2026-07-29-pdp404-stale-sha-conflict.md)
— the third and fourth ways a storefront reaches `Complete` without working PDPs.

## Kickoff prompt

> Read `.rptc/complete/2026-07-29-reset-consent-only-when-there-is-something-to-lose.md`.
> Implement the three-state repo-selection behavior: auto-setup when empty, refuse
> when populated-but-not-a-storefront, prompt only when there is something to lose. TDD.
