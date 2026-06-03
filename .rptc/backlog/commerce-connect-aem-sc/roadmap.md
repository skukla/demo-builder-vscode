# Build sequence — the synced common storefront

> **2026-06-03 re-aim.** V1 = the synced common storefront (two SCs: a content-owned frontend + a commerce backend). The earlier `P1/P2 · H1/H2/H3 · A1` slicing was built on the superseded "commerce-hub connects out to AEM" frame and is **replaced** by the sequence below. See [overview](./overview.md).
>
> **Grounded in the code (2026-06-03).** Each step below is tagged against what the codebase actually does today — **EXISTS / PARTIAL / NET-NEW** — with the key file. Verdict: most pieces exist; the real new work is the multi-repo / multi-account orchestration (step 5).

## What V1 builds, in order

1. **Master + synced copy (the backbone).** — **EXISTS (1:1).**
   The sync engine already pulls a copy from a configurable upstream, one-directional (master→copy), with merge-or-reset conflict handling. The upstream is set per-project (`templateOwner` / `templateRepo` on the EDS-storefront component). *`src/features/updates/services/templateSyncService.ts`.*
   **New part:** today it's **one copy ← one upstream**; V1 needs the *same* master driving *two* copies. That's part of the step-5 orchestration, not new sync logic.

2. **Add the commerce parts to the master.** — **PARTIAL (mostly reuse).**
   The commerce parts live in the boilerplate/template; the block- and feature-pack installers already install a configurable set of parts into a storefront repo (atomic commits, multi-source merge). So the master is "a storefront built from the commerce boilerplate," and the installers cover extras. *`src/features/eds/services/blockCollectionHelpers.ts`, `featurePackInstaller.ts`; `config/block-libraries.json`, `config/stacks.json`.*
   **New part:** none structural — just pointing the install at the master. No per-block picker needed.

3. **Wire each copy to the commerce backend.** — **EXISTS (already local-safe).**
   Connect-Commerce writes `config.json` (endpoint + account-specific headers/keys). Crucially, the **sync engine already preserves `config.json` (and `fstab.yaml`) across syncs** — so the backend wiring is *already* per-copy and not overwritten when the master updates. *`src/features/eds/services/configGenerator.ts`, `configSyncService.ts`; `ConnectStoreStepContent.tsx`; preservation in `templateSyncService.ts`.*
   **New part:** essentially none — this falls out of existing behavior. Both copies just carry the same backend URL in their own `config.json`.

4. **Content via AEM Sites.** — **VERIFY.**
   The content source is bound per-copy (Helix `fstab.yaml`, preserved across syncs). The Content SC authors in **AEM Sites**; confirm AEM-Sites-as-content-source renders in the storefront. *Mostly existing storefront + Helix capability — verify in a live env, don't rebuild.*

5. **Cross-team orchestration (the real net-new).** — **NET-NEW.**
   Today everything is **single-project, single active GitHub account, 1:1 sync** (`currentProject` is singular; one upstream per copy; one GitHub token per session). V1 needs: define **one master** that **two separately-owned copies** (in **two different accounts**) both sync from, and let the Commerce SC act on the master that the Content SC's copy follows. *`src/core/state/stateManager.ts` (single `currentProject`), `projectDirectoryScanner.ts`, `src/features/eds/handlers/edsGitHubHandlers.ts` (one active account).* **This is where the genuine engineering is.**

## Two imagined gaps that aren't gaps

- **"Shared mesh / backend endpoint."** Not orchestration — both copies just carry the **same backend URL** in their own `config.json`, which Connect-Commerce already writes. Nothing to coordinate.
- **"Shared DA.live content site."** Not needed — content comes from the Content SC's **AEM Sites**, per-copy. The shared-DA.live concern was from the old brand-cloning flow, not this case.

## Later (not V1)

- **Either SC** can add the commerce parts — V1 is **Commerce SC only**, via the commerce boilerplate.
- **Two-way contribution** — the Content SC contributes custom parts back to the master.
- **Discovery** — read a partner's commerce-backend details from a URL instead of entering them. A convenience; not needed in V1 because the Commerce SC owns the backend.

## Open questions to resolve as we go

- Where the **master** lives and who can write to it (cross-team GitHub access) — the core of step 5.
- The **multi-copy state model**: today `currentProject` is singular — how to represent "two copies that share a master."
- **Two GitHub accounts** in one workflow (one active token per session today).
- Re-verify the **cross-account commerce-backend read** and **AEM-Sites content source** in a live environment before code lands.
