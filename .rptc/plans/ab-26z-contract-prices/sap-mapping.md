# How SAP's customer prices map onto Commerce's shared catalog

Read 2026-09-28 from SAP's own documentation (SAP S/4HANA Cloud Public Edition, APIs for
Sales, version 2608), in a browser at the owner's request: help.sap.com serves its pages
through JavaScript and forbids unnamed automated fetchers in `robots.txt`, so the pages were
read in Chrome. Sources:

- Condition Record Validity (entity `A_SlsPrcgCndnRecdValidity`):
  help.sap.com/docs/SAP_S4HANA_CLOUD/03c04db2a7434731b7fe21dca77440da/c8fef622eed042fba2d0ddb749bac7ac.html
- Pricing Scales (entity `A_SlsPrcgCndnRecordScale`): .../0f89bf893bda43139efa5adef1012c4f.html
- Sales Pricing Condition Record Events: .../71703bca89464fa0a164163979327bf4.html
- Sales Contracts: .../b4004ce27c5544c7983978ff15beb342.html
- learning.sap.com, "Defining Condition Tables for Sales Pricing" and "Introducing Pricing
  Fundamentals in S/4HANA Cloud" (access sequence order, key combinations, PPR0).

## What SAP says

**A customer's price is a condition record, not a contract.** "The validity of a condition
record is characterized by a validity start date and end date, business attributes (such as
product, customer, and so on), and a condition type." Its key fields include `Customer` and
`SoldToParty`, `CustomerGroup`, `CustomerPriceGroup`, `PriceListType`, `Material`,
`SalesOrganization`, `DistributionChannel`, `TransactionCurrency`, and `SalesDocument` (a record
can belong to one sales document, such as a contract).

**Which record wins is the access sequence, most specific first.** SAP's training example: "it
might first look for a customer-specific material price, then a price list category price for
the material, and finally a general material price." PPR0 "often represents a base price".

**Records have a release status.** Blank is "Released": "approved and can be used in
pricing"; others are Blocked, In Review, Rejected and deletion requested.

**Quantity breaks are scales.** Each scale line is a `ConditionScaleQuantity` with its own
`ConditionRateValue`.

**SAP raises events when a price changes:** Created, Changed (including "set as deleted"),
Deleted, and ValdtyPerdChanged ("the validity period of a condition record is changed"). The
payload names the condition record and its condition type, not the price: the listener reads
the record through the API.

**A sales contract is a commitment, not a price list.** "Sales contracts define when specific
goods are to be sold and under which conditions. Sales contracts are valid for a certain time
period. The customer fulfill a sales contract by issuing release orders." Its prices are
condition records that belong to it.

## The mapping

| SAP | Commerce | How |
|---|---|---|
| Customer-specific price (Customer + Material) | the company's own custom shared catalog, custom price for the product | one tier price at quantity 1 for the catalog's customer group |
| Price by customer group, customer price group or price list type (+ Material) | the same company catalog, never a catalog shared by several companies | Commerce allows "only one shared catalog" per company, so the integration writes the price SAP's access sequence would pick for that company |
| Scale lines | tier prices at those quantities | one tier price per scale line |
| Percentage discounts stacked on a price | one net price | Commerce holds one custom price per product per catalog, so the integration writes the net result, not each condition |
| Validity start and end | nothing in Commerce | tier prices have no dates: the integration writes a price when it becomes valid and removes it when it ends (on ValdtyPerdChanged, plus a daily pass for dates that simply arrive) |
| Release status | only Released records publish | a record in review or blocked is not a price yet |
| Base price (PPR0 by material) | the product's own price | already synced (`product.price`) |
| Sales organisation and distribution channel | the Commerce website | the integration's sales organisation per website; the tier price's website |
| Currency | the website's base currency | |
| Sales contract | the reason a price exists | the contract's condition records publish like any other; the contract itself stays in the ERP (release orders are the ERP's business) |

**The integration asks for the determined price, not the rules.** Recomputing SAP's access
sequence outside SAP would duplicate its pricing. SAP offers a price determination service
("Sales Price - Retrieve (Version 2)" in the same API family); a real integration asks it for
each company's prices and writes the answers. The demo ERP's `contracts/in-force` route is that
answer.

## What this changes in AB-26z

- The ERP's vocabulary should be SAP's: **condition records** (customer + material, validity,
  scales, release status) as the source of a price, and a **sales contract** (number, sold-to
  party, validity, status) that condition records can belong to. Not Business Central's
  "sales price list".
- An event per changed condition record (thin, SAP-style) with the integration reading the
  prices in force, rather than one fat event carrying them.
- Validity handled by the integration: publish at the start date, remove at the end date.
