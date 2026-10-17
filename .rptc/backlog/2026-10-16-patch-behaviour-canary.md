---
id: EDS-49
kind: feature
area: eds
needs: [EDS-48]
value: high
status: active
---

# A storefront canary: check that the patched boilerplate still WORKS, not just that patches fit

Filed 2026-10-16, owner-requested ("yes" to a periodic behaviour check).

## The gap

The daily drift gate in `skukla/eds-demo-patches` checks that every patch still FITS
Adobe's new code (its exact target text is still there). It cannot see a patch that fits
but no longer does its job, or an Adobe change that breaks a storefront around a patch.
Since EDS-48 the gate publishes releases by itself, so such a break would now reach SCs
the day after Adobe ships it, with nothing between. The 2026-10-16 audit (every patch read
against Adobe's diff, a storefront rebuilt on the new boilerplate, each patch confirmed in
the served code) is the check this item automates.

High value because it is what makes the next step safe: merging a rewritten patch
automatically (see "What it unlocks").

## How it works (built 2026-10-17)

The first proposal ran on the owner's machine (a `reset_project` per release, a test
shopper for the account pages). What was built runs entirely in GitHub Actions, in
`skukla/eds-demo-patches` (`canary.yml`; its README's "The patch canary" section is the
operating manual):

1. **Trigger:** after each green drift-gate run, daily at 09:47 UTC, and by hand.
2. **Update (step B):** the canary storefront `skukla/patch-canary-b2b` (starter package,
   eds-accs stack, CitiSignal B2B store) is brought to the current tested version by the
   extension's OWN update code, the same `TemplateSyncService` merge an SC's Check for
   Updates runs, built from this repo as `dist/canary-update.js`
   (`npm run build:canary-update`, `src/features/updates/canary/`). The version it last
   matched is kept in the patches repo at `canary/b2b.last-synced`. After a push, the run
   waits until the live site serves the pushed code (`scripts/canary-wait-for-code.mjs`).
3. **Check (step A):** `scripts/canary-check.mjs` checks each B2B patch by behaviour in a
   browser, and that its replacement text is in the served file:
   - the header renders when the menu arrives without its tools section
     (header-nav-tools-defensive);
   - an image for a SKU with "/" is named with the slash replaced (aem-assets-sku-sanitization);
   - a published product page whose SKU does not exist lands on the 404 page, with a real
     product page as the control (pdp-empty-data-redirect).
4. **Check the checks:** the same run with Adobe's unpatched files served in place of the
   live ones must fail every check.
5. **Report** per patch: works / broken / could not check; anything but "works" fails the run.

The account-page checks were never needed: the canary showed both account patches act on
no shipped storefront, and they were removed (`d68880054`, ADR-006 amendment 2026-10-17).
So there is no test shopper, and nothing in SecretStorage.

**What it needs, and when it breaks:**

- secret `CANARY_REPO_TOKEN` on the patches repo: a fine-grained token, Contents read and
  write on `skukla/patch-canary-b2b` only, one year. When it expires the update step fails
  with 401 until a new one is saved;
- variable `EXTENSION_REF` on the patches repo: the extension branch the update code is
  built from. Set to `loop/2026-10-05-release-candidate` because the command exists only
  there; **switch it to `master` when that release merges** (`cut-release` step 4 says so).

## Still open

- **No real update observed yet.** The first run (39003260461) found the canary already at
  the tested version and correctly did nothing. The proof is the first run after the gate
  publishes a newer version: a commit "the canary now matches ..." in the patches repo, and
  green checks after it.

## What it unlocks

With a canary that passes, a patch rewritten after Adobe broke its fit (by hand, or drafted
automatically) could be merged without the owner reading it: PR fits (the gate's PR check)
AND the canary passes on it. That is the owner's question of 2026-10-16, "can the broken
patch case be automated further?" Not built: the canary runs on main after the gate,
not on a patch PR yet.

## Shipped so far

- 2026-10-17  Step A live in skukla/eds-demo-patches (2ff6b1b, 20ef37d): canary.yml checks the three B2B patches by behaviour on patch-canary-b2b after each green gate run and daily, and its self-test proves every check fails with its patch removed. The canary's first runs found two patches that never act on a shipped storefront (sidebar selector race, account column layout); both removed from the ledgers and packages, with the two product-link ids ADR-024 had already removed. Step B (bring the canary to each new tested version inside GitHub) not started.
- 2026-10-17  fix(eds): drop four code patches no shipped storefront runs (`d68880054`)
- 2026-10-17  feat(updates): the patch canary takes updates through the extension's own update code (`b15496d54`)
- 2026-10-17  docs(backlog): record the canary's progress and the proven write with the SC's sign-in (`00a3b2810`)
- 2026-10-17  Step B live: canary.yml (eds-demo-patches 4ed6389) runs the extension's update code (b15496d54) before the checks; first run 39003260461 green, nothing to update (canary already at 48bed04)
