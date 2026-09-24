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

## 6. The order of work

Six workstreams, one sequence. Each row is a slice with its own plan or step file, TDD, its
repo's tests green, the screen looked at in the preview, and the record updated. Live proof
against a deployed pair is the owner's, at the gates marked ◆.

| # | Slice | Workstream | Repos | Depends on | Decision needed | Exit criteria |
|---|---|---|---|---|---|---|
| **Done** | Order document (slice 1); Customer document; Shipments and Invoice as documents with partial shipment and Close remaining; derived statuses; cancel reason to Commerce; **credit hold** — records, moves and screen (held / release / reject, four blocking levels, demo step 11 walkable in the preview) | A + B | erp, integration | — | — | `demo-erp` `6009a62` `ffc7be2` `1c00e32` `c865750` + screen commit; integration `64a6844` `0fcec33` + contract sync |
| 1 | *(done — folded into the row above)* | | | | | |
| 2 | **Hold → Commerce hold/unhold**, detach unholds; new event `sales_order_hold`, handler, contract | C | erp, integration | 1 | ◆ owner runs the deploy | a held ERP order shows On Hold in Commerce; reset returns it |
| 3 | **Commerce-side order changes → ERP**: shipment, invoice, cancel, hold made in Commerce Admin; the `origin` marker so the ERP does not echo; the **"is this mine?" check against the pair's own ERP** (M2) | C | erp, integration | 1 | ◆ subscription change: uninstall + install | ship in Commerce Admin → ERP shows the shipment; no second Commerce shipment |
| 4 | **Per-source stock → ERP** (G2) and the small decisions: product delete (G1), credit balance (G3 — recommend the ERP's exposure is the demo's truth), currency (G5, via slice 6) | C | integration, erp | — | G3 | a non-default source edit in Commerce reaches the ERP |
| 5 | **Pricing conditions** (slice 2): validity dates, minimum quantity, value help, "why not" in the price test; Pricing rail label | A + B | erp | — | — | demo steps 4–5 walkable |
| 6 | **Business structure** (`../erp-business-structure/`, five steps): record-shape pin + contract v2; per-website sales org, per-pair prefix and ownership setting, mirror filter; legal identity; warehouse names; Organisation card; currency; demo setup guide | D | erp, integration | 3 (uses the M2 check), 4 | S3 answered yes; P1–P3 | no "1000" that is not a real sales org; a second pair can sit alongside |
| 7 | **Product master** (slice 6): Available = on hand − committed; open orders for a product; sales status; low-stock tint; `Card` reuse | A + B | erp | 6 (warehouse names) | — | demo step 2 |
| 8 | **Home and search** (slice 7): work list, rail count badges, event journal naming documents and refreshing live, global search, order timeline, sticky title line | B | erp | 1, 5 | — | demo steps 1 and 12 |
| 9 | **Commerce Admin differentiators** (AB-25): "why did this buyer get this price" on the order view; the three-way ERP-down choice; Origin / ERP ID grid columns | E | integration | 5 (needs `notApplied`) | which of the three first | UX validation candidates 4 and 6 built |
| 10 | **Live webhooks** AB-19 (availability) and AB-20 (credit at order placement), `required: true` | C / E | integration, erp | 1, 7 | already decided (decision 26) | an over-limit cart is stopped with the ERP's sentence |
| 11 | **Second pair installs** — AB-23 (workspace per pair, active) then AB-16 | F | extension | — | — | two pairs on one store, both working alone |
| 12 | **The routing integration** — its own catalog entry (`kind: integration`), added beside the pairs; owns the ownership map, the split, the dispatch through the seam, the merge, the failure; Admin UI SDK screens; each pair gains seam S2 (send this part) and S3 (per-part outcome); S1 stands a pair down | F | new repo, integration, extension | 6, 11 | the client's answers (S1); seam question (routing owns the order event); where the second number goes | the nine moments |
| 13 | **Credit memo** (slice 5) and Repeat order | A / C | erp, integration | 3 | **O5** | reversibility rule met for `invoiced` |

**Why this order.** 1 finishes what is half-built. 2–4 close the entity matrix's gaps
before the structure changes touch the same handlers. 5 is independent and carries two demo
steps. 6 needs 3's "is this mine?" check and is the precondition for two pairs (R5). 7–9
are screen work that can interleave. 11–12 are the multi-ERP half and wait on the client's
answers; nothing before them is wasted if those answers change, because every slice is
also the single-pair product. 13 waits on O5.

### The split order: how it is delivered (owner's question, 2026-09-24)

**Its own integration**, not a mode of the ERP integration. `multi-erp-order-routing` §3
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

## 7. Where the programme stands (update with every commit set)

| Workstream | Built | Next | Blocked on |
|---|---|---|---|
| A · ERP documents and behaviour | order, customer, shipment, invoice documents; derived statuses; cancel reason; credit hold (records, moves, screen) | pricing conditions (slice 5) after the sync gaps | — |
| B · Modern UI | shared Card, Field, DocumentPage, trail navigation, status badges, four themes | Home, journal naming, pricing value help (with 5 and 8) | — |
| C · Bidirectional sync | every ERP → Commerce write, reversible; cancel reason | hold → Commerce (2) — **next** — then Commerce-side changes → ERP (3); per-source stock (4) | owner's deploys ◆ |
| D · Business structure | plan written; nothing built | slice 6 | S3, P1–P3 (recommendations given) |
| E · Commerce Admin | history, retry, one-order trace, settings page | "why this price"; ERP-down choice | 5 |
| F · Multi-ERP | copy identity; AB-23 active | AB-16; routing integration | client answers; seam question |
| Docs / drift | contract tests both repos; plan status blocks; this overview | record-shape pin (slice 6 step 01); demo setup guide | — |

All of it is committed locally and unpushed: `demo-erp` `feature/erp-grids`,
`commerce-erp-integration` `feature/sync-history`, this worktree `feature/erp-integration`.
The `develop` push in `demo-builder-vscode` still needs the owner at the keyboard.

## 8. Decisions still open, consolidated

| # | Question | Source | Recommendation |
|---|---|---|---|
| O4 | Cancellation terminal plus Repeat order, or an un-cancel? | screen plan §10 | Terminal; Commerce cannot un-cancel either |
| O5 | Credit memo: new event + Commerce handler (slice 13)? | screen plan §10 | Yes, full credit only; it is the reversibility answer for `invoiced` |
| O6 | Mirror customer addresses? | screen plan §10 | **Answered by the structure plan**: legal name, tax id, reseller id, legal address, admin's website |
| O8 | Does a second ERP need to look different? | screen plan §10 | Display name and prefix only |
| S1 | Which ERPs does the routing client run; does the PIM carry an owning-system attribute? | structure research §9 | Ask the client before slice 12 |
| S3 | Mapping on the Commerce side, accepting the manual scope sync? | structure research §9 | Yes |
| P1–P3 | Walk-in partner in every sales org; company code fixed `1000`; seller block on the invoice | structure plan | `['*']`; fixed; yes |
| G3 | Whose exposure is the demo's truth? | entity matrix | The ERP's, stated on the card |
| Q2 | Does the routing integration become the only order-event subscriber? | multi-ERP research §11 | Yes; it is what keeps the pairs generic |
| Q-num | Where does the second ERP's number live? | multi-ERP research §11 | Prefix on `ext_order_id` for the selling ERP (M4); the parts in the routing app and comments |
| E-first | Which Admin differentiator first? | UX validation | "Why did this buyer get this price" |

## 9. Out of scope, deliberately

A PIM (the SKU's source stands in for it); partial invoicing (owner, O2); an OMS (the
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
