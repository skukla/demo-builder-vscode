# Build sequence — toward the shared-upstream storefront (shape 2)

> **Architecture:** see [storefront-topology](./storefront-topology.md) (the two shapes, the Adobe canonical-site rule, the upstream decision). **Target = shape 2** (neutral upstream + per-org forks, full symmetry). Shape 1 is the first increment, not a throwaway.
>
> **Grounded in the code (2026-06-03/04).** Each step is tagged **EXISTS / PARTIAL / NET-NEW** with the key file. Headline: the sync + install + connect pieces exist; the real new work is **AEM Sites as a content source** and the **upstream + multi-fork orchestration**.

## What to build, in order (each increment demos something)

1. **Shape 1 — combine commerce into a Content-SC storefront.** — **PARTIAL (mostly reuse).**
   Add the commerce dropins (from the boilerplate) into a Content-SC-owned storefront repo and wire the backend. Proves the combine in one org. *Reuses the block/feature-pack installers + Connect-Commerce; the backend config is already preserved per-repo across syncs.* *(`blockCollectionHelpers.ts`, `featurePackInstaller.ts`, `configGenerator.ts`.)*
   **New part:** the Commerce SC acting on a repo they don't own (GitHub collaboration). Content can be DA.live here to de-risk; AEM Sites is step 2.

2. **AEM Sites as a content source.** — **NET-NEW (the big one).**
   Teach the extension to use **AEM Sites** as the content source, not just DA.live — so the Content SC's real AEM content drives the combined demo. Today everything (fstab, content pipeline, config-service registration) is DA.live-shaped. *(`fstabGenerator.ts`, `configurationService.ts`, `edsPipeline.ts` — all DA.live today.)* **Needs live verification** (code-sync app, one-content-source rule).

3. **Neutral upstream + fork-and-sync.** — **EXISTS (sync) + NET-NEW (upstream).**
   Stand up the neutral code **upstream** (seeded from the commerce boilerplate, in a shared GitHub org). Make the Content SC's storefront a **fork** that syncs from it; backend + content source stay per-fork (already preserved). *Reuses the sync engine (1:1 upstream→fork). `templateSyncService.ts`.*

4. **Full symmetry — the Commerce SC's demo as a fork too.** — **NET-NEW (multi-fork).**
   The Commerce SC's own demo becomes a fork of the same upstream, so their custom commerce blocks live in the upstream and flow to **both** forks. *Today: single-project, one upstream per project, one active GitHub account (`stateManager.ts`, `edsGitHubHandlers.ts`) — driving one upstream into two separately-owned forks is the orchestration gap.*

5. **Cross-team operation.** — **NET-NEW.**
   The practical hand-off across two GitHub accounts/orgs: who maintains the upstream, how forks get created/granted, what triggers a sync.

## The constant (don't lose it)

The combined demo (AEM content + commerce) **lives in the Content SC's org** — content can't be shared across orgs (one content source per site). What's shared is **code** (the upstream) and the **backend** (one URL). See [storefront-topology](./storefront-topology.md).

## Two imagined gaps that aren't gaps

- **"Shared mesh / backend."** Just the same backend URL in each fork's `config.json` — already written by Connect-Commerce. Nothing to coordinate.
- **"Shared content site."** Not possible *and* not needed — each fork has its own content source; the combined content is the Content SC's AEM, in their fork.

## Later (not the first pass)

- **Two-way contribution** — the Content SC pushes custom blocks *back* to the upstream (vs. one-way upstream→forks).
- **Reusable upstream** — one customization layer across many demo scenarios (vs. per-scenario).
- **Either SC adds commerce parts** — V1 is the Commerce SC, via the boilerplate.
- **Discovery** — read a partner's backend details from a URL instead of entering them.

## Open questions to resolve as we go

- Where the **upstream** is hosted and who can write to it (cross-team GitHub access) — step 3/5.
- The **multi-fork state model**: today `currentProject` is singular — how to represent "one upstream, two forks."
- **Two GitHub accounts** in one workflow (one active token per session today).
- Re-verify live: **AEM-Sites content source**, **cross-org mesh call**, `aem-boilerplate-xcom` maturity, the **code-sync app**, CORS.
