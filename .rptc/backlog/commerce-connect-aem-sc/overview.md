# Two-SC synced storefront demos (commerce + content)

**Filed:** 2026-06-02 · **Re-aimed:** 2026-06-03 · **Status:** backlog (designed, paused — ready to promote when activated).

This file is the front door — read it first.

> **2026-06-03 re-aim.** Earlier drafts framed V1 as a single commerce demo that "connects out" to other Adobe apps (including pulling in AEM content). **That was the wrong target.** V1 is the **synced common storefront** described below. The other docs in this folder still carry some of the older framing — this overview is the current source of truth; each doc is flagged in the table.

## What we're building (V1)

A way for **two solutions consultants** to build **one demo storefront together**, even though they work in **separate Adobe accounts**:

- a **Commerce SC** — owns the commerce backend (products, cart, checkout), and
- a **Content SC** — owns the content, authored in **AEM Sites**.

### How it works (the locked target)

- A neutral **upstream** holds the shared storefront **code** (commerce dropins + shared design), based on a commerce boilerplate that supports **AEM Sites authoring** (`aem-boilerplate-xcom`). It's code, not a live site; maintained by the Commerce SC.
- **Both SCs fork the upstream** into their own org and sync from it → the two sites are **identical in look/system**.
- **Each SC authors their own content** into their fork — and **the Content SC authors in their *own* AEM Sites** (the non-negotiable point). Identical code, different content.
- **Both forks carry full commerce and both transact** against the **Commerce SC's backend** (by URL).

### Why two sites, not one

Adobe EDS's **canonical-site rule** (one repo = one org's site; one content source per site) means a single live storefront can't span two accounts — so the result is **two forks** sharing the codebase. The Content SC's AEM-Sites authoring is the org-bound piece that forces the split, and we **accept** that rather than work around it. Full detail + decision trail in **[storefront-topology](./storefront-topology.md)**.

### Target vs later

- **Target:** Scenario B · Option X · **two identical transacting forks**; both SCs on the extension (content-SC wizard); each authors their own content; **Content SC in their own AEM Sites**; both wired to the Commerce SC's backend.
- **Later:** two-way contribution (the Content SC evolving the *shared design*, not just content); an invite/handoff between the SCs; shared cart/session across the two sites.

## Why this isn't from scratch (verified against the code, 2026-06-03)

Most of the pieces already exist — V1 mostly **assembles them across two SCs**. See the [roadmap](./roadmap.md) for the per-step EXISTS/PARTIAL/NET-NEW grounding and file references.

- a **sync engine** that already pulls a fork from a configurable upstream, one-directional, with conflict handling — **and already preserves each fork's `config.json`/`fstab.yaml` across syncs** (so the backend wiring and content source survive an upstream update);
- **installers** that already add parts (block libraries / feature packs) into a storefront repo;
- **Connect-Commerce** that already writes the backend connection (`config.json`).

## What's genuinely new (and where the real work is)

- **AEM Sites as a content source** — the extension is **DA.live-only** today; this is the biggest net-new piece.
- **The upstream + multi-fork orchestration:** one neutral upstream that **two separately-owned forks in two different accounts** both sync from. Today everything is single-project, one active GitHub account, 1:1 sync. **This is the heart of the build.**
- **Re-verify live:** reading the commerce backend across accounts, the AEM code-sync app, `aem-boilerplate-xcom` maturity, CORS (Adobe docs block programmatic fetch — verify live before code lands).

**Two things that turned out *not* to be problems:** a "shared mesh/backend" (just the same URL in each fork's `config.json` — already written by Connect-Commerce) and a "shared content site" (not possible *and* not needed — each fork has its own content source).

## Out of scope

- The deep "solution-family" product-selection refactor.
- Seeding content into AEM (the Content SC authors it).
- The optional SEO prerenderer.

## Documents

| Doc | What it is |
|---|---|
| [storefront-topology](./storefront-topology.md) | **The authoritative architecture** — the Adobe canonical-site rule, what can/can't be shared across orgs, the two shapes, and the upstream decision (neutral, seeded, full symmetry). |
| [roadmap](./roadmap.md) | **The build sequence** — the increments toward shape 2, each tagged EXISTS/PARTIAL/NET-NEW with file refs. |
| [federated-two-instance-demos](./federated-two-instance-demos.md) | The **two-SC / synced-copy delivery model** — now V1-central (it was filed as "deferred"). |
| [aem-sc-first-run](./aem-sc-first-run.md) | The **content-SC-owned storefront** flow + **AEM Sites** as the content-authoring tool — the V1 model. |
| [commerce-connection-kit](./commerce-connection-kit.md) | The **commerce-backend connection** detail (now one step *inside* the synced storefront) + the cross-account read caveat. |
| [ownership-vs-connection](./ownership-vs-connection.md) | Earlier organizing model ("connection-as-primitive / commerce-hub"). **Superseded framing** — kept for the research trail. |
| [user-journeys](./user-journeys.md) | Step-by-step journeys — **reflects the earlier framing**; see the roadmap for the corrected V1. |
| [slice1-discovery](./slice1-discovery.md) | A discovery service — **now a later convenience, not the first slice** (the Commerce SC owns the backend in V1). |

## Provenance

Grew out of "hook the extension to an existing AEM Sites deployment and demo the same content from DA.live *and* AEM Sites." Research killed simultaneous dual-authoring (one storefront = one content source) and cross-account code sharing as a single repo (so: a master + synced copies instead). It established that the commerce **backend can be read from another account** (read path needs only a URL + public keys), which is what lets the Content SC's copy show the Commerce SC's products across accounts. The full RPTC research/decision trail lives in git history on `claude/commerce-connection-kit-research`.

## Kickoff prompt

> Promote `commerce-connect-aem-sc` from the backlog. Read [storefront-topology](./storefront-topology.md) first (architecture), then start with step 1 of the [roadmap](./roadmap.md) — **shape 1: combine commerce into a Content-SC storefront** — on a feature branch, RPTC TDD loop. Re-read the roadmap before each subsequent step; write detailed plans just-in-time.
