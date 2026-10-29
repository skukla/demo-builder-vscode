# Business structure — the ERP's selling structure lined up with Commerce's store structure

Plan written 2026-09-24 from `.rptc/research/erp-business-structure/research.md` (§8, the
recommended model) after the owner asked whether the data model was understood and pinned.
Repos: `demo-erp` (`feature/erp-grids`) and `commerce-erp-integration`
(`feature/sync-history`), siblings of this worktree. Status: **SHIPPED 2026-09-24** on the `loop/2026-09-24-erp-programme` branches of
`demo-erp` (86be509, 7e8b1cf, 126cf5f, df2075c) and `commerce-erp-integration`
(50b1927, 2807a46, 5625033, 7537745, 965e7fe); backlog AB-26j. **Not verified:** App
Management's rendering of the `text` fields on its own form (needs a deployed app and a
Commerce Admin); the `GET store/websites` / `store/storeConfigs` field names on Adobe
Commerce as a Cloud Service (read from the PaaS reference, no live fixture captured: no
credential for the pair on this machine). **Changed from the plan:** Store Information
(address, VAT) is not readable over REST, so the `structure` block and the Organisation
card carry the store configuration's currency and locale and leave address and VAT null;
P3 is answered as far as the API allows (sales organisation and country on the invoice,
VAT blank). P1 and P2 taken as recommended.

## What this builds, in one paragraph

The mock ERP gets the three seller levels every real ERP has — a company code (the ERP
itself), sales organisations (one per Commerce website), warehouses (one per Commerce
inventory source) — and a customer belongs to the sales organisations of the websites it
buys through. The mapping "website → sales organisation" is a per-website merchant setting
on the integration's Commerce Admin screen; the ERP shows its structure read-only and
rebuilds it from Commerce on every reset. The fake `salesOrg: '1000'` on every customer
disappears, along with the Commerce vocabulary ("Default Source") on shipments.

## Two rules that govern the plan

1. **Commerce is the system of record; the ERP is transient.** Every mapping lives in
   Commerce's business config or is derived from Commerce's own data at mirror time. Nothing
   the ERP holds about structure survives a wipe except warehouse NAMES, which are
   presentation, re-defaulted from Commerce when a code is new.
2. **Nothing is soft-deprecated.** `salesOrg` (singular) leaves the partner record in the
   same commit `salesOrgs` arrives; `upgradeOrder`-style read-time upgrades cover stored
   records, and every reader moves.

## The data model (the pin — build to this table, and step 01 tests it)

### `businessPartners` (demo-erp)

| Field | Type | Default | Source | Change |
|---|---|---|---|---|
| `salesOrgs` | `string[]` | `[]` for an imported company with no known website; `['*']` for the walk-in partner | import row `salesOrgs` (integration: the company admin's website → its sales org; widened by each order's sales org on arrival) | **new**; replaces `salesOrg` |
| `salesOrg` | — | — | — | **removed** (read-time upgrade: `[salesOrg]` when present and non-default, else `[]`) |
| `legalName` | `string \| null` | `null` | Commerce company `legal_name` | new |
| `vatTaxId` | `string \| null` | `null` | company `vat_tax_id` | new |
| `resellerId` | `string \| null` | `null` | company `reseller_id` | new |
| `legalAddress` | `{ street: string[], city, region, postcode, countryId, telephone } \| null` | `null` | company `street`, `city`, `region`, `postcode`, `country_id`, `telephone` | new (resolves open question O6) |
| `website` | `{ id: number, code: string } \| null` | `null` | the company admin customer's `website_id` (`GET customers/{super_user_id}`), code from `GET store/websites` | new |

Unchanged: `id`, `name`, `commerceCompanyId`, `customerGroupId`, `emailDomain`,
`paymentTerms`, `creditLimit`, `blocked`, `isDefault`, `updatedAt`.

### `salesOrders` (demo-erp)

| Field | Type | Default | Source | Change |
|---|---|---|---|---|
| `salesOrg` | `string` | `'1000'` when the request carries none (legacy callers) | order request `salesOrg` (integration: the order's `store_id` → website → `structure_sales_org`) | **new** on the order; the header prints it, not the customer's |
| `salesOrgName` | `string \| null` | `null` | request `salesOrgName` | new |

Stored records written before this carry no `salesOrg`; `upgradeOrder` fills `'1000'`.

### `pricingConditions` (demo-erp)

| Field | Type | Default | Change |
|---|---|---|---|
| `salesOrg` | `string \| null` | `null` = every sales organisation | new, optional scope; `matches()` in `lib/pricing.js` requires equality when set; specificity +4 when set (above partner+sku) |

### `settings` (demo-erp, singleton `erp`)

| Field | Type | Default | Change |
|---|---|---|---|
| `warehouses` | `Record<code, { name: string }>` | `{}` | new; ERP names for Commerce source codes; a code seen in an import with no entry gets `name = Commerce source name`; survives wipe (settings are not wiped) |
| `structure` | — | — | **not stored**; derived on read by `describeStructure(cols)` (below) |

### Derived: `describeStructure(cols)` (demo-erp, `lib/structure.js`, new)

```
{
  companyCode: { code: '1000', name: settings.displayName,
                 currency, countryId, vatNumber, address }   // from the mirrored storeInfo of the website mapped to '1000', else nulls
  salesOrgs: [ { code, name, websiteCode, customers: n, orders: n } ]  // union over partners' salesOrgs and orders' salesOrg, sorted by code
  warehouses: [ { code, name, commerceName, products: n } ]           // union over products' warehouses × settings.warehouses
  unmapped: [ websiteCode ]                                            // websites the mirror saw with no sales org setting
}
```

The mirror carries the website list and each website's Store Information into a new
import key so the ERP can derive this without knowing Commerce: see the import shape.

### Import request (`POST admin/import`, contract `import`)

| Key | Shape | Change |
|---|---|---|
| `partners[].salesOrgs` | `string[]` | new |
| `partners[].legalName`, `.vatTaxId`, `.resellerId`, `.legalAddress`, `.website` | as above | new |
| `structure` | `{ websites: [{ code, name, salesOrg: string \| null, salesOrgName, storeInfo: { currency, countryId, vatNumber, address } }] }` | new, optional; sent by the full mirror only; stored as `settings.structureMirror` (wiped? no — settings survive; it is REPLACED on every full mirror, which is the reset path) |

### Order request (`POST orders`, contract `order.request`)

| Key | Change |
|---|---|
| `salesOrg`, `salesOrgName` | new, optional |

### Contract

`contractVersion: 1 → 2`. Additions only (above). Events unchanged. Both repos' copies move
in the same pair of commits; the integration's `contract:check` reports the gap until then.

### Integration `businessConfig` (commerce-erp-integration)

| Name | Scope | Type | Default | Label |
|---|---|---|---|---|
| `structure_sales_org` | per website | `text` (4 chars, validated `^[A-Z0-9]{4}$` on save) | `1000` | "ERP sales organisation for this website" |
| `structure_sales_org_name` | per website | `text` | `""` (the ERP prints the website's name when empty) | "Sales organisation name" |
| `structure_order_prefix` | Default Config (per pair) | `text` (1–6 chars, `^[A-Z0-9]{1,6}$`) | derived from the ERP display name at first read (first four letters, upper-cased; `ACME`) | "Prefix on ERP order numbers in Commerce" — multi-ERP rule M4: `ext_order_id` = `ACME-0000001042`; added on write-back, stripped on the way in, the ERP never sees it |
| `structure_owns` | Default Config (per pair) | `list`: `all` · `sources` · `attribute` | `all` | "Which products belong to this ERP" — rule M3; `all` keeps today's behaviour for a single pair |
| `structure_owns_sources` | Default Config | `text` (comma-separated source codes) | `""` | "Inventory sources this ERP ships from" (used when `structure_owns = sources`) |
| `structure_owns_attribute` | Default Config | `text` (`code=value`, e.g. `erp_owner=ACME`) | `""` | "Product attribute that names this ERP" (used when `structure_owns = attribute`; the mode for a store without sources) |

The mirror, the product events and the stock events filter by `structure_owns`; the order
handler still takes every new order (which ERP sells a mixed order is the routing layer's
call, out of scope here) but, under `sources`/`attribute`, an order with NO owned line is
skipped with a journal entry saying why.

`settings-view.js` gains `{ prefix: 'structure', title: 'Structure' }` and both fields join
it by name. Read for an order through the existing `settingsFor(order.store_id)` — the scope
tree inherits website-scoped values to the store view, which is already how `orders_send`
is read. Field type `text` must be confirmed against the library's supported types in step
02 (the researched page lists `list` and `dynamicList`; plain text is assumed, verified at
build).

## Where this sits (owner's gate, 2026-09-24)

Before the order split, every native Commerce entity must have its ERP counterpart and a
sync in both directions where one belongs. The entity coverage matrix in
`../../research/erp-bidirectional-review/research.md` is that check; this plan closes its
"planned" rows (website → sales organisation, Store Information, the company's legal
identity, currency). The matrix's open gaps that this plan does NOT close — Commerce-side
shipment/invoice/cancel/hold flowing back to the ERP, and per-source stock changes — sit
before it in the build order there. Build this plan fifth, after those.

## Steps

| # | Step | Repo(s) | Lands |
|---|---|---|---|
| 01 | Pin the record shapes and bump the contract: `test/records-shape.test.js` (exact keys of a stored partner, order, shipment, invoice, condition, settings vs a checked-in fixture), `contractVersion 2` with the additions, vendored copy synced | demo-erp, integration | the drift guard, before any field moves |
| 02 | Integration: the Structure settings (sales org per website; prefix and ownership per pair); the order carries `salesOrg`/`salesOrgName` and its written-back number carries the prefix; the mirror and the product/stock events filter by ownership; the mirror carries the company's legal fields, admin website and `salesOrgs`, and the `structure` block (websites + Store Information) | integration | every value the ERP needs arrives; a second pair can sit alongside |
| 03 | ERP: the data model above (`partners`, `orders`, `conditions`, `settings.warehouses`, `structure.js`), the read-time upgrades, `salesOrg` removed; pricing honours the scope | demo-erp | the records |
| 04 | ERP screen: Settings → Organisation card + Warehouses (names editable); order header, customer document and shipment print real structure; Pricing Rules gain the optional scope; preview `fakeApi` mirrors the shapes | demo-erp | what the audience sees |
| 05 | Record: the routing client's facts into `../research/multi-erp-order-routing/` ("who this is for"); README collection/route tables; **the SC-facing demo setup guide** (what the Commerce instance must have per story — sources per ERP or an `erp_owner` attribute, websites, companies — with the check and the undo for each); plan → `complete/` with what was NOT verified | worktree, demo-erp, integration | no drift in the docs; a demo can require setup as long as it is written down |

Each step is its own commit set, TDD (RED file first), tests green in the repo it touches
(`node --test test/` · `npx vitest run` + `npx biome check`), screen built under budget.
Cloud deploys are not part of any step; the live proof is the owner's, on the owner's word.

## Verification

- **Records pin**: step 01's test fails on any added or removed key in a stored record —
  including the ones this plan adds — until the fixture is updated in the same commit. That
  is the drift guard the owner asked for on 2026-09-24.
- **Contract**: `test/contract.test.js` (demo-erp) and `test/contract/erp-contract.test.js`
  (integration) both green; `npm run contract:check` in the integration reports no gap once
  both copies are at version 2.
- **Behaviour**: an order from website `eu` (setting `2000`) arrives with `salesOrg: '2000'`
  and the header prints "2000 · Online EU"; a company whose admin is on `eu` imports with
  `salesOrgs: ['2000']`; a contract price scoped `2000` does not apply to a `1000` order;
  a warehouse renamed in Settings prints its ERP name on the shipment; a wipe + mirror
  rebuilds the Organisation card identically (structure is derived, names survive).
- **Screens** looked at in the preview: Settings (Organisation, Warehouses), Order, Customer,
  Shipment, Pricing Rules.
- **Not verified by this plan**: the App Management form's rendering of a `text` field (needs
  a deployed app and a Commerce Admin); the `GET store/*` response field names (read from
  the live instance in step 02, ADR-016 contract tier, fixture captured).

## Rollback

Additive contract; every new field has a default; `upgradeOrder` and the partner read-time
upgrade cover stored records. Reverting a step is `git revert` in the repo it touched plus
re-vendoring the contract. The two settings, if reverted, leave values in App Management
storage that nothing reads — harmless, and cleared by uninstall.

## Out of scope, and why

- **The routing integration** (which ERP owns a line): waits on the client (research §9 S1).
  This plan puts the SKU's inventory source and the per-website sales org in place so it has
  both axes to read.
- **Credit hold**: its own slice (`erp-screen-realism` slice 3), next after this.
- **Distribution channel and division as settings**: fixed texture ("10 · Online", "00")
  until a demo needs them.
- **A PIM**: the demo does not model one; the SKU's source stands in for "the PIM assigned
  this line to that ERP".

## Open questions (owner)

| # | Question | Recommendation |
|---|---|---|
| P1 | Walk-in partner: member of every sales organisation (`['*']`) or of none? | `['*']` — it exists so any website's order has a sold-to. |
| P2 | Should the company code be `1000` fixed, or the ERP's copy number (`1000`, `2000` for a second ERP)? | Fixed `1000`; two ERPs are two company codes in two systems, and each says `1000`. Commerce tells them apart by the order-number prefix (M4, owner 2026-09-24). |
| P3 | Show the seller's VAT and address on the invoice document from the mapped website's Store Information? | Yes, in the invoice header — that is what a real invoice carries and it costs a lookup. |
