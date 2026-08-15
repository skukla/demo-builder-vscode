# Step 02 — Rebase EDS `citisignal` onto the B2B base → hybrid (GATED)

**Goal:** Make the EDS `citisignal` package hybrid by basing it on `boilerplate-b2b-template`
(like `citisignal-b2b`) and branding via the CitiSignal overlay — so a company customer sees B2B
and an individual sees B2C, on the one CitiSignal site.

## ⛔ Gate — do NOT start until live verification passes

From the research verification plan (egress-blocked here; needs a live B2B storefront):
1. Individual (non-company) customer login → B2B nav items **hide**, **especially the `all`-tagged
   B2B rows** (Requisition Lists, Company Profile, Company Credit, Quotes). The single most
   important check — if these leak to individuals, hybrid is not clean and this step changes shape.
2. Company customer login → B2B sections render + function.
3. B2C parity: the b2b base with no company behaves like today's `citisignal` for an individual (no
   regressions).

If any of 1–3 fail, pause and revisit (may need an upstream fix or a content/permission adjustment)
before rebasing.

## Folded in (PM Option D): citisignal-b2b account chrome

This step now also owns getting the **B2B account chrome into `citisignal-b2b`** (and any
canonical-boilerplate brand on the B2B base). Rather than a tactical per-package
`accountContentSource` override in Tier 1, the convergence content model is: **a hybrid package's
account pages (`/customer/account`, `/customer/nav`, login, create-account) are sourced from the
canonical B2B content site (`adobe-commerce/boilerplate-b2b`), while brand/catalog content comes
from the brand site.** Implement as a small overlay pass (copy `/customer/*` from the B2B content
site after the brand-content copy; reference-following then pulls `/customer/nav` for free) — same
mechanism, applied uniformly to every hybrid package instead of special-casing one. So
`citisignal-b2b`'s missing B2B account menu is fixed as a side effect of the convergence, not a
bespoke patch.

## Approach (once gate passes)

Mirror `citisignal-b2b` exactly — it already proves "b2b base + CitiSignal overlay" works:
- `demo-packages.json`: point `citisignal` EDS storefront `source`/`templateRepo`/`contentSource`
  + `codePatches`/`codePatchSource` at the b2b base + the `citisignal-b2b` ledger (or a shared
  base), keeping CitiSignal `configDefaults`, block library, and content overlay.
- Rely on Tier 1 (`content-copy-completeness`) for the account `/customer/nav` acquisition — the
  rebased `citisignal` gets the hybrid account menu for free via the same discovery/override.
- Decide: does `citisignal` *replace* its current non-b2b base, or do we keep both a B2C-only and a
  hybrid variant? (Likely replace, since the b2b base degrades to B2C — confirm via gate check 3.)

## Test-first (RED)

- Update package/storefront count + id assertions (the `citisignal-b2b` add did this: 5→6, 10→12).
- Assert the rebased `citisignal` resolves to the b2b base + CitiSignal overlay and that the
  account-content acquisition (Tier 1) applies.

## Files

- `src/features/project-creation/config/demo-packages.json` (+ block-libraries.json if native map
  changes), package-count tests.

## Acceptance

- New `citisignal` EDS project is hybrid: company users see B2B account features, individuals see
  B2C; CitiSignal branding intact; no B2C regressions (live-verified).

## Notes

- This step is intentionally last and gated — it's a base swap for a flagship package; the live
  login-UX evidence is the go/no-go.
- Custom-base packages (`buildright`, `isle5`, headless) remain out of scope per the PM decision.
