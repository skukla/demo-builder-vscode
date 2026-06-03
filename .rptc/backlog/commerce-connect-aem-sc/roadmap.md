# Build sequence — the synced common storefront

> **2026-06-03 re-aim.** V1 = the synced common storefront (two SCs: a content-owned frontend + a commerce backend). The earlier `P1/P2 · H1/H2/H3 · A1` slicing was built on the superseded "commerce-hub connects out to AEM" frame and is **replaced** by the sequence below. See [overview](./overview.md).

## What V1 builds, in order

Each step says what to build and which **existing** piece it reuses. Detailed TDD plans are written just-in-time, one step at a time.

1. **Master + synced copy (the backbone).** Stand up a common **master** storefront and a **copy** that auto-syncs from it. *Reuses the auto-update / sync engine (`templateSyncService` / `componentUpdater`).* Everything else hangs on this.

2. **Add the commerce parts to the master.** The Commerce SC installs the commerce parts (product pages, cart, checkout) into the master **from the commerce boilerplate**, so they flow into the copies. *Reuses the block-library / feature-pack installers.*

3. **Wire each copy to the commerce backend.** Write the backend connection into each copy as **local** config — deliberately kept *out* of sync so it isn't overwritten. *Reuses Connect-Commerce / `configurationService`.*

4. **Content via AEM Sites.** Confirm the content the Content SC authors in **AEM Sites** renders in the storefront. *Mostly existing storefront + AEM capability — verify, don't rebuild.*

5. **Cross-team access.** The practical hand-off so the Commerce SC can contribute to a master that the Content SC's copy syncs from (different accounts / repos).

## Later (not V1)

- **Either SC** can add the commerce parts — V1 is **Commerce SC only**, via the commerce boilerplate. (Allowing the Content SC to add them too is purely a "when do we build it" call, not a different design.)
- **Two-way contribution** — the Content SC contributes custom parts back to the master.
- **Discovery** — read a partner's commerce-backend details from a URL instead of entering them. A convenience; not needed in V1 because the Commerce SC owns the backend.

## Open questions to resolve as we go

- Where the **master** lives and who can write to it (cross-team GitHub access).
- **Merge/conflict** handling when synced commerce parts meet a copy's local content.
- Re-verify the **cross-account commerce-backend read** in a live environment before code lands.
