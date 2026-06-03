# Two-SC synced storefront demos (commerce + content)

**Filed:** 2026-06-02 · **Re-aimed:** 2026-06-03 · **Status:** backlog (designed, paused — ready to promote when activated).

This file is the front door — read it first.

> **2026-06-03 re-aim.** Earlier drafts framed V1 as a single commerce demo that "connects out" to other Adobe apps (including pulling in AEM content). **That was the wrong target.** V1 is the **synced common storefront** described below. The other docs in this folder still carry some of the older framing — this overview is the current source of truth; each doc is flagged in the table.

## What we're building (V1)

A way for **two solutions consultants** to build **one demo storefront together**, even though they work in **separate Adobe accounts**:

- a **Commerce SC** — owns the commerce backend (products, cart, checkout), and
- a **Content SC** — owns the content, authored in **AEM Sites**.

### How it works

- For each demo pairing, there is **one master storefront** — the shared source of the storefront's parts.
- Each SC has their **own copy** of the storefront (their own repo, in their own account) that **auto-syncs from the master**.
- The **Commerce SC adds the commerce parts** (the product pages, cart, checkout — "commerce blocks") to the master **from the commerce boilerplate** → they flow into both copies.
- The **Content SC authors the content in AEM Sites** → it shows up in the storefront.
- Each copy is wired to the **Commerce SC's commerce backend** for live products and pricing.
- **Result:** both SCs see the same, always-current storefront that blends their content and commerce.

### Why separate copies (not one shared site)

The two SCs are in **different Adobe accounts**, so they can't literally share one running site. A **master + auto-synced copies** is the only workable shape — and that account split is exactly *why* the answer is a shared (synced) storefront rather than a one-off connection between two finished demos.

### V1 vs later

- **V1:** the master + synced copies; the Commerce SC adds the commerce parts; content via AEM Sites; each copy wired to the commerce backend.
- **Later:** **either** SC can add the commerce parts (V1 = only the Commerce SC); two-way contribution (the Content SC contributing custom parts back); a convenience that reads a partner's commerce-backend details from a URL instead of entering them by hand.

## Why this isn't from scratch

The extension already has the three ingredients; V1 mostly **assembles them across two SCs**:

- a **sync engine** — it already keeps a project's parts up to date from a master source (the auto-update system);
- **installers** — it already adds parts (block libraries / feature packs) into a storefront;
- **Connect-Commerce** — it already wires a storefront to a commerce backend.

## What's genuinely new / risky

- A **master + synced copies** setup that spans **two SCs' repos in different accounts** — who can write to the master, how the copies get created.
- Keeping the **backend wiring local** to each copy, so a sync doesn't overwrite it.
- **Merge/conflict** handling when a sync brings commerce parts into a copy that already has local content.
- **Re-verify live:** reading the commerce backend across accounts (research couldn't fetch Adobe's docs programmatically, so the cross-account specifics need a live check before code lands).

## Out of scope

- The deep "solution-family" product-selection refactor.
- Seeding content into AEM (the Content SC authors it).
- The optional SEO prerenderer.

## Documents

| Doc | What it is |
|---|---|
| [roadmap](./roadmap.md) | **The build sequence** (re-aimed) — what V1 builds, in order, and which existing piece each step reuses. |
| [federated-two-instance-demos](./federated-two-instance-demos.md) | The **two-SC / synced-copy delivery model** — now V1-central (it was filed as "deferred"). |
| [aem-sc-first-run](./aem-sc-first-run.md) | The **content-SC-owned storefront** flow + **AEM Sites** as the content-authoring tool — the V1 model. |
| [commerce-connection-kit](./commerce-connection-kit.md) | The **commerce-backend connection** detail (now one step *inside* the synced storefront) + the cross-account read caveat. |
| [ownership-vs-connection](./ownership-vs-connection.md) | Earlier organizing model ("connection-as-primitive / commerce-hub"). **Superseded framing** — kept for the research trail. |
| [user-journeys](./user-journeys.md) | Step-by-step journeys — **reflects the earlier framing**; see the roadmap for the corrected V1. |
| [slice1-discovery](./slice1-discovery.md) | A discovery service — **now a later convenience, not the first slice** (the Commerce SC owns the backend in V1). |

## Provenance

Grew out of "hook the extension to an existing AEM Sites deployment and demo the same content from DA.live *and* AEM Sites." Research killed simultaneous dual-authoring (one storefront = one content source) and cross-account code sharing as a single repo (so: a master + synced copies instead). It established that the commerce **backend can be read from another account** (read path needs only a URL + public keys), which is what lets the Content SC's copy show the Commerce SC's products across accounts. The full RPTC research/decision trail lives in git history on `claude/commerce-connection-kit-research`.

## Kickoff prompt

> Promote `commerce-connect-aem-sc` from the backlog. Start with step 1 of the [roadmap](./roadmap.md) — the **master + synced copy** backbone — on a feature branch, RPTC TDD loop. Re-read the roadmap before each subsequent step; write detailed plans just-in-time.
