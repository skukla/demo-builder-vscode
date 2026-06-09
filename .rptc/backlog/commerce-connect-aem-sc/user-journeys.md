# User journeys — per owner archetype

> **Reflects earlier framing (2026-06-03).** These journeys were written for the superseded "commerce-hub" model. V1 is the **synced common storefront** — see [overview](./overview.md) and [roadmap](./roadmap.md) for the corrected flow.

**Filed:** 2026-06-03
**Status:** Design (end-to-end journeys for the SCs the extension serves). Read after [ownership-vs-connection](./ownership-vs-connection.md) (the model) and alongside [roadmap](./roadmap.md) (what's built when). Journey 2's flow detail lives in [aem-sc-first-run](./aem-sc-first-run.md).

## Scope note — who actually uses the extension

The SCs who *use* the extension are the **owners**: the **commerce SC** and the **content SC**. The outbound targets (AEM / AEP / App Builder) are **external systems whose operators never touch the extension** — they are connection endpoints, not journeys we build. "Federated" is not a third journey; it's the case where one owner's connected peer happens to be another owner's extension-built, published demo.

**Build status legend:** ✅ built in v1 · 🟡 designed slot in v1 (not functional) · 🔵 first-class later (designed now).

---

## Journey 1 — Commerce SC  (v1 anchor; mostly ✅)

**Owns:** a commerce backend + an EDS/DA.live storefront. This is today's user; v1 is additive, the new part is the tail.

0. **Journey selector (H3)** ✅ — a visible front door: **commerce** is the live journey, **content** appears as a "coming soon" entry. Commerce SC picks commerce and proceeds.
1. **Create** ✅ *(unchanged, exists today)* — prerequisites → Adobe setup (auth/org/project) → welcome (demo package + architecture) → **Connect Commerce** → mesh → components → review → create.
2. **Dashboard, recomposed (H2)** ✅ — renders **per `(product, ownership)`** instead of the binary `isEds`. Owned commerce shows its actions (Deploy Mesh / Sync / Configure / Author in DA.live); a new **Connections** area appears.
3. **Connect to AEM (A1)** ✅ — **manual entry** of an AEM connection (author/publish URL + IMS org; AEM is external → not discoverable) → **apply** (P2) → the storefront consumes AEM-authored content/assets, and a **functional** connected-AEM card shows on the dashboard. *This is the one live outbound spoke.*
4. **AEP / App Builder** 🟡 — appear as **designed slots** (non-functional cards) until built later.

**The honest v1 line:** today's flow **plus** a live commerce→AEM content connection, the connections surface, and the ownership model underneath. AEP/App Builder payoff comes later. **Known A1 risk:** AEM content is org-bound (unlike the org-agnostic commerce backend) — cross-org consumption must be re-verified live before building.

**Shared primitive on this path:** minimal. A commerce owner never **discovers** their own commerce (P1) and rarely **applies** it to themselves (P2). P1/P2 are built first because they're TDD-ready and reusable — they pay off in Journey 2.

---

## Journey 2 — Content SC  (🔵 first-class later; designed now)

**Owns:** an AEM-authorable storefront (e.g. `aem-boilerplate-xcom`), entered through a **new wizard** that is a *peer* to the commerce wizard (not a commerce sub-flow).

1. **Front door** 🔵 — picks the **content** journey. The selector must host commerce / content / federated as peers (built on the existing `selectedStack`/`componentSelections`/registry model — *not* a solution-family refactor).
2. **Scaffold** 🔵 — provisions an AEM storefront in *their* org (repo-from-template).
3. **Connect to commerce** — they don't own commerce, so they connect to it:
   - **General case (manual)** ✅-able — *manual entry* of an external commerce backend (URL + public read keys); the peer wasn't built with the extension. This is the spine.
   - **Federated case (discovery)** ✅-able — if that commerce *is* a peer extension-built demo, **discover** it (P1) from its published URL.
   - Either path → **apply** (P2) into their storefront config.
4. **Guided no-API AEM wiring** 🔵 — Code Sync, Cloud Manager site, IMS roles, UE enablement, as a checklist with verify affordances.
5. **Author** 🔵 — in Universal Editor against their AEM Sites.
6. **Dashboard (same H2 composition)** 🔵 — owned-AEM actions (Author in AEM/UE) + a **connected-commerce** status card; DA.live authoring / Sync Storefront / Deploy Mesh are *absent* (they own none of those).

**Why this matters:** this is where **P1 + P2 earn their keep** and where the **neutral spine is proven** — the same dashboard composition and connection primitive serve a project whose *owned* product isn't commerce.

---

## The federated relationship

Journey 2 step 3 becomes **federated** when its connected commerce *is* Journey 1's owned, published commerce — two extension instances, one discoverable link. This is the case slated to become first-class and Team-facing, and the reason the spine must stay product-neutral now (see [ownership-vs-connection](./ownership-vs-connection.md), neutrality constraint).

---

## Slice → journey mapping

| Slice ([roadmap](./roadmap.md)) | Commerce SC (v1) | Content SC (later) |
|---|---|---|
| **P1 discover** | not on their path | the federated populate-by-URL step |
| **P2 apply** | writes the AEM connection (A1) | writes commerce into their storefront |
| **H1 model** | commerce represented as owned | archetype → owned/connected derivation |
| **H2 dashboard** | owned-commerce actions + AEM card (live) + AEP/App-Builder slots 🟡 | owned-AEM actions + connected-commerce card |
| **H3 journey selector** | commerce live, content "coming soon" ✅ | lights up the content entry 🔵 |
| **A1 AEM spoke** | live commerce→AEM content ✅ | informs the (owned) AEM contract |
| **design AEP + App Builder** | designed slots 🟡 | validates the remaining shapes |
| **content-SC wizard** | — | the whole creation journey 🔵 |
| **deferred cohesion** | shared custom code across both | shared custom code across both |

## Resolved (2026-06-03)

- **Commerce-SC v1 thinness → resolved:** v1 builds **one live spoke, AEM** (commerce→AEM content). AEP/App Builder stay designed slots.
- **Front-door timing → resolved:** the **journey selector ships in v1** (commerce live, content "coming soon"), not deferred.

## Open journey questions

- **A1 scoped to same IMS org** (commerce + AEM co-resident) — resolves the org-bound auth risk *and* matches the shared-storefront precondition. Open part: can it ever be *external* / cross-org? Re-verify live before attempting.
- **A1's AEM-content renderer must be a block-library artifact** (not bespoke extension code) so it flows through the deferred shared-upstream **repoless** model (one upstream, sites reference it — no fork/sync). Open: how much of that block is extension vs storefront work.
- **Manual vs discovery default in Journey 2:** lead with manual (general) and offer discovery when a published peer is detected?
