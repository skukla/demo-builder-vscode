# Commerce-connect for AEM-SC two-instance demos

**Filed:** 2026-06-02 · **Status:** backlog (designed, paused — ready to promote when activated).

A single backlog feature with several design docs and a build plan. This file is the front door; read it first, then follow the links below.

## The feature in one line

Let an **AEM SC** run their *own* copy of the extension, paste the **Commerce SC's published storefront URL**, **discover** the (already-public) commerce connection from it, **scaffold** an AEM-authorable `aem-boilerplate-xcom` storefront in *their* org, **apply** the connection, and author it in Universal Editor against their own AEM Sites — sharing the commerce **backend** (a URL + public read keys), not code or content.

## Provenance

Grew out of "hook the extension to an existing AEM Sites deployment and demo the same content from DA.live *and* AEM Sites." Research killed simultaneous dual-authoring (one EDS site = one content source) and cross-org code sharing (code-bus is bound to one org), but established that the commerce **backend is org-agnostic to consume** (SaaS read path / API Mesh need only a URL + public keys, no IMS token). That reshaped the goal into the **federated, discovery-first** model captured here. Full RPTC research/decision trail lives in git history on `claude/commerce-connection-kit-research`.

## Documents

| Doc | What it is |
|---|---|
| [commerce-connection-kit](./commerce-connection-kit.md) | **Lead design** — the integration mechanism (the connection contract, cross-org verdict, discovery-not-export, what exists today, considered-&-rejected). Status: *leading direction*. |
| [federated-two-instance-demos](./federated-two-instance-demos.md) | **Operator/delivery model** — each SC runs their own single-org instance; the higher-cohesion shared-upstream (synced-fork) layer for shared custom code. |
| [aem-sc-first-run](./aem-sc-first-run.md) | **Front door / cold-start** — why a commerce-centric first action mismatches an AEM SC; the router + separate AEM-framed flow + shared-surface (`kind`) adaptation. |
| [roadmap](./roadmap.md) | **Build sequence** — 5 slices (Discover → Apply → Scaffold → front-door/UI → shared-code sync), with detailed TDD plans produced just-in-time. |
| [slice1-discovery](./slice1-discovery.md) | **First executable plan** — TDD-ready Slice 1: a pure `discoverCommerceConnection(url)` service. |

## Goal / scope

- **In:** the discovery → apply → scaffold plumbing, an AEM-SC front door + AEM-framed connect flow, and the manifest `kind` + dashboard branching that an AEM-storefront project needs.
- **v1:** two repos sharing **data** (discovery). **Later (deferred):** three repos (shared upstream + synced forks) sharing **code**.
- **Out:** the deep "solution-family" product-selection refactor; content seeding into AEM; the optional SEO prerenderer.

## Execution plan

The [roadmap](./roadmap.md) holds the slice sequence; [slice1-discovery](./slice1-discovery.md) is ready for TDD. Slices 1–2 are concrete; 3–5 carry real unknowns (cross-org behavior, the no-API AEM wiring, the sync model) and stay roadmap-level until reached. Deferred decision to lock at Slice 4 planning: minimal two-option router vs. a fuller solution selector (recommendation: minimal, designed to grow).

## Constraints

- Research caveat: Adobe doc pages block programmatic fetch; load-bearing specifics (esp. cross-org API Mesh) should be re-verified in a live environment before code lands.
- Reuses existing single-org architecture — **no multi-IMS refactor**; integration is via the connection, not centralized orchestration.
- Additive except for two commerce-assuming surfaces: the manifest `kind` field and the dashboard's `kind`-branching.

## Kickoff prompt

> Promote `commerce-connect-aem-sc` from the backlog. Start with `slice1-discovery.md` — run the RPTC TDD loop (RED → GREEN → REFACTOR) on `src/features/eds/services/commerceConnectionDiscovery.ts` on a feature branch. Re-read the roadmap before each subsequent slice; write detailed plans just-in-time.
