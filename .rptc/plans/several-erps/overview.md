# Several ERPs: the remaining ERP work, consolidated

Written 2026-09-26 at the owner's request: "write the several ERPs plan and consolidate all the
remaining work". This is now the order of work for the ERP programme ([[AB-26]], [[AB-16]]). The
programme overview (`../erp-programme/overview.md`) stays the record of rules R1 to R10, the
evidence and what is built; this document says what is left and in what order.

**Status: ACTIVE.** Update the table in §7 with every commit set.

## 1. The owner's decisions this plan carries out

| When | Decision |
|---|---|
| 2026-09-24 | ~~**One integration, several ERPs.**~~ *Superseded 2026-09-26 by one integration per ERP (below).* The ERP integration serves one or more ERP targets; routing lives inside it and passes every order straight through when there is one target. The mock ERPs stay separate systems, each in its own workspace with its own screen and look (O8). Shaped as the customer would build it. |
| 2026-09-24 | **Ownership by product attribute** (S1): an attribute in Commerce names the owning ERP; the story says a PIM would write it. Inventory sources stay the alternative. |
| 2026-09-24 | ~~**Only the routing consumer subscribes to Commerce's order event** (Q2).~~ *Superseded 2026-09-26: no router; each integration takes only its own lines.* |
| 2026-09-24 | **ERP order numbers in custom order attributes**, one per ERP (`erp_<name>_number`), symmetric; `ext_order_id` keeps the prefixed number of the ERP that took the order (Q-num, to validate live). |
| 2026-09-26 | **Freeze ERP feature growth after contracts.** Contracts ([[AB-26z]]) are the last new ERP feature before several ERPs. |
| 2026-09-26 | **Every ERP is a copy of the same baseline code**, so every ERP has the same feature set. There is one `demo-erp` codebase and one integration codebase; a second ERP is the same code deployed again with its own name, look and data. |
| 2026-09-26 | **Finish first what several ERPs multiply**, such as filling at reset. |
| 2026-09-26 | **Research how website scope works in the Admin page** (the Mapping tab's scope list shows no websites). |
| 2026-09-26 | **Cleanup is complete or it keeps what names the leftovers** (removal retries, then stops and keeps the record, folder and workspace). See §8 for a correction on workspace deletion. |
| 2026-09-26 | **One integration PER ERP, superseding the 2026-09-24 "one integration, several ERPs".** Each ERP comes with its own integration, its own Admin settings and its own Commerce app; every pair runs the same baseline code. Adding the ERP tile again adds the second pair (what AB-23 and AB-15 already built). No target list, no router: each integration sends only the order lines its ERP owns. At most two ERPs in a demo. |
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

## 5. Phase B: one integration per ERP (rewritten 2026-09-26)

The first shape of this phase (one integration holding a list of ERPs, with a router) was
dropped the same day in favour of what the owner asked for: each ERP with its own integration.
The second pair is added from the ERP tile, as today. Each slice is TDD, runs the A5 journeys,
and is proven live with Northwind ERP and a second ERP on Bodea.

| # | Slice | What changes | Done when |
|---|---|---|---|
| B1 | **Each integration sends only its own lines** | An order is sent to an ERP with only the lines for products that ERP owns (the ownership setting that exists: product attribute, sources or all); an order with none of its products is not its business. Status, shipments and invoices coming back touch only those lines. | a mixed order becomes one ERP order in each ERP, each holding only its lines |
| B2 | **Each ERP's number in its own order field** | Every integration writes its ERP's order number to its own custom order attribute on the Commerce order (Q-num, validated live first); `ext_order_id` is no longer written by two apps. | a mixed order shows both ERP numbers on the Commerce order page |
| B3 | **Prices from each ERP's contracts** | A4's shared-catalog writes, made by each integration for the SKUs its ERP owns, into the company's one catalog. The cart price webhook is already gone by then, which removes the webhook collision between two pairs. | a company buying from both ERPs sees both contracts' prices |
| B4 | **Companies and credit across two ERPs** | Every company is filled into each ERP as that ERP's own customer. Each ERP keeps its own limit and holds its own part of an order. Each integration writes its ERP's limit, exposure and available credit into its own prefixed company custom attributes (`POST V1/company/setCustomAttributes`; whether a set replaces the whole set is checked live first). Commerce's company credit limit is the TOTAL across the ERPs, recomputed from those attributes by whichever integration last changed one. Each integration's Admin page has a Credit section that edits its ERP's limit, writing through to the ERP (research: `.rptc/research/erp-company-credit-options/`). | a held part in one ERP leaves the other part flowing; Commerce's limit equals the sum of both ERPs' limits |
| B5 | **The second pair, live** | Add a second ERP from the tile on Bodea; both install; both Admin pages work; removal of either follows the cleanup rule and leaves the other untouched. | two pairs installed and removed cleanly, in either order |
| B6 | **Surfaces** | Each card, Admin page, history and order trace names its ERP; the walk-through ([[AB-26u]]) gains the two-ERP section. | the two-ERP demo path is walkable |
| B7 | **Harness** | The pair-in-a-box harness runs two pairs against one fake Commerce. | the mixed-order journeys pass in the harness and live |

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
| A | A2 API inventory, live half | every call proven live by A1; the responses are not yet captured as fixtures under `test/fixtures/commerce/` |
| A | A3 filling by Demo Builder | steps 1a and 1e built; plan written; 3 owner questions |
| A | A4 shared catalogs and contracts | filed with measurements; Kukla Studios' catalog set up by hand as the model |
| A | A5 sync validation baseline | D7 and D8 built; journeys not yet written |
| A | A6 website scope | built and deployed ([[AB-36]], integration a2a13a8); the live tree holds every website; owner questions from the research still open |
| B | B1 to B7 (one integration per ERP) | not started |
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

1. **The integration page design in §5b**, now that a preview exists.

## 9. How this plan stays true

Each slice gets its own step file here when it starts, moves to `.rptc/complete/` when it ships,
and logs to its backlog item. The programme overview's §6 table points here for the order of work.
