# Step 06 — Reset self-heal wiring + revisit the selector-race patch

**Goal:** Ensure existing/stale storefronts repair on **reset** (not just fresh create), and
re-evaluate whether the `commerce-account-sidebar-selector-race` code patch is still needed once
`/customer/nav` is actually copied.

## Why

- The 2026-06-12 dropin-delivery item's lesson: a copy-side fix that isn't wired into reset leaves
  already-created storefronts broken. Owners with existing B2B storefronts need a repair path.
- Hypothesis (account-features research): the selector-race patch ("empty left nav on freshly-
  published storefronts") may have been treating a *symptom* of the never-copied `/customer/nav`
  fragment as a decoration timing race. With the fragment present, the empty-nav cause is removed.

## Test-first (RED)

1. `edsResetService`/`edsResetRepoHelper`: a reset run executes content discovery + audit (Steps
   01/03) so a storefront missing `/customer/nav` gains it on reset (assert the dest POST + audit
   clean after).
2. Idempotency: re-running reset does not duplicate `/customer/nav` (dedup vs dest).

## Implement (GREEN)

- Confirm the reset path invokes the same `copyContentFromSource` (with discovery) — if reset uses a
  narrower content path, route it through the unified discovery+audit so reset and create behave
  identically. Reuse the Step 04 inventory.
- **Selector-race patch decision (separate, evidence-based):**
  - With `/customer/nav` copied, reproduce a fresh publish and check whether the empty-nav race
    still occurs. If it does not recur across N publishes, plan retirement of
    `commerce-account-sidebar-selector-race` from `eds-demo-patches/{b2b,citisignal-b2b,custom}` per
    the ledger's `exit` discipline (file/track upstream as needed).
  - If it still races independently of the fragment, keep the patch and note that the two were
    distinct causes. **Do not remove the patch speculatively** — gate on reproduction.

## Files

- `src/features/eds/services/edsResetService.ts`, `edsResetRepoHelper.ts`.
- (Conditional) `eds-demo-patches/{b2b,citisignal-b2b,custom}/code-patches.json` — only if
  reproduction shows the patch is now redundant.

## Acceptance

- Reset on a `/customer/nav`-missing storefront repairs it; audit clean; idempotent.
- A documented decision on the selector-race patch (retire-with-evidence OR keep-with-rationale).

## Notes

- Cross-repo: any patch retirement is a separate commit in `eds-demo-patches` on the same feature
  branch (`claude/b2b-boilerplate-account-features-wzzg55`), gated on the drift/LKG checks.
