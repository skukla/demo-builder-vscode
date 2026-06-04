# Build sequence — two identical transacting forks (the locked target)

> **Target (locked 2026-06-04):** Scenario B · Option X · two identical transacting forks · each authors their own content · **Content SC in their own AEM Sites** (non-negotiable). Architecture + decision trail: [storefront-topology](./storefront-topology.md).
>
> **The spine and the gating unknown are the same thing — AEM Sites as a content source.** Verify it live *before* committing to the full build.

## Verify first (gates everything)

**Can an `aem-boilerplate-xcom`-style storefront be authored via AEM Sites in its own org *and* transact against a commerce backend?** Stand this up by hand in one environment. If it holds, the rest is "two of these sharing an upstream." If it doesn't, the target needs rethinking. *(Also confirms: the AEM code-sync app, xcom maturity.)*

## What to build, in order (each tagged EXISTS / PARTIAL / NET-NEW)

1. **The shared upstream.** — **PARTIAL.**
   A neutral repo seeded from a commerce boilerplate **that supports AEM Sites authoring** (`aem-boilerplate-xcom` family) — full commerce dropins + shared design. Commerce SC owns it, in a shared GitHub org. *Repo-from-template machinery exists; the "AEM-authorable commerce base" is the part to confirm.*

2. **AEM Sites as a content source.** — **NET-NEW (the spine).**
   Teach the extension to wire a storefront's content source to **AEM Sites** (code-sync app, site registration, Universal Editor) in the Content SC's own org — not just DA.live. *Everything content-source today (`fstabGenerator.ts`, `configurationService.ts`, `edsPipeline.ts`) is DA.live-shaped.*

3. **The content-SC wizard.** — **NET-NEW (mostly assembly).**
   A second creation flow: fork the upstream → connect their AEM Sites (step 2) → wire the backend. Reuses the existing wizard shell + create-from-template; the new pieces are the AEM step and pointing the fork at the shared upstream.

4. **Fork + sync, both sides.** — **EXISTS (sync) + NET-NEW (two-fork).**
   Each SC's fork syncs from the upstream, keeping the two **identical** in code/design while each keeps its own content + backend (already preserved). *Sync engine exists 1:1 (`templateSyncService.ts`); driving one upstream into two separately-owned forks across accounts is the orchestration gap (`stateManager.ts` is single-project today).*

5. **Backend + CORS.** — **EXISTS + one coordination step.**
   Both forks point at the **Commerce SC's backend** (Connect-Commerce). The Commerce SC **CORS-allow-lists both storefront domains**. Mesh optional; default to per-org meshes (no cross-org call) — see [storefront-topology](./storefront-topology.md).

## The constant

Both sites are **identical by shared code, differentiated by content** (each authored in its own org; the Content SC's in their AEM Sites). They **both transact** against one backend. Two sites, not one — by the canonical-site rule.

## Later (not first pass)

- **Two-way contribution** — the Content SC evolving the *shared design* in the upstream (vs. just their content).
- **Invite/handoff** between the SCs (vs. sharing upstream + backend coordinates manually).
- **Shared cart/session** across the two sites (deliberate shared auth).

## Open questions to resolve as we go

- The **two-fork state model** (today `currentProject` is singular).
- **Two GitHub accounts** in one workflow (one active token per session today).
- Whether one xcom upstream supports **each fork's content source** (Content SC = AEM Sites; Commerce SC = AEM or DA.live).
- The live-verification list above — **AEM Sites content source first.**
