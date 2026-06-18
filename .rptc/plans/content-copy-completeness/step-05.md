# Step 05 — Per-package create+audit smoke (Layer 4) · the regression net

**Goal:** An automated check, per demo package, that asserts the copy produces a **complete**
storefront — no dangling references, and key runtime surfaces present (account menu fragment, PDP
coverage, cart/checkout, …). This is the net that would have caught **both** confirmed instances
before a user did.

## Why

Each package has a different content source and index coverage; the B2B packages (cross-org → index
fallback) are highest-risk. Bugs in this class are only caught today by field reports.

## Test-first (RED)

New `tests/features/eds/services/contentCompleteness.smoke.test.ts` (unit-level, mocked `fetch`,
fixture per package — NOT a live network test):

1. Drives `copyContentFromSource` for each package in `demo-packages.json` against a recorded
   source fixture; asserts the audit (Step 03) reports **zero dangling references**.
2. Asserts presence of expected surfaces per package profile: b2b/citisignal-b2b → `/customer/nav`
   copied with B2B menu items; all → account/login/create-account present; PDP template
   (`/products/default`) present.
3. A deliberately-broken fixture (missing `/customer/nav`) **fails** the smoke — proving the net
   bites.

## Implement (GREEN)

- A small harness that enumerates packages via the demo-package loader and runs copy+audit against
  per-package fixtures captured from the live CDN (record once; store as test fixtures, NOT as
  shipped content — fixtures live under `tests/`).
- Profile table: which surfaces each package profile must have (b2b vs non-b2b vs custom).
- PDP coverage is **asserted** here (so it can't silently regress) even though *fixing* the PDP gap
  stays on `b2b-pdp-404-gap` (catalog-derived authoring, Option A).

## Files

- New `tests/features/eds/services/contentCompleteness.smoke.test.ts` + fixtures under
  `tests/features/eds/fixtures/content-completeness/`.
- Possibly a small `src/features/eds/services/` helper to expose package→source mapping for the
  harness (reuse `demoPackageLoader`).

## Acceptance

- Smoke green for all current packages; the broken-fixture case fails as designed.
- CI runs it with the normal `npm test` (no live network).

## Notes

- Capture fixtures during the Step 01 pre-work browser verification (save the real `.plain.html`
  shapes). Keeps the net grounded in real content.
- Future packages get coverage for free by adding a fixture + profile row.
