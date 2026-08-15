# The `bodea` datapack — measured contents (2026-08-14)

Read from the deployed Data Installer service by the data-installer session. **Not inferred.**
Owner CoreTech, `shared: true`. Use version **`main`** (its `products` payload is byte-identical
to `tierpricingfix`; the other two versions are archived/legacy).

## Reproducible read path (re-run per tenant; do not trust this file forever)

```
GET  /get-data-item?datapack_name=bodea&data_type=products&version=main
POST /batch-get-data-items  {datapack_name, version, data_types:[...], include_content:true}
```
Base URL = the `demoBuilder.dataInstaller.apiBaseUrl` default in demo-builder-vscode
`package.json` (namespace-scoped — read it, don't paste it). Token =
`aio config get ims.contexts.cli.access_token --json`. Any valid IMS **user** token works.

⚠️ **Provenance rule for anything in this file.** Facts marked MEASURED came from the deployed
service or a live instance. The local `data-installer-api-b2b` checkout is a **2026-03-06
snapshot ~5 months behind the deployment** (proof: `commerce_instance` appears nowhere in it,
yet every live endpoint accepts it). Anything read from that repo is a hypothesis about the
deployment, not a statement of it. Also note: **export is currently broken for ACCS on stage** —
`get-export-items` rejects both the tenant id and the full URL while the same credentials pass
import validate — so capturing a pack *from* an instance is not an option today.
**Trap:** `get-data-item` returns `data` as a JSON *string* — `JSON.parse` it.
`batch-get-data-items` 400s without an explicit non-empty `data_types`.
See `docs/systems/data-installer.md` for the full contract; `npm run data-installer:drift`
checks the read endpoints against committed fixtures.

## Import ordering — load-bearing

**49 of 56 products carry `tier_prices` naming the customer group "Platinum Buyer" by name.**
The service resolves name→id at import. If `customer_groups` is not imported first (or in the
same request), the lookup fails and **the entire `products` type fails atomically — zero
products land.** This bit a live run on 2026-08-14. Always import `customer_groups` with/before
`products`.

Also: the pack hardcodes `website_ids: [3]`, but the service rewrites it to the session website.
**MEASURED for `products`:** all 56 landed on website 1 with the pack declaring `[3]`. Do not
design around website 3 existing.
*Hypothesis only (from the March source drop, unverified against the deployment):* that the
mechanism is `replaceWebsiteIdsWithSession()` declared in `config/data_processors_import.json`,
and that `cart_rules`, `product_export` and `stocks` receive equivalent treatment. The products
behaviour is empirical; the other three types are not.

## Products — 56 total (32 simple, 17 virtual, 7 configurable)

**No product carries `media_gallery_entries` — and this is BY DESIGN, system-wide.**

- **MEASURED (live, `get-data-item`):** zero `media_gallery_entries` across **11 packs / 4
  owners**, including every citisignal version. This is the load-bearing fact and it stands
  on its own.
- **AUTHORITATIVE (the service's author):** images "was expected to be in AEM" — see below.
- *Explanation only, from the **March 2026 source drop*** (`data-installer-api-b2b/docs/
  CONVERT_CSV_EXPORT.md` §6 "Image Path Removal"): pack-prep clears `base_image`, `small_image`,
  `thumbnail`, `swatch_image`, `additional_images` and their labels, "to avoid broken
  references". ⚠️ **That local repo is a snapshot dated 2026-03-06, ~5 months behind the deployed
  service** — `commerce_instance` appears nowhere in it although every live endpoint accepts it.
  Cite it as "the March source drop says", never as "the service does". The *outcome* here is
  measured, so only the stated reason depends on the drop.

So product imagery is **not** the datapack's job — see "Where product images come from" below.
(This is also why product-teaser's unguarded `images[0]` was a certainty rather than a risk;
fixed in bodea-source `77b9a18`.)

`visibility` is numeric in the pack: **31 products = `4`** ("Catalog, Search"), **25 = `1`**
("Not Visible Individually" — the configurable children). None use `3`.

**SETTLED (measured live 2026-08-14, with controls):** Catalog Service takes **label strings**,
not the pack's numerics. Against a live ACCS catalog of 39 visible products —
no filter → 39 · `["Catalog, Search"]` → 39 · `["Search"]` → 0 · `["4"]` → **0** ·
`["NotAValue"]` (control) → 0. The bogus control proves the filter applies, so `["4"]` is a real
rejection. **Our blocks' existing `['Search', 'Catalog, Search']` filter is correct — do not
change it.** The 25 children are correctly excluded. (Scope caveat: measured on a different
catalog on the same instance — the *layer behaviour* is proven, not anything Bodea-specific.)

Individually-visible non-configurables (SKU · price):
`vrrack` 7500 · `datacentersystem` 7500 · `primergyrx4770m5` 2150 · `poweredger752` 1850 ·
`rackerbladeserver` 1650 · `proliantdl380` 1650 · `switchenterprise24` 1299 ·
`bladeservermodelxz` 1230 · `switchlite24` 999 · `switchenterprise8` 399 · `lsps-01` 349.98 ·
`indoorcable` 279 · `accesspointpro` 249 · `accessrouter` 249 · `accesspoint` 199 ·
`switchlite8` 199 · `outdoorcable` 139 · `accessmeshpro` 69 · `accessmesh` 49 · `smartcable` 19
Virtuals: `sc-intro` 499 · `coolingservice` 1000 · `powerservice` 1000 ·
`securityessentialstrial` 0

## Configurable parents (all visibility 4) — for `luxury-configurator`

| SKU | Name | Option attribute (code / label) | Values |
|---|---|---|---|
| `bodea-vr-rack` | Bodea VR Rack | `processor` / "Processor" | 2.4, 3, 3.2, 4 GHz |
| `bodea-racker-blade-server` | Bodea Racker Blade Server | `processor` / "Processor" | 2.4, 3, 3.2, 4 GHz |
| `bodea-blade-server-model-xz` | BodeaBlade Server Model XZ | `processor` / "Processor" | 2.4, 3, 3.2, 4 GHz |
| `coolerz2` | Cooler Z2 | `input_voltage` / "Input Voltage" | 120, 208, 230, 240V AC |
| `bodeapowerx20` | Bodea Power X20 | `wattage` / "wattage" (lowercase) | 650W, 850W, 1000W |
| `outdoorpatchcable` | Outdoor Patch Cable | `cable_size` / "Size" | 6, 8, 10 foot |
| `indoorpatchcable` | Indoor Patch Cable | `cable_size` / "Size" | 6, 8, 10 foot |

Each has ONE option attribute → the configurator's `attribute-groups` must be rewritten from
Jen's `"Materials: Material, Finish; Signature: Hardware, Scale"` to match a real label, e.g.
`"Configuration: Processor"`. Note `wattage`'s frontend label is lowercase in the pack — it
renders verbatim.

**All seven are plain dropdowns** (measured): `frontend_input: "select"`, Source\Table model, no
`swatch_input_type` or swatch fields anywhere in the pack. Option labels equal their values
(`{"label":"2.4 GHz","value":"2.4 GHz"}`). So `luxury-configurator`'s `image` and `color`
rendering branches have nothing to bind to — the demo is dropdown-only unless someone seeds
swatch data by hand.

Hook if we ever want a swatch demo: a **`color` attribute already exists** (`is_filterable: true`,
applies to simple/virtual/configurable) but is **empty** — its only option is a single blank
`{"label":" ","value":" "}`. Seeding its options is manual work outside the pack.

## Categories

Root **"Bodea"**, `parent_id: 1`, **`include_in_menu: false`** (nav will not show it untouched).
Packs bring their own root; they do not merge into an existing tree.

- `Bodea/Products` (url_key `products`) → Critical Power `critical-power-equipment` ·
  Cooling `cooling-equipment` · Servers and Racks `racks` · Switching `switching` ·
  Wi-Fi `wi-fi` · Cables `cables`
- `Bodea/Products/Servers and Racks` → Servers `servers` · Racks `racks`
- `Bodea` → Software `software` · Maintenance Services `services`

⚠️ **`racks` is used as a url_key twice** (level-2 "Servers and Racks" and level-3 "Racks").
Disambiguate anywhere a path is built from url_key. Product→category links use **url_key
strings, not numeric ids** — e.g. `vrrack` → `[bodea, products, racks]` — so nothing goes stale.

## Customers, groups, companies

- **Customer groups:** "ServerSavvy Solutions", "Platinum Buyer" (both tax_class_id 3).
  Platinum Buyer is the tier-price group → this is the customer-group pricing story that
  `scripts/bodea-customer-group.js` lights up.
- **Customers (6, `@adobedemo.com`):** julie.rendon + joe.anderson (ServerSavvy Solutions);
  melissa, mark, charles, kareena (Default/General). Passwords ship in the pack — read them from
  `get-data-item?data_type=customers` when needed; **never commit them** (public repo).
- **Companies (3), all with quotes + purchase orders enabled:** Altura (admin mark@, San Jose) ·
  ServerSavvy Solutions (Austin) · RackMaster (admin kareena@, New York).

## Where product images come from (NOT the pack)

**Two different AEM Assets mechanisms are routinely confused. Name which one you mean.**

**Path A — product images on the storefront. This is the one that matters here.**
A **Commerce↔AEM Assets integration on the backend** resolves product→asset; the storefront
merely needs to be told to use it. Our extension already does that: setting `AEM_ASSETS_ENABLED`
→ `config-template.json` → **`commerce-assets-enabled`** in the generated `config.json`
(`configGenerator.ts:317,526,552`). **Global, not per-package — the bodea entry declares
nothing.** Default `true`; the CHANGELOG rationale is "All demo backends have AEM Assets
integration configured." This is what makes `tryRenderAemAssetsImage` fire in our blocks.
Not an SC editing products in Admin, and not a storefront-side SKU→asset map.

**Path B — the DA.live authoring asset picker.** `aem.repositoryId` (from
`demoBuilder.daLive.aemAuthorUrl`) written to the **per-site** DA config `/config/<org>/<site>`,
where da.live's Library reads it to show an Assets panel to authors. Site scope is load-bearing
— org-scoped once meant the block library appeared but the Assets panel did not. **Nothing to do
with product images.**

**CONFIRMED BY THE SERVICE'S AUTHOR (Jeff, via Steve, 2026-08-14):** asked whether SCs supply
product images in a pack — *"was expected to be in AEM."* So Path A is the intended design, not
an inference.

*Fallback only:* Jeff also noted *"Images could be done via the native product api. They would
need to be encoded."* — base64 through `POST /V1/products/:sku/media`, entirely outside the Data
Installer and requiring a separate script. One runbook line as an escape hatch; not the plan.

**The residual unknown, and it is a content question, not a code one:** whether AEM Assets
actually holds assets for *Bodea's* SKUs. The plumbing self-heals (flag on, integration expected,
dropin support present) but if nobody has uploaded Bodea assets, images stay empty with
everything correctly configured. **Ask CoreTech before promising the storefront fills itself in.**
Lead: the pack's own `cover_image` is hosted at `dsc3sv.adobedemo.com`, and "DSC" is the same
acronym in the service's TODO line about image support — worth asking what DSC's role is.

**Block-policy consequence:** treat missing images as a *temporary* state (keep the blocks, ship
the placeholder), not a permanent condition to design around.

## What the pack does NOT provide

- **Customer segments** — **CONFIRMED by the service's author**: *"true, api doesn't support."*
  No processor exists in either direction. An SC can create them by hand in Admin, but no import
  on any pack will ever produce them. For `customer-segment-personalization-block` this means
  **empty is the steady state of every fresh demo** until someone does manual work — unlike
  images, which self-heal once Assets coverage exists.
- **Store scope** (website/store/store view) — no `stores` processor; must pre-exist.
  **The intended flow, per the author: create the website FIRST, then target the import at it.**
  *"Yes before import. Then you can specify site and store on the data pack import. It will
  validate to make sure they exist."* Everything landing on `base` (as the 2026-08-14 live run
  showed) is what happens when targeting is **skipped**, not the intended end state. This is a
  **precondition at the TOP of the runbook**, not a post-import step.
  **DECIDED 2026-08-14 — ship `base` / `main_website_store` / `default` (i.e. keep what we have).**

  Evidence behind the decision:
  - **No documented convention exists.** `IMPORT_GUIDE.md:21-29` and `QUICK_START_GUIDE.md:128-129`
    describe the params only: `website_code` optional → defaults `base`; `store_code` (a store
    VIEW code) optional → defaults `default`; both validated against Commerce, and one without
    the other is a 400. Nothing says when to target. `USER_README.md`/`API_REFERENCE.md` are
    silent, and there is no Bodea naming convention anywhere in the doc set.
  - **Our shipped values are exactly what an untargeted import produces** (`base` + `default`),
    so the default path is self-consistent.
  - **Empirically unresolvable, and honestly so:** Bodea has been imported 121 times across 10
    instances (9 of them all 14 types), so full installs are routine — but the service log does
    not record `website_code`/`store_code` at all, so it cannot say whether any of those were
    targeted. (Reported as unknown rather than as "nobody targets", which is what the absent
    field naively reads as.)
  - **CitiSignal's branded codes are not a precedent for us**: its website is created by other
    tooling as part of that demo's setup. Bodea has no such step, so branded codes here would
    pre-fill a scope that does not exist on a first-time SC's instance.
  - **Wrong-toward-`base` self-corrects; wrong-toward-branded does not.** The wizard has a real
    store picker (`StoreSelectionRow.tsx` — website → store → store view, fed by live
    discovery), so an SC who *did* create a Bodea website sees it and selects it. A branded
    pre-fill naming a non-existent scope looks authoritative and is the failure mode that
    silently empties a catalog.

  **If we ever adopt a branded Bodea website**, the prerequisite is a documented "create it
  first" step (Jeff's flow). The pipeline already supports it: as of 2026-08-14 the extension
  sends `website_code`/`store_code` on import and reset, and the import modal's picker states
  the precondition. No code change needed on our side — only a runbook step and a config flip.
- **Product images** — see above.
- **Orders** — no order processor; `commerce-account-hub`'s "Recent Orders" reads 0 until an
  order is placed by hand.
- **Quotes and requisition lists — impossible via ANY datapack, not just this one.** The
  service's full vocabulary was pulled live: 21 import types, 18 export, and **zero matches for
  quote / requisition / negotiable in either direction**. So no pack can ever seed them, and
  `commerce-account-hub`'s Quotes / Quote Templates / Requisition Lists tiles read 0 on a fresh
  import regardless of brand. The three companies DO ship `is_quote_enabled: true` and
  `is_purchase_order_enabled: true` — the features are on, there is simply no seeded instance
  data behind them. **Permanent runbook line:** create one quote + one requisition list by hand
  post-import, or the flagship B2B block demos zeros.

## Product images — MEASURED on a live storefront (2026-08-15)

AEM Assets coverage for Bodea is **partial, and thin**: only 3 of 26 categorized products
carry assets — `bodea-vr-rack` (3 images), `bodea-racker-blade-server` (2),
`bodea-blade-server-model-xz`. Their URLs are real AEM delivery URLs
(`delivery-p158081-e1683323.adobeaemcloud.com/adobe/assets/urn:aaid:aem:…`) and serve valid
images (verified 200 `image/jpeg`).

Everything else has none:

| Category | Products | Without images |
|---|---|---|
| products/racks | 9 | 7 |
| products/switching | 4 | 4 |
| products/wi-fi | 5 | 5 |
| products/cables | 5 | 5 |
| products/cooling-equipment | 1 | 1 |
| products/critical-power-equipment | 2 | 1 |

**Consequence, and why `AEM_ASSETS_ENABLED` defaults to `false` for this package.** The
boilerplate PLP's `ProductImage` slot calls `tryRenderAemAssetsImage` unguarded. Its logic
(read from the vendored `tools/lib/aem/assets.js`):

```
if (!isAemAssetsEnabled()) { renderPlain(); return; }   // disabled → safe
if (!imageProps.src) throw new Error('An image source is required…');  // enabled + no src → THROWS
if (!isAemAssetsUrl(src)) { renderPlain(); return; }
```

So with assets enabled, ONE image-less product throws inside the slot and the entire product
grid fails to render — every category page came back blank. Disabled, the plain-render path
still shows the three products that have assets (unoptimized) and renders an empty slot for
the rest.

Not patched deliberately: a patch would buy image optimization for three products at the cost
of a permanent entry in a ledger the project keeps single-digit. The unguarded throw is a
genuine boilerplate defect and belongs upstream.

**Open with CoreTech:** asset coverage for the remaining 23 SKUs. That is what actually makes
the demo look good; the toggle only stops it being broken.

## Category binding — VERIFIED

`product-list-page` authors as `urlPath`, and Catalog Service expects the **full path**, not the
url_key: `products/racks`, `products/switching`, `products/wi-fi`, `products/cables`,
`products/cooling-equipment`, `products/critical-power-equipment`, `software`, `services`.
(`racks` alone returns 0; `bodea/products/racks` returns 0.)

⚠️ The Bodea tree is only visible to Catalog Service once the **store group's root category** is
pointed at the Bodea root — packs bring their own root and do not merge into the existing tree.
Before that change, `categories` returned only "Default Category" and every PLP was empty.
Manual Admin step, belongs in the runbook next to "create the website".

## guided-selling-luxe — the custom-data check (2026-08-15)

Flagged as a possible "Jen custom data" dependency. Investigated; the smell was real, and
it sat **entirely in her authored JSON**, not in the block code or the backend.

**Her deployed schema** (`/data/guided-selling/bodea-rack-finder.json` on
`jenhankib2bbodea`, 23,870 bytes) is built on data that does not exist here:

| She referenced | Status against our catalog |
|---|---|
| personas → `BD-NE-06U-1`, `BD-NE-12U-GLASS-{6U,12U,24U,42U}` | none resolve (positive control `vrrack` resolves) |
| `server-racks`, `network-enclosures`, `power-cooling`, `cable-management`, `accessories` | the dead nav links removed in Step 04 |

**Her own quiz is broken upstream.** Her deployed `guided-selling-luxe.utils.mjs` (18,185
bytes, fetched with `--compressed`) dereferences `schema.personaOrder` in three places;
her deployed schema has no such key. Intro and questions render; the results step throws.

**The block code is clean.** The only Commerce attributes it ever queries are
`categoryPath`, `sku` and `visibility` — all native Catalog Service. No custom attribute,
no custom segment, nothing requiring a backend she built. Our replacement schema uses only
categories verified to return products, and was validated by running the block's real
`resolveResultState` over all 1,024 answer combinations.

**What it actually demonstrates**, stated plainly so nobody oversells it: the questions,
personas, weights and tie-breaks are hand-authored JSON. No Commerce feature drives any of
it. The only native moment is the `productSearch` that hydrates the result tiles. It is a
merchandising/content experience that ends in a real catalog query — not Commerce doing
guided selling. The on-thesis native equivalents (Live Search, Product Recommendations)
are unused. **Decision: keep it, library-only** (it is on no page, so it costs nothing and
an SC who wants it gets a working example).

Measured directionality of the `personaOrder` requirement, now corrected in the block's
README (which documented neither): a persona in `personas[]` missing from `personaOrder`
throws `TypeError: ... (reading 'total')`; a surplus id in `personaOrder` is harmless.

## B2B contract pricing IS live — on customer groups 6 and 7 (2026-08-15)

Measured against the seeded instance via `Magento-Customer-Group` (the header is
`sha1(base64decode(uid))` in lowercase hex; uid is base64 of the group id):

| Group | vrrack | switchlite24 | indoorpatchcable |
|---|---|---|---|
| 0 (guest) | 7500.00 | 999.00 | 4.00 |
| 6 | 7500.00 | 999.00 | **3.28** |
| 7 | **6750.00** | **899.10** | 4.00 |

Group 7 reads as a blanket ~10% contract discount (almost certainly "Platinum Buyer");
group 6 is a narrower cable-only tier. Groups 0–5 and 8–20 are identical to guest.

**A sweep of groups 0–4 finds nothing and reads exactly like "tier pricing was never
imported."** That wrong all-clear was stated out loud before the range was widened. The
real ids are simply higher than the default-group range. Sweep 0–20 before concluding
anything about group pricing here.

**Consequence for guided-selling-luxe:** no persona→group mapping is needed or wanted.
`bodea-customer-group.js` sets the header on `CS_FETCH_GRAPHQL`, the shared Catalog
Service fetch instance that the block's `search()` also uses, so a signed-in buyer's
contract pricing already flows into the result tiles for free.

**Known limitation if that beat gets demoed:** `hydrateModuleProducts` memoizes results in
`runtime.productCache` keyed by module, and nothing invalidates it on the auth event — so
signing in mid-quiz will NOT reprice the tiles already rendered. It needs a page reload
today. Clearing that cache in the existing `authenticated`/`auth change` handler would make
"take the quiz as a guest, sign in, watch it reprice" work live; not done yet.
