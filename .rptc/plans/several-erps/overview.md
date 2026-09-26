# Several ERPs: the remaining ERP work, consolidated

Written 2026-09-26 at the owner's request: "write the several ERPs plan and consolidate all the
remaining work". This is now the order of work for the ERP programme ([[AB-26]], [[AB-16]]). The
programme overview (`../erp-programme/overview.md`) stays the record of rules R1 to R10, the
evidence and what is built; this document says what is left and in what order.

**Status: ACTIVE.** Update the table in §7 with every commit set.

## 1. The owner's decisions this plan carries out

| When | Decision |
|---|---|
| 2026-09-24 | **One integration, several ERPs.** The ERP integration serves one or more ERP targets; routing lives inside it and passes every order straight through when there is one target. The mock ERPs stay separate systems, each in its own workspace with its own screen and look (O8). Shaped as the customer would build it. |
| 2026-09-24 | **Ownership by product attribute** (S1): an attribute in Commerce names the owning ERP; the story says a PIM would write it. Inventory sources stay the alternative. |
| 2026-09-24 | **Only the routing consumer subscribes to Commerce's order event** (Q2). |
| 2026-09-24 | **ERP order numbers in custom order attributes**, one per ERP (`erp_<name>_number`), symmetric; `ext_order_id` keeps the prefixed number of the ERP that took the order (Q-num, to validate live). |
| 2026-09-26 | **Freeze ERP feature growth after contracts.** Contracts ([[AB-26z]]) are the last new ERP feature before several ERPs. |
| 2026-09-26 | **Every ERP is a copy of the same baseline code**, so every ERP has the same feature set. There is one `demo-erp` codebase and one integration codebase; a second ERP is the same code deployed again with its own name, look and data. |
| 2026-09-26 | **Finish first what several ERPs multiply**, such as filling at reset. |
| 2026-09-26 | **Research how website scope works in the Admin page** (the Mapping tab's scope list shows no websites). |
| 2026-09-26 | **Cleanup is complete or it keeps what names the leftovers** (removal retries, then stops and keeps the record, folder and workspace). See §8 for a correction on workspace deletion. |

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

## 5. Phase B: one integration, several ERPs

Each slice is TDD in the repo that owns it, runs the A5 journeys, and is proven live with two
ERPs on Bodea (Northwind ERP and a second one with its own name and look). The second ERP is the
same `demo-erp` code deployed again.

| # | Slice | What changes | Done when |
|---|---|---|---|
| B1 | **The target model and its migration** | The integration holds a list of ERP targets (address, name, order-number prefix, ownership value) in a config it owns, not N env vars. Extension side: one integration bound to several systems (`boundTo` becomes 1:N; `pairedInstanceId`, `findMissingProvider`, `linkBroughtSystem` read a list). A project on the baseline becomes target 1 with nothing asked of the SC (the stored-shapes table in [[AB-16]]). | a baseline project upgrades to one target and behaves identically; the pin tests say so |
| B2 | **Add another ERP** | An action on the integration's card deploys another `demo-erp` in its own workspace and adds it as a target; the same as an agent tool. The numbered-copy path for the ERP pair (a second INTEGRATION, `DEMO_BUILDER_COPY_NUMBER` app ids) is deleted in the same change, not left beside it (R7). Removing a target is the reverse and follows the cleanup rule. | an SC adds and removes a second ERP from the card; the integration stays one App Management app |
| B3 | **Per-target settings and website scope** | Which settings are per target (pricing, structure, prefix, ownership) and which stay integration-wide (order switches), per the stored-shapes table. Uses A6's answer for scope. The business-config schema is static, so targets are fixed slots; the slot count is an owner decision (§8). | the Mapping tab shows each ERP's settings, per website where they vary |
| B4 | **Routing** | One consumer of the order event splits each order by owning ERP (product attribute), dispatches each part to its target, records each part's outcome, writes each ERP's number to its own custom order attribute. One target: every order passes through unchanged. Seams S1 to S4 from `../../research/multi-erp-order-routing/` carry over. | a mixed order becomes two ERP orders, each holding only its lines; one ERP down leaves one part waiting and re-sent |
| B5 | **Inbound per target** | Each ERP's events carry its target; an ERP's product, stock and price changes touch only what it owns; company and credit rules per target (§8, question 4); the write log records which target wrote; reset, undo and removal per target. | a change in one ERP never touches the other's products; reset returns both to zero |
| B6 | **Filling and pricing per target** | A3's filling fills each target with what it owns; A4's contract lines from each target go into the company's one shared catalog, by owned SKU. | a company buying from both ERPs sees both contracts' prices |
| B7 | **Surfaces** | The integration card lists its ERPs; the Admin pages (history, order trace, Mapping) show which ERP; the setup checklist per target where it differs; agent tools take a target; AGENTS.md and the walk-through ([[AB-26u]]) gain the two-ERP section. | the nine moments of the routing research §10 are walkable |
| B8 | **Harness and live proof** | The pair-in-a-box harness runs two in-process ERPs behind one integration; the routing verification block from [[AB-26t]] becomes B4's and B8's. | the journeys pass in the harness and live |

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
| A | A1 live proofs | not started (credential now exists) |
| A | A2 API inventory, live half | not started |
| A | A3 filling by Demo Builder | steps 1a and 1e built; plan written; 3 owner questions |
| A | A4 shared catalogs and contracts | filed with measurements; Kukla Studios' catalog set up by hand as the model |
| A | A5 sync validation baseline | D7 and D8 built; journeys not yet written |
| A | A6 website scope | cause found: the picker reads only the top of the scope tree; three more defects behind it; fix not started ([[AB-36]], `../../research/erp-admin-website-scope/research.md`) |
| B | B1 to B8 | not started |
| C | C1 to C4, readability | after Phase B |

## 8. Decisions for the owner (recommendation first)

1. **Workspace deletion on an unclean removal** (correction, 2026-09-26). The AB-23 record
   says deleting a workspace removes its Runtime namespace (measured 2026-09-20, an HTTP 200;
   the namespace was not listed afterwards). If that holds, deleting a component's OWN workspace
   is itself the complete cleanup. Recommended: when the workspace is the component's own and
   nothing else uses it, delete it and then prove the namespace is gone; keep-for-retry only when
   the workspace is shared or still in use. Today's build keeps it in every case.
2. **How an SC adds the second ERP**: from the integration's card (recommended: it is a target of
   that integration, not a new tile), or from the gallery tile.
3. **How many targets** the static settings schema carries: three (recommended; a demo rarely
   shows more than two, and each slot is a set of settings on the Mapping tab).
4. **Companies across ERPs**: every ERP holds every company as its own customer (recommended,
   as SAP extends a customer to each sales area it buys through), and Commerce's one company
   credit belongs to the ERP the company is assigned to on the Mapping tab.
5. The three A3 questions in §3.

## 9. How this plan stays true

Each slice gets its own step file here when it starts, moves to `.rptc/complete/` when it ships,
and logs to its backlog item. The programme overview's §6 table points here for the order of work.
