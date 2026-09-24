# Business structure: how the ERP's selling structure and Commerce's store structure line up

Date: 2026-09-24. Mode: hybrid (codebase + external). Four parallel report-only researchers
read SAP (help.sap.com through its JSON page endpoints), Dynamics 365 Business Central and
Finance & Supply Chain Management (learn.microsoft.com), and Adobe Commerce (Experience
League `.md` sources, `AdobeDocs/*` repos, the starter kit clone at `019a03b`). Codebase facts I read myself. Labels throughout: **read** (the
page was read), **snippet** (search excerpt only), **inferred**, **marketing**.

Builds on, and does not repeat: `../erp-realism-audit/`, `../multi-erp-order-routing/`,
`../erp-bidirectional-review/` (item 7), `.rptc/plans/erp-integration/overview.md`
(decisions 3, 5, 15).

**Which real ERPs matter.** The multi-ERP order-routing client (acquisitions) runs
**several ERPs, none named**; each **product line lives in its own ERP**, and an **inRiver
PIM aggregates them into one online catalog**. That per-line ownership is why an order must
split (owner, 2026-09-24; an earlier "Infor" reading was wrong and its research was
stopped). A different client runs **Dynamics 365**. The mock ERP is a composite legible to
SAP and Dynamics users (plan §1.1), so both are covered; section 6 is the routing client.

---

## 0. The question, and the answer in one paragraph

Every ERP has a seller-side hierarchy: a legal entity that keeps books, a selling unit
inside it, and a place goods ship from. Commerce has a different one: website → store →
store view, with inventory sources per SKU. The mock ERP today has one field for all of
this, `salesOrg`, defaulting to `'1000'` for every customer, set by nothing, shown on two
documents. Nothing maps the two hierarchies.

The model that fits both the evidence and our principles: **three seller levels in the ERP**
(company code = the ERP itself, sales organisation ↔ Commerce website, warehouse ↔ Commerce
inventory source per SKU), **the mapping owned on the Commerce side** as a per-website
setting on the integration's injected Admin screen, and **the ERP showing its structure
read-only**, rebuilt from Commerce on every reset. The multi-entity order is one order in
the selling entity plus intercompany documents, which is how SAP and D365 both do it and
what the routing integration should mirror.

---

## 1. What the codebase has today (read)

| Where | What | Verdict |
|---|---|---|
| `demo-erp/lib/partners.js` `importPartners` | `salesOrg: row.salesOrg \|\| existing?.salesOrg \|\| '1000'` | the only structure field; nothing sends `row.salesOrg` |
| `commerce-erp-integration/src/lib/mirror.js` | products → ERP products with `warehouses` one per inventory source, named from Commerce's sources; companies → partners | no `salesOrg` anywhere in the integration's `src/` |
| `demo-erp/lib/orders.js` | an order carries `partnerId`, `currency`, no sales organisation of its own | the order document prints the customer's `salesOrg` |
| `commerce-erp-integration/app.commerce.config.ts` `businessConfig` | five boolean settings (`orders_*`, `pricing_*`), scoped Default / website / store / store view by `@adobe/aio-commerce-lib-config` | the mechanism for a per-website mapping exists and is in production |
| `src/commerce-backend-ui-2/web-src/src/settings-view.js` | the Admin screen's settings tab with a scope picker over Commerce's websites/stores/views | the screen exists; a new setting joins a section by its name prefix |
| `demo-erp/lib/fulfilment.js` `postShipment` | the shipment event carries `stockSourceCode` = the ERP warehouse code = the Commerce source code | the warehouse axis is already wired end to end |
| `demo-erp/screen` | Customer document and Order header print "Sales organisation 1000"; Shipment prints "Default Source · default" | present and meaningless — the failure the realism audit ranks worst |

Two real clients have been named; neither's structure is modelled.

---

## 2. SAP S/4HANA (read unless marked)

**Levels.** Client → company code ("a legally independent firm with its own independent
accounting", [company code](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/621c00a46ed247ffa5a2a311de7e3535/c5c2dc53b5ef424de10000000a174cb4.html)) →
sales organisation ("the selling unit as a legal entity … Each sales organization is assigned
exactly one company code … must be specified in all sales documents",
[sales organization](https://help.sap.com/docs/SAP_ERP/a428aae377ba4a1199c3ecc8b7f5f33d/668bc95360267214e10000000a174cb4.html)) →
distribution channel (wholesale, retail, direct; one channel can serve several sales orgs) →
division (product group). Sales area = (sales org, channel, division) and "appears in all
the main sales and distribution documents"
([sales area](https://help.sap.com/docs/SAP_ERP/beef6a3baaa149d18944b7170c427838/be95c7536e8e2a4be10000000a174cb4.html)).

**Plant and storage location.** A plant is enabled for selling through the explicit
assignment "sales organization – distribution channel – plant": "defines that a plant can
be used as a delivering plant in sales orders of a sales organization and distribution
channel combination", and "a plant of one affiliate can be assigned to several sales
organizations of another affiliate"
([Best Practices](https://help.sap.com/docs/SAP_S4HANA_BEST_PRACTICES/cdc21d75bc156982be95178cc2d7dbc7/d07c28678c6c4c32a11573c3815ca295.html)).
A storage location belongs to exactly one plant. The delivering plant is an ITEM-level
field, proposed from the ship-to's master record.

**Customer per sales area.** Master data has three layers: general (one), company-code data
(reconciliation account, payment terms, dunning), and sales-area data (currency, Incoterms,
payment terms, delivering plant, pricing procedure, partner functions), "so that each
company code and each sales organization can store its own information"
([customer master](https://help.sap.com/docs/SAP_ERP/72b431fb78a649da9c8b46951e64fb88/17e8d353ca9f4408e10000000a174cb4.html)).
A business partner is **extended** to a sales area by creating that segment
([Create/Extend Customer Sales Area Data](https://help.sap.com/docs/SAP_S4HANA_BEST_PRACTICES/cdc21d75bc156982be95178cc2d7dbc7/5dac3dc5cb9f436e80bcc00c353a8a80.html), snippet),
and sales-area payment terms "are used instead of the terms of payment defined on the
company code level". For a sold-to, ship-to, bill-to and payer default to itself.

**Pricing is keyed by selling unit.** The standard price condition (PR00 / PPR0) is
maintained under "sales organization, distribution channel and material"
([PR00](https://help.sap.com/docs/SAP_ERP/15f6005df5a343d096f63b554e47e14a/b1dcc353b677b44ce10000000a174cb4.html)).
So a contract price without a sales organisation on it is not an SAP condition record.

**Numbering.** Sales document numbers come from `RV_BELEG`, assigned by document TYPE, not
by company code or sales org (inferred: client-wide). S/4's optional flexible numbering can
prefix by company code (DE-, IT-)
([Flexible Sales Document Numbering](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/a01254bea38949bba7d5835ffb4132dc.html)).
Our ten-digit ranges are consistent with SAP as long as they stay one range per document
type across the ERP.

**SAP's own commerce product puts the mapping on the COMMERCE side.** In SAP Commerce Cloud,
Backoffice holds an "SAP Base Store Configuration" (Order Type, Reference Customer,
**Sales Organization**, **Distribution Channel**, **Division**, shipping/payment mappings,
and a "Mapping SAP Plant to Logical System and Sales Area" table with a Warehouse per row)
attached to each Base Store, 1:n
([Defining an SAP Base Store](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/0af2145522f64abd9d7d00bc69e4745a/8bae533586691014b7c284741a6d4831.html),
[Common Settings](https://help.sap.com/docs/SAP_COMMERCE/50c996852b32456c96d3161a95544cdb/8b864b1b86691014a7fb90d133daff43.html)).
Order replication reads sales org, channel and division "from the canonical item
SAPConfiguration derived from the store name attached to the order". Warehouses map
one-to-one to plants, "warehouse IDs … match the four-digit IDs of the corresponding
plants". The cloud ERP edition does the same per store in its own UI. **The company code is
not a field there**: it follows from the sales organisation (inferred).

**Multiple back ends.** SAP Commerce splits an order into sub-orders per back end, keyed by
plant: "each warehouse must correspond one-to-one with a plant … Do not assign a single
plant ID to more than one SAP back end", and "each sub-order contains a sold-to party. The
sub-order can only be created if the sold-to party is known in the SAP back end"
([multiple back ends](https://help.sap.com/docs/SAP_COMMERCE/50c996852b32456c96d3161a95544cdb/afe5277b433940a48120af30ef15e061.html)).
That is exactly our routing integration's job, and its two constraints: ownership is per
plant (= per Commerce source), and the customer must exist in every ERP that gets a part.

**Counter-example on the ERP side.** Sana Commerce (its own storefront) assigns a webstore's
sales area and company code inside the SAP add-on, and "you will not be able to change the
sales area" after creation (read via WebFetch summariser).

## 3. Dynamics 365 Finance & Supply Chain Management (read unless marked)

**Legal entity = company (DataAreaId).** "A legal entity is an organization that has a
registered or legislated legal structure … every legal entity is associated with a company
ID … companies are used as a boundary for data security"
([organizations overview](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/organization-administration/organizations-organizational-hierarchies)).
"Each legal entity requires a ledger … A balance sheet can be created only for a legal
entity. … An operating unit can't have its own ledger"
([plan your hierarchy](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/organization-administration/plan-organizational-hierarchy)).
Operating units (business unit, cost centre, department, value stream, **retail channel**)
are for control and reporting and can span legal entities.

**Sites and warehouses.** "A site … belong[s] to a single legal entity. A single site can't
be shared by multiple legal entities" and "all transactions must refer to a site"
([guidance](https://learn.microsoft.com/en-us/dynamics365/guidance/organizational-strategy/define-organizational-strategy),
[configure sites](https://learn.microsoft.com/en-us/training/modules/get-started-inventory-management-supply-chain/configure-sites)).
Warehouses sit under a site (cardinality inferred).

**Customers per legal entity, party shared.** "Some master data, such as customers, payment
terms … must be set up for each legal entity. Some master data, such as … products … is
shared among all legal entities." Behind a customer is a global-address-book party that
"can be associated with customer … roles in the CEE company, and … the vendor role in the
CEU company"
([global address book](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/organization-administration/overview-global-address-book)).
Customers are copied between legal entities, optionally with the same id
([copy customers](https://learn.microsoft.com/en-us/dynamics365/finance/accounts-receivable/copy-customer)).

**The multi-entity order is an intercompany chain, not a split.** "When Company A first
creates a sales order for an external customer, a purchase order can be created
automatically in Company A. This action prompts the automatic creation of an intercompany
sales order in Company B. The three-legged order chain consists of a sales order and a
purchase order in Company A and an intercompany sales order in Company B"
([intercompany orders](https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/intercompany-orders-and-return-orders)).
Several owning companies can serve one order ("more than one intercompany purchase order"),
with **Direct delivery** shipping from the owner straight to the customer
([several companies](https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/intercompany-orders-in-several-companies)).
The external customer only ever deals with the selling entity (inferred).

**Numbering.** Sequence scope is chosen per sequence: Shared, Company, Legal entity or
Operating unit; a Company-scoped sequence restarts per company, so "sales order number
SO-0029 is used in each company"
([number sequences](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/organization-administration/number-sequence-overview)).

**Microsoft's own commerce product puts the mapping in the ERP.** A Dynamics 365 Commerce
online channel is created in headquarters with **Legal entity**, **Warehouse**, **Currency**,
**Default customer**, **Customer address book**; "you can configure a single channel with
only one currency, one legal entity, and one set of products and prices", and a multi-market
site uses "each online channel for a region-specific legal entity"
([set up an online channel](https://learn.microsoft.com/en-us/dynamics365/commerce/channel-setup-online),
[map channels to sites](https://learn.microsoft.com/en-us/dynamics365/commerce/map-channels-sites)).

## 4. Dynamics 365 Business Central (read unless marked)

**Company = one legal entity's data container.** "The container for business data that
belongs to a business unit or legal entity is referred to as a company"; an environment
holds many, one is open at a time
([about a new company](https://learn.microsoft.com/en-us/dynamics365/business-central/about-new-company)).
Customers, items and number series are per company (customer scope inferred from the
`DataPerCompany` default of `true`; not stated on the Customer page).

**Selling structure is thinner than SAP's or F&SCM's.** Responsibility Centers are
administrative units (a sales office) that default onto a document from the user, the
customer or Company Information and "affect the address, dimensions, and prices"
([responsibility centers](https://learn.microsoft.com/en-us/dynamics365/business-central/inventory-responsibility-centers)).
Locations are the inventory places, on the sales header and each line
([locations](https://learn.microsoft.com/en-us/dynamics365/business-central/inventory-how-setup-locations)).
Dimensions (two global, up to eight shortcut) are the reporting structure
([dimensions](https://learn.microsoft.com/en-us/dynamics365/business-central/finance-dimensions)).
The sales header carries Responsibility Center, Location Code, Sell-to / Bill-to / Ship-to,
Customer Price Group, Customer Disc. Group, Payment Terms Code, Currency Code
([Sales Header](https://learn.microsoft.com/en-us/dynamics365/business-central/application/base-application/table/microsoft.sales.document.sales-header)).

**Numbering.** "For each company that you set up, you need to assign unique identification
codes … one or more codes for each type of master data or document"
([number series](https://learn.microsoft.com/en-us/dynamics365/business-central/ui-create-number-series)).

**BC's Shopify Connector puts the mapping in the ERP.** One "Shopify Shop" card per web
store, inside one company, holding Customer/Company Template Code, Default Customer No.,
Customer Mapping Type, Customer Price Group, Customer Discount Group, Currency Code, Item
Template Code, and a Shopify Shop Locations sub-page (Default Location Code, Location Filter
such as `EAST|WEST`, Stock Calculation)
([get started](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/get-started),
[synchronize inventory](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-inventory),
[synchronize orders](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-orders)).
"The Shopify Connector affects only … the company. You can connect to the same Shopify
online store from multiple environments or companies." No page describes one store routing
orders to several companies. Responsibility centres and dimensions are not mapped by the
connector (absence in nine pages read).

## 5. Adobe Commerce (read unless marked)

**Scope hierarchy.** "global → website → store → store view. … The primary function of a
website is top-level feature configuration [payment, delivery, checkout, customer accounts
when shared per website, prices when price scope is Website] … of a store is root category
configuration … of a store view is translation information and currency symbol
configuration"
([scope](https://experienceleague.adobe.com/en/docs/commerce-admin/start/setup/websites-stores-views)).
"Inventory is managed at Website or Global level only"
([multi-site](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/multi-sites/ms-overview)).
Customer accounts are Global or Per Website
([account scope](https://experienceleague.adobe.com/en/docs/commerce-admin/customers/customer-accounts/customer-account-scope)).

**The seller's legal identity is website-scoped configuration, not an object.** Store
Information holds the business address and a **VAT Number** ("the Value Added Tax number of
the business that owns the Commerce installation") at **website** scope; Store Name and
Phone at store view; shipping **Origin** at website
([general config](https://experienceleague.adobe.com/en/docs/commerce-admin/config/general/general),
[shipping settings](https://experienceleague.adobe.com/en/docs/commerce-admin/config/sales/shipping-settings)).
So each website can carry a different seller address and tax number, but Commerce has no
named "legal entity" and no way to say two websites share one.

**Inventory.** "Stocks map a sales channel (currently limited to websites) to source
locations … a sales channel can be assigned to only one stock"
([REST inventory](https://developer.adobe.com/commerce/webapi/rest/inventory/)); sources
are assigned per product; the shipping source travels as
`arguments.extension_attributes.source_code` on `POST /V1/order/{id}/ship`. This is the
field our shipment event now fills (`stockSourceCode`).

**A B2B company is the BUYER, and it belongs to one website.** It carries Company Legal
Name, VAT/Tax ID, Reseller ID and a Legal Address ("the street address where the company is
registered to conduct business"), credit, a shared catalog through its customer group, and
"Website — Set the website scope for the company account. Defaults to the Main Website"
([create a company](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/companies/account-company-create),
[manage](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/companies/account-company-manage)).
That is the shape of SAP's sold-to extended to one sales area, and the fields are what an
ERP business partner's general data holds. We mirror none of them (open question O6 should
widen from addresses to the legal fields).

**Our settings mechanism, precisely.** App Builder `businessConfig` "generates the runtime
actions that the App Management UI uses to render a configuration form"; values live per
scope-tree node (Global, website, store, store view, custom) and inherit upward; the form
shows in the **App Management view** in Commerce Admin, not under Stores → Configuration;
and the scope tree "reflects Adobe Commerce scope structure as of the last sync. It is not
kept in lockstep" — an admin must run **Sync commerce scopes** per app
([business configuration](https://developer.adobe.com/commerce/extensibility/app-management/configuration-schema/)).
Field types include `list` and `dynamicList`. Two consequences for a mapping setting: it is
reachable per website today, and a website added after install is invisible to it until
someone syncs.

**Adobe says nothing about seller structure.** The starter kit docs (32 files) and its
`app.commerce.config.ts` contain no company code, sales org, plant or legal entity, and no
`businessConfig` (positive control: `website` matched, as `exclude_website_ids`). The one
SAP article on Experience League is a "perspectives" piece (untrusted retrieval by the
docs-lookup rule) and maps SAP to the BUYER side: "SAP Customer Number → Commerce Company
Account → Shared Catalog → Pricing Source"; it names no website mapping.

**Third-party connectors document no Commerce-side field.** APPSeCONNECT's docs show the
Commerce website list synced *into the ERP* with per-connection tables
([NAV–Magento](https://docs.appseconnect.com/integration/nav-magento/)); its plant→store
mapping is in its own "Dynamic Mapping Interface" (marketing). i95Dev: "Orders route to
the correct F&O legal entity by storefront, currency, and account … Multi-entity mapping is
defined during discovery" (marketing; its manual PDF could not be read). Corevist pages
were unreadable. Webkul's SAP B1 connector picks one warehouse and price list in a
Magento-side config view with no per-website mapping (read).

## 6. The routing client: product lines per ERP, aggregated by a PIM

What the owner has from the client (2026-09-24), stated as given: several ERPs, not named;
each product line is mastered in its own ERP; inRiver, a product information management
system, aggregates the lines into the single catalog the web store sells; therefore one
order can hold lines owned by different ERPs and must be split. Nothing below about this
client is from vendor documentation.

**What this changes in the model.** Ownership is a **per-SKU fact that originates upstream**
of Commerce — the PIM knows which ERP mastered each product line — and it is NOT a
website mapping. The two seller axes stay distinct:

| Axis | Owner of the fact | Where it lands in Commerce | What it decides |
|---|---|---|---|
| Which selling unit (legal entity / sales org) | the merchant's structure | website | which ERP's sales organisation an ORDER is placed in; `ext_order_id`; the seller's address and VAT on the invoice |
| Which system owns the goods | the PIM, per product line | the SKU's **inventory source** (and/or an ownership attribute the PIM feed sets) | which ERP fulfils a LINE; where the shipment ships from |

The multi-ERP research already chose inventory sources as the native ownership marker
(`../multi-erp-order-routing/` §1.1: "the closest native thing to 'which system owns this
SKU'"). The PIM fact fits it: a source per ERP ("Acme plant", "Contoso plant"), assigned to
each SKU by the PIM's feed or by the merchant. If the client's PIM cannot drive source
assignment, a product attribute (`erp_owner`) set by the feed is the fallback, and the
routing integration reads whichever the merchant chooses. **inRiver itself is out of our
scope**: the demo does not model a PIM; the mock ERP's products arrive from Commerce, so
the demo's stand-in for "the PIM assigned this line to ERP B" is the SKU's source.

**The selling entity for a split order.** With lines owned by two ERPs, one ERP is still
the seller of record for the order (D365's selling company; SAP Commerce's sub-order per
back end still carries one sold-to per part). The website's sales-organisation mapping
(8.2) names it; the owning ERP's part references the selling ERP's number. This is the one
place the two axes meet, and it is exactly what the routing integration exists to decide.

**Open with the client**, to be asked rather than assumed: which ERPs; whether the PIM
already carries an "owning system" attribute per product; whether Commerce inventory
sources are already one per ERP; who the seller of record is for a mixed order (the
website's entity, or the entity owning the majority of lines).

---

## 7. What the evidence says, read together

**Every ERP has the same three seller levels, under different names.**

| Level | SAP | D365 F&SCM | Business Central | Commerce's nearest thing |
|---|---|---|---|---|
| Legal entity, own books | company code | legal entity / company | company | none as an object; Store Information (address, VAT) per **website** |
| Selling unit | sales organisation (+ distribution channel, division) | retail channel / operating unit; the legal entity itself for most sales | responsibility centre (thin) | **website** (checkout, payments, prices, customers, one stock) |
| Where goods are | plant → storage location | site → warehouse → location | location | inventory **source** per SKU, one stock per website |
| Buyer | sold-to, extended per sales area | customer per legal entity, shared party | customer per company | B2B company, scoped to one website |

**On where the mapping is configured, the first-party products split.** SAP Commerce Cloud
configures the store→sales area→plant mapping on the commerce side, per base store.
Dynamics 365 Commerce and BC's Shopify Connector configure it in the ERP, one channel or
shop card per web store. Sana (SAP and D365) configures it in the ERP. No Adobe Commerce
connector documents a Commerce-Admin field for it. So "where" is a product decision, not an
industry norm, and it should follow our own principles rather than a precedent count.

**Our principles decide it for the Commerce side.** Commerce is the system of record and
the ERP is transient (`.rptc/plans/erp-integration` decisions 3, 8; README "Commerce is the
permanent system"). A mapping stored in the ERP is wiped on every reset and rebuilt from
nothing; a mapping stored in Commerce's business config survives reset and is what the
mirror reads to rebuild the ERP's structure. The merchant's structure (websites) is owned in
Commerce, so the merchant maps it there. That is SAP Commerce's shape, and it is the only
one consistent with "whatever can be done can be undone" here. The ERP then SHOWS the
structure, read-only, the way it shows every other mirrored fact.

**The multi-entity order is one order plus intercompany documents, not two orders.** SAP
Commerce splits into sub-orders per back end keyed by plant and requires the sold-to to
exist in each; D365 keeps one sales order in the selling entity and auto-creates
intercompany purchase/sales orders in the owning entity, shipping direct. Both agree on the
two facts the routing integration needs: **ownership is decided per line by the goods'
location** (plant / site / Commerce source), and **the customer must be known to every entity
that fulfils a part**. Commerce has exactly one `ext_order_id`, so the SELLING ERP's number
is the one written back, and the owning ERP's documents reference it.

---

## 8. Recommended model

### 8.1 Three seller levels in the ERP, one buyer level

```
Company code            = this ERP (one per ERP instance; the ERP's display name is its name;
                          currency and country from the mapped website's Store Information)
 └─ Sales organisation  ↔ one Commerce website (code + name; distribution channel fixed "Online")
     └─ Warehouse       ↔ one Commerce inventory source (code from Commerce; NAME the ERP's)
Sold-to (business partner) ↔ one B2B company, in the sales organisation of its website;
                          the walk-in partner belongs to every sales organisation
```

The two-ERP case adds nothing to the levels: each ERP is its own company code, and a
website maps to a sales organisation in exactly one of them. Distribution channel and
division stay as fixed texture ("10 · Online", "00 · Cross-division") until a demo needs
them; adding them later is two fields, not a model change.

### 8.2 Where each mapping is configured

| Mapping | Configured where | Mechanism |
|---|---|---|
| website → sales organisation (code, name) | Commerce Admin, the integration's App Management settings, per website | two new `businessConfig` fields: `structure_sales_org` (code, default `1000`), `structure_sales_org_name` (text, default the website's name); a new "Structure" section in `settings-view.js` by name prefix |
| website → which ERP (two-ERP case) | the same setting, on the ERP integration that owns that website; `orders_send` off on the other | already the multi-ERP research's finding (S1); no new mechanism |
| source → warehouse name | ERP Settings → Warehouses (code from Commerce, read-only; name editable) | ERP-side because it is presentation, not routing; wiped and re-defaulted on reset |
| source → owning ERP (routing) | the routing integration's own per-source table, on ITS Admin screen | out of scope here; noted so the sales-org setting is not misused for it |
| company code identity (name, currency, country, VAT) | derived: display name + the mapped website's Store Information | the mirror reads Store Information per website (`GET store/storeConfigs`, `GET store/websites`); no new setting |

The App Management scope tree goes stale until synced; the mirror should read Commerce's
websites directly (`GET store/websites`) and warn on the ERP's Structure card when a website
has no mapping ("Website `eu` has no sales organisation; orders from it use 1000").

### 8.3 What flows

- **Order request** gains `salesOrg` (contract: `order.request`), resolved by the
  integration from the order's `store_id` → website → setting. Stored on the order; the
  order header prints it instead of the customer's.
- **Partner import** gains `salesOrgs: [...]`: the sales organisations of the websites the
  company's users have ordered through, plus its admin's website. The customer document
  lists them ("Sold-to in 1000 · Online DE, 2000 · Online US"), which is SAP's extension
  made visible; `salesOrg` (singular default) is removed, not kept beside it.
- **Pricing conditions** gain an optional `salesOrg` scope, so a contract price can be "for
  this customer, in this sales organisation" (SAP's PR00 key). Default: all.
- **Shipment** already carries `stockSourceCode`; the ERP prints the warehouse's ERP name.

### 8.4 What the ERP shows

Settings → **Organisation** card (read-only, rebuilt on reset):

```
Company code   1000  Northwind ERP        USD · United States · VAT 12-3456789 (from Main Website)
Sales orgs     1000  Online US   ↔ website base      3 customers · 41 orders
               2000  Online EU   ↔ website eu        1 customer  · 6 orders
Warehouses     default  Default Source  → "Plant 1000 · Dallas DC"   (name: editable)
               east     East DC         → "Plant 1100 · Newark DC"
```

Plus, on the documents already built: Order header "Sales organisation 1000 · Online US";
Customer header "Sold-to in …"; Shipment "Ship-from Plant 1100 · Newark DC (east)". Home's
work list can be filtered by sales organisation once two exist.

### 8.5 What the two-ERP case needs from this

1. Each ERP integration's per-website `structure_sales_org` and `orders_send` settings, so a
   website belongs to one ERP (exists today except the sales-org field).
2. A per-source ownership table in the routing integration (which ERP owns source `east`),
   and the rule that a line is routed by its product's source — SAP Commerce's plant rule.
3. The selling ERP keeps the single `ext_order_id`; the owning ERP's order references it as
   the customer reference (D365's intercompany chain, SAP's sub-order).
4. The buyer must exist in both ERPs: the partner import already runs per ERP from the same
   Commerce companies, so it does.

---

## 9. Open questions for the owner

| # | Question | Recommendation |
|---|---|---|
| S1 | Which ERPs does the routing client run, and does inRiver already carry an "owning system" attribute per product line? | Ask the client; the model in 8.1 holds for any ERP, and the ownership axis lands on the SKU's source either way. |
| S2 | Which Dynamics edition does the other client run? | F&SCM assumed (legal entities, intercompany); BC noted where it differs. |
| S3 | Does the mapping go on the Commerce side (8.2), accepting that App Management's scope tree needs a manual sync when a website is added? | Yes — it is the only placement that survives an ERP reset and matches "Commerce is the system of record". |
| S4 | Mirror the buyer's legal fields (Company Legal Name, VAT/Tax ID, Reseller ID, Legal Address) into the partner's general data? Widens O6. | Yes; it is what every ERP's business-partner general data holds, and the customer document is visibly thin without it. |
| S5 | Keep distribution channel and division as fixed texture, or make them settings too? | Fixed ("10 · Online", "00") until a demo needs otherwise. |
| S6 | Should the sales-organisation mapping ship before the credit hold (build order in `erp-bidirectional-review` §Recommended order)? | Yes — it is one setting, one contract field and one card, and it turns a fake field on two built documents into a real one. |

## 10. What could not be established

- SAP: that a plant belongs to exactly one company code (standard, but not quoted); the
  exact refusal text when a sold-to has no sales-area data; key fields of A304/A305/A306.
- D365 F&SCM: a verbatim "warehouse belongs to one site"; the full list of hierarchy
  purposes; scope of customer price groups.
- BC: that the Customer table is per company (inferred from `DataPerCompany`); which setup
  field numbers sales orders.
- Commerce: whether a B2B company is global or per website as an entity (only the admin's
  Website field is documented); the "Default Config" label in App Management (source says
  "Global"); whether the business-config form can appear under Stores → Configuration.
- Any Adobe Commerce ERP connector's documented mapping field — every vendor page was
  marketing, gated or unreadable (i95Dev PDF 406, Corevist empty).
- The routing client: which ERPs, and how the PIM expresses ownership. Not vendor-documentable; a client question (S1).
