# Storefront topology — the locked plan of record

**Filed:** 2026-06-04 · The **authoritative architecture** for this feature. Read after [overview](./overview.md).

## The decision (locked 2026-06-04)

**Scenario B · Option X · two identical transacting forks.**

- **Both SCs use the extension** (Scenario B). The Content SC gets a dedicated **content-SC wizard**.
- The two storefronts are **forks of one shared upstream** → **identical look/system** (Option X: shared whole codebase, kept in sync).
- **Each SC authors their own content** into their own fork. **The Content SC authors in their *own* AEM Sites, in their own org — this is the non-negotiable point of the whole feature.**
- **Both forks carry the full commerce dropins and both transact** against the **Commerce SC's backend**.
- We **accept the two-org reality** (AEM Sites is org-bound; that's the point) rather than engineer around it.

The **spine and the gating unknown is the same thing: AEM Sites as a content source** (the extension is DA.live-only today).

## The rule everything bends around

Adobe EDS has a **canonical-site rule: one repo serves exactly one org's site** — no single live repo spans two Adobe orgs; the sanctioned move is **fork into your own org**. And **one site has exactly one content source**. *(grounded in [`configurationService.ts`](../../../src/features/eds/services/configurationService.ts); established in [commerce-connection-kit](./commerce-connection-kit.md).)* This is *why* the target is **two forks**, not one shared live site — and why the Content SC's AEM-org binding forces the split.

## What can and can't be shared across the two orgs

| Layer | Shareable? | How |
|---|---|---|
| **Content** (AEM-authored pages) | **No** | One site = one content source, org-bound. Each fork authors its own. |
| **Code / design / commerce** | **Yes** | The shared **upstream** that each org **forks** and syncs. |
| **Commerce backend** | **Yes** | Consumed by URL + public keys; org-agnostic. |

## How it works

```
        Neutral UPSTREAM  (commerce boilerplate that supports AEM authoring — "xcom")
        shared design + blocks + full commerce dropins · Commerce SC maintains
               │ fork + sync                │ fork + sync
     ┌─────────▼──────────┐      ┌──────────▼───────────┐
     │ Commerce SC FORK   │      │ Content SC FORK       │
     │ (org A)            │      │ (org B)               │
     │ authors own content│      │ authors content in    │
     │                    │      │ THEIR OWN AEM Sites    │
     │ full commerce ─┐   │      │ full commerce ─┐      │
     └────────────────┼───┘      └────────────────┼──────┘
                      └──► Commerce SC's backend (by URL) ◄──┘
        Identical look (shared code) · own content each · BOTH transact
```

- Both forks are children of the **same upstream**, so they look and behave identically — *except* the content each authors.
- **Both transact** — and this is *least* risky here, because both forks *are* the commerce boilerplate, so the cart/checkout dropins belong by construction (no graft).
- Each fork keeps its **own content source + backend config**; the sync engine already **preserves** those across syncs.

## The upstream

- **Neutral repo, seeded from a commerce boilerplate that supports AEM Sites authoring** (the `aem-boilerplate-xcom` family — commerce dropins + Universal-Editor/xwalk authoring). This is the linchpin: the shared code must let a fork be authored via AEM Sites.
- **Identity comes from a mirrored package.** When both SCs pick the same demo identity (e.g. "CitiSignal") from their respective wizards, that package defines the upstream's brand/design — so the two forks **align by construction**, no manual coordination. See the [compositional demo builder](../compositional-demo-builder.md) direction (packages *within* composition, mirrored across owning systems).
- **Hosted** in a neutral/shared GitHub org (GitHub isn't Adobe-org-bound); **maintained by the Commerce SC**.
- **Full symmetry:** both SCs' demos are forks of it.
- **Shared design lives in the upstream; content is per-fork.** To keep the two sites identical, design/code changes go to the **upstream** (centrally). The Content SC evolving the *shared design* (vs their content) is **two-way contribution — later**.
- Each fork sets its **own content source**: the Content SC's is **their AEM Sites**; the Commerce SC's is whatever the xcom base supports (their AEM or DA.live — a detail to confirm).

## The mesh — optional, not necessarily cross-org

**API Mesh** stitches commerce services into one endpoint and holds keys server-side. It's a **convenience, not a requirement** — the config generator falls back to a direct backend URL when no mesh is deployed *([`configGenerator.ts`](../../../src/features/eds/services/configGenerator.ts))*. PaaS usually wants one; SaaS often doesn't. And cross-org is a choice: **default to a mesh per org** (each fork calls its own org's mesh → no cross-org call), rather than both forks sharing the Commerce SC's one mesh.

## Alternative topology: Configuration-Service "repoless" model

> Discovered 2026-06-04 in [`config-service-setup`](https://www.aem.live/docs/config-service-setup). Documented here so future passes know it exists; **the two-fork model above remains primary for Slice 1** because the extension's sync engine already supports it and the Slice-1 step list is grounded in that shape.

The Configuration Service decouples a "site" from its GitHub repo. A site becomes `(org, site)` and points at a separately-named code repo plus a separately-named content source. Verbatim:

> "it is now possible to have multiple sites that use different content, but use the same code repository. This feature is also known as **'repoless'**."

For two SCs sharing one upstream codebase, that opens a topology the two-fork model rules out:

```
Commerce SC's aem.live site (org A) ──┐
                                       ├──► same GitHub code repo (the upstream)
Content SC's   aem.live site (org B) ──┘
                                       └► each site points at its own content source
                                          (Content SC's → their AEM Sites)
```

**Two sites, one code repo, two content sources. No fork. No sync engine.** The "shared design lives in the upstream" property is achieved *by construction* because both sites point at the same repo.

### The constraint that complicates it

> "For projects that want to use multiple sites with the same code repository (repoless), there must be **one canonical site for which the `org/site` matches the GitHub `owner/repo`**. This is required for proper code-config association and CDN push invalidation."

One SC becomes the canonical anchor. Commerce SC fits naturally (they maintain the upstream). The asymmetry is not yet stress-tested in the docs — what breaks if the canonical site goes away isn't stated.

### Two further setup facts

- Each `aem.live` org **must also exist as a `github.com` org** with at least one repo synced via the AEM Code Sync App. Cross-account: each SC needs both an `aem.live` and a matching `github.com` org.
- The Configuration Service can set arbitrary CORS headers on a site via `POST /config/{org}/sites/{site}/headers.json` — relevant to the cross-org CORS question (see [cross-org-cors-and-mesh research](../../research/2026-06-04-cross-org-cors-and-mesh.md), addendum).

### Why this is parked, not picked

The Slice-1 build sequence and the existing sync engine assume the two-fork model. Adopting "repoless" would mean rewriting Slice 1's reuse map. The trade comes due if the two-fork sync turns out to be more friction than expected, or if Slice 2+ needs the asymmetric anchor model anyway. Either way, the option exists.

## Reuse vs net-new

| Reuses today | Net-new |
|---|---|
| Fork-from-template + the **sync engine** (keeps forks identical, preserves per-fork content source + backend); the **commerce dropins**; **Connect-Commerce** | **AEM Sites as a content source** (the spine — DA.live-only today) · the **content-SC wizard** · the **two-fork / cross-account orchestration** |

## Accepted trade-offs

- **Two-org complexity is accepted** (the cost of AEM Sites authoring being the point).
- **Two sites, not one** (canonical rule) — unified by shared *code*, differentiated by content.
- **Separate cart/session per site** (different domains) unless shared auth is deliberately wired — "same engine + catalog, two sites," not "one cart across both."

## Needs live verification (critical-path first)

1. **AEM Sites as a content source, transacting** — can an `xcom`-style upstream be authored via AEM Sites in the Content SC's own org *and* transact against the backend? *(The spine — verify before committing to the build. Runbook: [verify-aem-sites-spike](./verify-aem-sites-spike.md). Desk research confirms it's a standard capability; the spike is end-to-end confirmation.)*
   - note: PDP URLs need *a* routing mechanism — **folder mapping** (deprecated but functional; client-side; transacts) **or** the **AEM Commerce Prerenderer** (App Builder app; real per-product HTML via content-overlay → falls back to the AEM-authored source). Transacting needs *a* mechanism but **not** the prerenderer; because folder mapping is deprecated, the prerenderer is the **durable build-time** PDP-routing choice per fork — never a transaction blocker. Bonus: overlay+fallback lets prerendered product pages and AEM-authored content **coexist in one storefront**.
2. The **AEM code-sync app** (connecting the fork to the Content SC's AEM).
3. `aem-boilerplate-xcom` maturity.
4. **CORS** allow-listing both storefront domains on the backend.
5. Cross-account **commerce backend read** (high confidence, but unverified live).

(Adobe docs block programmatic fetch — verify in a live environment before code lands.)

## Decision trail (how we got here)

- **Scenario A dropped** — Commerce SC grafting commerce into a non-extension Content SC's existing storefront carried the worst integration risk *and* couldn't be push-button (the extension can't reach the Content SC's Adobe org). A "shoppable content" variant was considered and set aside in favor of full B.
- **Option Y dropped** — "commerce as an installable kit" gives two *different*-looking sites; "identical look" requires sharing the whole codebase (X).
- **Rows 1 & 2 dropped** (shared DA.live single site / guest-authoring) — both sacrifice the Content SC authoring in their *own* AEM Sites, which is the point.
