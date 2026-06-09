# Multitenant PDP Pre-render: Adobe's model vs. our ACCS overlay — evaluation

**Captured**: 2026-06-09
**Status**: First-pass research / decision input. Produced from a Claude Code on the web
session scoped to `skukla/demo-builder-vscode`, reading `skukla/accs-discovery-service`
via GitHub code search and Adobe's `adobe-rnd/aem-commerce-prerender` via the web.
**Question driving this**: Should we evolve the ACCS `render-pdp` action into a *true
multitenant pre-render service*? Can it stay decoupled from Demo Builder and be reusable
by each SC? How do reset/edit and SC/AI custom templates factor in? Does any of it matter?

> Verify-before-build flags are called out inline as **[VERIFY]**. The biggest one —
> whether Catalog Service is queryable with the storefront's *public* config keys — is now
> **substantially answered: yes** (see §3.1, evidence from `skukla/citisignal-b2b`). The
> residual open item is narrower: confirming the action can *fetch* that public config at
> runtime (a live `config.json` fetch returned 403; see §3.1).

---

## Decisions locked (owner, 2026-06-09)

- **Ship in two phases.** **Phase 1 (now):** finish + release the existing *generic-template*
  overlay to kill PDP 404s — functional relief, add/delete-safe, no architecture decision
  required. **Phase 2 (later):** design (A) real server-side rendering.
- **Stay shared, not per-project.** App Builder access friction (easy only in the SCs' dedicated
  org, not the Commerce org) + a ~10-person team make per-project the wrong call now. The shared
  render-pdp action renders against the *public* catalog endpoint, so it needs no per-SC App
  Builder. Per-project remains the documented escape hatch for org-wide scale; keep the
  overlay-URL seam swappable.
- **Stage workspace is acceptable** for the shared render-pdp deployment (demo use, small team).
  No durable/prod deployment is required for Phase 1 — the action is already deployed to stage
  and the extension's default `overlayUrl` points at it.
- **The current 404s are not a bug to diagnose** — the solution simply isn't finished/released
  yet and the affected SC is on an old extension build. Phase 1 = finish + ship, not debug.

## TL;DR recommendation

1. **Do not replicate Adobe's pre-generation (store-and-serve) model.** It is single-tenant
   by design and brings cron pollers, per-tenant storage, per-tenant state files, and
   staleness windows — all of which fight the demo use case and *re-couple* the service to
   Demo Builder (reset would need a cache-purge hook).
2. **If we render real PDP data at all, do it as multitenant *on-demand* rendering
   (design A below):** one stateless shared action that, per request, reads the storefront's
   *public* `config.json` (keyed by the stamped `org`/`site`), fetches the product from the
   *public* Catalog Service, injects data + meta tags into **the storefront's own authored
   PDP template**, and returns it. Stateless ⇒ reset/edit are non-events; reads the real
   template ⇒ SC/AI customizations are honored; no per-tenant secrets ⇒ stays decoupled and
   reusable by any EDS storefront.
3. **But first decide whether it's worth it.** For demos the *functional* value of
   server-side per-product rendering is low (SEO rarely matters for short-lived/no-index
   demos). The real value is the **narrative** ("production-grade, SEO-prerendered like a
   real storefront"). If that narrative isn't a sales requirement, the cheaper correct move
   is to stop overlaying real product paths and let the authored template serve them —
   which also removes the template-divergence bug (see §5).
4. **Regardless of the above, resolve the template-divergence risk now** (§5): the moment an
   SC or AI customizes a PDP while the generic overlay is live on real product paths, the
   product URL and the authored `/products/default` diverge.
5. **At Adobe-wide SC scale (the product goal), edge caching is not optional** (§9). The
   extension targets *any* SC giving demos at Adobe (commerce is an opt-in subset). A single
   shared on-demand action across all SCs is fragile without caching as the load-shedding
   mechanism; keep the tenancy seam swappable (shared+cache → per-region → per-project).

---

## 0. Problem statement & separability (the actual driver)

**The actual problem:** PDP paths (`/products/{urlKey}/{sku}`) return **404** on hard
navigations and to crawlers. Root cause, confirmed in code: Adobe **deprecated folder
mapping** — the old Helix mechanism that routed `/products/*` to a single template doc — so
demo-builder stopped configuring it (`configurationService.ts:15-18`,
`storefrontSetupPhase3.ts:192-194`; roadmap audit A2 removed the code). CitiSignal's
client-side JS routing only covers in-app navigation, **not direct URL hits or bots → those
404**. The fix suggested to an SC — **author a page/template per SKU** — is the tightly-coupled
anti-pattern: manual per product, and it breaks the moment a product is added or deleted.

**What the existing BYOM overlay already solves.** The `content.overlay` → `render-pdp` action
is Adobe's official replacement for deprecated folder mapping (`aem.live/developer/byom`). Even
the **current generic-template** version (no real product data) already:
- **Fixes the 404** — every `/products/{urlKey}/{sku}` returns 200 (path-shaped, no per-SKU
  authoring).
- **Is add/delete-safe by construction** — new products resolve automatically; deleted products
  leave no orphaned authored doc.
- **Stays decoupled** — one registration per storefront; the drop-in hydrates real product data
  client-side, as it already does.
- It is **default-on** in the extension as of commit `7449d99` (`byom.enabled` true,
  `overlayUrl` defaults to the deployed action).

**Therefore the urgent fix is SEPARABLE from the architecture fork.** Shipping/registering the
existing generic overlay kills the 404s and the coupling — it needs **no** design-(A)
server-side rendering and **no** shared-vs-per-project tenancy decision. Design (A) (render real
product data server-side) and the tenancy/scale questions (§9) are a *later SEO/parity
enhancement*, not a prerequisite. **Fix the 404 with the overlay you already have; decide the
rest on its own timeline.**

If PDPs still 404 with the overlay nominally on, the likely culprits (verify, don't assume):
the storefront predates the overlay and was never re-created/reset (overlay is registered only
on create/reset); the released extension build predates `7449d99`; the `render-pdp` action
isn't actually deployed/returning 200; or the storefront's real PDP URL format doesn't match
`parsePdpPath`'s `/products/{urlKey}/{sku}` (→ the action 404s it).

## 1. The two architectures, side by side

Both deliver through the **same EDS seam**: the AEM Configuration Service `content.overlay`.
Helix dispatches every page request to the overlay URL before falling back to authored
content. The difference is entirely *what the overlay URL points at*.

| Axis | Adobe `aem-commerce-prerender` | ACCS `render-pdp` (today) | What demos need |
|---|---|---|---|
| **Tenancy** | Single-tenant. One App Builder project per storefront; `ORG`/`SITE`/`STORE_URL` in per-project `.env`. | Multitenant. One shared action; `?org=&site=` stamped on the registered overlay URL. | Multitenant — many ephemeral storefronts, install-and-go. |
| **Render trigger** | Batch **pre-generation**: cron pollers (`productPoller` ~5 min `check-product-changes`; `productScraper` ~60 min `fetch-all-products`) + manual "Trigger Product Scraping". | **On-demand** at request time via overlay dispatch. No cron. | On-demand — freshness, zero scheduling. |
| **Product data** | Catalog Service via `STORE_URL`. | **None.** Returns a constant generic template; the Commerce drop-in hydrates client-side from the URL. | (If rendering) Catalog Service / Live Search. |
| **Change detection** | Per-product **state file**: SKU, last-rendered epoch, markup hash. New product → appears in `{locale}-products.json` → poller renders it; deleted → `mark-up-clean-up` unpublishes. | N/A — path-shaped only. New product "just works" because the template is product-agnostic. | New product should "just work" with no per-product step. |
| **Output / delivery** | Pre-rendered HTML stored in **Azure Blob** (App Builder storage); overlay points at stored files: `overlay: { url: '.../pdps', type: 'markup', suffix: '.html' }`. | HTML returned **inline per request**; no storage. | Stateless preferred (no purge coordination). |
| **Infra** | App Builder (Runtime + Alarms) **+ Azure Blob** + a Management UI. | One stateless App Builder web action. `require-adobe-auth: false`, `nodejs:20`. | Minimal; no per-tenant infra. |
| **Auth to Commerce** | Per-project credentials in the project's `.env`/Console workspace. | None today. | **No per-tenant secrets** (the crux — see §3). |
| **One-line model** | Pull → render → **store** → overlay serves static files. | Pure **pull**; overlay = live render. | Pull, live, stateless. |

**Key realization:** "use the overlay" is not the decision. Adobe and we already agree on the
overlay. The decision is **batch-stored output (Adobe) vs. live render (us)**, and **single-
tenant secrets (Adobe) vs. zero-secret multitenant (us)**.

---

## 2. Should we evolve ACCS into a *true* multitenant pre-render service?

"True multitenant pre-render" usually implies Adobe's capabilities — per-tenant product
discovery, rendering, and **stored** output — but shared across tenants. That combination is
the worst of both worlds for demos:

- A shared service that *stores* per-tenant rendered HTML needs a **per-tenant control plane**:
  a registry of org/site → Commerce endpoint + credentials, plus per-tenant storage
  namespaces and per-tenant state files. That is exactly the secret-management and
  coupling surface the team **deliberately walked away from** in commit `facaec1` (dropped
  the shared secret to keep the action stateless and self-service).
- Stored output introduces **staleness** (Adobe's is up to ~60 min) and a **purge obligation**
  on every reset/edit — re-coupling the service to Demo Builder (§4).

**Verdict:** No to multitenant *pre-generation*. If we go past the generic template, the only
fit is multitenant **on-demand** rendering — and even that is optional (§6).

---

## 3. Can it be decoupled from Demo Builder and reusable by each SC?

**Yes — and it largely already is.** Demo Builder's only involvement is writing the overlay
URL into the Config Service registration (`buildSiteConfigParams` → `registerSite`/
`updateSiteConfig`, with `?org=&site=` stamped by `appendOverlayParams`). The action knows
nothing about Demo Builder; *any* EDS storefront that registers the overlay gets the behavior.

To keep it decoupled while adding real rendering **without secrets**, the action derives
everything from the request + public data:

1. From the stamped `org`/`site`, construct the storefront's **public** base URL and fetch
   its published **`config.json`** (already served at the storefront CDN — Demo Builder
   publishes it in reset step 6). That yields the Catalog Service / Live Search endpoint and
   the **public** API keys the browser drop-in already uses.  **[VERIFY]** that these keys
   are public and sufficient for server-side Catalog queries (true for ACCS SaaS Catalog
   Service in the client; confirm there's no CORS/referer gating that blocks server use).
2. Query Catalog Service for the `{urlKey, sku}` parsed from the path.
3. Inject data + meta into the template (see §5 for *which* template).

Because every input is public and request-derived, there are **no per-tenant secrets, no
registry, no stored state** — the service stays a pure function of (path, org, site) and is
reusable by any SC's storefront, Demo-Builder-created or not. **This zero-secret path is the
single most important enabler.**

### 3.1 Evidence: the keys really are public, non-secret, client-side (citisignal-b2b)

Confirmed against a live demo-builder-delivered storefront, `skukla/citisignal-b2b`
(a **public** repo, created 2026-06-09). Its realized config (`demo-config.json`) holds
*real, non-placeholder* Commerce values:

```
commerce-endpoint / commerce-core-endpoint:
  https://edge-sandbox-graph.adobe.io/api/a8101baa-b235-4d8e-88c4-734e5f054b56/graphql
headers.cs:
  x-api-key:               4dfa19c9fe6f4cccade55cc5b3da94f7
  Magento-Environment-Id:  G8b9X9oVp44YqwE4mw21H4
  Magento-Website-Code:    citisignal
```

`default-site.json` is the template Demo Builder fills (`{CS_ENDPOINT}`,
`{COMMERCE_API_KEY}`, `{COMMERCE_ENVIRONMENT_ID}`, `{WEBSITE_CODE}`).

Why this resolves the auth question:

- These are the **same headers the browser Commerce drop-in sends client-side** — they ship
  in a public repo and to every visitor's browser, so they are **not secrets**.
- The endpoint is the Adobe Commerce Optimizer / Catalog Service **edge GraphQL** CDN
  (`edge-sandbox-graph.adobe.io`), designed for client consumption.
- A server-side fetch from `render-pdp` can send the identical endpoint + `x-api-key` +
  `Magento-Environment-Id` and get the **same data the browser would** — which is exactly
  the parity we want. **CORS does not apply server-side**, so the browser-only concern is moot.

**Confirmed live (storefront owner, 2026-06-09):** the published storefront
`https://main--citisignal-b2b--skukla.aem.live/phones` returns ACCS products via the Catalog
Service through a **publicly accessible GraphQL endpoint**:
`https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql`
(the ACCS SaaS API host: `na1-sandbox` = NA region sandbox, tenant ID in the path). This is
direct production-equivalent proof that the catalog is queryable with the storefront's public
client-side headers — exactly the data path design (A) relies on. (Could not be re-probed
from the research session: this environment's network policy blocks
`api.commerce.adobe.com` egress — "Host not in allowlist" — so this rests on the owner's
confirmation plus the working page.)

**Important discrepancy → design implication:** the *live* endpoint above is **not** the one
committed in the repo (`demo-config.json` has `edge-sandbox-graph.adobe.io/api/<id>/graphql`).
So **design (A) must read the endpoint + headers from the storefront's *live published*
`config.json`, never from the committed repo config** (which can be stale or a different
route). 

**Residual open items for (A):**
- Confirm the action can fetch the live published `config.json` server-side. An anonymous
  fetch of `.../config.json` returned **HTTP 403** in testing while `/phones` works in a
  browser — so config.json is browser-reachable (the drop-in reads it) but may bot-block
  non-browser user-agents. Replicate the browser fetch (UA/headers) or pick an alternate
  config-delivery path.
- Confirm whether the live GraphQL endpoint needs the public `x-api-key` /
  `Magento-Environment-Id` headers or is fully open; either way they are non-secret.

### 3.2 Why does the repo config differ from the live endpoint? — CONFIRMED via Adobe docs

The committed `demo-config.json` (`edge-sandbox-graph.adobe.io/api/<uuid>/graphql`,
env id `G8b9X9oVp44YqwE4mw21H4`) does not match the live endpoint
(`na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql`), and the three IDs don't
match each other. Adobe's storefront documentation explains why — the repo file is **not** the
live source of truth:

**Config precedence (Boilerplate / Commerce Configuration docs).** Commerce blocks read config
from **either the public config for the site (the Configuration Service) or a `config.json` in
the code repo**. Quoted: *"A config.json file in your repository root is useful for **local
development and testing on feature branches**. Edge Delivery Services will serve this file at
/config.json and **it will override the Configuration Service**."* So the **authoritative
production source is the public config (Configuration Service)**; a repo `config.json` is a
local-dev override. The live site serves `na1-sandbox` because the **Configuration Service
public config is authoritative**, and the repo's `demo-config.json`/`default-site.json` aren't
even the served `/config.json` filename (nor do their IDs match) — they're samples/inputs.
→ **Hypothesis #1 confirmed (primary cause).**

**Endpoint host families (Commerce Configuration / Catalog Service / Merchandising API docs).**
Two distinct Catalog Service endpoint families exist:
- **ACO-native (live):** `https://<region>-<environment>.api.commerce.adobe.com/<tenantId>/graphql`
  — verbatim match for the live endpoint. This is the Adobe Commerce Optimizer catalog GraphQL
  (`commerce-endpoint` for ACO).
- **Older/standalone Catalog Service:** `catalog-service-sandbox.adobe.io/graphql`; the repo's
  `edge-sandbox-graph.adobe.io` is an edge variant of that older family.
→ **Hypothesis #2 confirmed.** The repo reflects an older/different endpoint family than the
live ACO-native one. (Not hypothesis #3's core-vs-catalog split — both are catalog endpoints.)

**Headers (Catalog Service docs).** Required: `MAGENTO-ENVIRONMENT-ID`, `MAGENTO-STORE-VIEW-CODE`,
`MAGENTO-WEBSITE-CODE`, `MAGENTO-STORE-CODE`, `MAGENTO-CUSTOMER-GROUP`, `API-KEY` — all
**public/client-side** (an Adobe community thread on "configs.json exposure" confirms these are
publicly exposed by design). The endpoint is not fully open, but the headers are non-secret.

**Design implication (firmer): read the LIVE published `/config.json`, never the repo file.**
Because a repo `config.json` *overrides* the Configuration Service when present, fetching the
live `/config.json` is the single authoritative, override-aware source in all cases — it returns
whatever is actually served (Configuration Service value, or a repo override if one exists). This
also explains the earlier 403: `/config.json` is the documented public artifact the drop-in
reads, so it is meant to be fetchable — the 403 was environment/UA, not a design gate.

**Remaining for the new agent (verification, not discovery):** on a fully-published storefront,
confirm (a) server-side fetchability of the live `/config.json` (UA/headers), and (b) a one-shot
read-only GraphQL query against the live endpoint with the public headers succeeds. Reference
storefront: `skukla/citisignal-b2b`; live PLP `…/phones`; live endpoint
`na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql`.

**Sources:** Adobe Commerce Storefront — Boilerplate Configuration
(`experienceleague.adobe.com/developer/commerce/storefront/boilerplate/configuration/`);
Commerce Configuration
(`…/storefront/setup/configuration/commerce-configuration/`); Catalog Service
(`developer.adobe.com/commerce/webapi/graphql/schema/catalog-service/`); Merchandising API
(`developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api/`).

---

## 4. Reset and edit actions by the SC

Demo Builder's reset is a 12-step destroy-and-recreate (`edsResetService.ts`): resets the repo
to template, reinstalls blocks, clears + recopies DA.live content, **re-registers the overlay**
(step 7, `updateSiteConfig` with `byomOverlayUrl`), purges cache, republishes. Edits change
config/content/templates in place.

- **On-demand / stateless (our model): reset and edit are non-events.** Nothing is cached in
  the service. Reset recreates content and re-stamps the same overlay; the next request renders
  against whatever is now live. Edits to config/content/template are picked up on the next
  request automatically. **This is a decisive advantage and a direct answer to "how do we
  account for reset/edit": we don't have to.**
- **Pre-generation / stored (Adobe's model): reset and edit are painful.** Stored PDPs would
  point at deleted/old content after a reset, so Demo Builder's reset would need to call a
  **purge/invalidate hook** on the prerender service — new coupling, new failure mode. Edits
  would serve **stale** pre-rendered pages until the next cron cycle, which during a live demo
  (SC edits a product, refreshes, sees the old page) is a credibility killer.

**Conclusion:** reset/edit strongly favor stateless on-demand. Pre-generation forces Demo
Builder to grow cache-busting responsibilities — the opposite of decoupling.

---

## 5. Custom templates created by the SC or by AI — and the divergence bug

**How EDS PDPs are templated:** the storefront authors a single PDP template (typically the
`/products/default` doc) containing a `product-details` block, plus whatever blocks the SC/AI
add around it. The Commerce drop-in mounts on `product-details`. SC/AI customizations
(custom hero, related-products block, rearranged sections, promoted custom blocks via
`promote_block_to_library` → `component-definition.json` + DA.live picker) live in **that
authored template and the user's repo/DA.live**, and survive reset (the "Refresh Block Library"
path reads `component-definition.json` from the *user's* repo).

**The latent bug:** `render-pdp` today returns a **hardcoded generic template** and
deliberately **404s `/products/default`** so EDS serves the authored default there. So:

- `/products/default` → SC's **customized** template (authored).
- `/products/sku-123` → action's **generic** template (overlay).

The moment an SC or AI customizes the PDP, **real product URLs stop matching the storefront's
own design.** Today this is masked because the generic template is structurally close to
CitiSignal's, but it is a correctness bug waiting for the first custom PDP.

**This forces one of two coherent designs:**

- **(A) Overlay renders the storefront's *own* authored template.** The action fetches the
  storefront's published PDP template (public CDN), injects server-rendered product data into
  `product-details` + meta tags, and returns *that*. Customizations are honored automatically
  because we render the SC's real template, not a hardcoded one. Stateless, on-demand, no
  secrets. **This is the only "true to intent" multitenant prerender design**, and it answers
  custom-templates, reset, and edit all at once.
- **(B) Don't overlay real product paths at all.** Let EDS serve the authored template for
  `/products/{urlKey}/{sku}` via client-side routing (status quo pre-BYOM), and use the
  overlay (if anything) only for `<head>` meta injection. Lighter; loses server-rendered
  product *body* but keeps perfect template fidelity for free.

The current "generic template on real product paths" is the one option that is *neither*
correct-for-fidelity *nor* maximally simple — it should not be the long-term resting state.

---

## 6. Does any of this matter? (the honest meta-answer)

**Distinguish two things (see §0):** the *overlay itself* fixes a real functional bug (PDP
404s) and is not optional — it's the decoupled replacement for deprecated folder mapping. What
*is* optional is **design (A): rendering real product data server-side.** The question below is
only about that enhancement, not about whether to have an overlay.

For the **demo** use case, weigh what server-side per-product rendering (beyond the generic
overlay) actually buys:

- **SEO** — the #1 production reason for prerender. Demos are short-lived, often noindex/behind
  auth, rarely need to rank. Mostly irrelevant.
- **Social/OG link previews** — occasionally nice ("share this product"); marginal.
- **Initial paint / no-JS** — the drop-in already paints fast client-side; demos run in real
  JS browsers. Minimal.
- **"Looks/works like production"** — the strongest *demo* argument: being able to say
  "and it's fully SEO-prerendered, like a real storefront." This is a **talking point**, not
  a functional need.

**So:** for most demos, true per-product prerender does **not** matter functionally. The
generic overlay already yields crawlable 200 product URLs with the right structure. Invest in
design (A) **only if** the "production-grade SEO" story is a real sales requirement. If it
isn't, the cheaper *and more correct* path is option (B) — let authored templates serve real
product paths — which also erases the §5 divergence bug.

---

## 7. Recommended decision tree

1. **Is "production-grade SEO-prerendered PDPs" a real demo/sales requirement?**
   - **No →** Adopt option (B): remove the overlay from real product paths (or reduce it to
     meta-only). Keep the generic template only as a fallback. Stop here. Lowest cost, fixes
     §5, fully decoupled.
   - **Yes →** Go to 2.
2. **[VERIFY] Can the action query Catalog Service with the storefront's public config keys?**
   - **No →** Multitenant rendering needs secrets/a control plane → reconsider; likely fall
     back to (B). Per-project Adobe-style deploy is the only secretful alternative, and it's
     not multitenant.
   - **Yes →** Build **design (A)**: stateless multitenant on-demand renderer that reads the
     storefront's public `config.json` + authored PDP template + Catalog Service, injects data
     + meta, returns; graceful fallback to today's generic template on any failure. This
     satisfies decoupling, reuse, reset, edit, and custom templates simultaneously.
3. **Do not** build Adobe's pre-generation/stored model for the multitenant case under any
   branch — it re-couples reset and introduces staleness.

---

## 8. Open items to confirm in the implementation session

- **[RESOLVED — see §3.1]** Catalog Service is queryable with the storefront's public,
  non-secret client-side keys (confirmed via `skukla/citisignal-b2b`). Remaining sub-item:
  **confirm the action can fetch the published `config.json` server-side** (a live fetch
  returned 403 on the brand-new site; verify on a fully-published storefront, or pick an
  alternate config-delivery path). Also do a one-shot server-side Catalog GraphQL query with
  those headers to confirm no referer/IP gating.
- Confirm the canonical PDP template doc path per storefront (is it always `/products/default`,
  or configurable?) for design (A)'s "fetch the authored template" step.
- Confirm `parse-path.js`'s `{urlKey, sku}` is sufficient to resolve a Catalog product (some
  catalogs key on SKU, some on urlKey; handle both).
- Runtime cost/latency budget for on-demand rendering at the overlay (cold starts, Catalog
  round-trip) and whether a short edge TTL is acceptable given reset/edit freshness needs.
- Decide whether meta-only injection (option B+) is a useful middle ground: authored template
  serves the body, the action injects only `<head>` product meta. Cheapest SEO win without the
  template-fidelity problem.
- **Performance & multi-tenancy at scale — see §9** for the full set (Helix overlay-timeout
  budget, overlay-response cache TTL vs freshness, tenancy seam: shared+cache / per-region /
  per-project, statelessness enforcement, commerce-only gating). At Adobe-wide SC scale these
  move from "nice to have" to "load-bearing."

## 9. Performance & multi-tenancy at Adobe-wide SC scale

**Scale context (product goal, owner-stated 2026-06-09):** the extension is intended for **any
SC giving demos at Adobe** — potentially hundreds–thousands of SCs/storefronts — and is "built
to expand." Commerce is an **opt-in subset** (not every SC has Commerce access), so only
commerce-enabled storefronts register the overlay and reach `render-pdp`. Even so, org-wide
rollout pushes aggregate PDP traffic through a single shared action far past "a handful of
demos," which changes the calculus below.

Design (A) puts **live compute + 2–3 network round-trips on the critical path of every PDP
request, through one shared action serving all SCs** — the opposite of Adobe's model (static
files from storage, per-project isolation). Adobe's heavier choices were buying exactly the
performance and isolation properties we give up here.

### Per-request performance
- **Critical path.** Helix dispatches the overlay synchronously, so the action's latency adds to
  PDP TTFB. Naive flow = fetch live `/config.json` → Catalog GraphQL query → fetch/inject
  authored template → return (up to 3 sequential round-trips).
- **Cold starts.** `nodejs:20` App Builder action; an idle storefront, when clicked, pays
  cold-start latency (hundreds ms–seconds). Adobe's static overlay has none.
- **Helix overlay timeout [VERIFY budget].** Helix bounds overlay-fetch time; cold start + 3
  round-trips can exceed it → fallback/404 → broken PDP. The action MUST answer within that
  budget, with a fast fallback to the generic template on any slow dependency.

Mitigations (impact order): **edge-cache the overlay response** (collapses latency *and*
concurrency for hot products — but adds staleness, the core tradeoff against the "reset/edit are
free" property of §4); warm in-action cache for `/config.json` + authored template keyed by
org/site; keep the render minimal.

### Multi-tenant concurrency (the weaker spot, and it worsens with scale)
- **Noisy neighbor.** All SCs share one App Builder namespace's concurrency + rate limits. A
  crawler walking thousands of SKUs, a large training session, a load test, or a viral demo
  link on one storefront can throttle PDPs for everyone.
- **Shared rate limits → global 429s.** No per-tenant fairness unless built.
- **No cost isolation/attribution.** All invocations bill the team's one project.
- **Blast radius / SPOF.** A bad deploy breaks PDPs for ALL SCs at once; per-project deploys
  isolate this.
- **Statelessness is a correctness requirement.** The action must be a pure function of
  `(path, org, site)`; any module-level mutable state or mis-keyed cache risks cross-tenant data
  leakage. Enforce and test.
- **Not shared:** each storefront's Catalog backend is its own per-tenant ACO instance — catalog
  load is naturally partitioned by tenant.

### How org-wide scale changes the recommendation
At a handful of demos, shared on-demand is fine. At **all-Adobe-SC scale, edge caching becomes
the load-shedding mechanism that makes a shared action viable at all** — with it, actual
invocations drop to cold/changed PDPs, which simultaneously tames concurrency, cost, and
blast-radius exposure. Without it, one shared action across all SCs is fragile.

**Doors to keep open ("built to expand"):**
- **Caching-first.** Treat the overlay response as cacheable with a tuned TTL; decide the
  freshness-vs-staleness tradeoff explicitly (and whether reset/edit triggers a purge).
- **Regional sharding is natural** — endpoints are already regional (`na1-`, `eu1-`, …); a shared
  action per region bounds blast radius and aligns latency.
- **Per-project deploy stays the escape hatch** (Adobe's model; roadmap D1's original
  "per-project deployment") if isolation/cost/blast-radius ever dominate — and demo-builder can
  automate that deploy, preserving install-and-go. **Do not foreclose** swapping a shared action
  for per-region or per-project deployment later; keep the overlay-URL seam abstract.

### New decision / verification items
- **[VERIFY]** Helix overlay-fetch timeout budget; ensure worst case (cold start + dependencies)
  fits, with fast fallback to the generic template.
- **[DECIDE]** Overlay-response cache TTL and whether reset/edit purges it (freshness vs
  cost/coupling).
- **[DECIDE]** Tenancy at scale: shared action + heavy caching vs per-region shard vs per-project
  deploy. Keep the seam swappable.
- **[DESIGN]** Enforce/test statelessness (pure function of path + org + site); no cross-tenant
  cache bleed.
- **[SCOPE]** Only commerce-enabled storefronts register the overlay (non-commerce SCs
  unaffected) — confirm the `demoBuilder.byom.enabled` gating already achieves this.

## References

- `accs-discovery-service`: `actions/render-pdp/{index.js,template.js,parse-path.js}`,
  `app.config.yaml`, `README.md` (read via GitHub code search at ref `ac36fc7`).
- `demo-builder-vscode`: `src/features/eds/handlers/edsHelpers.ts`
  (`resolveByomOverlayConfig`, `appendOverlayParams`), `src/features/eds/services/
  configurationService.ts` (`registerSite`/`updateSiteConfig`), `src/features/eds/services/
  edsResetService.ts` (12-step reset), `docs/research/2026-05-18-production-readiness-roadmap.md`
  (item D1).
- Adobe: `adobe-rnd/aem-commerce-prerender` (architecture, triggers, Azure Blob overlay).
