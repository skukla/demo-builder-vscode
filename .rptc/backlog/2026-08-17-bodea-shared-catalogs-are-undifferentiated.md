# Bodea's shared catalogs assign identical categories — catalog-driven menus cannot be demoed

**Filed:** 2026-08-17, while resolving the VIP nav gating open item.
**A data finding, not a defect.** It changes what the Bodea demo can claim.

## What was measured

Read live from the Data Installer service, `bodea@main`:

| Shared catalog | Categories assigned |
|---|---|
| Default (General) | bodea, cables, cooling-equipment, critical-power-equipment, products, racks, servers, services, software, switching, wi-fi |
| ServerSavvy Solutions | *identical, 11 of 11* |
| Platinum Buyer | *identical, 11 of 11* |

Compared as sets: **all three are the same**. Company assignments do differ —
Altura and RackMaster → Default (General); ServerSavvy Solutions → its own — but
they resolve to the same visible catalog.

## Why it matters

A nav driven by shared-catalog assignment — the correct mechanism for "this
company sees these categories" — would render **the same menu for every company
and every customer group**. The mechanism is right; the data has no
differentiation for it to express.

This is the real reason the VIP nav gating item was deferred. The earlier reason
recorded in the plan (no clean single-patch insertion point in `header.js`) is
true but secondary: even with a perfect insertion point there is nothing to show.

## What the pack DOES demonstrate

Differentiation is entirely in PRICE, not visibility:

- Two customer groups, both `tax_class_id 3`: "ServerSavvy Solutions", "Platinum Buyer"
- **49 of 56 products carry `tier_prices` naming "Platinum Buyer" by name**
- So the demo is: sign in as a Platinum Buyer, see different prices on the same catalog

## Do not delete `bodea-customer-group.js` as redundant

The two are halves of one path, and the module looks redundant until you ask what
serves the price:

- **The shared catalog decides WHAT the price is.** Creating one creates/uses a
  customer group; product prices assigned to that catalog are what make the tier
  price true in Commerce.
- **`bodea-customer-group.js` decides WHO IS ASKING.** Catalog Service is a
  CDN-fronted read API that returns prices for the group named in the
  `Magento-Customer-Group` header. With no header every request looks like the
  guest group, so the tier prices exist in the backend and are never shown on the
  storefront. It also re-keys the Catalog Service cache-buster on the header set,
  so a cached guest response is not served to a signed-in Platinum Buyer.

Removing the module does not "fall back to shared catalog pricing" — it silently
shows guest prices to everyone, which looks like the demo working.

## If catalog-driven menus are actually wanted

It is a DATA change before a code change, in this order:

1. **Differentiate the shared catalogs** — give at least one a narrower category
   set. Until this exists, nothing downstream is observable, so this step is also
   the test.
2. **Build the nav from what the customer can see.** Today `/nav` is a static
   authored DA document listing six categories; it is the same for everyone by
   construction. Catalog-driven means rendering it from Catalog Service against
   the customer's own catalog — a new block, not a gate over the existing menu.

Do NOT approach this as hiding entries in the authored nav: that keeps a
hand-maintained list in DA in sync with a backend assignment, and they drift
silently in the direction of showing something that should be hidden.

## Constraints

- The category ids above are the pack's own (`bodea`, `racks`, `wi-fi`, …), and
  the pack's categories are addressed by STRING ids, not numeric — see
  `bodea-datapack-facts.md`, which notes nothing goes stale as a result.
- The pack's root "Bodea" category has `include_in_menu: false`, so nav content
  never came from the category tree in the first place.

## Differentiation proposal (drafted 2026-08-23 — awaiting the data decision)

**Re-measure status: NOT re-run** — the 2026-08-23 pickup found no Extension Dev
Host serving the MCP socket, so the live category sets could not be re-fetched.
The proposal below is designed against the 2026-08-17 measurement; re-run the
fetch (kickoff prompt) before executing.

The cleanest demo story keeps each catalog demonstrating ONE thing:

| Shared catalog | Categories | What it demonstrates |
|---|---|---|
| Default (General) | all 11 (unchanged) | the walk-up baseline |
| ServerSavvy Solutions | `servers`, `racks`, `cooling-equipment`, `cables`, `switching`, `services` (6 of 11 — drop `software`, `wi-fi`, `critical-power-equipment`, `products`, `bodea`) | **catalog-driven VISIBILITY**: a server-room reseller whose nav genuinely differs |
| Platinum Buyer | all 11 (unchanged) | **PRICE**: same catalog, better prices (the 49 tier-priced products keep working untouched) |

Why this shape: differentiating ONE catalog is enough to make visibility
observable (the item's step 1 "is also the test"), and leaving Platinum Buyer's
categories alone keeps the existing tier-price demo exactly as it is — the two
mechanisms stay separately demonstrable instead of confounded in one login.

Execution is a DATA change to the pack (`bodea@main`), outside this repo — the
pack source is external (see `project_bodea_template`: the bodea-source repo is
one of the pending external steps). Step 2 (a nav block reading Catalog Service
against the customer's own catalog) stays a separate build, only worth starting
after the data ships and re-measures as differentiated.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-17-bodea-shared-catalogs-are-undifferentiated.md`.
> Re-measure first — fetch `b2b_shared_catalog_categories` for `bodea@main` and
> compare the category sets, since the whole item rests on them being identical
> and a pack revision could change that. If they are still identical, the
> decision is whether to differentiate the DATA; there is no code worth writing
> before that.
