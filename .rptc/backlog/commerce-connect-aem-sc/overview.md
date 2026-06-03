# Commerce-connect for AEM-SC two-instance demos

**Filed:** 2026-06-02 · **Status:** backlog (designed, paused — ready to promote when activated).

A single backlog feature with several design docs and a build plan. This file is the front door; read it first, then follow the links below.

## The feature in one line

Let the extension build **multi-product Adobe demos** through **owner archetypes** (creation wizards): the **commerce-SC wizard** today, a **content-SC wizard** later — each *owns* its demo and *connects out* to other systems that are usually **not built with the extension** (so **manual entry is the spine**; discovery/federated is the special case). **v1 anchors on the commerce-hub** (an owned commerce demo connecting out to partner-managed Adobe apps) — the first case *implemented* on a **product-neutral spine**, not a privileged one. The **content-SC owner wizard** and the **federated peer-to-peer** case (Team-facing) become **first-class** later and must drop in additively. See [ownership-vs-connection](./ownership-vs-connection.md).

## Provenance

Grew out of "hook the extension to an existing AEM Sites deployment and demo the same content from DA.live *and* AEM Sites." Research killed simultaneous dual-authoring (one EDS site = one content source) and cross-org code sharing (code-bus is bound to one org), but established that the commerce **backend is org-agnostic to consume** (SaaS read path / API Mesh need only a URL + public keys, no IMS token) → a **federated, discovery-first** model. That then generalized again (2026-06-03): discovery was forcing "every SC must use the extension," so **connection became the primitive** (manual entry first-class, discovery as an accelerator) and **ownership a per-product flag** — which also covers a commerce owner connecting outward to partner-managed Adobe apps. v1 was re-anchored to that commerce-hub case. Full RPTC research/decision trail lives in git history on `claude/commerce-connection-kit-research`.

## Documents

| Doc | What it is |
|---|---|
| [ownership-vs-connection](./ownership-vs-connection.md) | **The organizing model** — owned vs connected (per product); two owner archetypes on a neutral spine; connection as the primitive (manual \| discovery); the per-`(product, ownership)` dashboard principle; the v1 decisions. Read after this. |
| [user-journeys](./user-journeys.md) | **End-to-end journeys per owner archetype** — Commerce SC (v1) and Content SC (later) step-by-step, with build status (✅ v1 / 🟡 designed slot / 🔵 later), the federated relationship, and a slice→journey map. |
| [commerce-connection-kit](./commerce-connection-kit.md) | **Lead mechanism** — the commerce connection contract, cross-org verdict, discovery-not-export, what exists today, considered-&-rejected. |
| [federated-two-instance-demos](./federated-two-instance-demos.md) | **Operator/delivery model** — each SC runs their own single-org instance; the higher-cohesion shared-upstream (synced-fork) layer for shared custom code. |
| [aem-sc-first-run](./aem-sc-first-run.md) | **Front door / cold-start** — the commerce-vs-content journeys; front door + AEM-framed flow; the selection model that **reuses the existing configuration model** (`selectedStack` / `componentSelections{frontend,backend,integrations[],appBuilder[]}` / the registry — *no* new field). |
| [roadmap](./roadmap.md) | **Build sequence** — shared primitive (P1 discover · P2 apply) → commerce-hub v1 (H1 model · H2 dashboard) → AEM-SC milestone → deferred cohesion. JIT plans. |
| [slice1-discovery](./slice1-discovery.md) | **First executable plan** — TDD-ready: a pure `discoverCommerceConnection(url)` service (the discovery population mode / P1). |

## Goal / scope

- **In (v1, commerce-hub):** the connection/ownership framework (connection primitive: manual entry + discovery + apply), commerce's owned representation, the per-`(product, ownership)` dashboard surface, a **visible journey selector** (commerce live, content "coming soon"), and **one live outbound spoke — AEM** (commerce→AEM content) — all reusing the existing configuration model, no new field.
- **Design, not build (v1):** the **AEP + App Builder** spoke connection contracts (AEM is built); surface as designed slots.
- **First-class later:** the **content-SC owner wizard** (a second creation journey) and the **federated** peer-to-peer case (discoverable commerce) — must drop in additively on the neutral spine. **Deferred:** higher cohesion (shared upstream + synced forks) for shared code.
- **Hard constraint:** the spine stays **product-neutral** (commerce is one product, not *the* product) — but neutrality is structural/naming, not a built-ahead framework (implement only commerce in v1; YAGNI).
- **Out:** the deep "solution-family" product-selection refactor; content seeding into AEM; the optional SEO prerenderer.

## Execution plan

The [roadmap](./roadmap.md) holds the sequence: **P1 discover · P2 apply** (shared primitive, P1 TDD-ready) → **H1 model · H2 dashboard · H3 journey selector** + **A1 the live AEM spoke** (the commerce-hub v1) → content-SC milestone → deferred cohesion. Detailed TDD plans are written just-in-time. **A1 carries the one live unknown:** AEM content is org-bound (unlike the org-agnostic commerce backend) — re-verify cross-org consumption live before building.

## Constraints

- Research caveat: Adobe doc pages block programmatic fetch; load-bearing specifics (esp. cross-org API Mesh) should be re-verified in a live environment before code lands.
- Reuses existing single-org architecture — **no multi-IMS refactor**; integration is via the connection, not centralized orchestration.
- Reuses the **existing project configuration model** (`Project` manifest: `selectedStack` / `componentSelections` / `componentConfigs` / the component registry) — **no new `kind`/`composition` field.** Additive except for the dashboard's branching (today it assumes commerce/EDS) and any shared project-creation pipeline the AEM case touches.

## Kickoff prompt

> Promote `commerce-connect-aem-sc` from the backlog. Start with `slice1-discovery.md` — run the RPTC TDD loop (RED → GREEN → REFACTOR) on `src/features/eds/services/commerceConnectionDiscovery.ts` on a feature branch. Re-read the roadmap before each subsequent slice; write detailed plans just-in-time.
