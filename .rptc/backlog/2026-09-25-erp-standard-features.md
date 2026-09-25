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
