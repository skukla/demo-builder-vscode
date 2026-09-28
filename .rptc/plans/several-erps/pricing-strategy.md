# Pricing strategy: who owns which price, and how the buyer's price is made

Settled with the owner, 2026-09-28. Draft for review by the case agent (possible vignette).
Companion to `pricing-and-live-checks.md` (what is synced ahead and what is asked live).
Backlog: [[AB-26z]] (built), [[AB-16k]], [[AB-16l]] (to build).

## The strategy in one line each

1. **The ERP owns every customer price.** List prices and each company's own prices are set
   in the ERP and nowhere else.
2. **Commerce owns promotions.** Catalog price rules and cart price rules are marketing's,
   and they sit on top of the ERP's price.
3. **Prices are synced ahead, never asked on a cart change.** The listing, the product page
   and the cart all price from Commerce, so checkout never waits on an ERP.
4. **The order goes back to the ERP with what the buyer actually paid**, promotions included.
   The ERP takes the web price as sold and does not reprice it.

## The layers, in the order they apply

| # | Layer | Set in | Lands in Commerce as | Who sees it |
|---|---|---|---|---|
| 1 | List price | ERP (product) | The product's price | Every buyer |
| 2 | Customer price (the ERP's decision: own price list, then price group list, then pricing rule, capped by the maximum discount) | ERP | A tier price for the company's customer group, in its own shared catalog | That company only |
| 3 | Catalog price rule | Commerce | Applied by Commerce | The groups the rule targets |
| 4 | Cart price rule | Commerce | Applied in the cart | Whoever meets its conditions |

**How Commerce combines 1 to 3:** the final price is the LOWEST of the product price, the tier
price, a special price and a catalog price rule (Experience League, "Tier pricing": Final Price
= Min(Regular Price, Group (Tier) Price, Special Price, Catalog Price Rule)). They do not stack.
A catalog rule beats a company's ERP price only when it comes out lower.

**Layer 4** applies afterwards, to the cart total built from that price.

## What the shared catalog is for

One shared catalog per company that gets its own prices. It gives the company a customer group
of its own, which is the only way Commerce gives one company a price nobody else gets. Nobody
types prices into it in this demo: the integration writes the ERP's prices there and removes
them when the ERP stops pricing them.

**Who owns the catalog assignment** (from the case agent's review, 2026-09-28): the customer
master owns each company, its customer group and its shared-catalog assignment, product
visibility included: Salesforce for the JustRite client; setup (or the ERP, per demo scope) in
the demo. The ERP integration only writes prices into whatever catalog the company is assigned
to, and never creates or reassigns a catalog. Checked in the integration 2026-09-28: it only
reads the assignment (`sharedCatalogGroupOf`, `src/lib/commerce-tier-prices.js`) and skips a
company that has no catalog of its own.

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
