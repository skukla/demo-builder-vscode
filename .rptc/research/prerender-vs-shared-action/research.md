# Product pages: our shared action vs Adobe's `aem-commerce-prerender` (EDS-25)

Researched 2026-10-05 (read-only: public docs, `gh api` reads of the prerender repo, local code
reads). [V] verified by reading code/docs, [I] inferred.

## Verdict

**Keep ours as the default for every stack. Do not adopt prerender per demo.** Prerender is
still built for one site per deployment: every demo would need its own App Builder workspace,
a 1-year site key, four always-on timers and a storefront code change; a new SKU can take up
to ~65 minutes to appear; it has no documented uninstall. Its one real advantage is
server-rendered product HTML (JSON-LD, og tags, content before JavaScript) — valuable for
crawlers and social previews, not for humans on a demo call. If a demo ever needs that, add
the tags inside our shared `render-pdp` action (reusing prerender's Apache-2.0 `ldJson.js`,
no price on B2B) rather than deploying prerender.

## Findings

1. **One site per deployment [V].** Org, site, content URL, store URL, products template and
   admin token are deploy-time settings marked `final: true` (OpenWhisk: not overridable per
   request) in `app.config.yaml`; the admin token is a publish key under
   `/config/{org}/sites/{site}/apiKeys.json` (`bin/setup/index.js`); rendered pages go to the
   workspace's one public storage area, which is the overlay URL; tracking files are named by
   locale only (`actions/utils.js`). Experience League (aem-prerender, updated 2026-09-30)
   describes per-site setup only and calls it "a paid App Builder application". The
   event-driven branches (`aio-events`, `journal_poc`) are unmerged, last touched 2025.
2. **Overlay registration [V].** Prerender's wizard MERGES into the site config
   (`{...current, content: {...current.content, overlay}}`) and writes `content/query.yaml`.
   OUR `updateSiteConfig` deletes and re-puts the whole site config
   (`configurationService.ts`), which wipes `apiKeys` (measured 2026-08-15,
   `.rptc/complete/pdp-prewarm-401-after-admin-pinning.md`) — so every project edit or reset
   would kill prerender's baked-in key [I]. A site has one `content.overlay` slot: only one
   of the two can run.
3. **What each gives on product pages.** Prerender [V]: product HTML, JSON-LD with Offer,
   og/meta tags, category pages (since 2026-08-26), hourly removal of deleted products; costs:
   new SKUs up to ~65 min (60-min product list + 5-min change check; issue #262 still open),
   template edits don't re-render existing pages (#277), no per-SKU overrides, skips urlKeys
   outside `[a-zA-Z0-9-]`. Ours [V]: new SKU live on first visit in ~2–3 s (smart-404 + the
   per-site publish key), product data always live in the browser, no per-demo
   infrastructure, template edits applied at the next reset. **Both** use the authored
   `/products/default` (prerender swaps only `.product-details`).
4. **Commerce flavours.** Prerender [V]: ACCS, PaaS with Catalog Service, ACO (reads the
   storefront's public `config.json` headers; no Commerce credentials). Ours [V]: routing on
   any backend; pre-warming ACCS only (`catalogPrewarmService.ts`); ACO not wired (PL-60).
5. **B2B.** Prerender [V] renders with the default customer-group header, baking the guest
   price into the page and JSON-LD; Adobe's own `docs/USE-CASES.md` says not to render
   logged-in-only data such as dynamic pricing. A buyer would see the guest price flash
   before the drop-in replaces it [I]. On a B2B site whose categories are not granted to the
   public catalog, discovery returns 0 (measured on Justrite 2026-10-01) — prerender would
   publish nothing; ours still publishes on first visit via the SKU lookup [V]. Ours renders
   only a template, so every price and grant is resolved for the signed-in buyer [V].
6. **Reset and undo.** Prerender [V]: no documented uninstall; bulk unpublish is a manual
   "disaster recovery" step. Ours [V]: reset re-registers the overlay, re-mints the key and
   re-warms. **Gap in ours** [V by reading, effect I]: neither reset nor teardown unpublishes
   product pages published through the overlay (they unpublish only pages listed in DA.live,
   `storefrontTeardown.ts`, `edsPipeline.ts`) — filed as EDS-26.
7. **Dependencies.** Ours: Helix accepting site-scoped publish keys (+30-day renewal),
   Catalog Service SKU case-insensitivity, the one shared action being up, ADR-007 SKU
   encoding. Prerender: a 1-year key per demo (wiped by our config writes), paid always-on
   timers, Adobe-hosted management/log endpoints, and a lossy SKU-to-URL scheme that does not
   match ADR-007 (messy SKUs would 404 [I]).

## Side by side

| Criterion | Ours (shared `render-pdp`) | Prerender |
|---|---|---|
| Per-demo setup | none (automatic at create/reset) | workspace + wizard + deploy + timers + block change |
| Multi-tenancy | one action, `?org=&site=` | one site per deployment |
| First visit of a new SKU | ~2–3 s | up to ~65 min |
| Customisation | `/products/default`, applied on reset | `/products/default`; edits don't re-render (#277) |
| SEO / server-rendered HTML | none | JSON-LD, og tags, product HTML |
| B2B correctness | correct per buyer | guest price baked in; empty if categories ungranted |
| ACCS / PaaS / ACO | routing all; pre-warm ACCS only; ACO unbuilt | all three |
| Reset / undo | automatic; product pages not unpublished (EDS-26) | manual; no documented uninstall |
| Owner | us (2 repos, key store) | Adobe code, but N live deployments run by SCs |
| Adobe direction | same overlay pattern, our additions | Adobe's recommended production path |

## What would change the verdict

- Adobe ships multi-site/hosted prerender AND on-demand or event-driven publish (#262).
- Demos start needing SEO, "AI-ready content" or social previews → server-rendered tags
  inside `render-pdp`, no price on B2B.
- Helix stops accepting our site publish keys, or running the shared action becomes
  unacceptable.
- A customer's own production proof-of-concept → prerender in their workspace, not ours.

## Not verified

Whether deleting a site config/repo stops the CDN serving overlay-published product pages;
whether a deleted config removes `query.yaml`; real App Builder cost per demo; whether the
600/min BYOM cap is current (#278). No live probes were run.

## Records corrected the same day

The memory note on prerender (it said "either side overwrites the other"; only ours does),
`docs/architecture/eds-byom-pdp-routing.md` and ADR-005 (they said the publish trigger is
unauthenticated; it signs with a per-site publish key), and the `catalogPrewarmService.ts`
header (it said smart-404 fails with the same 401; fixed by the publish-key registrar).

## Sources

github.com/adobe-rnd/aem-commerce-prerender (README, `app.config.yaml`,
`actions/lib/runtimeConfig.js`, `actions/utils.js`, `actions/pdp-renderer/*`,
`actions/renderUtils.js`, `actions/check-product-changes/poller.js`, `bin/setup/*`,
`docs/{USE-CASES,POST-SETUP,RUNBOOK}.md`; issues #262, #276, #277, #278, #281);
experienceleague.adobe.com/en/tools/commerce-storefront/setup/configuration/aem-prerender/;
experienceleague.adobe.com/en/tools/commerce-storefront/setup/seo/ssr-and-crawlability/;
www.aem.live/developer/byom; github.com/apache/openwhisk docs/annotations.md (`final`).
