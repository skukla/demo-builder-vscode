# The ERP programme — one plan of action

Written 2026-09-24 at the owner's request: every piece of ERP research and planning done
since 2026-09-14, synthesised into a single order of work. This is the document to read
first; the others are its evidence and its detail, and it says which one to open for what.

**Status: ACTIVE.** The table in §7 is the state of the programme and is updated with every
commit set. Nothing in this overview repeats a specification that lives in a slice plan;
it says what, why, in what order, and what has to be true before each step starts.

---

## 1. What we are building, in one paragraph

A mock ERP (`demo-erp`) and a Commerce integration (`commerce-erp-integration`) that an SC
adds to a project as one pair, so that in front of an audience the ERP looks like the
system of record — prices, stock, credit and customers change there and Commerce follows;
an order placed in Commerce arrives there with an ERP number and is confirmed, shipped,
invoiced or held there, and Commerce follows — while underneath Commerce stays the master
the SC prepares in, and everything the ERP writes into Commerce can be undone. The ERP is
legible to people who use SAP, Dynamics 365 or another real ERP, and looks like software
built this decade. Several pairs can sit in one project as independent copies, and a
routing integration above them can split one Commerce order across ERPs — which is the
real client story that motivates the multi-ERP half.

## 2. The rules every slice is held to

These are settled. A slice that trades one away stops and asks.

| # | Rule | Where it is written and enforced |
|---|---|---|
| R1 | **Commerce is the system of record; the ERP is transient.** Every ERP → Commerce write Commerce can undo is read first, ledgered, and reverted on reset/removal; what Commerce cannot undo (notes, shipments, invoices, cancellations) is the documented exception; the ERP number is cleared. | integration README; `lib/ledger.js`, `lib/detach.js`, `lib/commerce-before.js`; `erp-integration` plan decisions 3, 8, 21 |
| R2 | **To the audience the ERP is the system of record.** A change in Commerce Admin must not leave the ERP wrong; a change in the ERP must reach Commerce. | `erp-bidirectional-review` (goal statement, entity matrix) |
| R3 | **One composite ERP, no vendor skin.** Products, Customers, Pricing conditions, Shipment, Related documents, CP01/CD01/MD01, ten-digit numbers. | `erp-screen-realism` §1.1 |
| R4 | **Real ERP behaviour, not demo convenience.** Over-limit orders are created and held, not refused; statuses derive from quantities; refusals speak in words. | `erp-screen-realism` §4.2, §6.1, §6.3 (owner, 2026-09-23) |
| R5 | **Every pair is self-contained.** No shared state; every Commerce-side handler asks its own ERP "is this mine?"; each pair mirrors only what it owns; the written-back number carries a per-pair prefix. | `erp-bidirectional-review` §Multi-ERP independence M1–M5 (owner, 2026-09-24) |
| R6 | **The mapping between the two structures lives on the Commerce side**, per website, on the integration's Admin screen; the ERP shows its structure read-only and rebuilds it on reset. | `erp-business-structure` research §7–8 and plan |
| R7 | **Nothing is soft-deprecated.** A field that becomes obsolete leaves in the same commit. | repo rule; `credit`'s `blocked` → `blocking` is the worked example |
| R8 | **The demo may require Commerce setup; it is documented, never designed around.** | owner, 2026-09-24; structure plan step 05 (`docs/demo-setup.md`) |
| R9 | **Cloud deploys and event-subscription changes are the owner's to run**, never unattended; a changed subscription needs uninstall + install. | repo rule; integration README |
| R10 | **The ERP holds the account of record, not the relationship.** Companies become business partners (sold-to, with credit, terms, legal identity); individuals, contacts and pipeline are a CRM's and are not mirrored. Every reference system keeps a customer master in the ERP: SAP's customer master with company-code and sales-area data, D365's customer per legal entity, BC's customer card. | `erp-integration` decision 5; `erp-business-structure` research §2–4 (owner asked 2026-09-24) |

## 3. The evidence, and what each document is for

| Document | Open it for |
|---|---|
| `../../research/erp-realism-audit/` (2026-09-23) | what a real ERP shows, area by area, against what ours had; ranked gaps Tier 1–3; the cheap bundle |
| `../erp-screen-realism/overview.md` | the screen-by-screen specification (§3), document flow (§4), data model changes (§5), credit (§6.1), refusal texts (§6.3), the twenty-minute demo path (§7), slices 0–7 (§8), open questions O4–O8 (§10) |
| `../../research/erp-ui-modern-audit/` (2026-09-24) | per-screen keep / change / add / drop to make captured ERP function read as modern software; nine ranked changes |
| `../../research/erp-bidirectional-review/` (2026-09-24) | the two principles; **the entity coverage matrix** (every Commerce entity, both directions, gaps G1–G5); **the multi-ERP independence rules M1–M5**; the revised build order |
| `../../research/erp-business-structure/` (2026-09-24) | SAP / D365 F&SCM / Business Central / Commerce structure from primary sources; the routing client's PIM-aggregation model; the recommended three-level model; owner questions S1–S6 |
| `../erp-business-structure/` (plan) | the data model as a pinned field table; the record-shape test; contract v2; the prefix and ownership settings; five steps |
| `../../research/multi-erp-order-routing/` (2026-09-23) | what native Commerce gives (sources, one `ext_order_id`, several shipments/invoices); the three layers and **the seam S1–S4**; ownership options; the OMS limit; the nine-moment demo; owner questions |
| `../../research/erp-two-way-ux/` and `../../research/erp-ux-validation/` (2026-09-22/23) | what the Commerce Admin, the ERP user and the buyer see in real integrations; which of our seven Admin-side candidates are standard, novel, and wanted |
| `../erp-integration/overview.md` | the founding decisions ledger (1–27); `../two-erps/` — AB-23, a workspace per pair |
| Backlog | AB-9 (epic: the ERP integration), AB-25 (epic: the two business users' experience), AB-16 (several ERPs), AB-19 / AB-20 (live availability and credit webhooks), AB-10 (Admin settings section), AB-13 (updates), AB-21 (settings on tile), AB-23 (workspace per pair) |

## 4. The target: what the demo shows when this is done

**One pair** (`erp-screen-realism` §7, twenty minutes): Home with work in it → a product
with base unit, sales status and stock per warehouse → a customer with credit limit,
exposure, available, its orders → a pricing condition with validity and minimum quantity,
and the price test saying why a record did not apply → the storefront pricing at list for
4 and at contract for 10 → an order placed → the order document, confirmed → a partial
shipment posted, Commerce showing it → the remainder shipped → one invoice → a second order
arriving on credit hold and refusing to confirm, released → the event journal naming every
document both ways.

**Two pairs plus routing** (`multi-erp-order-routing` §10, nine moments): the Commerce
catalog with an owning system per SKU → the routing integration added beside two ERP pairs
→ its rules screen with a dry-run → a mixed order → the Commerce order page showing part 1
in Acme, part 2 in Contoso → both ERP screens side by side, each holding only its lines →
one ERP down, one part waiting, re-sent → one order, two native shipments → reset to zero.

**The Commerce Admin** (`erp-ux-validation`): run history and per-record retry (standard,
built), one order traced across both systems (built; tier-2 capability rendered where the
operations person works), "why did this buyer get this price" (the differentiator, not
built), the ERP-down switches (partly built).

## 5. The data model, in one place

Specified in `../erp-business-structure/overview.md` § "The data model" (the pin) and
`../erp-screen-realism/overview.md` §5; summarised here so the whole shape is visible.

| Record | Stored | Derived on read | Removed |
|---|---|---|---|
| Sales order | `header` (created · confirmed · cancelled), lines with `item`, `shippedQty`, `closedQty`, `shipments[]`, `invoice`, `creditStatus` (approved · held · released · null), `creditReason`, `creditDecidedAt`, `salesOrg`*, `history` | `status` (the contract's five words), `shippingStatus`, `billingStatus`, `overall`, `can`, `credit`, `net`/`tax`/`total`, `openQty` | the single stored status word (upgraded on read) |
| Shipment | on the order: `number` (8000000001+), `warehouse`, `lines`, `status` open · posted, `postedAt` | names, units, the warehouse's ERP name* | — |
| Invoice | on the order: `number` (9000000001+), lines as placed, `net`/`tax`/`total`, `shipments[]`, `status` open · credited | seller block from the mapped website* | — |
| Business partner | `blocking` (open · shipping · invoicing · all), `creditLimit`, `paymentTerms`, `salesOrgs[]`*, legal identity*, `website`* | `credit { limit, exposure, available, held }`, its orders, its conditions | `blocked` (done), `salesOrg` singular*, `creditUsed` (done) |
| Pricing condition | `kind`, `partnerId`, `sku`, `price`/`percent`, `validFrom`/`validTo`†, `minQty`†, `salesOrg`* | status Active · Scheduled · Expired†, `notApplied[]` in a quote† | — |
| Product | mirrored: `name`, `type`, `unit`, `listPrice`, `warehouses[]`; ERP-owned: sales status‡ | `stock`, `available` = on hand − committed‡ | `description` (done) |
| Settings | `displayName`, `appearance`, stamps, `warehouses` names*, `structureMirror`* | `structure` (company code, sales orgs, warehouses, unmapped websites)* | `offline` (done) |
| Counters | `salesOrder`, `shipment`, `invoice`, (`creditMemo`§) | — | — |

\* structure plan · † pricing slice · ‡ product slice · § credit memo, gated on O5.
Contract: `contractVersion` 1 → 2 in the structure plan; every change is additive.

## 5a. The composite entities (owner, 2026-09-24)

A business concept such as "a buying organization" exists in neither system as one record.
Each system represents it with a composite of native records, and the concept only exists
when both composites are read together through one join. The entity matrix (bidirectional
review) lists the native records; this table lists the concepts. Slice 9's cards and slice
V's journeys are per concept. Confirmed by the owner 2026-09-24 as the right set; each row
is written out record by record, with field ownership, in the composite-entity research
(to be done — see §6, slice CE).

| Concept | Commerce composite | ERP composite | Join |
|---|---|---|---|
| **Buying organization** | company · company admin and users (customers) · customer group · shared catalog · company credit · company address book · payment/shipping allowances · (quotes, purchase orders) | business partner (sold-to) · credit limit · exposure (derived) · blocking level · payment terms · sales-organisation memberships · its pricing conditions · legal identity | company id |
| **Selling organization** | website · Store Information (address, VAT, currency) · stores and store views · the website's stock | company code · sales organisation · order-number prefix | the per-website setting |
| **Sellable item** | product · attributes · configurable parent and variants · source assignments · website assignments | product · base unit · type · variants · warehouses · sales status · conditions naming it | SKU |
| **Price** | list price · website-scoped price · shared-catalog custom price · cart-time ERP price (webhook) · discount ceiling (webhook) | list price · contract price · contract discount · maximum discount · validity, minimum quantity, sales-org scope | SKU + company + sales org |
| **Inventory position** | source items · stock per website · salable quantity | warehouses · committed to open orders · available | SKU + source code |
| **Credit** | company credit: limit, balance, currency, allow-to-exceed | limit · exposure · available · held orders · blocking | company id |
| **Order** — order to cash, the order and every document it becomes, ending when the money is in (owner, 2026-09-24: "if it's possible to do that as described, then we should") | order · items · comments · hold · shipments · invoices · credit memos · `ext_order_id` · payment transactions | sales order · lines (shipped / open / closed) · credit decision · shipments · invoice · credit memo · history · the open item and its clearing | `ext_order_id` with prefix |
| **Payment / receivable** | the invoice's payment (capture on invoice; for orders paid on account, the company's credit balance and its reimbursements) | open item per invoice · incoming payment · clearing · overdue by payment terms | invoice ↔ ERP invoice number; company id for the balance |
| **Fulfilment source** | inventory source | warehouse, its ERP name; which ERP, in the two-pair case | source code |

## 6. The order of work

Six workstreams, one sequence. Each row is a slice with its own plan or step file, TDD, its
repo's tests green, the screen looked at in the preview, and the record updated. Live proof
against a deployed pair is the owner's, at the gates marked ◆.

| # | Slice | Workstream | Repos | Depends on | Decision needed | Exit criteria |
|---|---|---|---|---|---|---|
| **Done** | Order document (slice 1); Customer document; Shipments and Invoice as documents with partial shipment and Close remaining; derived statuses; cancel reason to Commerce; **credit hold** — records, moves and screen (held / release / reject, four blocking levels, demo step 11 walkable in the preview) | A + B | erp, integration | — | — | `demo-erp` `6009a62` `ffc7be2` `1c00e32` `c865750` + screen commit; integration `64a6844` `0fcec33` + contract sync |
| 1 | *(done — folded into the row above)* | | | | | |
| **CE** | **Composite-entity research**: each concept in §5a written out record by record on both sides — record, field, type, owner (which system decides it), mirrored today or not, the join — from the Commerce REST and B2B references, our two repos, and SAP's record structure for the counterpart (customer master's three layers, material master views, sales document header and item, credit account). Output: `.rptc/research/erp-composite-entities/`. It is the input to V's journeys and 9's cards | research | worktree | — | — | every §5a row has its field table, and every field says who owns it |
| **API-1** | **Commerce API inventory and validation** (owner, 2026-09-24): one document listing every Commerce API the programme needs — REST (products, source items, stocks, store configs and websites, companies, company credits, customers, orders, ship, invoice, hold/unhold, cancel, comments, credit memo), Commerce events (product, stock, order, shipment, invoice saves), the two webhooks, Admin UI SDK extension points, App Management business config — one row per API with the slice that needs it. Each validated to EXIST on the backend the demo runs on (Adobe Commerce as a Cloud Service and PaaS are not guaranteed identical) by a read-only call against a live instance, with the real request and response captured as a fixture (ADR-016 contract tier: a fixture captured live is the contract; a shape typed from memory is not) and pinned by a test that the code sends and reads exactly that. On the ERP side, `erp-contract.json` grows from key lists to full request/response shapes at version 2, SAP's terms carried in descriptions (sold-to, sales organisation, delivering plant) without renaming fields that work — "closer to SAP, not too picky". Before slices 2–4, which add five new Commerce calls; the live calls are the owner's ◆ | C / docs | integration, erp | — | ◆ live read-only calls | every API a later slice uses has a captured contract before that slice starts |
| 2 | **Hold → Commerce hold/unhold**, detach unholds; new event `sales_order_hold`, handler, contract | C | erp, integration | 1 | ◆ owner runs the deploy | a held ERP order shows On Hold in Commerce; reset returns it |
| 3 | **Commerce-side order changes → ERP**: shipment, invoice, cancel, hold made in Commerce Admin; the `origin` marker so the ERP does not echo; the **"is this mine?" check against the pair's own ERP** (M2) | C | erp, integration | 1 | ◆ subscription change: uninstall + install | ship in Commerce Admin → ERP shows the shipment; no second Commerce shipment |
| 4 | **Per-source stock → ERP** (G2) and the small decisions: product delete (G1), credit balance (G3 — recommend the ERP's exposure is the demo's truth), currency (G5, via slice 6) | C | integration, erp | — | G3 | a non-default source edit in Commerce reaches the ERP |
| 5 | **Pricing conditions** (slice 2): validity dates, minimum quantity, value help, "why not" in the price test; Pricing rail label | A + B | erp | — | — | demo steps 4–5 walkable |
| 6 | **Business structure** (`../erp-business-structure/`, five steps): record-shape pin + contract v2; per-website sales org, per-pair prefix and ownership setting, mirror filter; legal identity; warehouse names; Organisation card; currency; demo setup guide | D | erp, integration | 3 (uses the M2 check), 4 | S3 answered yes; P1–P3 | no "1000" that is not a real sales org; a second pair can sit alongside |
| 7 | **Product master** (slice 6): Available = on hand − committed; open orders for a product; sales status; low-stock tint; `Card` reuse | A + B | erp | 6 (warehouse names) | — | demo step 2 |
| 8 | **Home and search** (slice 7): work list, rail count badges, event journal naming documents and refreshing live, global search, order timeline, sticky title line | B | erp | 1, 5 | — | demo steps 1 and 12 |
| 9 | **The entity map — the Commerce Admin page where the settings ARE the picture** (AB-10, AB-25; owner 2026-09-24). Not prose. One card per composite entity, two systems side by side, the pieces of the entity as rows, the join drawn as a connector between them, and the setting that makes the join sitting on the connector, editable there. Ownership per field shown as the arrow's direction; sync state (in step · N pending · failed, last synced) on each row; a link into the ERP's own document. Cards: **Buying organization** (B2B company + users + customer group + company credit ↔ business partner + blocking + terms + exposure + sales orgs; join: company id), **Selling organization** (website + Store Information ↔ company code + sales organisation; join: the per-website setting), **Product** (product + attributes + sources ↔ product + unit + warehouses + conditions + sales status; join: SKU, source ↔ warehouse), **Order** (order + shipments + invoices + hold ↔ sales order + shipments + invoice + credit decision; join: `ext_order_id` with prefix), **Fulfilment source** (source ↔ warehouse name, and which ERP in the two-pair case). The existing switches move onto the card they belong to (order switches on Order, pricing switches on Product); the ERP-down choice sits on Order. Needs a small read on the pair ("what do you hold for company / SKU / order X") so the ERP side of each card is live | E | integration, erp | 6 (the joins exist), 3 (sync state per direction) | none | a merchant can read every mapping off the screen and change any join without leaving Commerce Admin |
| 10 | **Live webhooks** AB-19 (availability) and AB-20 (credit at order placement), `required: true` | C / E | integration, erp | 1, 7 | already decided (decision 26) | an over-limit cart is stopped with the ERP's sentence |
| 11 | **Second pair installs** — AB-23 (workspace per pair, active) then AB-16 | F | extension | — | — | two pairs on one store, both working alone |
| 12 | **The routing consumer inside the one ERP integration** (AB-16; superseded 2026-09-24: ~~its own catalog entry (`kind: integration`), added beside the pairs~~); owns the ownership map, the split, the dispatch through the seam, the merge, the failure; Admin UI SDK screens; each pair gains seam S2 (send this part) and S3 (per-part outcome); S1 stands a pair down | F | new repo, integration, extension | 6, 11 | the client's answers (S1); seam question (routing owns the order event); where the second number goes | the nine moments |
| 13 | **Credit memo** (slice 5) and Repeat order | A / C | erp, integration | 3 | **O5** | reversibility rule met for `invoiced` |
| 14 | **Order to cash — the payment leg** (owner, 2026-09-24). Commerce → ERP: when Commerce captures an invoice's payment, the ERP records an incoming payment and clears the open item; the ERP gains a receivables view (open items per customer, payments, overdue by payment terms) on the customer document and Home. ERP → Commerce: for orders paid on account, a payment posted in the ERP reimburses the company's credit balance — a company-credit write, ledgered and reverted like the credit limit. Exact Commerce calls (payment transactions, company credit balance operations) are read live in API-1 before this is built; if a leg does not exist on the target backend, the slice says so and stops at the leg that does | A / C | erp, integration | API-1 (the calls), 13 (credit memo, so a credited invoice clears) | none beyond API-1's findings | an invoice goes from open to paid in the ERP when Commerce captures it; a reset returns the company balance |
| **T-1** | **Pair-in-a-box harness** (owner, 2026-09-24: testing and validation without the owner). The ERP's actions run in-process against the in-memory database; the integration's handlers call them directly instead of over HTTP; a fake Commerce in front records every write and answers from the fixtures API-1 captured. Every bidirectional journey then runs as a test in seconds — a price changed in the ERP becomes a recorded Commerce write; a shipment made in the fake Commerce becomes an ERP shipment; a reset reverts the ledger — both directions, no cloud. Joins pieces that exist (`test/helpers/memory-db.js`, the mirror's injected readers, the contract tests). Lives in the integration repo, requiring `demo-erp` as a dev dependency by path | tests | integration, erp | API-1 (fixtures) | — | slice V's journeys are tests the loop runs; a journey that fails names the entity and the direction |
| **T-2** | **Headless screen checks**: a script drives the ERP preview with a headless browser (never the owner's Chrome) and asserts per screen — rendered, expected documents and actions present, console clean, computed-style fingerprint equal to the last accepted one (the `webview-visual-baseline` idea on the ERP). Catches what unit tests cannot: the Spectrum table crash of 2026-09-24 fails this, not a unit test | tests | erp | — | — | every screen in the preview has a check; a fingerprint change must be accepted deliberately |
| **V** | **Sync validation — every entity, both directions, proved** (owner 2026-09-24: a comprehensive check that everything that can be bidirectional is). For each row of the entity matrix: a unit test in the repo that owns the direction, and a **live journey script** (`docs/sync-validation.md` in the integration) that an SC or the owner runs against a deployed pair — change it in Commerce, see it in the ERP; change it in the ERP, see it in Commerce; reset, see it undone — with the expected result written beside each step. Runs first as a baseline against what exists today (finding the gaps the matrix reads from code), then again after slices 2–4 and 6, and before every release. Products are the first row: create, rename, reprice, restock per source, delete, in both directions | C | integration, erp | — for the baseline; 2–4, 6 for the full pass | — | every matrix row has a test and a journey step, and the journey passes end to end |
| **UI-1** | **Shell and navigation redesign**: rail with count badges, global search in the shell bar, sticky document title line, Home rail label | B | erp | 8 (Home) | — | UI audit §Shell, §Home |
| **UI-2** | **Lists redesign**: filter chips (Open · In process · Completed · Cancelled) and Shipping/Billing badges on Sales Orders; Exposure/Available columns and a blocking badge on Customers; Sold-to on Shipments and Invoices; three-tint stock status on Products | B | erp | 1, 7 | — | UI audit §Sales Orders, §Customers, §Shipments/Invoices, §Products |
| **UI-3** | **Documents redesign**: order timeline card from `history`; product link from an order line; credit meter and open-items/history split on the customer; due date and seller block on the invoice; ERP warehouse names on the shipment; the product page on the shared `Card` | B | erp | 6 (names, seller block), 7 | — | UI audit §Order, §Shipment/Invoice, §Customer, §Product |
| **UI-4** | **Settings and journal redesign**: Organisation, Warehouses, Currency and Document numbering cards; event journal naming documents, plain kinds in the list, live refresh; Wipe confirmation that names what is lost | B | erp | 6 | — | UI audit §Settings, §Event Journal |

**Why this order.** CE and API-1 come first and are research: CE says what the concepts are
made of, API-1 says which Commerce calls exist and what they answer, and V's baseline then
proves what syncs today. Nothing is built on an unverified call or an unwritten composite.
1 finishes what is half-built. 2–4 close the entity matrix's gaps
before the structure changes touch the same handlers. 5 is independent and carries two demo
steps. 6 needs 3's "is this mine?" check and is the precondition for two pairs (R5). 7–9
are screen work that can interleave. 11–12 are the multi-ERP half and wait on the client's
answers; nothing before them is wasted if those answers change, because every slice is
also the single-pair product. 13 waits on O5.

### The split order: how it is delivered (owner's question, 2026-09-24)

**Decided later the same day, superseding the paragraph below: ONE integration, several ERPs
(AB-16).** The ERP integration serves one or more configured ERP targets; the routing
consumer lives inside it and passes every order through unchanged when there is one target.
The mock ERPs stay separate systems, each in its own workspace with its own screen and look.
This is the shape the customer would build (one App Management app, one codebase, a target
list rather than a fork); the separate-router shape below was Demo Builder's reuse instinct
applied where the customer has no such constraint. The single-ERP skeleton is nailed down
first; the target list grows out of it. Rules M1–M5 keep their discipline with the boundary
moved from pair to target. Superseded text kept for the record:

~~Its own integration~~, not a mode of the ERP integration. `multi-erp-order-routing` §3
fixes this: the ERP integration stays generic and knows nothing of a second ERP; the routing
integration is a third catalog entry added from the gallery beside two pairs, and it reaches
each pair only through the seam — never the ERP's API directly. The seam is four things:
S1 stand down (exists: `orders_send` per website), S2 send this part (missing), S3 report
the part's outcome (half there: per order, not per part), S4 who am I (exists: copy id).
The cleanest shape is that the routing integration becomes the only subscriber to the
order event and stands the pairs down; that is seam question 2 for the owner. Ownership per
SKU is the inventory source (owner, 2026-09-23), with the attribute mode as the fallback for
a store without sources (R8: documented setup). The second ERP's number has no native home
in Commerce (one `ext_order_id`); the prefix (M4) makes each number self-identifying, and
the routing app's own screen and order comments carry the parts. Backlog: AB-16, blocked on
AB-23.

## 6a. How every slice is verified without the owner (owner, 2026-09-24)

Every slice item carries a **verification block, written before its code**, and the loop's
done gate checks the block:

1. **Tests it adds** — unit tests in the repo that owns the logic (`node --test` · vitest),
   argument-asserting where a collaborator is mocked.
2. **Journeys it must pass** in the pair-in-a-box harness (T-1), named from slice V's list
   — both directions for every entity the slice touches.
3. **Contracts** — the event/route pins in both repos, and the Commerce fixtures from API-1
   replayed: a handler test runs against the captured response, and a mismatch, not a
   live call, is what says a contract moved.
4. **Screens** — the headless checks (T-2) over every screen the slice changed, fingerprints
   re-accepted on purpose.
5. **Mutation floor** — `mutation-test-pilot` on the ERP `lib/` modules the slice touched;
   the ERP's logic is small, synchronous and unmocked, the case where the score is real.
6. **Scans** — the loop's mechanical trio, and the judgment scans the shape triggers.

**What still needs a person, verified 2026-09-24 rather than assumed** (the CLI is signed
in to the Adobe project; the repos hold no local credentials):

| Step | Who | Why |
|---|---|---|
| API-1's live read-only calls | **the loop** | reads are inside the rails; the workspace config supplies the credential; an expired session defers, never prompts |
| Deploying the pair for slices 2, 3, 6, 14 | **the loop, once the owner widens the rail** | decision 17 lets the agent create and delete its own scratch workspace; "no cloud writes" is the unattended rail and needs the owner's explicit "deploy the pair to a scratch workspace" |
| Commerce Admin rendering of the business-config form | **a person** | a browser sign-in to Commerce Admin; forbidden unattended. Fallback: the library validates the schema at build, and the risk is accepted in the slice's report |
| V's live baseline on the demo instance | **the loop, with the owner's authorization** | it places and ships orders — writes to real demo data |
| Pushing `loop/` branches to the two public repos | **the owner's yes** | a remote write not previously authorized for those repos |

## 7. Where the programme stands (update with every commit set)

| Workstream | Built | Next | Blocked on |
|---|---|---|---|
| A · ERP documents and behaviour | order, customer, shipment, invoice documents; derived statuses; cancel reason; credit hold (records, moves, screen); **pricing conditions** with validity, minimum quantity, value help and why-not (AB-26i, 2026-09-24); **product master** — committed, available, sales status that refuses shipment, Basic data and Open orders cards (AB-26k, 2026-09-24) | lists redesign (AB-26o), documents redesign (AB-26p) | — |
| B · Modern UI | shared Card, Field, DocumentPage, trail navigation, status badges, four themes; **Home as a work list, rail counts, shell-bar search, journal sentences** (AB-26l); the sticky title line (AB-26n); **Settings' Document numbering card and the ERP's own currency** (AB-26q); **the lists** — shipping and billing on orders, sold-to on shipments and invoices, the plant's ERP name, exposure and available on customers (AB-26o); **the documents** — timeline, due date, credit meter, open items, a product from an order line (AB-26p, 2026-09-24) | — (UI-1..4 done) | — |
| C · Bidirectional sync | every ERP → Commerce write, reversible; cancel reason | hold → Commerce (2) — **next** — then Commerce-side changes → ERP (3); per-source stock (4) | owner's deploys ◆ |
| D · Business structure | **shipped** (AB-26j, 2026-09-24): Structure settings per website and per pair, the order's sales organisation, prefix on `ext_order_id`, ownership filter, legal identity, warehouse names, the Organisation card, the SC setup guide (`commerce-erp-integration/docs/demo-setup.md`); plan in `.rptc/complete/erp-business-structure/` | product master (AB-26k), entity map (AB-26m) | ◆ live look at App Management's text fields; ACCS `store/*` fixture |
| E · Commerce Admin | history, retry, one-order trace; **the entity map** — the Mapping tab replaces Settings: one card per composite entity, both systems side by side, ownership arrows, the join's setting on the card, sync per direction, ERP figures; **the look-up** of one company id or SKU as both systems hold it, on the Buying organization and Sellable item cards (AB-26m, 2026-09-24) | the walk-through (AB-26u) reads it | ◆ a person looks at the live Admin page |
| F · Multi-ERP | copy identity; AB-23 active | AB-16; routing integration | client answers; seam question |
| CE · Composite entities | the concept list (§5a), owner-confirmed; **the research, record by record on three sides** (`.rptc/research/erp-composite-entities/`, AB-26a, 2026-09-24) | slice 9 reads it | — |
| API-1 · Commerce API inventory | the calls the code makes today; **the inventory document** (`commerce-erp-integration/docs/commerce-api-inventory.md`, AB-26b) | live validation with captured fixtures | ◆ a credential: the owner adds the ERP integration to a project, then the loop reads |
| T-1 / T-2 · Test harnesses | memory-db, injected readers, contract tests, the preview; **headless screen checks with fingerprints** (T-2, AB-26d: 13 checks, retry-once, mismatch rows kept) | pair-in-a-box after API-1's fixtures | API-1's fixtures |
| V · Sync validation | the entity matrix, read from code | journeys as T-1 tests; the live baseline once the owner authorizes writes on the demo instance | authorization |
| B · Screen redesign (UI-1..4) | the house style: cards, badges, trail, themes | scheduled behind the slices whose data they show | — |
| Docs / drift | contract tests both repos; record-shape pin; plan status blocks; this overview; **the demo setup guide** (AB-26j step 05); **the walk-through** (AB-26u, `commerce-erp-integration/docs/walkthrough.md`) | keep both true when a live run corrects them; the two-pair section once the routing integration exists | ◆ a live re-check before a first showing |

Everything the loop built on 2026-09-24 is on the `loop/2026-09-24-erp-programme` branch of
all three repos, pushed (owner authorization 1). The `develop` push in `demo-builder-vscode`
still needs the owner at the keyboard; the loop branches await the merge decision in the
loop report (`.rptc/handoff/2026-09-24-loop-report.md`).

## 8. Decisions still open, consolidated

| # | Question | Source | Recommendation |
|---|---|---|---|
| O4 | Cancellation terminal plus Repeat order, or an un-cancel? | screen plan §10 | **Decided 2026-09-24 (owner): terminal**, with Repeat order |
| O5 | Credit memo: new event + Commerce handler (slice 13)? | screen plan §10 | **Decided 2026-09-24 (owner): yes**, full credit only. Also: document the reconciliation of PARTIAL invoices against one Commerce order as a customization opportunity, alongside order routing (backlog AB-26v) |
| O6 | Mirror customer addresses? | screen plan §10 | **Answered by the structure plan**: legal name, tax id, reseller id, legal address, admin's website |
| O8 | Does a second ERP need to look different? | screen plan §10 | **Decided 2026-09-24 (owner): yes, it looks different** — its own display name and its own Appearance (theme, palette, mark; the Settings → Appearance card built for this), and its own order-number prefix in Commerce |
| S1 | Which ERPs does the routing client run; does the PIM carry an owning-system attribute? | structure research §9 | **Decided 2026-09-24 (owner): the story does not depend on the answer.** The ERPs may never be known; the demo does not model a PIM. A product ATTRIBUTE in Commerce names the owning ERP (`structure_owns = attribute`, e.g. `erp_owner`), and the story says a PIM would write that attribute into Commerce (and read it back) in a real deployment. Attribute is now the primary ownership mode for the two-ERP story; inventory sources stay as the alternative |
| S3 | Mapping on the Commerce side, accepting the manual scope sync? | structure research §9 | Yes |
| P1–P3 | Walk-in partner in every sales org; company code fixed `1000`; seller block on the invoice | structure plan | `['*']`; fixed; yes |
| G3 | Whose exposure is the demo's truth? | entity matrix | The ERP's, stated on the card |
| Q2 | Does the routing integration become the only order-event subscriber? | multi-ERP research §11 | **Decided 2026-09-24 (owner): only the routing consumer subscribes — and it lives INSIDE the one ERP integration (AB-16, decided later the same day).** Recorded as a PATTERN to relay to the customer: a single consumer action receives Commerce's order event, decides which ERP owns each line, and dispatches each part to that pair's own runtime actions and events; the pairs stop listening to Commerce for new orders and stay generic. It is the integration starter kit's consumer-and-handler shape lifted one level, from one app's actions to one app dispatching to sibling apps |
| Q-num | Where does the second ERP's number live? | multi-ERP research §11 | Prefix on `ext_order_id` for the selling ERP (M4) stays. **Owner 2026-09-24: look into Commerce's custom order attributes** — Adobe Commerce as a Cloud Service shows and edits custom order attributes (code + value) on the Admin order view, created via GraphQL or the Admin, editable only while the order is Pending (Experience League: order-processing; ACCS release notes). **Direction (owner, 2026-09-24): use them for BOTH ERPs**, symmetric — every pair writes its number into its own custom order attribute (`erp_<name>_number`), so no pair is the special one; `ext_order_id` keeps the prefixed number of the pair that took the order, so the standard field still reads in a single-ERP demo. To validate live (API inventory row): the write path over REST or GraphQL, and the Pending-only edit rule against when each pair writes |
| E-first | Which Admin differentiator first? | UX validation | "Why did this buyer get this price" |

## 8a. The deliverable at the end: the walk-through (owner, 2026-09-24)

When it is built, the owner needs a walk-through: what to look at in the ERP and how it
relates, then what to look at in Commerce and how it relates. Filed as **AB-26u**: an
SC-facing `docs/walkthrough.md` in the integration — the ERP screen by screen along the demo
path, Commerce screen by screen from the other side, and one relation table per composite
entity (the printable twin of the entity map). Written from the preview so it is
reproducible; re-checked live on the owner's word.

## 9a. Ideas kept, not scheduled

Owner, 2026-09-24: open to more Commerce Admin ideas, but the mapping settings are the
bare minimum and "why did this buyer get this price" is not strong enough to lead.

- "Why did this buyer get this price" on the order view, from the ERP's `notApplied[]`
  (UX validation candidate 4 — novel at tiers 2 and 3, no demand evidence).
- A dry-run box on the routing app's page: paste an order, see where each line would go,
  nothing sent (multi-ERP research §10 moment 3).
- Per-record resync from the Admin page (candidate 2 — standard, strongest demand; the
  Retry that exists is per order, not per entity).
- Read-only ERP pricing rules in the Admin (candidate 5 — weakest; would only follow
  candidate 4).

## 9. Out of scope, deliberately

A PIM (the SKU's source stands in for it); partial invoicing (owner, O2); dunning and
ageing reports beyond "overdue by terms"; an OMS (the
multi-ERP research §5 names where the customer would need one, and the demo says the
sentence); distribution channel and division as settings; live price on the product page
(decision 26); individual shoppers as ERP customers (decision 5); cost, valuation, ATP,
output management (realism audit Tier 3).

## 10. How this plan stays true

- Each slice has its own plan or step file and moves to `.rptc/complete/` when its code is
  released, with what was NOT verified written down.
- §7 is edited in the same commit set as the code it describes; the `rptc-hygiene-scan`
  catches a plan that claims completion while sitting in `plans/`.
- Record shapes are pinned by a test (structure plan step 01), event payloads and routes by
  the contract tests in both repos, and the preview's stand-in data mirrors every shape.
- Client facts live in the repo (`multi-erp-order-routing` "who this is for", structure
  plan step 05), not only in a session's memory.
