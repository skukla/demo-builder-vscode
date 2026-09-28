# Several ERPs: the remaining ERP work, consolidated

Written 2026-09-26 at the owner's request: "write the several ERPs plan and consolidate all the
remaining work". This is now the order of work for the ERP programme ([[AB-26]], [[AB-16]]). The
programme overview (`../erp-programme/overview.md`) stays the record of rules R1 to R10, the
evidence and what is built; this document says what is left and in what order.

**Status: ACTIVE.** Update the table in §7 with every commit set.

## 1. The owner's decisions this plan carries out

| When | Decision |
|---|---|
| 2026-09-24 | **One integration, several ERPs** (owner; restated 2026-09-27). The ERP integration serves one or more ERP targets; routing lives inside it and passes every order straight through when there is one target. The mock ERPs stay separate systems, each in its own workspace with its own screen and look (O8). Shaped as the customer would build it. |
| 2026-09-24 | **Ownership by product attribute** (S1): an attribute in Commerce names the owning ERP; the story says a PIM would write it. Inventory sources stay the alternative. |
| 2026-09-24 | **Only the routing consumer subscribes to Commerce's order event** (Q2). Owner: routing is "a consumer action that then routes to the specific ERP's runtime actions and events in the integration", and the customer would not use "a completely separate workspace/integration for the routing piece". |
| 2026-09-24 | **ERP order numbers in custom order attributes**, one per ERP (`erp_<name>_number`), symmetric; `ext_order_id` keeps the prefixed number of the ERP that took the order (Q-num, to validate live). |
| 2026-09-26 | **Freeze ERP feature growth after contracts.** Contracts ([[AB-26z]]) are the last new ERP feature before several ERPs. |
| 2026-09-26 | **Every ERP is a copy of the same baseline code**, so every ERP has the same feature set. There is one `demo-erp` codebase and one integration codebase; a second ERP is the same code deployed again with its own name, look and data. |
| 2026-09-26 | **Finish first what several ERPs multiply**, such as filling at reset. |
| 2026-09-26 | **Research how website scope works in the Admin page** (the Mapping tab's scope list shows no websites). |
| 2026-09-26 | **Cleanup is complete or it keeps what names the leftovers** (removal retries, then stops and keeps the record, folder and workspace). See §8 for a correction on workspace deletion. |
| 2026-09-26 | ~~**One integration PER ERP**~~ **WITHDRAWN 2026-09-27: never the owner's decision.** It was the loop's recommendation after the owner wrote "each ERP would have its own separate integration" and "each integrated system should have its own admin settings"; the owner's reply agreed to other points and never confirmed it. The owner restated on 2026-09-27: "The intention was always to have a routing action as part of the single multi ERP integration." How "its own admin settings" fits one integration is an open question (§8). Phase B below still describes the withdrawn model and is to be rewritten. Withdrawn text: Each ERP comes with its own integration, its own Admin settings and its own Commerce app; every pair runs the same baseline code. Adding the ERP tile again adds the second pair (what AB-23 and AB-15 already built). No target list, no router: each integration sends only the order lines its ERP owns. At most two ERPs in a demo. |
| 2026-09-26 | **Settings and mapping are separate** on the integration's Admin page, and the page is heavily simplified (design in §5b). |
| 2026-09-26 | Scope: settings are per website; the website list is read on every page open (no Refresh button); a sales organisation shows its name before its code; Wipe and the undo of Commerce writes move to Demo Builder; Demo Builder leaves the Mapping defaults unless a demo needs otherwise. |

## 2. Where it stands (2026-09-26)

- **One ERP pair works live on Bodea** as Northwind ERP: orders with the number written back,
  cart prices, product and stock events both ways, company changes, setup checklist, the
  Mapping tab. Proven today: an ERP rename reaches Commerce in about five seconds, and the
  Commerce stock event reaches the ERP (the stock handler was fixed today, [[AB-35]]).
- **Built but never proven live**, because no credential existed until today: the credit hold
  reaching Commerce ([[AB-26f]]), Commerce Admin changes flowing back to the ERP
  ([[AB-26g]]), per-source stock, product delete and the exposure rule ([[AB-26h]]), and the
  live half of the Commerce API inventory ([[AB-26b]]).
- **Several ERPs today:** a second pair can be added as a numbered COPY of the integration and
  its ERP, each in its own workspace ([[AB-23]]), and the copy gets its own Commerce app id
  ([[AB-15]]). Two collisions remain: every copy sends the WHOLE order to its own ERP, and
  every copy writes the one `ext_order_id`. The decided shape (one integration, a list of
  targets) replaces the copy approach for the ERP pair.

## 3. Phase A: finish the one-ERP baseline (before the freeze line)

Only work that is either unproven or that several ERPs would multiply. Each step is live-proven
on Northwind ERP before the next phase starts, because Phase B copies whatever the baseline is.

| # | Work | Item | Why now | Done when |
|---|---|---|---|---|
| A1 | **Live proofs** of what is built to the edge: credit hold to Commerce, Commerce Admin shipment, invoice, cancel and hold to the ERP, per-source stock, product delete | [[AB-26f]], [[AB-26g]], [[AB-26h]] | every ERP will run this code; a defect found after the split is found N times | each journey passes on Bodea and is written into `docs/sync-validation.md` |
| A2 | **API inventory, live half**: the read-only calls, captured as fixtures | [[AB-26b]] | the routing slice adds calls (custom order attributes) and needs the same discipline | every call the code makes has a captured fixture and a test |
| A3 | **Demo Builder fills the ERP at reset**, and the integration stops copying and polling (steps 1 to 5 of `../erp-demo-filling/overview.md`) | [[AB-26y]] | each ERP needs filling; one path for N ERPs, not N copies of the mirror | "Load demo data" and reset fill the ERP from Demo Builder; the integration has no mirror, refresh job or timer |
| A4 | **Contract prices in shared catalogs, with ERP contracts** (the last new ERP feature) | [[AB-26z]] | each ERP writes its companies' contract lines; the catalog write must be per ERP from the start | the storefront shows a company its contract price everywhere; the ERP shows the contract; the cart webhook for price is removed |
| A5 | **Sync validation baseline**: every entity, both directions, as tests in the pair-in-a-box harness and as a live journey | [[AB-26e]] | becomes the regression check every Phase B slice runs | every entity-matrix row has a test and a journey step |
| A6 | **Website scope in the Admin page**: why the Mapping tab lists no websites, and how per-website settings should work (research in `../../research/erp-admin-website-scope/`, then the fix) | [[AB-36]] | per-website settings (sales organisation, which ERP serves a website) are the basis of routing | the Mapping tab lists every website; a setting saved for one website is read back for that website |

Owner questions A3 carries (recommendation first, from the filling plan): Wipe moves to Demo
Builder; undoing the integration's Commerce writes becomes Demo Builder's, over the integration's
write log; whether the Mapping tab can be pre-filled from outside the app.

## 4. The freeze

After A4, no new ERP feature is started until Phase B lands. These wait, status `gated`:

- [[AB-26r]] credit memo and repeat order;
- [[AB-26s]] order to cash, the payment leg;
- [[AB-26v]] reconciling partial invoices;
- [[AB-26w]] business-user settings (its decisions are made; no new settings);
- the ideas in the programme overview §9a.

A fix to something built is not growth and is not frozen.

## 5. Phase B: one integration, several ERPs, a routing action (rewritten 2026-09-27)

Built from the LOCKED design v1 (`design.md`); the design is the source, this is the order of
work. Each slice is TDD, keeps every existing single-ERP journey green, runs in the
pair-in-a-box harness, and is proven live on Bodea before the next starts. The integration's
`main` stays what Bodea runs; slices land on the loop branch and reach `main` as a set.

| # | Slice | What changes | Done when |
|---|---|---|---|
| B0 | **The code layout** (no behaviour change) | A router folder that knows no ERP; `adapters/demo-erp/` implementing the written contract ("send this part", "report this part's outcome"); `adapters/example/` skeleton; the ERP list with ONE entry keyed by id. Today's order sender becomes the demo-erp adapter's "send this part" with the whole order as one part | every existing test and journey passes unchanged; the layout reads as design §2 describes |
| B1 | **The router** | The routing action becomes the only subscriber to the order event: reads each line's owning ERP (the product attribute), splits the order into parts, stores them, and sends each part through its adapter, keyed by order and part. One ERP in the list: pass-through | a mixed order in the harness becomes one part per owning ERP, each sent once |
| B2 | **Outcomes and the combined status** | Each part's outcome (sent, held, refused, failed) recorded by the router; the combined order status rule (design §3.3); ERP numbers in comments and the router's record; `ext_order_id` written only by the router | the harness shows the right status for every mix of part outcomes |
| B3 | **Several ERPs in one integration** | The ERP list holds several entries; the key map is keyed by ERP and company; each ERP's inbound events are matched to its own part; per-ERP settings on the Admin page with a switcher | two harness ERPs each receive and report only their part |
| B4 | **Shipments and invoices per part** | Each ERP ships and invoices only its own lines (`items[]`), invoice before shipment, one invoice at a time per order | a two-ERP order ends Complete with two shipments and two partial invoices |
| B5 | **Blocks and credit per brand** | An ERP's block holds only its part (the company-flag write is removed); each ERP's limit, exposure and available credit in its own company attributes; Commerce's limit the total | a held part leaves the other flowing; the company can still order |
| B6 | **Demo Builder adds a second ERP** | Adding an ERP to an existing integration: a new ERP system in its own workspace, a unique name, registered in the integration's ERP list; filling, reset and removal cover every ERP | two ERPs added, filled, reset and removed on Bodea, in either order |
| B7 | **Admin surfaces** | The order-grid column and order-view button showing each part and its ERP; Re-send for a failed part; product delete and variant checks by owner | staff can see and re-send every part |
| B8 | **Two ERPs live** | The mixed-order journeys on Bodea with two ERPs; the walk-through gains the two-ERP section ([[AB-26u]]) | the vignettes' "Today" lines can be updated to built |

Returns come after B8 (owner, 2026-09-27). Contract prices in shared catalogs ([[AB-26z]]) stay
Phase A's last feature; B3 makes them per ERP when they land.

## 5b. The integration's Admin page, simplified (owner, 2026-09-26)

Settings and mapping are separate. The owner judged one screen with tabs would not scale
(2026-09-26), so the page is a header (the ERP, whether it is reachable) and a side list of
sections, each with its own address: **Overview** (the mapping below), **Credit** (this ERP's
limit, exposure and available credit per company, with an edit that writes to the ERP),
**Activity** (what crossed and what failed, with Retry) and **Settings**. A clickable preview
with stand-in data is in commerce-erp-integration at `preview/next.html` (`npm run preview`).

- **Settings** is a short form in Commerce Admin's own style: the scope picker (Default Config
  and each website), then three groups (Orders, Prices, Products and organisation), each field a
  label, the value, one line of help, and Commerce's own "Use Default" checkbox for inheritance.
  One Save.
- **Overview (the mapping)** is read-only and fits on one screen: a header with the two systems, then one row
  per connection (Companies, Products, Prices, Stock, Orders, Shipments and invoices, Credit,
  Warehouses) showing Commerce's record, a direction arrow, the ERP's record, what joins them,
  and a status badge with a count. A row opens to its fields and a look-up. Unbuilt connections
  are not shown.

Built after Phase B's model is settled, as a preview first; replaces the card layout.

## 5a. Phase C: circle back on readability (owner, 2026-09-26)

After Phase B, a reassessment pass over what the SC and the audience look at, because by then
every screen shows several ERPs and the two phases will have added to them piece by piece.

| # | Work | Scope |
|---|---|---|
| C1 | **Reassess first**: walk every ERP screen and every integration screen along the demo path with two ERPs, and list what is hard to read, crowded or inconsistent, before changing anything | ERP: Home, Customers, Products, Pricing and contracts, Sales Orders, Shipments, Invoices, Settings, the journal. Integration: the Commerce Admin page (Mapping, Status and sync, history, order trace) and the Demo Builder integration card, flyout and checklist |
| C2 | **ERP screens more readable**: type scale, density, labels, empty states, the second ERP's look distinct at a glance | `demo-erp`; the headless screen checks (T-2) re-accept fingerprints on purpose |
| C3 | **Integration screens cleaned up**: the Mapping tab's layout and scrolling inside the Admin frame (found 2026-09-26: the frame could not be scrolled to the Order card in a short window), wording, which ERP each row belongs to | `commerce-erp-integration` Admin UI; the Demo Builder card and flyout (the webview visual baseline for those) |
| C4 | **Walk-through re-checked** against the cleaned screens | [[AB-26u]] |

Cosmetic changes found during Phases A and B are written into C1's list rather than done on the
way, unless they block the work.

## 6. What every slice is checked against

The programme overview §6a (tests, journeys, contracts, screens, mutation floor, scans) plus:
every ERP runs the same code, so a slice is never done for "ERP 2" alone; and every capability
that creates something ships its removal (the cleanup rule).

## 7. State (update with every commit set)

| Phase | Step | State |
|---|---|---|
| A | A1 live proofs | done 2026-09-27 on Bodea except a non-default source (waits on a second source, now a setup step); found and fixed the 64-bit document numbers (demo-erp 071ae6b, 6d2c504) and the skipped first sync (281f5275b) |
| A | A2 API inventory, live half | done 2026-09-27: 15 live answers captured and run through the real readers; full ERP contract shapes dropped for the journeys' checkout check; event payloads not capturable from Runtime |
| A | A3 filling by Demo Builder | steps 1a and 1e built; plan written; 3 owner questions |
| A | A4 shared catalogs and contracts | filed with measurements; Kukla Studios' catalog set up by hand as the model |
| A | A5 sync validation baseline | D7 and D8 built; journeys not yet written |
| A | A6 website scope | built and deployed ([[AB-36]], integration a2a13a8); the live tree holds every website; owner questions from the research still open |
| B | B0 to B8 (one integration, a routing action) | B0 done 2026-09-27 (integration `21306ab`: router, contract, demo-erp and example adapters, ERP list; no behaviour change, 455 tests); B1 done (integration `639c888`: the router splits by owning ERP, each ERP sent only its lines, parts stored per order, a redelivery sends only unfinished parts; 460 tests); B2 done (integration `a4c5373`: each part's outcome from the ERP's messages, the combined status (the router only holds and unholds; Commerce moves Processing and Complete), never an automatic cancel; 506 tests); B3a done (integration `950227d`, demo-erp `e1425f3`: stored ERP list with `erp/erps`, key map per ERP, companies sent to every ERP, events carry `erpId`, contract v4; 533 + 262 tests); B3b done (integration `99581c0`..`0ce05ff`: cart checks ask each owning ERP for its own lines, the Admin lookup per ERP, per-ERP settings on each ERP's entry with a switcher on the Admin page, seen in the preview; 558 tests); B4 done (integration `f18927f`: partial invoice and shipment per part, invoice before shipment, one invoice at a time per order via a State lock, Commerce-side shipments and invoices told to each ERP for its lines; 569 tests); B5 done (integration `f739c94`: several ERPs — a block holds only that ERP's parts, never the company flag; each ERP's credit in its own company attributes, Commerce limit the total; detach undoes both; 585 tests. One ERP keeps today's block behaviour, pending the owner) |
| C | C1 to C4, readability | after Phase B |

## 8. Decisions for the owner (recommendation first)

Answered 2026-09-26: workspace deletion (delete a component's own workspace, then prove the
namespace is gone; keep for retry only when shared or unprovable), the second ERP from the tile,
at most two ERPs, the filling questions (Wipe and the undo to Demo Builder, defaults left alone),
website scope (per website, read on every open, name before code).

Also answered 2026-09-26: Commerce's company credit limit is the total across the ERPs, and
each ERP's own figures live in prefixed company custom attributes, edited from each
integration's Credit section (B4).

Still open:

0. **Per-ERP settings inside the one integration** (2026-09-27). Recommendation: each ERP stays its own system (workspace, screen, look, data); the one integration holds the routing action and a settings section per ERP on its one Admin page, with a picker between ERPs.

1. **The integration page design in §5b**, now that a preview exists.

## 9. How this plan stays true

Each slice gets its own step file here when it starts, moves to `.rptc/complete/` when it ships,
and logs to its backlog item. The programme overview's §6 table points here for the order of work.
