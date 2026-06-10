# Step 06 — Extract & Consolidate the Patch Ledger

**Repo:** `skukla/eds-demo-patches` (generalized from `eds-demo-content-patches` — D3). **Out of current session scope.**
**Depends on:** the audit (`findings.md`). **Blocks:** Steps 5, 7, 8.
**Status:** proposed (no code yet)

## Objective

Turn the audit's **33 modification files** into the target **~6–8 patch ledger**, each patch named,
precondition-anchored, and carrying a declared exit. Definitions live in the patches repo (externalized), authored
in the v2 shape the engine (Step 1) consumes.

## The ledger (from ADR-006 §"Patch policy" + findings hard-cases)

| Source modifications (audit) | Consolidation | Result |
|---|---|---|
| 14 one-line import swaps (aem-assets wrapper) | Patch the vendored dropin file directly (v1's `aem-assets-sku-sanitization` did exactly this) | **1 patch** |
| 11 CSS theming files | One vendored `<link>` in `head.html` (smart-404 vendoring shape) + an additive brand stylesheet | **1 vendor point** (minimizes CSS patches) |
| Sidebar selector race (`commerce-account-sidebar.js`) | Carry patch; **upstream PR** → delete on merge | 1 expiring |
| `aem.js` `createOptimizedPicture` origin fix | Carry patch; **upstream PR** → delete on merge | 1 expiring |
| Header nav-tools defensiveness | Carry patch; **upstream PR** → delete on merge | 1 expiring |
| SKU slash encoding (`scripts/commerce.js`) | Carry patch; **upstream PR** → delete on merge | 1 expiring |
| Carousel autoplay removal | Demo preference — drop, or propose upstream as block option | 0 |
| Trivia (`delayed.js` comment, READMEs) | Drop | 0 |
| 2 product-teaser fixes (SKU-encoding portability, image-URL handling) | **Block-targeting** code patches (apply post-install); PRs to demo team | **2 expiring** |

**Steady state: ~6–8 active patches**, each with a declared exit. New patches require justifying why neither
additive nor upstream works.

## Scope / artifacts (in the patches repo)

- `citisignal/code-patches.json` — the v2 code-patch definitions: `{id, target, description, precondition,
  replacement, exit, critical?}` each (`critical` defaults off per D1).
- **Repo migration (D3):** rename/move `eds-demo-content-patches` → `eds-demo-patches`; relocate the existing
  `citisignal/patches.json` (content patches) and update the extension's `contentPatchSource` defaults in
  lockstep (Step 5) so nothing dangles.
- The additive brand stylesheet asset + the `head.html` `<link>` vendor patch (the CSS consolidation).
- Each patch annotated with its `exit` (upstream PR URL once filed in Step 8, or "additive-restructure").

## Approach (to detail after approval)

1. Reproduce each genuine modification from the fork audit at the canonical anchor; author a precondition that
   matches the canonical (or installed-block) region uniquely and a replacement that applies our change.
2. Split into two `target` domains: canonical-file patches (apply pre-install) and `blocks/…` patches (apply
   post-install) — consumed by Step 2's phase routing.
3. Keep the ledger single-digit; prefer the consolidations above over per-file patches.

## Risks (this step)

- **R6 (CSS churn):** if append-dominant CSS patches prove brittle, the vendored-stylesheet approach is the
  hedge; revisit only if churn is high.
- **R7 (teaser carries):** these must exist as day-one patches before Step 5 flips the block source — otherwise
  the two fixes are lost when we stop sourcing blocks from our fork.
- **Precondition durability:** anchors must target stable canonical regions; the gate (Step 7) is what keeps them
  honest over time.

## Test / verification

- Each patch validated against canonical `main` by the gate's check script (Step 7): precondition matches.
- A dry-run apply against a fresh canonical clone + a fresh demo-team block install produces the expected files.

## Exit criteria

- A ~6–8 entry ledger exists in the patches repo, every precondition matches current canonical / demo-team
  blocks, the two teaser carries are present as block-targeting patches, and each patch declares an exit.
