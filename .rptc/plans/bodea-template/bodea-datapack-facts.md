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

Also: the pack hardcodes `website_ids: [3]`, but the service rewrites it to the session website
(`replaceWebsiteIdsWithSession()`, default `base`/id 1) — verified live, all 56 landed on
website 1. Do not design around website 3.

## Products — 56 total (32 simple, 17 virtual, 7 configurable)

**No product carries `media_gallery_entries` — the pack ships ZERO images.** Every image in a
Bodea demo must come from DA.live content or the brand-assets vendor point. (This is why
product-teaser's unguarded `images[0]` was a real crash risk, fixed in bodea-source `77b9a18`.)

`visibility` is numeric in the pack: **31 products = `4`** ("Catalog, Search"), **25 = `1`**
("Not Visible Individually" — the configurable children). None use `3`. Our blocks filter
Catalog Service on the label strings `['Search', 'Catalog, Search']`, which should match the 31
after import (Catalog Service exposes labels, the pack stores the numeric) — **confirm live
before trusting it.**

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

## What the pack does NOT provide

- **Customer segments** — not importable by the API at all. Manual in Admin, permanently.
  Blocks the `customer-segment-personalization-block` story until created by hand.
- **Store scope** (website/store/store view) — no `stores` processor; must pre-exist.
- **Product images** — see above.
- **Orders** — no order processor; `commerce-account-hub`'s "Recent Orders" reads 0 until an
  order is placed by hand.
