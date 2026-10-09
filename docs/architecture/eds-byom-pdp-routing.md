# EDS BYOM PDP Routing

How the extension makes `/products/{urlKey}/{sku}` URLs work for every storefront, dynamically, without per-product authoring.

For the decision rationale behind the architecture, see [ADR-005](adr/005-byom-pdp-routing.md). For the empirical evidence behind the design, see `.rptc/research/eds-pdp-routing-validation/findings.md` (canonical anchoring + corrected conclusions, 2026-06-10) and `.rptc/research/multitenant-prerender-evaluation/` (original Phase 1/2 research).

---

## Problem

EDS storefronts have no built-in routing for per-product URLs (`/products/{urlKey}/{sku}`). The historical mechanism — folder mapping — has been deprecated by Adobe. The official replacement is **BYOM (Bring Your Own Markup) `content.overlay`** registered against the Configuration Service. That's the canonical pattern, documented at [aem.live/developer/byom](https://www.aem.live/developer/byom) and implemented by Adobe's reference `adobe-rnd/aem-commerce-prerender`.

Demo Builder uses the canonical BYOM pattern with **two deliberate innovations** on top, each justified by the demo workflow's needs (see ADR-005 for full rationale):

1. **Multi-tenant hosted action** — Adobe's reference is single-tenant (one App Builder workspace per storefront). Demo Builder hosts one shared `render-pdp` action serving every SC's storefronts via `?org=&site=` query params on the registered overlay URL.
2. **Smart-404 client-side recovery** — Adobe's reference relies on a scheduled poller to publish catalog SKUs into Helix content-bus over time, with operator CLI tools (`refresh-pdps.js`) for manual recovery. Demo Builder adds a JS snippet vendored into the storefront's `head.html` / `404.html` / `delayed.js` that triggers on-demand publish for any unknown PDP URL on first visit. Closes the gap Adobe acknowledges in [`aem-commerce-prerender` issue #262](https://github.com/adobe-rnd/aem-commerce-prerender/issues/262) (event-driven recovery, OPEN).

**Phase 2 status: LIVE as of 2026-06-09.** The `render-pdp` overlay fetches the storefront's authored `/products/default` (per-org/site cache, generic shell as fallback on failure) and serves that on real product URLs. SC customizations to `/products/default` inherit on every PDP automatically.

---

## Is this what a merchant would run?

Mostly, yes. Checked 2026-10-06 against `adobe-rnd/aem-commerce-prerender` at
`91a491c0` (2026-09-23), the reference a merchant would deploy.

**Matches the reference:**

| | Adobe's prerender | Demo Builder |
|---|---|---|
| How pages reach Helix | BYOM `content.overlay`, `type: "markup"` | Same overlay, same shape |
| Product URL | `/products/{urlKey}/{sku}` through Helix `sanitizePath`, which cleans the last segment — the SKU (`getProductUrl`, `actions/utils.js`); its README: `MY_PRODUCT_123` → `my-product-123` | Same result for the SKU; we also clean the URL key segment with `sanitizeName` — `pdpPathFor`, canonical `getProductLink`, `render-pdp` all agree (ADR-024) |
| Where the SKU comes from | `<meta name="sku">` in the page head (`pdp-renderer/templates/head.hbs`); its README calls this "a requirement when the SKU is sanitized" | `render-pdp` adds the same tag |
| How the storefront reads it | Canonical `getMetadata('sku') \|\| getSkuFromUrl()` | Unpatched canonical code — no SKU encoder (ADR-024 deleted ours) |

**Differs on purpose — demo needs:**

| | Adobe's prerender | Demo Builder | Why |
|---|---|---|---|
| Tenancy | One App Builder workspace per storefront | One shared action, `?org=&site=` on the overlay URL | SCs get PDPs without deploying anything |
| When pages publish | Ahead of time: a poller (5–60 min alarm triggers in `app.config.yaml`) detects catalog changes, renders, publishes | Once at create/reset (catalog pre-warming), then on demand: the smart-404 snippet publishes an unknown product page on its first visit | Demos are created and reset constantly; a demo cannot wait for a poll cycle, and nothing should run on a schedule for a demo nobody is looking at |
| What the page contains | Full server-rendered product markup + JSON-LD (SEO, AI crawlers) | The storefront's authored `/products/default` + the SKU tag; the drop-in renders the product in the browser | Demo audiences are people on a call, not crawlers |
| Where HTML lives | Static files in App Builder storage | Rendered by the action when Helix previews the page | No storage to clean up per demo |

**The one piece a merchant would not have** is the smart-404 snippet in
`scripts/delayed.js`. In production every product is published before a shopper
arrives, so a missing product page is a real 404. For a demo it is the cheapest
way to make any SKU work immediately — including products added after the
storefront was built. Adobe tracks the same gap as event-driven recovery in
[`aem-commerce-prerender` issue #262](https://github.com/adobe-rnd/aem-commerce-prerender/issues/262).

If an SC needs production-grade SEO, deploying `aem-commerce-prerender` to their
own workspace is the answer; the URL and the SKU tag are already compatible.

---

## Architecture

```
┌─ This repo (demo-builder-vscode) ──────────────────────────┐
│                                                            │
│  Create / reset / edit pipeline writes:                    │
│    • Configuration Service site config with                │
│      content.overlay.url = <render-pdp endpoint>           │
│      ?org=<daLiveOrg>&site=<daLiveSite>                    │
│    • Eager mixed-case → lowercase redirect snippet         │
│      prepended to head.html. Runs synchronously before     │
│      body paint. Handles the common case (PLP click on a   │
│      mixed-case product URL) with zero visible 404 flash.  │
│    • Smart-404 JS snippet appended to                      │
│      scripts/delayed.js in the storefront's GitHub repo,   │
│      with the storefront's org, site, and the              │
│      prepublish-pdp endpoint URL templated in. Gated on    │
│      window.isErrorPage. Handles the cold case (lowercase  │
│      URL that's never been published yet) by calling       │
│      prepublish-pdp and redirecting after success.         │
│                                                            │
└────────────────────────────────────────────────────────────┘
                              │
                              │ Helix Configuration Service +
                              │ Helix preview/publish
                              ▼
┌─ accs-discovery-service (sibling repo) ────────────────────┐
│                                                            │
│  render-pdp:  GET /api/v1/web/accs-discovery/render-pdp    │
│    Called by Helix during admin preview/publish.           │
│    Fetches the storefront's authored /products/default     │
│    from https://main--{site}--{org}.aem.live and serves    │
│    it (per-org/site cache; generic shell on fetch fail).   │
│    Returns 404 for non-PDP paths so Helix falls back to    │
│    authored content.                                       │
│                                                            │
│  prepublish-pdp: POST .../prepublish-pdp                   │
│    Called by the smart 404 from the visitor's browser.     │
│    Triggers Helix admin POST /preview + POST /live for     │
│    the requested path. Gated to PDP-shape paths only.      │
│    Signs with the site's publish key (registered by the    │
│    extension; see publishKeyRegistrar.ts).                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

The two repos coordinate via three URL strings — the `render-pdp` overlay URL, the `prepublish-pdp` trigger URL, and the storefront's `?org=&site=` stamping. One piece of per-tenant state: since storefront setup pins a site admin (which closes the Helix admin API to anonymous callers), the extension registers a site-scoped publish key with the shared action after every site config write, and a sweep renews it (`src/features/eds/services/pdp/publishKeyRegistrar.ts`, `publishKeyRenewalSweep.ts`). No shared secret between tenants.

---

## Request flows

### First visitor to a PDP path (cold path)

```
1. Visitor clicks product card on PLP → /products/orchard-2/Orchard2
2. Helix looks up content-bus at the mixed-case path → 404 (Helix
   stores content-bus paths in lowercase; mixed case never matches).
3. head.html eager redirect fires synchronously before body paint:
   detects PDP shape, computes lowercase /products/orchard-2/orchard2,
   calls location.replace(). No visible 404 flash.
4. Browser navigates to lowercase URL. Helix looks up the lowercase
   path:
   - If already published (warm path): Helix serves the cached page
     → drop-in runs → done.
   - If not yet published (cold path): Helix 404s again → storefront
     renders its default 404 chrome. delayed.js loads, the smart-404
     snippet checks window.isErrorPage:
   a. Recognizes PDP-shape URL
   b. Computes lowercase variant /products/orchard-2/orchard2
   c. HEAD checks lowercase variant → 404 (not yet published)
   d. POST to prepublish-pdp action with the lowercase path
4. prepublish-pdp action:
   a. Validates path matches /products/{urlKey}/{sku} shape
   b. POST admin.hlx.page/preview/.../products/orchard-2/orchard2
      → Helix calls render-pdp overlay → gets SC's authored /products/default template
      → stores at lowercase path in content-bus
   c. POST admin.hlx.page/live/.../products/orchard-2/orchard2
      → Helix promotes preview to live
   d. Returns 200 to the browser
5. Smart-404 JS: location.replace('/products/orchard-2/orchard2?pdpRetry=1')
6. Browser navigates to lowercase URL → Helix serves the cached template → 200
7. Drop-in runs, reads SKU=orchard2 from URL, queries Catalog Service
   → Catalog Service returns the canonical Orchard2 product (case-insensitive lookup)
8. Page populates with product data. Total time: ~2-3 seconds for cold path.
```

### Subsequent visitors to the same SKU (warm path)

```
1. Visitor clicks another product card → /products/droidview-1/DroidView1
   OR same product from a fresh session
2. Helix → content-bus → not found (mixed case) OR found (lowercase) → 404 or 200
3. If 404:
   - Smart-404 JS HEAD-checks lowercase variant
   - Lowercase variant exists (previous visitor's publish persists in content-bus)
   - location.replace(lowercase) → instant
4. If 200 already (lowercase URL):
   - Page serves directly, no smart-404 involved
```

The cold path runs once per SKU across all visitors to a storefront. Every subsequent hit — same SKU, same case, different case, different session — serves instantly from Helix's CDN cache.

---

## What ships

| Piece | Where | Behavior |
|---|---|---|
| `render-pdp` overlay action | `accs-discovery-service`, deployed (Phase 2 LIVE) | Fetches and returns the storefront's authored `/products/default` for `/products/{urlKey}/{sku}`, with the product's real SKU added as `<meta name="sku">` (ADR-024); 404 for a product that does not exist or a path that is not the product's canonical one; generic shell fallback on template-fetch failure; 404 for non-PDP paths |
| `prepublish-pdp` trigger action | `accs-discovery-service`, deployed | Validates the PDP path, resolves the product (`lib/pdp-product.js`, fail-open — a confirmed-absent product → 404, no publish), relays Helix admin preview/publish for the product's **canonical** path, and returns that path so the snippet redirects there |
| Configuration Service registration with overlay URL | This repo (`ConfigurationService.registerSite` / `updateSiteConfig` with `byomOverlayUrl`) | Wires the overlay into the site config with `{ url, type: "markup", suffix: ".html" }` — shape matches canonical `aem-commerce-prerender` setup wizard |
| **Catalog pre-warming at create/reset** | This repo (`catalogPrewarmService.ts` + pipeline step) | Enumerates the Commerce catalog via Catalog Service GraphQL and pre-publishes every SKU's PDP URL via batches of 5 to `prepublish-pdp`. Equivalent to one cycle of the canonical scheduled poller. v1 supports ACCS storefronts; PaaS follow-up tracked separately. |
| Smart-404 snippet install step | This repo (`pdp404HandlerPublisher.ts` + pipeline step) | Vendors three pieces into the storefront: (1) cold-path action call + spinner UI in `scripts/delayed.js`, (2) eager mixed-case → lowercase redirect in `head.html`, (3) same eager redirect in static `404.html` |
| `demoBuilder.byom.enabled` setting | This repo | Master toggle; when off, no overlay registers and no 404 publishes |
| `demoBuilder.byom.overlayUrl` setting | This repo | Override for non-default deployments. Defaults to the team's shared deployment. |

### Reset and delete remove the product pages (EDS-26)

Product pages are published through the overlay and have no DA.live document, so
re-copying or deleting the content never cleared them. Until 2026-10-05 a reset left
every product page of the old catalog live, and deleting a storefront left them too.

Both now remove them (`storefront/productPageRemoval.ts`, one implementation):

| Flow | When | Where |
|---|---|---|
| Reset (dashboard, `reset_project`) | Before the content pipeline, whose last step pre-warms the current catalog. A reset ends with product pages for the current catalog only. | `reset/edsResetProductPages.ts` |
| Delete (the delete-project button, `delete_project`, `cleanup_dalive_site` with `githubRepo`) | In the storefront teardown, after the DA.live pages are unpublished and before the source is deleted. | `storefront/storefrontTeardown.ts` |

The rules (owner, 2026-10-05):

- **True deletion.** The live copy goes, then the preview copy, page by page with the
  DA.live sign-in (ADR-002). If Helix refuses the preview removal, the result says the
  live copies are gone and the preview copies remain. It is never reported as clean.
- **The list comes from Helix,** not from pre-warm: a page a shopper's first visit
  published is recorded nowhere else. It is the Admin API's bulk status job for
  `/products/*` on the site keyed by GitHub owner/repo (`helix/helixPublishedPaths.ts`).
  If the listing fails, nothing is removed and the sentence says the pages may still be
  live.
- **Only generated product pages.** A path is removed only when it is
  `/products/<urlKey>/<sku>` and DA.live has no document for it. The authored template
  `/products/default`, and any page an author made under `/products`, is DA.live
  content and is not touched by this step.
- **Refused on a shared repository.** When another local project publishes to the same
  GitHub repository, nothing is removed and the sentence names that project. Only
  projects on this machine can be seen.

The sentence goes on the progress line and in the log, and to agents as `productPages`
on the `reset_project`, `delete_project` and `cleanup_dalive_site` results. The delete
button shows anything short of a clean removal in its results.

**Not yet seen live** (the build made no cloud writes): the bulk status request and its
response shape, whether the DA.live sign-in alone is enough for it on teardown (which has
no GitHub token), and whether Helix removes a preview copy while the overlay still
answers for the path. If it does not, the fallback above is what the SC sees; removing
the overlay registration first on delete is the untested alternative. The live check is
in `.rptc/backlog/2026-10-05-product-pages-survive-reset.md`.

The "Manage DA.live Sites" command goes through the same teardown (EDS-31). It finds
each site's repository from the local project that uses it, else assumes the
same-named repository in the DA.live org's namespace; when the unpublish fails, the
result names the sites whose pages may still be live.

**What the teardown unpublishes, and how it knows (EDS-33, 2026-10-09).** The pages
handed to the unpublish used to be the DA.live listing alone. Once a site's content was
gone, that list was empty and the teardown reported the site down while all 174 of its
pages still answered on aem.live. The list is now Helix's own record of the whole site
(the same bulk status job, for `/*`), joined to the DA.live listing, minus the generated
product pages the step above handles. When Helix cannot be read, the DA.live listing is
all there is and the sentence says so. Afterwards the home page and the first few
unpublished pages are fetched from the live host: the site is reported down only when
a check came back 404, nothing checked still answers, and every live copy was removed.
Otherwise the answer is `still-live` or `unknown`, said in words (`publishSummary`).
`storefront/storefrontUnpublish.ts`. Reset does not use the teardown; its unpublish still
works from the DA.live files it deleted.

### Out of scope (later workstreams or deliberate non-goals)

- **~~SC template customizations on real product URLs.~~** Resolved — Phase 2 shipped 2026-06-09. The overlay now fetches the storefront's authored `/products/default` and serves it on `/products/{urlKey}/{sku}`. SC customizations inherit automatically.
- **PDP cleanup after SKU deletion — cold case handled, cached case residual.** When a visitor hits a PDP URL for a SKU that no longer exists, there are two sub-cases. (1) **Never-published / cold URL — HANDLED:** `prepublish-pdp` resolves the product before publishing (`actions/lib/pdp-product.js`, which replaced `check-sku-exists.js` under ADR-024) — it reads the storefront's served `config.json` for the Catalog Service endpoint + headers, looks the product up by URL key, and falls back to the `products(skus:)` lookup. A confirmed-absent SKU returns 404 **without publishing** (so no empty page is ever cached), and the smart-404 snippet's failure branch redirects the shopper to the storefront's native `/404` (`buildSmart404Snippet`). The gate **fails open** — config unreachable / query error / unexpected shape all proceed to publish, so a real product is never 404'd by an infra hiccup. (2) **Already-published URL — RESIDUAL:** a SKU deleted *after* its PDP was published (or pre-warmed) still serves the cached 200 template, so `window.isErrorPage` is false, the snippet never fires, and the overlay isn't re-invoked for a served page — the drop-in renders an empty product block. **CLOSED 2026-08-23** by the `pdp-empty-data-redirect` code patch (eds-demo-patches): `fetchProductData` resolves null for the missing SKU, and the patched initializer redirects to the native 404 instead of mounting the empty drop-in — no cache invalidation needed. Record: `.rptc/complete/2026-06-09-pdp-graceful-empty-state.md`.
- **PaaS catalog pre-warming.** v1 of pre-warming covers ACCS only because the PaaS direct `/graphql` auth requirements are unverified for our use case. PaaS storefronts continue to work via the smart-404 fallback for catalog-churn paths; their warm catalog still loads (just less aggressively pre-warmed at setup).
- **Server-side SSR (Tier 3) — JSON-LD per SKU, og:image per SKU, Merchant Center metadata.** Deliberately omitted. The canonical `aem-commerce-prerender` does this; we don't, because demo audiences are humans on calls, not crawlers. If an SC ever needs production-grade SEO, they can deploy `aem-commerce-prerender` to their own workspace alongside Demo Builder's overlay.

---

## Load-bearing dependencies

These empirical facts make the routing work. If any changes upstream, it breaks silently.

### 1. Helix normalizes paths to lowercase before storing in content-bus

Verified 2026-06-09: `POST /preview/.../products/orchard-2/Orchard2` returns `resourcePath: "/products/orchard-2/orchard2.md"`. Helix lowercases on write.

**Why it matters**: motivates the entire smart-404 redirect. PLPs generate mixed-case URLs (Commerce SKUs are often PascalCase like `Orchard4`); Helix would serve those paths only if it stored them mixed-case, which it doesn't. The redirect routes the visitor to the lowercase URL that matches Helix's storage.

**If this ever changes** (Helix preserves case): the redirect becomes harmless overhead; everything continues to work.

### 2. Catalog Service is case-insensitive on SKU lookups

Verified 2026-06-09: `products(skus: ["Orchard2"])` and `products(skus: ["orchard2"])` both return the canonical `{sku: "Orchard2", name: "Orchard 2"}` product.

**Why it matters**: after the smart-404 redirects to a lowercase URL, the drop-in reads `sku=orchard2` from the URL path and queries Commerce. The query must still return the canonical product for the page to populate.

**If this ever changes** (Catalog Service becomes case-sensitive): every PDP across every storefront resolves at the routing layer but renders with empty product details — silent rot. Detection probe in `.rptc/research/multitenant-prerender-evaluation/addendum-2026-06-09-runtime-validation.md` (Finding 4 + reproducibility block). Mitigation paths documented in the same Finding.

### 3. Helix admin `POST /preview` and `POST /live` — no longer unauthenticated (superseded)

**Corrected 2026-10-05.** The assumption below held when this was written; it stopped holding once storefront setup pinned a site admin, which sets `requireAuth: "auto"` and closes the admin API to anonymous callers. `prepublish-pdp` now signs each publish with a site-scoped publish key the extension mints and registers (`publishKeyRegistrar.ts`; measured 2026-08-15 in `.rptc/complete/pdp-prewarm-401-after-admin-pinning.md`). The text below is kept as the original record.

Verified by the `accs-discovery-service` team (research doc at `accs-discovery-service/docs/research/helix-admin-auth-findings.md`, summarized in this repo's addendum at `.rptc/research/multitenant-prerender-evaluation/addendum-2026-06-09-helix-admin-auth-and-trigger-placement.md`).

**Why it matters**: `prepublish-pdp` has no credentials yet. It can call Helix admin freely because Helix doesn't gate those endpoints. `DELETE` (unpublish) is gated, but Phase 1 doesn't need DELETE — the extension owns cleanup via the SC's local tokens.

**If this ever changes** (Helix locks down admin POST): `prepublish-pdp` would need to authenticate. The shape of that authentication is the question we'd revisit. The shared-secret pattern is rejected (see commit `facaec19` rationale); the most likely path is a GitHub App that SCs install on their account. That's significant new infrastructure — at minimum, a multi-day project on the `accs-discovery-service` side. Worth flagging early so it's not a surprise.

### 4. The URL is Helix-clean; the page carries the SKU

The PDP URL is `/products/{urlKey}/{sku}` with both segments cleaned by `sanitizeName` — Helix's own rule for every path it publishes (lowercase; every run of characters outside `[a-z0-9]` becomes `-`). Canonical `getProductLink` builds links that way, the extension's `pdpPathFor` builds prewarm/probe paths that way, and Helix stores pages there, so all three agree by construction. Because cleaning is lossy, the URL does not carry the real SKU: `render-pdp` looks the product up by URL key at publish time and writes `<meta name="sku">` into the page, and canonical `getProductSku()` reads that tag before the URL. `prepublish-pdp` publishes the product's canonical path whatever link form arrived and tells the smart-404 snippet where to redirect.

**Why it matters**: a segment Helix would clean is a path no page will ever have. ADR-007's `_HH` encoding put `_` in the URL; Helix rewrote it to `-` on publish, and every SKU containing `_` 404'd (10 of 49 on JustRite, 2026-10-06). `encodeURIComponent` is unusable for the same family of reasons: aem.live's CDN rejects `%`-encoded paths with a bare 404.

**SC guidance**: any SKU works; the URL shows the cleaned form. Custom blocks that link to PDPs must build the href with `getProductLink(urlKey, sku)` — a hand-built link keeps case and punctuation and misses the page. Full rationale in [ADR-024](adr/024-pdp-sku-in-the-page.md).

**The overlay request carries the suffix.** The overlay is registered with `suffix: ".html"`, so Helix asks `render-pdp` for `/products/{urlKey}/{sku}.html`, never the bare path. `parsePdpPath` strips it. The first ADR-024 deploy did not, the SKU segment cleaned to `…-html`, no request ever matched its canonical path, and the JustRite reset's pre-warm went 0/49 (2026-10-06, fixed in `accs-discovery-service` `8035199`). A `render-pdp` test that calls the bare path is testing a request Helix never sends.

**If this ever changes** (the URL-key lookup stops resolving, e.g. a catalog whose search index cannot filter on `url_key`): `render-pdp` falls back to the SKU lookup, which finds plain SKUs only; pages for SKUs Helix had to clean are then served without the tag and render empty. Check the lookup before anything else.

### 5. One overlay per base content — and it is bound to the content, not the site

Per the Admin API schema ([`ContentConfig`](https://www.aem.live/docs/admin.html#schema/ContentConfig)),
`content.overlay` is a *Markup Content Source* (`type` and `url` required, `suffix`
optional) and carries this constraint verbatim:

> the overlay config is tied to the base content and not to the site config — it is not
> possible to have multiple sites with different overlays on the same base content.

**Why it matters**: we register one overlay per storefront, each stamped with its own
`?org=&site=`. That works only because every storefront has its own DA.live content
source. Two storefronts sharing a content source could not carry different overlays, so
the second registration would silently take the first one's coordinates — every PDP on
one of them would render the wrong site's template.

The same page is why `suffix: ".html"` is correct rather than folklore: our PDP paths are
extensionless while the overlay serves `.html`, and `suffix` is the documented field that
makes the admin service append it. The `config-service-setup` page never mentions
`overlay` at all, and the one worked example omits `suffix` because it is optional — which
is why this looked undocumented until 2026-08-10.

**If this ever changes** (per-site overlays on shared content): nothing breaks; a
constraint we currently design around disappears.

**Do not** introduce content-source sharing between storefronts without revisiting this.

---

## Verifying the live system

The full chain can be verified end-to-end with curl probes against any deployed storefront. The reproducibility block in `.rptc/research/multitenant-prerender-evaluation/addendum-2026-06-09-runtime-validation.md` has the exact commands. Briefly:

1. Cold PDP path 404s on live.
2. `POST /preview` + `POST /live` via Helix admin succeed without auth.
3. After the publish, the lowercase URL serves 200; mixed-case URL still 404s (drives the redirect).
4. Catalog Service returns the same product for any-case SKU query.

If Phase 1's behavior diverges from this in production, those four probes localize where the chain broke.

---

## Code reference map

| Concern | File |
|---|---|
| Overlay URL resolution + stamping | `src/features/eds/handlers/byomOverlay.ts` (`resolveByomOverlayConfig`, `appendOverlayParams`) |
| Overlay registration failure surfacing | `src/features/eds/handlers/byomOverlay.ts` (`surfaceOverlayRegistrationFailure`), wired from `handlers/configServiceRegistration.ts` (create/edit, toast — the 403 toast carries Manage Site Access / Repair Site Configuration buttons) and `edsResetService.ts` (reset, `report()` — headless-safe) |
| Site-registration protocol (409→update, 401→re-auth, 403→propagation retry) | `src/features/eds/services/configService/siteConfigRegistrar.ts` (`registerSiteConfig`), shared by the wizard, the reset path and the repair command |
| Standalone retry after a refused registration | `src/features/eds/services/configService/repairSiteConfigHeadless.ts` + `src/commands/repairSiteConfiguration.ts` (`demoBuilder.repairSiteConfiguration`) |
| Configuration Service registration with overlay (incl. `suffix: ".html"`) | `src/features/eds/services/configService/configurationService.ts` (`registerSite`, `updateSiteConfig`, `buildSiteConfigParams`) |
| Smart-404 snippet generation + install (head.html, 404.html, delayed.js) | `src/features/eds/services/pdp/pdp404HandlerPublisher.ts` |
| **Catalog pre-warming (enumerate + bulk pre-publish)** | `src/features/eds/services/catalogPrewarmService.ts` |
| Pipeline integration (smart-404 install + pre-warming) | `src/features/eds/services/edsPipeline.ts`, `src/features/eds/handlers/storefrontSetup/storefrontSetupPhase2.ts` (create / edit), `src/features/eds/services/reset/edsResetRepoHelper.ts` (reset) |
| **Product page removal on reset and delete (EDS-26)** | `src/features/eds/services/storefront/productPageRemoval.ts` (the rules), `helix/helixPublishedPaths.ts` (the listing), `reset/edsResetProductPages.ts`, `storefront/storefrontTeardown.ts`, `storefront/sharedRepoProjects.ts` |
| Settings | `package.json` (`demoBuilder.byom.enabled`, `demoBuilder.byom.overlayUrl`) |

---

## Cross-references

- **Decision rationale**: [ADR-005: BYOM PDP Routing — Canonical Pattern with Multi-Tenancy and Smart-404 Gap-Fill](adr/005-byom-pdp-routing.md)
- **Canonical anchoring research**: `.rptc/research/eds-pdp-routing-validation/findings.md` (BYOM spec verification + canonical anchoring against `aem-commerce-prerender` issue #262, 2026-06-10)
- **Original Phase 1/2 research**: `.rptc/research/multitenant-prerender-evaluation/` (full doc + runtime-validation addendum + auth-findings addendum)
- **External primary sources**:
  - [BYOM spec](https://www.aem.live/developer/byom) — `content.overlay` registration contract
  - [`adobe-rnd/aem-commerce-prerender`](https://github.com/adobe-rnd/aem-commerce-prerender) — canonical reference implementation
  - [Issue #262 — event-driven updates](https://github.com/adobe-rnd/aem-commerce-prerender/issues/262) — OPEN; our smart-404 closes this gap
- **Memory entries**:
  - `project-byom-pdp-routing` — the two-repo model summary + multi-tenant rationale
  - `catalog-service-sku-case-insensitive` — load-bearing case-handling dependency
  - `reference-commerce-prerender-unfit` — why deploying Adobe's prerender per-storefront doesn't fit the demo workflow
- **Sister architecture docs**:
  - `eds-content-separation.md` — the broader two-repo content/code split
  - `eds-backend-configuration.md` — how `config.json` gets generated and published
