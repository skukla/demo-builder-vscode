# Storefront topology — the locked plan of record

**Filed:** 2026-06-04 · **Repivoted:** 2026-06-05 (repoless as the architecture). The **authoritative architecture** for this feature. Read after [overview](./overview.md).

## The decision (locked 2026-06-05)

**Repoless: one shared codebase, per-site content sources.**

- **One shared code repo (the upstream)** owned by the Commerce SC. Both SCs' `aem.live` sites point at this repo as their code source. No forks. No sync engine.
- **Each SC's `aem.live` site is its own (org, site) pair** with its own content source. The Content SC's site points at **their own AEM Sites**, in their own Adobe org — the non-negotiable point of the feature.
- **The Commerce SC's site is the canonical anchor** (Adobe's repoless rule requires one canonical site whose `org/site` matches the GitHub `owner/repo`). The Content SC's site is a satellite that reads the same code via the Configuration Service API.
- **Commerce config travels as authored content**, not baked code — config nodes are authored in AEM (`/content/<site>/configs`, `configs-stage`, `configs-dev`), and `paths.json` maps them to the runtime endpoints. Each site authors its own commerce wiring; the Commerce SC's backend URL/keys are public, so the Content SC's site can read them directly.
- **Both sites carry the full commerce drop-ins and both transact** against the **Commerce SC's backend**.

The result: two sites with identical look and behavior, each with its own content and its own per-environment commerce config, sharing one codebase by construction.

## Why this is locked: the validation evidence (2026-06-05)

Two live verifications close the architectural questions.

### Cross-org repoless works at runtime

The `verify-repoless-cross-org` spike pushed a marker to a code repo owned by GitHub org A and confirmed it appeared on an `aem.live` satellite site owned by org B within 45 seconds. The Admin API accepted the cross-org configuration (`PUT /config/{orgB}/sites/{site}.json` with `code.owner = orgA` → HTTP 201) and the runtime propagated the code change cleanly. The full test artifacts:

- Phase 3 (API acceptance): `201 Created` on cross-org satellite registration
- Phase 4 (runtime propagation): marker pushed to `skukla/repoless-spike/head.html` appeared in `https://main--satellite--kukla-demos.aem.page/head.html` within one sync cycle
- Live evidence captured in [`architecture-validation`](../../research/2026-06-05-architecture-validation.md)

### AEM Sites + xcom architecture works in production today

The public repo [`roberttoddhoven/citisignal-one`](https://github.com/roberttoddhoven/citisignal-one) is a working `xcom`-shaped commerce storefront authored via AEM Sites. Its `paths.json` shows the runtime mapping pattern this plan adopts:

```json
"mappings": [
  "/content/rth-citisignal-one/:/",
  "/content/rth-citisignal-one/configuration:/.helix/config.json",
  "/content/rth-citisignal-one/configs:/configs.json",
  "/content/rth-citisignal-one/configs-stage:/configs-stage.json",
  "/content/rth-citisignal-one/configs-dev:/configs-dev.json",
  ...
]
```

Configuration is authored as content nodes, multi-environment configs travel as content, drop-ins render correctly. The architecture the plan is locking in **already runs in production** — there's no novel engineering risk for the AEM Sites side.

## The rule that no longer bends the topology

Adobe EDS still has its canonical-site rule: **one repo serves exactly one canonical site, and one site has exactly one content source**. What changed in the analysis is that **repoless lets multiple sites share that one repo as their code source** — they each remain "exactly one site, exactly one content source," they just happen to point at the same code. The cross-org constraint we previously thought forced two forks is satisfied by repoless without forking.

The rule that still constrains: **one canonical site per code repo**. The Commerce SC is that canonical anchor. The Content SC's site is a satellite. The asymmetry is real (see Accepted trade-offs).

## What can and can't be shared across the two orgs

| Layer | Shareable? | How |
|---|---|---|
| **Code / design / commerce drop-ins** | **Yes** | One GitHub repo, both sites point at it as their code source |
| **Content** (AEM-authored pages) | **No** | Each site has exactly one content source; the Content SC's points at their AEM |
| **Commerce config** (endpoints, keys, store headers) | **Yes — published** | Authored as content in the Commerce SC's site; the Content SC's site reads the same upstream values or authors its own |
| **Commerce backend** | **Yes** | Consumed by URL + public identifiers; the Merchandising API documents itself as requiring no authentication |

## How it works

```
                  Shared GitHub code repo (the upstream)
                  owned by Commerce SC · Code Sync installed
                                   │
                                   │ (code propagates to all sites)
                                   │
              ┌────────────────────┴───────────────────┐
              │                                        │
              ▼                                        ▼
   ┌──────────────────────┐                ┌──────────────────────┐
   │ Commerce SC's site    │                │ Content SC's site     │
   │ (canonical anchor;    │                │ (repoless satellite;  │
   │  org/site = owner/repo)│                │  code.owner = Commerce│
   │                       │                │  SC's GitHub org)     │
   │ content: Commerce SC's │                │ content: Content SC's │
   │ AEM (or DA.live)      │                │ AEM Sites (own org)   │
   │ commerce config:      │                │ commerce config:      │
   │   own (configs node)  │                │   own (configs node)  │
   │ full commerce ────┐   │                │ full commerce ────┐   │
   └──────────────────┼───┘                └──────────────────┼───┘
                      │                                        │
                      └──► Commerce SC's backend (by URL) ◄────┘
                           Adobe Commerce as a Cloud Service
                           (Merchandising API requires no auth)

Identical code · own content each · own per-env config · BOTH transact
```

- Both sites are children of the **same code repo**, so they look and behave identically — *except* the content each authors and any per-site config overrides.
- **Both transact** — the drop-ins belong by construction (no graft).
- Each site keeps its **own content source and its own authored config** (per-env). The Commerce SC's backend URL/keys are public; each site stores its own copy of those values in its own AEM content tree.

## The upstream

- **Public GitHub repo, seeded from `aem-boilerplate-xcom`** (the commerce boilerplate that supports AEM Sites authoring — Universal Editor / xwalk authoring + full commerce drop-ins). The CitiSignal One repo is the live worked example of this shape.
- **Owned by the Commerce SC's GitHub org** (which matches their `aem.live` org name — the canonical-site rule).
- **AEM Code Sync App installed on it** by the Commerce SC. The Content SC's site references it via `code.owner = "<commerce-sc-org>"` in its Configuration Service site config — no Code Sync install needed on the Content SC's side.
- **Identity comes from a mirrored package.** When both SCs pick the same demo identity (e.g. "CitiSignal") from their respective wizards, the package defines the upstream's brand/design. Both sites already align by construction because they share the codebase; the package is what tells them *which* codebase to point at. See the [compositional demo builder](../compositional-demo-builder.md) direction (packages *within* composition).

## Creating a satellite — the locked mechanic (Option B, the Adobe-native path)

**A repoless satellite is a Configuration Service entry that references upstream code — not a fork, not a copy.** The Content SC's extension creates it with a single cross-org Admin API call:

```
PUT /config/{contentSC-org}/sites/{site}.json
  code:    { owner: <commerceSC-org>, repo: <upstream> }
  content: { source: { url: <Content SC's DA.live URL>, type: 'markup' } }
```

What the extension does **not** do for a satellite, by design:

- **No fork / `createFromTemplate`** — the satellite has no GitHub repo of its own.
- **No AEM Code Sync App install on the Content SC's side** — Code Sync lives only on the Commerce SC's canonical repo; the satellite reads the upstream through the `code` reference, and pushes to the upstream propagate to it through the canonical's Code Sync.
- **No code-sync verification** on the joiner's side (nothing to verify — there is no owned repo).
- **No GitHub config-push** — commerce config travels as content (config-as-content, below), never committed to the code repo; and you never push to a repo you don't own.

The joiner's only sign-in is **Adobe-side** (DA.live / IMS, for their own content and the PUT); the upstream's repo identity is resolved from the public `storefront-share.json` with an unauthenticated read — **no GitHub sign-in on the happy path**.

**One-time org prerequisite (not per-satellite):** each `aem.live` org must have a matching `github.com` org with at least one Code-Sync-synced "anchor" repo (the `kukla-demos/anchor` pattern from the live spike). This is org setup, separate from per-satellite creation.

**Site identity ≠ code source (the principle that drives the wiring).** A satellite's aem.live **site** is `{contentSC-org}/{site}` (its own `daLiveOrg/daLiveSite`); its **code** is the upstream (`code.owner/repo`). The canonical case conflates them (repo == site), but a satellite splits them, and the split is load-bearing: **Helix operations** (preview/publish/purge) target the satellite's *site*, while **code/component reads** target the *upstream*. This is the deeper form of the canonical-site rule — "one site, one content source" still holds; the code source is just a reference that may point elsewhere. *(Implementation-validated 2026-06-06: the build threads a site-vs-code split through the content pipeline and gates the joiner's config-push off, since `repoUrl` doubles as the local clone source.)*

> **Why this and not the alternative.** The rejected Option A reused the full EDS storefront-setup pipeline with the satellite's `repoInfo` pointed at the upstream. That would run the GitHub-App-install check, code-sync verification, and the `config.json`-push against a repo the joiner does **not** own — all anti-patterns under repoless. Option B mirrors Adobe's documented mechanism 1:1 ([aem.live/docs/repoless](https://www.aem.live/docs/repoless)); A re-skins the two-fork model repoless was meant to replace. Decision locked 2026-06-06.

The cross-org form of this exact PUT is what the 2026-06-05 spike verified live (HTTP 201 + 45s propagation — see [architecture-validation](../../research/2026-06-05-architecture-validation.md)).

## Configuration as content (the CitiSignal pattern)

Commerce wiring values — `commerce-core-endpoint`, `commerce-endpoint`, `x-api-key`, `Magento-Environment-Id`, store headers — are **authored as content nodes in AEM**, not committed to GitHub. The `paths.json` file in the repo maps content-tree paths to runtime JSON endpoints:

```
/content/<site>/configs        →   /configs.json        (production wiring)
/content/<site>/configs-stage  →   /configs-stage.json  (stage wiring)
/content/<site>/configs-dev    →   /configs-dev.json    (dev wiring)
/content/<site>/configuration  →   /.helix/config.json  (default fallback)
```

This is why having three AEM environments (dev/stage/prod) maps cleanly onto repoless: **one site per environment**, each pointing at its own AEM content source with its own commerce config nodes — same code across all three. Promotion is content authoring, not code merging.

The Content SC's site authors its own `configs*` nodes. The values they author can mirror the Commerce SC's (the read path needs only public values, so the Commerce SC can publish them in their own storefront's config and the Content SC can copy or programmatically discover them — see [commerce-connection-kit](./commerce-connection-kit.md)).

## The mesh — optional, not necessarily cross-org

**API Mesh** stitches commerce services into one endpoint and holds keys server-side. It is a **convenience, not a requirement** — the config generator falls back to a direct backend URL when no mesh is deployed *([`configGenerator.ts`](../../../src/features/eds/services/configGenerator.ts))*. PaaS usually wants one; ACCS often does not (the Merchandising API requires no authentication and CORS is handled at the edge). When a mesh is in play, default to **a mesh per org** (each site calls its own org's mesh) rather than sharing the Commerce SC's mesh across both. Details: [cross-org-cors-and-mesh research](../../research/2026-06-04-cross-org-cors-and-mesh.md).

## Reuse vs net-new

| Reuses today | Net-new |
|---|---|
| `aem-boilerplate-xcom` template + commerce drop-ins · `ConfigurationService.ts` (already talks to the Config Service API) · Connect-Commerce flow · existing site-creation machinery | **Content-SC wizard** (creates a repoless satellite via `PUT /config/{org}/sites/{site}.json` rather than forking) · **AEM Sites as a content source** flow (the spine — the extension is DA.live-only today) · **Config-as-content writer** (writes `configs.json` etc. to the AEM content tree rather than committing `config.json` to the repo) |

The shrink vs the two-fork model: **no sync engine work, no fork-from-template orchestration, no per-fork config preservation logic**. The Configuration Service API replaces all of it with a single PUT.

## Accepted trade-offs

- **Asymmetric ownership.** The Commerce SC owns the codebase. The Content SC is a satellite — they cannot modify code without forking out of the repoless arrangement (which is still available as an escape hatch — see below). For demo use the asymmetry is the right shape: code is platform discipline, content is per-tenant freedom.
- **Shared blast radius for code.** A bug pushed to the upstream affects both sites simultaneously. Acceptable for demo infrastructure; recoverable in minutes via revert. Not acceptable for production sites, which is not the use case.
- **One canonical-site dependency.** If the Commerce SC's canonical site is destroyed (deletion, lost access), the Content SC's satellite loses its code source. The mitigation is the standard one — multiple admins on the canonical, and the satellite owner can always exit to a fork if needed.
- **Separate cart/session per site** (different domains) unless shared auth is deliberately wired — "same engine + catalog, two sites," not "one cart across both."

## Escape hatch: fork-and-own-your-code

If a Content SC genuinely needs to customize code in ways the shared codebase does not support, they fork the upstream into their own GitHub org, install Code Sync on the fork, and switch their site's `code.owner` from the Commerce SC's org to their own. The two-fork-sync model becomes an opt-in tier for that case. The wizard does not need to support this on day one — manual repointing is a config change, not a build.

## Needs live verification (remaining open items)

The high-priority verifications are closed (cross-org repoless: ✅, AEM Sites + xcom: ✅ via CitiSignal One). Remaining:

1. **Cross-account cart/checkout transacting end-to-end.** The read path is closed by [Adobe's Merchandising API docs](https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api) ("Authentication is not required"). The write path (cart, checkout) was not tested live during the spike. Documentation triangulation says it should work via ACCS edge CORS; a single `Origin`-header probe against the core ACCS endpoint would close the question definitively. Not a build gate — worth running at convenience.

(Earlier list items — AEM code-sync app, `aem-boilerplate-xcom` maturity, CORS handshakes — are now closed by the CitiSignal One existence proof and the [Adobe Merchandising API docs](https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api). Folder mapping is no longer relevant since repoless sites use the Configuration Service path mappings.)

## Decision trail (how we got here)

- **Original V1 framing rejected** — "single commerce demo that connects out to other Adobe apps" was the wrong target; the two-SC synced storefront is the real shape.
- **Scenario A dropped** — Commerce SC grafting commerce into a non-extension Content SC's existing storefront carried the worst integration risk *and* couldn't be push-button (the extension can't reach the Content SC's Adobe org).
- **Option Y dropped** — "commerce as an installable kit" gives two *different*-looking sites; "identical look" requires sharing the whole codebase.
- **Two-fork-sync model rejected (2026-06-05)** — was the locked plan as of 2026-06-04 based on a narrow reading of the canonical-site rule. The post-research dig into the Configuration Service revealed repoless as Adobe's first-class capability for "multiple sites, one codebase." The cross-org repoless live test confirmed it works at runtime. The fork-and-sync model's autonomy is insurance against problems demos don't usually have; repoless aligns better with the compositional direction and removes most of the orchestration cost. Fork-and-sync survives as the explicit escape hatch for the rare Content SC who needs code customization.
- **Rows 1 & 2 dropped** (shared DA.live single site / guest-authoring) — both sacrifice the Content SC authoring in their *own* AEM Sites, which is the point.
