# Pricing strategy: who owns which price, and how the buyer's price is made

Settled with the owner, 2026-09-28. Draft for review by the case agent (possible vignette).
Companion to `pricing-and-live-checks.md` (what is synced ahead and what is asked live).
Backlog: [[AB-26z]] (built), [[AB-16k]], [[AB-16l]] (to build).

## The recommendation (owner, 2026-09-28)

**Prices and discounts that come from a company relationship live in the ERP**: contract
prices, price-group prices, customer discounts. Sales negotiates them, they apply on every
channel (web, phone, EDI), and they must match the invoice. The ERP sends Commerce the net
price it would charge ([[AB-16k]]).

**Seasonal web campaigns may live in Commerce, if the client wants them**: holiday promotions,
coupon codes, free shipping, bundles. Marketing runs them; they are web-only and short-lived.
When a client has them, two questions follow: does a campaign reach buyers who have a contract
price (setup 2 or 3 below), and the order carries the campaign discount to the ERP ([[AB-16l]]).

ERPs own discounts, not only list prices: an ERP's pricing turns a list price into a
customer's net price on every sales document (SAP: base price then discount conditions,
`../../plans/ab-26z-contract-prices/sap-mapping.md`; Business Central: line and invoice
discounts, from general knowledge, not re-read). List price is the item's own master data.

**For the demo:** setup 1 (ERP only) is the default story; a seasonal campaign (setup 3) is an
optional extra beat.

## The strategy in one line each

1. **The ERP owns every customer price.** List prices and each company's own prices are set
   in the ERP and nowhere else.
2. **Commerce promotions are optional: a client choice** (owner, 2026-09-28). A client can
   keep all pricing, discounts included, in the ERPs; or run Commerce's catalog and cart price
   rules as well, either competing with the ERP's price or on top of it (see "Three setups").
3. **Prices are synced ahead, never asked on a cart change.** The listing, the product page
   and the cart all price from Commerce, so checkout never waits on an ERP.
4. **The order goes back to the ERP with what the buyer actually paid**, any promotion included.
   The ERP takes the web price as sold and does not reprice it.

## The layers, in the order they apply

| # | Layer | Set in | Lands in Commerce as | Who sees it |
|---|---|---|---|---|
| 1 | List price | ERP (product) | The product's price | Every buyer |
| 2 | Customer price (the ERP's decision: own price list, then price group list, then pricing rule, capped by the maximum discount) | ERP | A tier price for the company's customer group, in its own shared catalog | That company only |
| 3 | Catalog price rule | Commerce | Applied by Commerce | The groups the rule targets |
| 4 | Cart price rule | Commerce | Applied in the cart | Whoever meets its conditions |

**How Commerce combines 1 to 3, by default:** the final price is the LOWEST of the product price, the tier
price, a special price and a catalog price rule (Experience League, "Tier pricing": Final Price
= Min(Regular Price, Group (Tier) Price, Special Price, Catalog Price Rule)). They do not stack.
A catalog rule beats a company's ERP price only when it comes out lower.

**Unless one setting is on** (found by the case agent, confirmed on the same Experience League
page 2026-09-28). Adobe Commerce as a Cloud Service has **Apply Catalog Price Rule on Grouped
Price** (Stores → Settings → Configuration → Sales → Sales → Promotions). With it on, a catalog
rule discounts the group's quantity-1 tier price instead of competing with it: a 90 company
price with a 10% rule becomes 81. It applies only to a group that has a tier price at quantity
1, and never to tier prices above quantity 1 (those apply as usual, without the rule).

## Three setups: a client choice, not a rule

The client worksheet asks which one (owner with the case agent, 2026-09-28). Example: a company
whose ERP price is 90 (list price 100), and a 10% catalog promotion.

| Setup | Commerce promotions | The company pays | Suits |
|---|---|---|---|
| 1. ERP only | None; every price and discount is the ERP's | 90 | A client whose discounts all live in the ERPs |
| 2. Promotions compete (setting off, Commerce's default) | Catalog and cart rules | 90 (the rule's 90 does not beat it) | Contract prices are final; campaigns reach only buyers without one |
| 3. Promotions on top (setting on) | Catalog and cart rules | 81 | Campaigns reach contract buyers too, on their price |

Setup 3 takes the rule only on the quantity-1 contract price: each ERP price list line shown
needs a quantity-1 line for the product. Cart rules (layer 4) apply in setups 2 and 3 alike.

**For the demo:** setup 1 by default; setup 3 as an optional extra beat. The demo store's value
of the setting has not been read yet.

**Layer 4** applies afterwards, to the cart total built from that price.

## What the shared catalog is for

One shared catalog per company that gets its own prices. It gives the company a customer group
of its own, which is the only way Commerce gives one company a price nobody else gets. Nobody
types prices into it in this demo: the integration writes the ERP's prices there and removes
them when the ERP stops pricing them.

**Who owns what around the catalog** (agreed by the owner with the case agent, 2026-09-28):

| Owner | Owns |
|---|---|
| The CRM (customer master; Salesforce for the JustRite client) | The company and its ENTITLEMENTS: which product lines it may buy (a segment or authorization on the account). Not the catalog |
| Commerce | The shared catalog itself |
| The CRM integration (the Commerce side of the CRM sync) | Assigning the company's shared catalog, derived from its entitlements |
| The PIM | The products |
| The ERPs (through the ERP integration) | The prices written into that catalog |

In the demo there is no CRM: setup plays its part (the SC creates the catalog and assigns the
company, per the setup guide).

The ERP integration only writes prices into whatever catalog the company is assigned to, and
never creates or reassigns a catalog. Checked 2026-09-28: it only reads the assignment
(`sharedCatalogGroupOf`, `src/lib/commerce-tier-prices.js`) and skips a company that has no
catalog of its own.

**The wrinkle:** a shared catalog is ONE customer group that carries both product visibility
and price. With one catalog per priced company, each catalog's product list must be derived
from that company's entitlements, so the number of catalogs and the work to keep their product
lists right grow together ([[AB-16m]]).

**Scale, open ([[AB-16m]]):** one shared catalog and customer group per priced company could
mean thousands for a client with about 3,000 ordering customers. No Adobe guidance on practical
limits was found yet. The alternative to weigh: a shared catalog per ERP price GROUP, which
many companies share, and a company-specific catalog only for a company with its own price
list. That mirrors the ERP's own order (own list, then price group list).

## The flows

- **ERP to Commerce, prices:** when a price changes in the ERP (a list price, a price list, a
  pricing rule), the ERP sends that customer's whole set of prices in force; the integration
  writes what is new or changed and removes what dropped out. An hourly publish catches any
  missed change. The storefront shows it after Commerce's catalog export (about 5 minutes on
  the demo store).
- **ERP to Commerce, a price list ends:** the company's prices that list set are removed; a
  price from its price group's list takes over if one is in force; otherwise the company pays
  the list price. Prices another ERP set, and prices the ERP never wrote, are untouched.
- **Commerce to ERP, the order:** each line with the price Commerce charged and its promotion
  discount, and the total the buyer paid. The ERP's sales order then matches the buyer's invoice.

## Setting up a demo

- The first "Load demo data" copies Commerce's product prices into the ERP as its list prices;
  from then on the ERP owns them. (A real rollout goes the same way.)
- A catalog price rule aimed at an ERP-priced company's customer group competes with its ERP
  price, lowest wins. Aim campaigns at other groups unless the competition is the point.

## Demo script (three beats)

1. Activate a company's price list in the ERP: minutes later its buyer sees that price.
2. Deactivate it: the buyer sees the list price again.
3. Run a cart promotion and place an order: the ERP's sales order shows the ERP price and the
   promotion discount, and adds up to what the buyer paid.

For the client story (case agent's suggestion): one visible moment with the same product at two
prices for two companies, and a cart promotion on top whose discount appears on that brand's
ERP sales order line (needs [[AB-16l]]).

## Built and not yet built (2026-09-28)

| Part | State |
|---|---|
| List price ERP to Commerce | Built |
| Customer and price-group price lists to the shared catalog, removal when they end | Built, proven on the demo store ([[AB-26z]]) |
| Pricing-screen rules and the maximum discount included in what the ERP sends | To build ([[AB-16k]]) |
| Promotion discounts on the ERP's sales order lines | To build ([[AB-16l]]); today a cart discount reaches the ERP only as a lower total |

## Sources and what is not yet sourced

- Commerce's lowest-price rule: Experience League, "Tier pricing" and "Special prices" pages
  (read 2026-09-28).
- "ERP owns contract prices, web store owns promotions" is the common B2B division as
  understood here, not yet checked against an Adobe or SAP source. Cite one before it goes
  on a slide.
