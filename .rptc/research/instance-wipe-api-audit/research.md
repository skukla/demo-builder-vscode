# Instance wipe — ACCS API removability audit + design

**Date:** 2026-08-23 · **Mode:** hybrid (live probes + two-provenance docs research)
**Feeds:** [`../../backlog/2026-08-22-instance-wipe-option.md`](../../backlog/2026-08-22-instance-wipe-option.md)
**Method:** the per-entity table is a diff of the COMPLETE published ACCS REST spec
(489 operations, 51 DELETEs, extracted from the rendered Redocly portal 2026-08-23)
against the PaaS spec (614 ops, 60 DELETEs) — so "no delete" below means *absent
from the whole published ACCS surface*, not "no page found". Everything is the
documented surface; no live delete was fired at a tenant.

> **Redaction note.** Several operational facts below come from internal Adobe
> channels (paraphrased — do not quote, link, or name people). They are marked
> *(internal)*. This repo is public.

## The four verdicts that shape the design

1. **App Builder cannot exceed the public API on ACCS — sourced, dead end.**
   ACCS forbids in-process code; customizations "integrate with Commerce through
   events and APIs" ([ACCS migration overview](https://experienceleague.adobe.com/en/docs/commerce/cloud-service/migration/overview)),
   and Adobe staff state the database is closed to direct modification (Experience
   League community, ACCS CRUD thread). No extensibility mechanism — webhooks,
   events, Admin UI SDK, API Mesh, starter kit — is documented with any data-plane
   access beyond public REST/GraphQL. **A "custom delete-orders API via App
   Builder" is not buildable.**
2. **The website-deletion workaround does not reach sales data.** In the Commerce
   schema, `sales_order`/`sales_invoice`/`sales_shipment` FK on `store_id` is
   `onDelete="SET NULL"` — orders SURVIVE store deletion with a nulled store
   reference (magento/magento2 2.4-develop `Sales/etc/db_schema.xml`; ACCS is
   closed-source, so this is inference from the shared lineage). Customers also
   survive (`SET NULL`); only product↔website assignment rows cascade. And the
   store-structure API is GET-only on ACCS anyway (4 read endpoints, zero writes)
   — whether the ACCS Admin even offers a delete button is undocumented.
3. **Orders (and sales documents generally) are the hard floor.** Zero DELETE
   operations under orders/invoices/credit memos/transactions in the ACCS spec
   (and in PaaS — the folklore is correct). Ceiling: `POST /V1/orders/{id}/cancel`
   (pre-capture only; the row stays), invoice void, hold/unhold. Order ARCHIVE
   hides rows without deleting ("Archived orders are not deleted") and has no API;
   its ACCS availability is unverified.
4. **The real clean-slate path is the INSTANCE, not the data** *(internal)*.
   Public docs say "You cannot copy or delete an existing instance" — that is the
   self-service view. Operationally, ACCS instances ARE deleted on request
   (support/ops ticket; in the Adobe Demo System org the request goes to the
   product team), and **the instance's credits are returned after deletion**.
   Creating a replacement instance is self-service and takes ~2 minutes, with
   optional sample data. This is the documented internal remedy for exactly our
   scenario (an instance in an unwanted data state). A CCM UI banner warning that
   deletion needs a ticket was proposed internally, corroborating both the
   restriction and the path.

## Per-entity removability matrix (ACCS)

Legend: **DI** = already covered by the Data Installer service's pack-scoped
delete (21 types, live-probed 2026-08-23). **REST** = direct ACCS REST delete
exists. Floor = cannot be removed by any client-side means.

### Removable

| Entity | Via | Endpoint / mechanism |
|---|---|---|
| Products | DI + REST | `DELETE /V1/products/{sku}` |
| Categories | DI + REST | `DELETE /V1/categories/{id}` |
| Product attributes / options | DI + REST | `DELETE /V1/products/attributes/{code}` |
| Attribute sets / groups | DI + REST | `DELETE /V1/products/attribute-sets/{id}` |
| Customers | DI + REST | `DELETE /V1/customers/{id}` (addresses via `DELETE /V1/addresses/{id}`) |
| Customer groups | DI + REST | `DELETE /V1/customerGroups/{id}` |
| B2B companies (+roles/teams/links) | DI + REST | `DELETE /V1/company/{id}` |
| B2B shared catalogs (+assignments) | DI + REST | `DELETE /V1/sharedCatalog/{id}` |
| Stocks (MSI) | DI + REST | `DELETE /V1/inventory/stocks/{id}` |
| Source items / stock-source links | DI + REST | `POST /V1/inventory/source-items-delete`, `.../stock-source-links-delete` |
| Cart price rules | DI + REST | `DELETE /V1/salesRules/{id}` |
| Coupons | DI + REST | `DELETE /V1/coupons/{id}` + bulk `deleteByIds`/`deleteByCodes` |
| Gift card accounts | DI + REST | `DELETE /V1/gift-card-accounts/{id}` — **ACCS-only** (PaaS has no such delete) |
| Returns / RMA | REST only | `DELETE /V1/returns/{id}` — the one deletable sales-adjacent entity |
| Tax rules / rates / classes | REST only | `DELETE /V1/taxRules/{id}`, `/V1/taxRates/{id}`, `/V1/taxClasses/{id}` |
| Tier / special prices / cost | REST only | bulk `POST /V1/products/tier-prices-delete`, `special-price-delete`, `cost-delete` |
| Gift wrappings | REST only | `DELETE /V1/gift-wrappings/{id}` |
| Negotiable quote templates | REST only | `DELETE /V1/negotiableQuoteTemplate/{id}` |
| Product media / options / links | REST only | per-entity DELETEs (`.../media/{entryId}`, custom options, bundle/configurable/downloadable) |
| Cart CONTENTS | REST only | `DELETE /V1/carts/{cartId}/items/{itemId}` — empties, never deletes the cart |

### The floor — not removable client-side, say so in the confirm

| Entity | Ceiling | Note |
|---|---|---|
| **Orders** | cancel (pre-capture) / hold | No delete on ACCS or PaaS. Cancel keeps the row. |
| Invoices / credit memos / transactions | void (invoice) | All rows persist. |
| Shipments | tracking-number delete only | Entity persists. |
| Carts/quotes (the entities) | empty them | No `DELETE /V1/carts/{id}` exists. Abandoned carts: no API expiry. |
| Negotiable quotes / purchase orders (B2B) | decline / cancel | GraphQL deletes exist only for requisition lists + wishlists and need the OWNING CUSTOMER's token — impractical; customer deletion is the practical route (cascade inferred, unverified). |
| **MSI sources** | **disable via PUT** | Cannot be deleted BY DESIGN (orders/shipments reference them; Adobe KB). **Flags a question for our own service: its delete mode lists `sources` — what does it actually do there?** |
| Websites / stores / store views | none via API (GET-only) | **ACCS Admin DOES offer deletion** — Delete Website / Delete Store / Delete Store View buttons observed first-hand in a live ACCS instance admin (2026-08-23). Manual-only; deleting them wouldn't remove orders anyway (verdict 2). |
| CMS pages/blocks | n/a on ACCS | The whole CMS API is absent (EDS-headless model — content lives in DA.live, which our reset already handles). |
| Catalog price rules, URL rewrites, reviews, newsletter subscribers, customer segments, search terms/synonyms, currency rates, company credit history | none | No API on either platform (segments: ACCS adds a GET-only search). |

### Open items carried from the audit

- ~~Whether ACCS Admin exposes store-structure deletion~~ **CLOSED 2026-08-23:
  it does** — Delete Website / Delete Store / Delete Store View buttons observed
  first-hand in a live ACCS admin (Adobe's admin docs still show only add/edit;
  REST remains definitive-no, so it is manual-only). Order ARCHIVE availability
  on ACCS remains unverified.
- Cascade behaviors on ACCS (customer→wishlists/addresses, company→credit) are
  standard-Magento inference; ACCS is closed-source.
- The published spec vs live tenant behavior — no live probe was run; the spec
  diff is internally consistent (all `mine`/guest ops removed exactly as the
  overview states), which corroborates but does not prove completeness.
- What the Data Installer's `sources` delete type does, given sources cannot be
  deleted (question for the retired service owner — reachable for questions).

## Design — one operation, three phases (scope confirmed with the user 2026-08-23)

The SC scenario that set the scope: a demo placed orders and created customer
accounts on the storefront; the SC wants the instance as reusable as possible
(SCs cannot delete instances themselves). Result promised: **the storefront
becomes fully reusable** (clean base for the next import; no stale customer can
log in); **the admin does not become day-one** (sales history and store
structure persist — stated, never hidden).

### Phase 1 — Pack removal

Enumerate every pack that ever touched the instance and remove them all.
Verified feasible 2026-08-23 by live probe: the service's activity endpoint
filters by `commerceInstance` and returns pack identity `(name, version)` per
record across ALL packs and callers (54 records on the real test instance) —
so the wipe is NOT limited to the current project's pack. Activity rows carry
empty `dataTypes`, so each discovered pack pairs with its metadata
(`get-datapack-metadata`) to get the full declared type list; delete requests
then reuse the EXISTING removal spine (`startDelete`, `operation_mode:
'delete'`) per pack with all its types. No new service capability needed —
important, since the service is frozen.

### Phase 2 — Residue sweep (REST)

Pack removal only takes what packs OWN. Demo residue — customer accounts
created live on the storefront, hand-made products/categories, leftover cart
contents — survives it, and is exactly what makes reuse feel dirty. The sweep
enumerates and deletes remaining removable records via direct ACCS REST:
customers (`GET /V1/customers/search` + `DELETE /V1/customers/{id}`),
companies, shared catalogs, cart-rule/coupon/gift-card leftovers, and empties
surviving carts. Further classes from the matrix (tax rules, tier/special
prices, RMAs, gift wrappings) join only when real demos show residue there.

### Phase 3 — Order hygiene

Orders cannot be removed; cancel every cancellable one
(`POST /V1/orders/{id}/cancel`) so the grid reads as closed history, then
REPORT the floor: "N orders remain in admin history (M canceled, K
uncancellable); storefront is clean for the next import."

Confirm copy (before anything runs) names the instance, the discovered packs,
and the floor: orders/invoices and store structure remain; duration honestly
surfaced (a six-type removal measured 470s; N packs multiply).

### The escalation path (document, don't build)

When a truly clean slate is needed — or sales data must go — the remedy is
instance replacement: request deletion of the instance (support/ops ticket;
credits are returned) and self-provision a fresh one (~2 minutes, optional
sample data). The wipe UI's floor message should point at this ("For a fully
clean instance, delete and re-create it — ask #<the ACCS support channel>"),
phrased for SEs who have that access. Not automatable by the extension.

### Surface

- **Data Installer surface**: a "Wipe instance data…" action beside import —
  it is an instance-scoped operation, so it lives where instance data is
  managed, NOT in reset (reset means "put the storefront back"; the wipe is a
  different promise and must not share a button).
- **MCP tool**: `wipe_instance_datapacks` (action descriptor, confirm-gated,
  names the instance and the discovered packs in the gate — the
  reset_eds_project precedent). `reset_datapack` remains the per-pack
  primitive; the wipe is discovery + a loop over it.
- Both doors converge on one headless service function (spine rule).

### Manual website deletion — what it gains and does not (analyzed 2026-08-23)

An SC manually deleting accumulated websites/stores/store views (and recreating
for the next brand) is a STRUCTURE-hygiene step, not a history remedy:

- **Gains:** a clean admin scope tree on a multi-brand-reused instance; fresh
  per-store order increment sequences for the next demo; possibly incidental
  customer cleanup (schema says customers survive with nulled references;
  whether application code deletes them on top is unresolved — moot for us,
  the wipe's sweep deletes customers anyway).
- **Does not gain:** order removal — orders survive with nulled store
  references, and the grid's "Purchase Point" is TEXT copied onto the order at
  purchase time, so deleted websites' store names keep displaying on old
  orders. Also leaves documented orphan debris (url_rewrites,
  sales_sequence_meta — magento/magento2#9088).
- **Availability: CONFIRMED.** The ACCS admin shows Delete Website / Delete
  Store / Delete Store View buttons — observed first-hand in a live instance
  (2026-08-23). Adobe's admin docs still document only add/edit, so the
  first-hand observation is the source of record here. Manual-only either way
  (the API is read-only), so the wipe cannot automate it.
- **Remaining risks:** recreated store views re-enter the Catalog Service /
  Live Search per-scope indexing limbo (the live "No index was found for this
  request" failure, 2026-08-18-prewarm-enumeration-needs-an-indexed-scope);
  the generated storefront config is wired to the codes, so recreating under
  different codes needs project reconfiguration.

Wipe guidance should mention this as an optional manual step for brand
switches, with the indexing warning attached. Not automatable (no API).

### The hygiene layer — assisting the MANUAL steps (scope added 2026-08-23)

The confirmed admin delete buttons reframed the feature: beyond the automated
wipe, the extension should assist the manual actions an SC must take between
demos. The pattern is the Code Sync precedent — instruct with exact values,
deep-link to the page, VERIFY the result through read-only APIs; "done" is a
measured statement, never trust.

**Pre-demo readiness check** (one status surface, all read-only):
1. Store scope structure — compare `GET /V1/store/websites|storeGroups|storeViews`
   against the project config's `ACCS_WEBSITE_CODE`/store/view codes. Mismatch →
   instruction card with the EXACT codes to create, admin deep link, Re-check
   button. Kills the transcribe-codes-from-memory failure mode.
2. Catalog index readiness — reuse the prewarm enumeration probe per scope
   ("No index was found" is the live filed failure); render as a monitored
   status instead of a mid-demo empty-products surprise.
3. Sample data present — from the service's instance activity history (proven).

**Post-demo checklist:** the automated wipe (three phases) · assisted
store-structure teardown (list current structure from the API, flag
accumulation, deep-link to the confirmed admin delete buttons, verify by
re-read) · recreate-for-next-brand via the same instruction cards, flowing
into the pre-demo index monitor · the floor + instance-replacement escalation,
stated.

MCP counterpart: a read-only `check_instance_hygiene` so an agent can walk the
SC through the same list. Every check reuses an existing spine; the only new
API surface is the three trivial store-structure GETs.

### Communication + verification design (2026-08-23)

**One status model, one headless spine, three surfaces.** A single
`instanceHygieneService` computes an ordered `InstanceHygieneStatus`: items of
`{ id, title, state, why, instruction?, verifiedAt }` with states

| State | Meaning | Rendered as |
|---|---|---|
| `checking` | probe in flight | spinner chip (never claim emptiness before looking) |
| `verified` | re-READ confirmed it | green chip + measured timestamp |
| `action-needed` | measured missing/wrong | amber chip + instruction card |
| `waiting-external` | correct on our side; Adobe-side provisioning pending (catalog index) | blue chip + poll, honest "this is Adobe's timeline" |
| `locked` | blocked by an earlier item | the areaSubSteps `locked` + `lockReason` vocabulary |
| `floor` | permanent, not actionable | gray informational row — NO checkbox (cannot be done, must not look undone) |

Every `verified` comes from a re-read of the API, never from trusting the
write or the human (the repo's standing verification rule). The instruction
card carries the EXACT values (copyable), an Open Admin deep link, and —
after the link is clicked — a background poll (the `waitForConfigAccess`
precedent) so the card flips green BY ITSELF when the SC completes the action
in the browser; a Re-check button remains as the manual fallback.

**Surface 1 — the wizard (first demo).** Business Structure's done-condition
is already "a store view was chosen" from live enumeration
(commerceSections.ts:296) — so the wizard already verifies structure
implicitly by only offering what exists. The addition: when the enumeration
lacks what the demo package expects, render the instruction card INLINE in the
step (exact codes, Open Admin, auto-poll refreshing the chooser). No new
gating: the existing done-condition simply becomes satisfiable without leaving
the wizard.

**Surface 2 — the dashboard (between demos).** The readiness probes join the
existing on-open checks pipeline. Per the status placement rule, the result is
a remedy-tile dot: the Datapacks tile wears amber (via `DashboardTile.status`,
dot + tooltip as one value) when the instance is not demo-ready, tooltip
naming why ("store scope missing for this project's codes" / "catalog index
not provisioned" / "previous demo's data present"). Clicking opens Surface 3.

**Surface 3 — the Instance Hygiene panel** (Data Installer surface). The
ordered checklist: the wipe as the headline automated action (structured
progress per the three-row contract, then re-probe to `verified`), then the
assisted manual items in dependency order (teardown → recreate → index wait),
each with the card mechanics above, then the floor rows with the
instance-replacement escalation. At the top, one measured verdict: "Demo
ready" turns green only when every non-floor item is `verified`, stamped with
when it was measured.

**MCP.** `check_instance_hygiene` (read descriptor) returns the same model the
panel renders — the agent and the UI cannot disagree because both read the one
service. `wipe_instance_datapacks` stays the confirm-gated action tool.

### Constraints carried forward

- No undo; the confirm lists the discovered packs by name and the floor.
- Never promise "clean instance" from the client side.
- The service is frozen (owner retired, questions-only): the design uses only
  capabilities proven live today.
