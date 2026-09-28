---
id: AB-26y
kind: feature
area: app-builder
parent: AB-26
needs: []
value: high
status: active
---

# The mock ERP knows nothing about Commerce: filling at reset, running as if the ERP were the source

Filed 2026-09-25 from the audit `.rptc/research/erp-standard-features-audit/research.md` and the
owner's decisions in the same conversation.

## The rule

The mock ERP gets only what a real ERP (SAP S/4HANA, Business Central) has out of the box. Every
convenience lives in the integration or in Commerce's own records (owner, 2026-09-25).

## The decided model (owner, 2026-09-25)

The ERP is a temporary demo system filled from Commerce. That stays, but it is split in two:

- **Filling** is a copy from Commerce into the ERP, run by **Demo Builder** at reset and from a
  dashboard action. Demo Builder already holds the project's Commerce credential, already has a
  Commerce REST client, and already runs the reset. It reads Commerce, writes the ERP through the
  ERP's ordinary import, and loads the integration's lookup table (which Commerce record is which
  ERP record), the way a key map is loaded at a real go-live. Neither the ERP nor the integration
  contains Commerce-copying code afterwards. Chosen over the integration (would leave a demo-only
  file in the hand-off code) and the ERP (would teach the ERP about Commerce).
- **Running** behaves as if the ERP had always been the source: the ERP owns its records and
  speaks its own language; the integration does all the translating. The integration is meant
  to be handable to a prospect as a working model for development, so it carries no demo code.

## Where each mapping lives (owner agreed, 2026-09-25)

| Kind | Example | Home |
|---|---|---|
| Which record is which | Commerce company 12 = ERP customer C000102 | data the integration keeps; read-only on the Admin page; never typed in |
| How the business is organised | website → sales organisation, source → plant, products owned by this ERP | settings on the Mapping tab |
| What the words mean | ERP event names → starter-kit events, field names | code, one named translation module |
| A policy hidden in a translation | which blocking levels stop web orders | a setting with a default, only where two merchants could answer differently |

## The work, in order

1. **Words and controls.** The journal says "Sent" to a named receiver, not "Delivered" to
   Commerce (D16). Remove Commerce wording from ERP screens (shipment ship-from, product page SKU
   note, Home's "Last sync from Commerce" card). Remove Sync records and its progress from the ERP
   and from the integration's Admin page; Demo Builder gets the demo-data action. Decide whether
   Wipe moves to Demo Builder too (recommended: yes, so demo controls live in one place).
2. **The ERP owns its structure** (audit F1). Company code, currency, country, tax number, sales
   organisations and plants are stored as the ERP's own settings, written by the demo copy in ERP
   terms ("1000 · Online US", "Plant 1100 · Newark DC"), never rebuilt from Commerce while
   running. The copy pre-fills the Mapping tab; the "website has no sales organisation" warning
   moves there. Supersedes the "rebuilt from Commerce on every reset, read-only" part of
   `erp-business-structure` section 8.
3. **The key map leaves the ERP** (F2). The customer record loses `commerceCompanyId`,
   `customerGroupId`, `emailDomain`, `website`; credit shows for any customer with a limit. The
   integration resolves Commerce company → ERP customer number from its lookup table and sends the
   customer number on the order, replacing the ERP's customer-group matching.
4. **The ERP speaks its own language** (F3). Its own event names and payloads (material,
   plant, customer number, blocking level); the integration's ingestion webhook translates to the
   starter kit's events and folds the blocking levels. Contract version bump.
5. **Deletes** (F5). Remove the ERP's product delete route. A Commerce product delete is recorded
   on the Admin page and unlinks the SKU in the lookup table; the ERP is untouched. The next reset
   drops the product from the ERP anyway. Syncing the ERP's sales status to Commerce's product
   status is a real, standard feature, left until a demo asks. Echo suppression moving into the
   integration comes last.

## Decided: the ERP's name is fixed at creation (owner, 2026-09-25)

Renaming a pair after creation would have to move a label through five places (the ERP's
screen, both tiles, the Commerce Admin menu, the Adobe workspace title) while every internal
id (Commerce app id, menu id, provider key, order prefix) stays on the first name. Rejected as
too complicated. Neutral ids everywhere was also rejected: it undoes the readable Commerce app
ids chosen on 2026-09-22, and installed pairs could not change theirs anyway.

So a pair's name is fixed when it is added; a different name means remove and add again, which
is cheap because the ERP is refilled at reset. Part of step 1:

- the ERP's Settings loses its name field, and `displayNameEdited` (the rule protecting an
  on-screen rename from a redeploy) is deleted with it;
- the name typed at add time is read-only afterwards wherever the integration's settings show
  it (check whether the tile's settings can edit `ERP_DISPLAY_NAME` today; close it if so);
- the add flow says so beside the name field: "The name can't be changed later. To use a
  different name, remove the ERP and add it again.";
- the order-number prefix is worked out once at install and saved as the Mapping tab's
  `structure_order_prefix`, instead of being recalculated from the name on every order.

## Decided: no polling between the two systems (owner, 2026-09-25)

"There shouldn't really be polling actions between the two systems." The minute-by-minute
refresh (Commerce stock, credit and companies into the ERP) is filling logic and becomes part of
the reset copy; its timer is removed. D14 (the overlap fix) is dropped with it, and the
"edit stock in Commerce, see it in the ERP" story goes. While running, changes cross only as
events.

## Shipped so far

- 2026-09-25  feat(integrations): an ERP pair's name is fixed when it is added (`b8219846e`)
- 2026-09-25  Step 1, words (demo-erp be9879b): the ERP's screens stop naming Commerce; the monitor says Inbound/Outbound/Sent; Home's sync card gone. Fixed name (demo-erp 1554681, this repo b8219846e). Left in step 1: Sync records and Wipe move to Demo Builder with the demo copy.
- 2026-09-25  Plan written for steps 1c to 5: .rptc/plans/erp-demo-filling/overview.md. Three owner questions: Wipe to Demo Builder; detach becomes Demo Builder's over the integration's write log; whether the Mapping tab can be pre-filled from outside the app.
- 2026-09-27  fix(app-builder): the ERP's first sync after an add actually starts (`281f5275b`)
- 2026-09-27  2026-09-27  Owner: during A3's live run, capture Commerce's own event payloads (shipment, invoice, order hold/cancel save, product delete) from the Developer Console's registration debug tracing, scrubbed, into commerce-erp-integration test/fixtures/commerce/events/, and point the handler tests at them (today they use hand-written payloads). Turn tracing on before the run's first order.
- 2026-09-27  feat(erp): Demo Builder fills the ERP from Commerce (`706583816`)
- 2026-09-27  2026-09-27  Step 1 LIVE on Bodea: load_erp_demo_data filled the ERP in 2m15s, 4 customers and 182 products; accessmesh, the customers' websites, sales organisations and credit limits identical to the integration's mirror. Open before step 2: the minute refresh is the only path for per-source stock and company changes (Commerce raises no event for either), so deleting it drops those.
- 2026-09-27  feat(erp): Demo Builder fills the ERP after the add and inside Reset (`bef6b4fff`)
- 2026-09-27  docs(backlog): AB-26y step 1 proven live on Bodea (`0b201347f`)
- 2026-09-27  feat(erp): "Load demo data" on the ERP card (`6670494a9`)
- 2026-09-27  Plan steps 2 and 3 built (loop branches, not deployed): the integration's copy removed (mirror, mirror-job, reset, refresh-job and its timer, refresh-partners, the Admin page's Sync/Refresh/Reset buttons; commerce-erp-integration 4eaf6ac, contract 4649ef0), and the ERP's Sync records button and sync record removed (demo-erp ef7727b). Demo Builder fills the ERP at add, at Reset records, and from Load demo data on the ERP card.
- 2026-09-27  Correction to the 2026-09-27 live-run line: Commerce DOES raise a company event (observer.company_save_commit_after, in the Cloud Service's supported list); the integration subscribes to it since 30e37cb, not yet proven live. Stock moved by Commerce's own Transfer, Import or a REST write still raises nothing and no longer reaches the ERP; the Move stock action is the path.
- 2026-09-27  Next: the key map (plan step 1's second half, prerequisite of step 5). Today the pairing is implicit: ERP customer C<companyId>, product by SKU. Design written in .rptc/plans/erp-demo-filling/overview.md.
- 2026-09-27  feat(erp): the fill hands the integration its key map (`5cee05c3f`)
- 2026-09-27  docs(handoff): ERP loop report, 2026-09-27 (`de8956524`)
- 2026-09-27  docs(plan): ERP filling progress, and the key-map design (`37fe91fb3`)
- 2026-09-27  Key map parts (a) to (d) built, loop branches, not deployed: the integration keeps the map and serves erp/keymap (444c4f1); Demo Builder loads it after every fill, skipping an integration too old to have it (5cee05c3f); orders send the ERP customer number from it (6408823, a box journey fails without it); the ERP's credit and block events find the company through it (4c02c9b); the company event updates the paired customer or pairs a new one (f333c9b); the Admin lookup reads through it (e70963c). Integration tests 441.
- 2026-09-27  Blocked on the owner: part (e), the ERP dropping Commerce ids. The cart price and discount checks still rely on the ERP matching the buyer by Commerce's customer group and email, because Commerce's cart payload carries only the group. Sending the ERP number there needs one extra Commerce read per cart update (customer to company), in a check that breaks the cart when it fails. Recommendation: read it once per customer and keep it in App Builder State.
- 2026-09-27  Live cart test on Bodea (2026-09-27, integration 0be3a36 deployed with the owner's go-ahead): a new RackMaster shopper on the shared group 1; both totals checks received quote.extension_attributes.company_id = 20 and customer_id. Test shopper and cart line deleted after. The cart checks now send the key map's ERP customer and the company (8a83f7a, loop branch, not deployed), so the cart decision is resolved and step (e), the ERP dropping Commerce ids, is unblocked.
- 2026-09-27  refactor(erp): the fill sends customers with no Commerce id, and pairs them from the companies (`22f9fec16`)
- 2026-09-27  docs(backlog): the cart carries the buyer's company; the key map reaches the cart (`cc16341e7`)
- 2026-09-27  docs(backlog): the key map built to the cart decision (`651005a47`)
- 2026-09-27  Key map part (e) built, loop branches, not deployed: the ERP holds and speaks no Commerce id, contract version 3 (demo-erp ec50cfe: customers drop commerceCompanyId, customerGroupId, emailDomain, website; a quote or order names its customer by number or is the walk-in's; events carry partnerId only; every non-walk-in customer has credit). Integration b309a8a sends only the key map's number; Demo Builder 22f9fec16 fills without them. Open for the owner: Demo Builder's setup step 'Give each company that gets its own prices a shared catalog of its own' and the integration's demo-setup row both rest on 'the cart names only the group', no longer true.
- 2026-09-27  docs(backlog): the ERP holds no Commerce id (key map part e) (`d723d454e`)
