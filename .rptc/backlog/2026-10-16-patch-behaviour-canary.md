---
id: EDS-49
kind: feature
area: eds
needs: [EDS-48]
value: high
status: backlog
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

## Proposal

A **canary storefront**: one dedicated scratch project, never used for a demo, reset onto
each new patches release and walked by script.

1. **Trigger:** when `npm run patches:released` sees a release the canary has not run on
   yet, plus monthly as a floor. Runs on the owner's machine (the reset needs the
   extension and its sign-ins), so it rides the unattended loop or the sweep.
2. **Rebuild:** `reset_project` on the canary (the agent surface, same path an SC's Reset
   takes).
3. **Read the served code:** each patch's replacement text is in the file the live site
   serves, and Adobe's unpatched copy lacks it (the 2026-10-16 audit's check, with its
   control). Note the CDN serves gzip; decompress before searching.
4. **Walk behaviour in a browser**, one check per patch:
   - header renders with its tools section (header-nav-tools-defensive);
   - signed in as a canary shopper, the account page lays out menu-left (body.columns,
     --column-width set) and the sidebar lists its items (account-page-column-layout,
     commerce-account-sidebar-selector-race); needs a test shopper on the canary's store,
     credentials in SecretStorage, never in the repo;
   - a product whose SKU contains "/" shows its image (aem-assets-sku-sanitization);
   - a published PDP whose product was deleted lands on the 404 page
     (pdp-empty-data-redirect);
   - product-teaser link and image on a CitiSignal canary, if one is kept.
5. **Report** in plain words per patch: works / broken / could not check, and fail loudly.

## What it unlocks

With a canary that passes, a patch rewritten after Adobe broke its fit (by hand, or drafted
automatically) could be merged without the owner reading it: PR fits (the gate's PR check)
AND the canary passes on it. That is the owner's question of 2026-10-16, "can the broken
patch case be automated further?"

## Open questions

- A dedicated Commerce store for the canary, or the scratch store the walk uses?
- Where the canary shopper's credentials live and how they are created.
