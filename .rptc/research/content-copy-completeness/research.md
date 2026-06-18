# Content-copy completeness — the "silently-dropped content" bug class

**Filed:** 2026-06-18 · **Status:** RESEARCH — systemic analysis (prompted by the `/customer/nav`
finding). · **Priority:** HIGH — recurring, owner-facing, currently caught only by manual reports

> **The bigger question (from the PM):** the `/customer/nav` bug is one missing document — *"are
> there other blocks/dropins/features hiding in plain sight, and is there a comprehensive
> approach?"* **Yes, there are almost certainly more, and yes — the fix is structural, not another
> path added to a list.** This doc names the bug class, the two confirmed instances, why it keeps
> happening, the likely additional blind spots, and a defense-in-depth approach.

## The bug class: incomplete content reproduction

When the builder creates an EDS storefront, it reproduces the source site's **content** by:

1. **Enumerate** authored paths — DA.live *list* API if the user belongs to the source org, else
   the CDN **content index** (`full-index.json`).
2. **Backfill** a few known-not-indexed paths from **hardcoded lists**.
3. **Copy** each path's `.plain.html` from the public CDN into the user's DA.live site.

A working storefront, however, also needs documents that are **(a) not in the index** *and*
**(b) not in any backfill list** — or that must be **generated** (catalog-derived). Anything in
that gap is **silently dropped**: no error, just a blank menu or a 404 that a user eventually
reports. That is the class. `/customer/nav` is one instance; it is not the only one.

## Confirmed instances (2)

1. **`/customer/nav` — the B2B account menu fragment** (this week). The account page embeds the
   nav fragment; the fragment isn't indexed and isn't in `essentialFragments` (`/nav`, `/footer`
   only) → empty account left-nav → "no B2B features." See
   `.rptc/research/b2b-account-features-missing/research.md`.
2. **Per-product PDP pages** (`.rptc/research/b2b-pdp-404-gap/findings.md`, 2026-06-08). The B2B
   Boilerplate builder never authors `/products/{urlkey}/{sku}` pages, so every PDP 404s; a
   colleague hand-created 25 pages from `/products/default`. Different sub-mechanism
   (catalog-derived, must be *generated* not *copied*) but the **same family**: the builder's
   content reproduction is incomplete relative to what a working storefront needs.

Two independent instances, both on the B2B path, both found by users in the field — strong signal
the current approach leaks by design.

## Why it keeps happening (root, structural)

`daLiveContentOperations.ts` discovery is **enumerate-then-hardcoded-backfill**, with the
backfills spread across **four separate, inconsistent lists** and **no reference-following** and
**no post-copy completeness check**:

| List | Location | Covers | Gap |
|---|---|---|---|
| `essentialSpreadsheets` | `daLiveContentOperations.ts:1843` | `/placeholders`, `/redirects`, `/metadata`, `/sitemap` | section placeholders? |
| `essentialFragments` | `:1858` | `/nav`, `/footer` | **`/customer/nav`** (+ any other fragment) |
| `essentialAuthPages` | `:1875` | login, account, create-account | cart/checkout/order/wishlist/addresses/forgot-password? |
| `placeholderPaths` | `edsResetRepoHelper.ts:48` | global, auth, cart, checkout, order, account, payment-services, recommendations, wishlist | **richer than the copy-path list — they disagree** |

Consequences:
- **No transitive discovery.** Nothing parses a copied page for the fragments/links it references,
  so a referenced-but-unindexed doc (`/customer/nav`) is invisible to the pipeline.
- **Hardcoded lists rot.** Every new template/dropin can add a referenced doc nobody put on a
  list. The create-path and reset-path lists already disagree (above).
- **Silent failure.** A dropped doc surfaces as a blank region or 404 in the running demo — never
  as a copy error — so it's only caught by a human noticing in a demo.

## Likely additional blind spots (to verify on each template's live CDN)

Probe candidates (egress-blocked here; verify in browser as we did for `/customer/nav`):

- **Other fragments** beyond `/nav`, `/footer`, `/customer/nav` — e.g. return-policy, mini-cart,
  promo/marketing fragments, product-detail fragments. Discover by scanning copied pages for
  fragment references / section-metadata path columns.
- **Other dropin pages** not indexed (noindex): `/cart`, `/checkout`, `/order-status` /
  `/order-details`, `/wishlist`, `/customer/addresses`, `/customer/forgot-password`,
  `/customer/reset-password`. `essentialAuthPages` only covers 3.
- **Store-config sheet** (`/configs` / `configs.json`) that commerce dropins read — confirm it's
  reproduced (it may come from the git template or `configGenerator`/Configuration Service rather
  than content copy; verify it isn't a gap).
- **Section placeholders** — copy-path grabs only `/placeholders`; reset knows 9 placeholder
  sheets. Reconcile.

## Comprehensive approach (defense in depth)

Fix the **class**, not the instance. Four layers, highest-leverage first:

1. **Reference-following discovery (structural fix for the copy side).** After copying a page,
   parse its `.plain.html` for (a) fragment references (the embed block / section-metadata path
   columns) and (b) internal links to other authored docs, and copy them transitively (seed from
   index + a small set of entry points: home, nav, footer, account). This captures `/customer/nav`
   **and its unknown siblings automatically**, regardless of index coverage. Make the immediate
   `/customer/nav` fix the *first consumer* of this — fix the class while fixing the instance.
2. **Post-copy completeness audit (the guardrail).** After copy, scan destination content for any
   reference (fragment path / internal link) whose target was **not** copied, and surface it via
   the existing patch-report toast/log (`PatchReport` / `reportUnapplied` precedent). Converts
   silent drops into a visible "referenced but not copied: …" diagnostic — catches *future*
   regressions of this class even if discovery misses something.
3. **Consolidate the four lists into one declared inventory.** A single source of known
   runtime-referenced surfaces (fragments, dropin pages, placeholder sheets, config docs), shared
   by **create and reset**, with a coverage test. Deterministic safety net beside the crawl; ends
   the create/reset disagreement.
4. **Per-package validation harness (catches it before users do).** An automated "create →
   audit" smoke per demo package (citisignal, b2b, citisignal-b2b, buildright, custom) asserting
   no dangling references + key surfaces present (account menu, PDP, cart/checkout, …). Each
   package has a different content source / index coverage; the B2B packages (cross-org → index
   fallback) are highest-risk. This harness would have caught **both** confirmed instances.

The **per-product PDP** instance (catalog-*generated*, not copyable) stays on its own track
(`b2b-pdp-404-gap` → Option A), but the audit (layer 2) and harness (layer 4) should assert PDP
coverage too, so the two instances share one guardrail.

## Recommendation / sequencing

- **Now:** implement `/customer/nav` via **layer 1** (reference-following) rather than a one-line
  list addition — same effort tier, kills the class on the copy side. (Plan:
  `.rptc/research/b2b-account-features-missing/research.md`.)
- **Fast follow:** **layer 2** (completeness audit) — highest guardrail value for least code.
- **Then:** **layer 3** (consolidated inventory) and **layer 4** (per-package create+audit smoke).
- Keep PDP (catalog-derived) on its existing plan; fold it into the layer-2/4 guardrails.

## Verification still needed (live, egress-blocked here)

1. For each demo package's source site, list which **fragments** and **dropin pages** it authors
   that are absent from `full-index.json` (browser-probe `.plain.html` + scan for references).
2. Confirm whether `/configs`(`.json`) store-config is reproduced or is a latent gap.
3. Reconcile the placeholder sheets between create and reset.

## Cross-refs

- `.rptc/research/b2b-account-features-missing/research.md` — the `/customer/nav` instance + fix.
- `.rptc/research/b2b-pdp-404-gap/findings.md` — the PDP instance (catalog-derived).
- `docs/architecture/adr/006-thin-layer-storefront-customization.md` — thin-layer / no-fork ethos
  this approach upholds (discovery pulls canonical; stores nothing).
