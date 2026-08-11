# Step 08 — Upstream PRs (patch exits)

**Repos:** `hlxsites/aem-boilerplate-commerce` (×4), `demo-system-stores/accs-citisignal` (×2).
**Out of current session scope.**
**Depends on:** Step 6 (the carries exist as patches). **Blocks:** nothing — **non-blocking by design.**
**Status:** proposed (no code yet)

## Objective

File the upstream PRs that are each carry-patch's **exit**. Upstream-first is the exit, **not** the gatekeeper:
the block-source flip (Step 5) and the whole migration do **not** wait on these merging. The gate's obsolete-patch
detection (Step 7) auto-proposes patch removal once a fix lands upstream verbatim.

## The PRs

### To `hlxsites/aem-boilerplate-commerce` (4 genuine canonical bugs)

1. **Account-sidebar selector race** — `commerce-account-sidebar.js` defensive guard (the founding example;
   fork PR #2 / `907883b3`).
2. **`aem.js` origin fix** — `createOptimizedPicture` carrying absolute origins (`806e04da`).
3. **Header nav-tools defensiveness** — `header.js` guard (from the v1 `header-nav-tools-defensive` patch).
4. **SKU slash encoding** — `scripts/commerce.js` `getProductLink`/`getSkuFromUrl` (`/` ↔ `__`).

### To `demo-system-stores/accs-citisignal` (2 demo-team block fixes)

5. **product-teaser SKU-encoding portability.**
6. **product-teaser image-URL handling.**

## Approach (to detail after approval)

1. For each, open a focused PR against the upstream with the same change the carry patch applies.
2. Record the PR URL in the corresponding patch's `exit` field (Step 6).
3. Leave the carry patch active until the PR merges; the gate (Step 7) then opens the retirement PR.

## Risks (this step)

- **Declined / slow PRs:** accepted — the patch carries indefinitely until merged; nothing downstream waits. If
  upstream declines, the patch becomes a permanent (still single-digit) ledger member, or we pursue the ADR's
  shadow-override escape hatch for a chronically broken demo-team block.
- **Drift while open:** if canonical changes the region before merge, the gate flags the precondition; rewrite the
  patch and update the PR.

## Test / verification

- N/A (external). Track PR state; each merged PR should trigger an obsolete-patch retirement PR from the gate.

## Exit criteria

- Six PRs filed and linked from their patch `exit` fields. (Acceptance is **not** required for initiative done —
  these are exits, not gates.)
