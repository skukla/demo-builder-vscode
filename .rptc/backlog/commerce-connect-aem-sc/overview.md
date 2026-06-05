# Two-SC synced storefront demos (commerce + content)

**Filed:** 2026-06-02 · **Re-aimed:** 2026-06-03 · **Repivoted:** 2026-06-05 (repoless as the architecture) · **Status:** backlog (architecture locked, validation evidence captured, ready to plan Slice 1 wiring).

This file is the front door — read it first. *Part of the [compositional Adobe demo builder](../compositional-demo-builder.md) direction — this is its **first feature**.*

> **2026-06-05 repivot.** Earlier drafts locked the two-fork-sync model. Post-research investigation surfaced Adobe's **repoless** capability as a first-class alternative; a live cross-org test confirmed it works at runtime. The architecture flipped: one shared code repo, per-site content sources via Configuration Service, no forks. The [storefront-topology](./storefront-topology.md) doc carries the new locked plan with validation evidence. Other docs in this folder still carry some of the older framing — this overview is the current source of truth; the doc table below flags which need cascading updates.

> **2026-06-03 re-aim** (prior). Earlier drafts framed V1 as a single commerce demo that "connects out" to other Adobe apps (including pulling in AEM content). That was the wrong target. V1 is the **synced common storefront** described below.

## What we're building (V1)

A way for **two solutions consultants** to build **one demo storefront together**, even though they work in **separate Adobe accounts**:

- a **Commerce SC** — owns the commerce backend (products, cart, checkout), and
- a **Content SC** — owns the content, authored in **AEM Sites**.

### How it works (the locked target)

- A **shared GitHub code repo (the upstream)** holds the storefront code (commerce drop-ins + design), based on `aem-boilerplate-xcom`. Owned by the Commerce SC; AEM Code Sync installed on it once.
- **The Commerce SC's `aem.live` site** is the canonical anchor (`org/site` matches the GitHub `owner/repo`). It authors content in the Commerce SC's AEM (or DA.live), commerce config in their AEM as content nodes.
- **The Content SC's `aem.live` site** is a repoless satellite that reads code from the Commerce SC's repo via `code.owner` in the Configuration Service. It authors content in **their own AEM Sites**, in their own Adobe org — the non-negotiable point of the feature. Their commerce config is authored in their own AEM and can mirror the Commerce SC's published values (the read path is no-auth).
- **Both sites carry full commerce and both transact** against the **Commerce SC's backend** (by URL).
- **No forks. No sync engine.** When the Commerce SC pushes a code change, both sites pick it up within one Code Sync cycle.

### Why this works across Adobe accounts

The original analysis assumed that EDS's canonical-site rule (one repo = one site; one content source per site) forced two forks across two accounts. **Repoless changes the answer**: a single repo can back multiple sites, each in its own `aem.live` org, each with its own content source. The cross-org part is just the satellite's site config — `PUT /config/{contentSC-org}/sites/{site}.json` with `code.owner = <commerceSC-org>`. Validated live 2026-06-05; full evidence in [storefront-topology](./storefront-topology.md).

### Target vs later

- **Target:** repoless with per-org content sources; both SCs use the extension (Content-SC wizard); each authors their own content in their own AEM; commerce config authored as content (multi-env aware); both transact against the Commerce SC's backend.
- **Later:** Content SC contributing back to the shared codebase (PRs to the upstream); an invite/handoff between the SCs; shared cart/session across the two sites.

## Why this isn't from scratch (verified against the code, updated 2026-06-05)

The architecture pivot to repoless **shrinks** the build:

- **`ConfigurationService.ts` already talks to the Configuration Service API** (`/config/{org}/sites/{site}.json` PUT/POST flows). The Content-SC wizard's site-creation step is a thin call into this existing seam.
- **`aem-boilerplate-xcom` is a public, supported template** — `gh repo create --template adobe-rnd/aem-boilerplate-xcom` is the entire repo-creation step. No custom upstream maintenance.
- **Existing fork-from-template / site-creation machinery** repoints to "create a repoless satellite via Configuration Service" instead of "fork into Content SC's org." The mechanic differs; the wizard shape is similar.
- **Connect-Commerce** still writes the commerce wiring. The destination changes from `config.json` in the repo to AEM content nodes (`configs`, `configs-dev`, `configs-stage`) per the CitiSignal pattern — but the *values* are the same shape it already produces.

## What's genuinely new (and where the real work is)

- **AEM Sites as a content source** — the extension is **DA.live-only** today. This is still the spine, *but* its architectural risk is now closed: [`roberttoddhoven/citisignal-one`](https://github.com/roberttoddhoven/citisignal-one) is a working public example of `xcom` + AEM Sites authoring + transacting. The remaining work is the wizard wiring, not the architectural pattern.
- **Repoless satellite creation** (the Content-SC wizard's new shape) — `PUT /config/{org}/sites/{site}.json` with `code.owner` cross-referencing the Commerce SC's repo. Cross-org validated live; the wizard wraps a single API call.
- **Config-as-content writer** — replaces the current "write `config.json` to the repo root" with "author `configs`/`configs-dev`/`configs-stage` nodes in AEM via the Configuration Service or directly to the content source." Per-environment from day one.

## What turned out *not* to be problems

- **A "shared mesh/backend"** — same URL in each site's config, public values, no handshake needed.
- **A "shared content site"** — not possible *and* not needed; each site has its own content source.
- **The two-fork orchestration** — repoless removes it entirely.
- **CORS allow-listing across orgs** — the Merchandising API requires no authentication and ACCS handles CORS at the edge for SaaS storefronts. No PaaS-style manual handshake needed.
- **Cross-account commerce backend read** — Adobe's docs state "Authentication is not required for the Merchandising API" verbatim; the required headers (`AC-View-ID`, `AC-Source-Locale`, optionally `AC-Price-Book-ID` / `AC-Policy-*`) are all public identifiers, and the tenant binding lives in the URL.

## Out of scope

- The deep "solution-family" product-selection refactor.
- Seeding content into AEM (the Content SC authors it).
- The optional SEO prerenderer (folder mapping is no longer the concern under repoless / Configuration Service paths).

## Documents

| Doc | What it is | State |
|---|---|---|
| [storefront-topology](./storefront-topology.md) | **The authoritative architecture.** Repoless with per-org content sources, validation evidence inline, two-fork model in rejected alternatives. | **Current** (2026-06-05) |
| [commerce-connection-kit](./commerce-connection-kit.md) | The commerce-backend connection detail, with the cross-account read claim strengthened by the Merchandising API "no auth required" finding. | Updated 2026-06-04; consistent with repoless |
| [roadmap](./roadmap.md) | The build sequence. **Pending repivot** — the sync-engine line items should drop; config-as-content writer should be added. | **Pending** |
| [synthesis-and-build-order](./synthesis-and-build-order.md) | Design → code mapping. **Pending repivot** — Slice 1 reuse map shrinks. | **Pending** |
| [verify-aem-sites-spike](./verify-aem-sites-spike.md) | Original gating spike. **Closed** — answered by [CitiSignal One](https://github.com/roberttoddhoven/citisignal-one) existence. | **Closed** (kept for runbook reference if a fresh end-to-end is needed) |
| [federated-two-instance-demos](./federated-two-instance-demos.md) | The two-SC / synced-copy delivery model. Still V1-central; the synced-copy mechanic is now Configuration Service, not fork-and-sync. | Carries pre-repivot framing in places |
| [aem-sc-first-run](./aem-sc-first-run.md) | The content-SC-owned storefront flow. Still V1 model; the wizard shape simplifies under repoless. | Carries pre-repivot framing |
| [ownership-vs-connection](./ownership-vs-connection.md) | The broader product direction (compositional demo builder). Repoless aligns directly with this direction. | Still valid; old "v1 decisions" superseded by storefront-topology |
| [user-journeys](./user-journeys.md) | Step-by-step journeys. Reflects earlier framing. | Update later |
| [slice1-discovery](./slice1-discovery.md) | A discovery service — still a later convenience, not the first slice. | Unchanged |

A new file is being added: [`architecture-validation`](../../research/2026-06-05-architecture-validation.md) — captures the live cross-org repoless verification and the CitiSignal One worked-example findings as primary-source evidence.

## Provenance

Grew out of "hook the extension to an existing AEM Sites deployment and demo the same content from DA.live *and* AEM Sites." Research killed simultaneous dual-authoring (one storefront = one content source) and reframed the goal as "two sites, identical look, own content each." For weeks the locked plan was **two-fork-sync**: each SC forks the upstream and the extension's sync engine keeps them aligned. The 2026-06-05 repivot replaced that with **repoless**: one repo, multiple sites pointing at it via the Configuration Service. Cross-org validated live 2026-06-05; AEM Sites + xcom architecture confirmed via CitiSignal One as the worked example. The full RPTC research/decision trail lives in git history on `claude/commerce-connect-slice-1-plan-bgVlb`.

## Kickoff prompt

> **Branch (read first):** all of these design docs live on `claude/commerce-connect-slice-1-plan-bgVlb` — they are **not** merged to `main` / `develop`. Start the next session on that branch, and create the implementation branch **from it** so the docs travel along:
> `git switch claude/commerce-connect-slice-1-plan-bgVlb && git switch -c <impl-branch>`
> Do **not** branch from `develop` (the docs won't be there).
>
> **If you're ready to build:** read [storefront-topology](./storefront-topology.md) (locked architecture + validation evidence), then **`/rptc:plan` Slice 1 — the repoless wiring with per-org content sources**. The roadmap and synthesis-and-build-order docs still carry pre-repivot framing in places; treat storefront-topology as the source of truth where they diverge until they're updated.
>
> **No live AEM environment needed** for Slice 1 — the wizard wiring (repoless satellite via Configuration Service, config-as-content writer) is buildable against the Admin API directly. AEM Sites authoring as a content source is a separate Slice that picks up after Slice 1.
