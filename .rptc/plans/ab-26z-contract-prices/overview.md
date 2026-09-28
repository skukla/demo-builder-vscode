# AB-26z: ERP contract prices live in each company's shared catalog

Plan, 2026-09-28. Owner: "build AB-26z" after agreeing the rule in
`.rptc/plans/several-erps/pricing-and-live-checks.md` (prices synced ahead; no ERP call on a
cart change). The item: `.rptc/backlog/2026-09-26-erp-contract-prices-in-shared-catalogs.md`.

## Where things stand (traced 2026-09-28, spot-checked)

- The mock ERP prices from loose conditions (`demo-erp/lib/pricing.js`: contractPrice,
  contractDiscount, maxDiscount, with validity and minimum quantity). No agreement groups them.
  **Changing a condition emits no event** (`lib/conditions.js` never calls `emit`); only a
  product's list price does (`lib/products.js:313`, `product.price`).
- The integration writes only a product's global price (`lib/commerce.js` `setProductPrice`).
  Nothing writes tier prices or reads a company's shared catalog. The write ledger
  (`lib/ledger.js`) has no kind for a tier price.
- Contract prices reach the buyer only through the two cart webhooks
  (`app.commerce.config.ts:472-536`). **Removing a webhook needs an uninstall with the old
  config, then an install with the new** (integration README, "Changing a webhook or event
  after install"); a plain update leaves it running.
- Demo Builder's fill sends no pricing to the ERP. The setup step `company-catalogs` already
  checks each company has its own shared catalog; its stated reason is the cart webhook.
- The Bodea storefront sends the signed-in buyer's customer group to Catalog Service
  (`scripts/bodea-customer-group.js`), and Catalog Service answers the shared catalog's price for
  it (measured 2026-09-26). So synced prices will show on product pages. Not yet seen live.

## Design

**What the new entity is.** A **contract** in the mock ERP: one agreement per customer with a
number, a term (starting date, ending date), a status and its price lines. It is the existing
contractPrice and contractDiscount conditions, owned by the contract instead of floating free.
The owner asked for it on 2026-09-26 (a real ERP groups terms into agreements). Store-wide rules
(the maximum discount) stay loose conditions.

Named after Business Central's sales price lists (Microsoft Learn, "Record special sales prices
and discounts", read 2026-09-28): a price list per customer (Applies-to Type customer), status
**Draft** ("not included in price calculations") until set to **Active**, then **Inactive**;
each line has the item, unit of measure, **minimum quantity** and starting and ending dates. An
active contract past its ending date prices nothing, without a status change.

**Who owns what.**

| Thing | Owner | Where |
|---|---|---|
| Contracts and their lines | the ERP | `demo-erp/lib/contracts.js`, a Contracts screen, `contract.changed` event |
| Which prices a company gets in Commerce | the integration | writes tier prices (quantity 1, fixed or percentage) into the company's shared catalog group, only for SKUs this ERP owns |
| Undo | the integration's ledger | a new `tierPrice` kind; detach and reset delete exactly what was written |
| The company's shared catalog | Commerce, set up by the SC | the existing setup step, reason reworded |

**Rejected.** Writing prices into a customer group with no shared catalog (a company then
belongs to no catalog: measured 2026-09-25). Keeping a cart webhook as a safety net (it is the
per-change ERP call the rule removes, and the platform runs it as required).

## Decided with the owner, 2026-09-28 (after reading SAP's documentation)

The SC demos this inside the mock ERP, so the ERP stays easy to explain and realistic at once:
**a "Customer price list"** (Business Central's shape, the words an SC can say in a sentence)
with **SAP-grade behaviour** underneath (`sap-mapping.md`). All in this item, now:

- **Customer price lists and group price lists.** A list applies to one customer or to a
  **price group** (Business Central: customer price group; SAP: customer group / price list
  type). The ERP gets price groups; a customer belongs to at most one. Precedence, most
  specific first (SAP's access sequence, simplified): the customer's own list, then its group's
  list, then the loose conditions, then the list price. The store-wide maximum discount still
  caps.
- **Dates on each line** (both ERPs date each line), as well as on the list, so "this price goes
  up on 1 January" is one dated line. A line is in force when its list is active and today is
  within both the list's and the line's dates.
- **Quantity breaks** ("from quantity") become tier prices at that quantity.
- The integration asks the ERP for the prices in force per customer (groups resolved in the
  ERP) and writes them into each company's shared catalog; a group list change reaches every
  member company.
- The talk track maps it to both ERPs (`sap-mapping.md`, "The mapping").

## Slices

- **Z1 (demo-erp): contracts.** Record, routes, a Contracts screen and the customer page's
  list. Quotes read the active contract's lines. `contract.changed` event carrying the
  customer and the active lines; the contract document (`contract/`) says so. Tests.
- **Z2 (integration): prices into the shared catalog.** Resolve company → customer group →
  shared catalog; write tier prices for the ERP's own SKUs on `contract.changed`; a
  `erp/prices` action that publishes every active contract (run after a fill); ledger kind and
  revert. Several ERPs: each writes and removes only its own SKUs' rows.
- **Z3 (integration): remove the cart webhooks.** The two actions, their config, the settings
  toggles (`pricing_contract_prices`, `pricing_discount_ceiling`), their tests, docs. No soft
  deprecation.
- **Z4 (Demo Builder).** After a fill, ask the integration to publish prices; the setup step's
  reason; `docs/systems/erp-integration.md`; the agent surface (say whether a tool publishes
  prices).
- **Z5 (live, Bodea).** Deploy both; **uninstall then install** the integration's Commerce app
  so the webhooks go; confirm System → Webhooks Subscriptions lists none of ours. Make a contract
  for Kukla Studios on `accesspoint`: the tier price appears in its shared catalog, Catalog
  Service with its group header answers the contract price, a cart prices from it. Withdraw
  the contract: the price goes. Reset: nothing of ours is left. Then five carts, for AB-16b.

## Open (decided while building, recorded here)

- The ERP's quantity breaks (minimum quantity) map to tier prices above quantity 1: include or
  leave for later. Recommended: include if Z1's model keeps minQty on a line.
- Which website a tier price is for when a company's catalog spans websites (the catalog's).
