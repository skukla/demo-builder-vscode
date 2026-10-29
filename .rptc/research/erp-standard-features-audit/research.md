# The mock ERP against one rule: only what a real ERP has out of the box

Date: 2026-09-25. Repo audited: `demo-erp` at `c686061` (read, not changed).

**The rule** (owner, 2026-09-25): the mock ERP gets only what a real ERP (SAP S/4HANA,
Dynamics 365 Business Central) has without customization. Every convenience for the merchant
lives in the integration (the App Builder app and its Commerce Admin page) or in Commerce's own
records. A merchant wants minimum development impact on the systems they already run.

**How this was done.** One reader inventoried every screen, card, route and stored field in the
ERP with file and symbol citations (78 capabilities). The Commerce-facing rows were then
re-checked by hand against the source. A second reader checked the acknowledgement question
against SAP and Microsoft documentation (section 5); the first attempt died on a usage limit
and was re-run. The verdicts below are judgement, stated
as judgement, applied to that inventory.

This builds on two earlier pieces rather than repeating them: the 2026-09-23 realism audit
(`erp-realism-audit`), which asked "does it look like an ERP" and cleared most screens, and the
2026-09-24 business-structure research (`erp-business-structure`), whose recommended model is
the main thing this audit questions (section 2).

---

## 1. The answer in one paragraph

Most of the ERP passes. Its documents, work list, credit management, pricing conditions and
outbound message monitor are things SAP and Business Central have as standard. What fails the
rule falls into three groups. First, and largest, **the direction of ownership**: the ERP's
company identity, currency, sales organisations and warehouses are derived from Commerce and
rebuilt from it on every reset, when in a real ERP they are the ERP's own configuration and the
integration maps Commerce onto them. Second, **Commerce's identifiers and vocabulary stored and
shown in the ERP**: the Commerce company id on the customer master, the starter kit's event
names on the wire, "To Commerce" in the monitor, the fold of four blocking levels into
Commerce's one boolean. Third, **integration controls on the ERP's screens**: "Sync records",
its progress bars, and the "Last sync from Commerce" card. The demo's own apparatus (screen key,
wipe, appearance) is honest as long as it stays off the prospect's path, which it does.

---

## 2. Findings that fail the rule, largest first

### F1. The ERP's enterprise structure is derived from Commerce (backwards)

What it does today (read): `lib/structure.js:describeStructure` builds the company code, its
currency and country, and one sales organisation per Commerce website from
`settings.structureMirror`, which the integration writes. Warehouses are registered from
Commerce inventory sources (`lib/settings.js:registerWarehouses`), keeping the Commerce code.
The invoice's Seller card reads the website's Store Information (`lib/fulfilment.js:sellerOf`).
Settings warns "a website has no sales organisation". The 2026-09-24 research recommended this
("the ERP showing its structure read-only, rebuilt from Commerce on every reset", section 0)
and the loop built it.

Why it fails: in SAP the company code, sales organisation and plant are ERP configuration done
long before any web shop exists; in Business Central the company and locations likewise. An ERP
does not learn who it is from its web shop. Here the ERP cannot exist without Commerce, and a
Commerce admin renaming a website changes the ERP's sales organisation.

Honest shape: the ERP owns a small seeded configuration (company code, currency, country, VAT,
sales organisations, plants and storage locations), editable on its Settings screen the way an
ERP consultant would set it. The integration owns the mapping, on its Commerce Admin Mapping
tab, which already carries the website → sales organisation setting: Commerce website → ERP
sales organisation, Commerce inventory source → ERP plant. The seller identity on an invoice
comes from the ERP's company code. For the demo's reset-to-zero, the ERP resets to its seed,
not to whatever Commerce says.

Cost (inferred): medium. The mapping side exists; the ERP gains a seed and loses the mirror;
the integration stops writing `structureMirror` and translates codes both ways. The
business-structure research's section 8 needs a superseding note.

### F2. The customer master stores Commerce's identity and attributes

Read: the customer carries `commerceCompanyId`, `customerGroupId`, `emailDomain` and
`website{id,code}`; `lib/credit.js:hasCredit` shows the credit card only when
`commerceCompanyId` is present.

Why it fails: storing a web shop's primary key and its customer-group id on the ERP's business
partner is a custom field in both ERPs. Real integrations keep that cross-reference in the
middleware (a key-mapping table), and the ERP's own credit management depends on the ERP's own
credit relationship (in SAP, a credit segment on the business partner), never on whether a web
shop id exists.

Honest shape: the ERP customer has its own number, its own credit account, and a standard
external-reference field where one exists. The integration's ledger already maps company id ↔
ERP customer number; make it the only place that mapping lives. Credit applies to any customer
with a credit limit.

What is fine: the customer reference on a sales order holding the Commerce order number. SAP
stores the web order number as the purchase-order reference and Business Central has External
Document No. (read in `erp-two-way-ux` section 4). The SKU equal to the material number is
also normal practice.

### F3. The ERP speaks Commerce's vocabulary on the wire and on screen

Read: outbound events are named in the starter kit's back-office vocabulary
(`be-observer.catalog_product_update`, `lib/events.js:EVENT_NAMES`); the four blocking levels
fold to Commerce's single boolean inside the ERP (`lib/credit.js:BLOCKING`); the journal says
"To Commerce" / "From Commerce" and prints the integration's webhook URL
(`screen/src/components/Events.js`); the shipment prints "ERP name (Commerce source code)"; the
product page says "The SKU links this product to Commerce. Change it there, then sync."

Why it fails: a real ERP emits its own message types (an IDoc type, a business event name) to a
named receiver or port, and knows nothing about the target's model. Translating to Commerce is
the integration's job, which is exactly what an App Builder integration is for.

Honest shape: the ERP publishes in its own terms (for example "Material changed", "Business
partner blocked" with the ERP's four levels), to a receiver named in its settings ("Web shop
integration"). The integration's ingestion step maps those to the starter kit's event names and
folds the blocking levels. The monitor says "Sent" to a receiver, not "Delivered" to Commerce
(this is D16's rename, widened).

Cost (inferred): low for the words; medium for moving the event-name and blocking translation
into the integration's ingestion webhook, which is the starter kit's designed seam for it.

### F4. Integration controls on the ERP's own screens

Read: Settings has **Sync records**, which asks the integration to resend everything
(`lib/sync.js:requestSync`), and a progress view the integration reports into
(`SyncProgress.js`, route `POST admin/sync`); Home has a **Last sync from Commerce** card.

Why it fails: no ERP has a button that asks an outside subscriber to push data into it, or a
progress bar for someone else's job. Those are middleware functions.

Honest shape: both already exist on the integration's Commerce Admin page (Status & sync:
Sync records, counts, What crossed). Remove them from the ERP. The ERP's Home keeps its own work
cues; if a freshness line is wanted, it belongs on the integration's page (the D14 line).

Cost: low.

### F5. Deletes and echoes decided inside the ERP

Read: `DELETE products/:sku` exists for "the product was deleted in Commerce"; inbound moves
from Commerce carry `origin` so the ERP does not raise its own outbound event
(`actions/orders/index.js:move`, `lib/fulfilment.js:receiveShipment`).

Why it may fail (judgement, weaker than F1 to F4): a real ERP would not delete a material
because a web shop dropped it; at most the integration unlinks or flags it. And a real ERP's
change pointers fire on every change regardless of origin, so suppressing the echo is the
integration's problem, not the ERP's. Keeping echo suppression in the ERP makes the integration
look simpler than it would be for a real customer.

Honest shape: a Commerce delete marks the ERP product "blocked for sales" or leaves it; the ERP
emits on every change and the integration drops its own echoes (it already records what it
wrote, so it can recognise them). Worth doing only after F1 to F4.

---

## 3. What passes: standard in a real ERP

From the inventory, verdict by judgement against what the earlier audits read from SAP and
Business Central documentation:

- **Home work cues, rail counts, recent documents, open order value.** SAP's overview pages are
  work lists (read in `erp-realism-audit` 2.6).
- **Shell search** (Fiori search, Business Central "Tell me").
- **Product master**: list, variants, list price, stock by warehouse, committed and available
  computed from open orders, blocked for sales (SAP sales status), open orders holding stock.
- **Customer master**: payment terms, credit limit, exposure, available, four blocking levels
  (SAP's order, delivery and billing blocks), orders, pricing.
- **Pricing conditions** with validity, minimum quantity, sales-organisation scope, and the
  price test (SAP's pricing analysis).
- **Sales orders**: work and stage filters, confirm, credit hold release and reject, close
  remaining with a reason, cancel with a reason, document flow, timeline.
- **Shipments and invoices** as documents: post shipment, due date from terms, document
  numbering ranges.
- **The outbound message monitor** itself: status, attempts, last error, retry, requeue, detail
  with the message id. SAP's IDoc monitor does this for outbound IDocs (section 5). Business
  Central has no comparable outbound log that could be found, so for a Business Central story the
  monitor is generous; keep it, with the wording fixes in F3, since it only claims "sent".
- **Inbound entries** in the same monitor: SAP shows inbound IDocs in the same monitor.

## 4. Demo apparatus: honest, keep off the story

Not ERP features and not pretending to be: the screen key Demo Builder puts in the link, Wipe
all records (the reset the reversibility principle requires), Appearance presets, the display
name, the journal's eight-second auto-refresh, the route kept in the address. All are on
Settings or invisible. Keep them there. One small leak: the "Open the ERP from Demo Builder"
message when the key is missing is fine, since only an SC ever sees it.

---

## 5. The acknowledgement question (SAP ALEAUD and equivalents)

Labels: READ = read on the cited page; SNIPPET = search results or community sources only;
INFERRED = reasoning from the above.

**SAP, IDocs over ALE.** The sender's own statuses describe dispatch, not processing: 03 "data
passed to port", 12 "dispatch OK" (SNIPPET). A standard application acknowledgement exists and
is configuration, not development (READ,
[ALE Audit](https://help.sap.com/doc/saphelp_nw73ehp1/7.31.19/en-us/4a/b4abcc85376d61e10000000a42189c/content.htm)):
"The receiving SAP system periodically sends confirmation messages to the sending system", as
"IDocs of message type ALEAUD", set up with a message flow in the distribution model and the
program RBDSTATE scheduled on the receiving side. The sender's IDoc then moves to 41
"application document created in receiving system", or reports the failure (SNIPPET; the exact
status mapping was only found in community sources). Without it, a receiver's rejection is
invisible to the sender (SNIPPET, community).

**SAP, web services and events.** The web service monitor tracks message status and errors of
the call itself (READ,
[Monitoring ABAP Web Service Messages](https://help.sap.com/doc/saphelp_nw75/7.5.5/en-US/b3/89c0c71e1444c0a075996cdf94df6a/content.htm));
nothing on the page describes a receiver's business outcome (INFERRED from the page's silence).
For a synchronous call, whatever the receiver answers is the outcome the sender sees (SNIPPET).
Event Mesh acknowledgement is delivery-level: any 2xx from a webhook counts as acknowledged
(SNIPPET, Event Mesh REST docs).

**Business Central.** Webhook subscriptions retry for 36 hours when the subscriber answers 408,
429 or 5xx, and nothing on the page records what the subscriber did with the notification
(READ,
[Working with webhooks](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/api-reference/v2.0/dynamics-subscriptions)).
Business events likewise carry no consumer acknowledgement back (READ,
[Business events](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/business-events-overview)).
No standard outbound message log comparable to SAP's IDoc monitor was found (absence of
evidence, not confirmed absence).

**What this means for the design (INFERRED).**

- The owner's instinct was right: ALEAUD is native to SAP. But it is native to one transport
  (IDocs between systems that both speak ALE), it needs the receiver to send an IDoc back, and
  Business Central has no equivalent at all. So it is not "what an ERP does"; it is "what an SAP
  customer on IDocs can switch on".
- For such a customer, the integration sending ALEAUD back is legitimate integration work: the
  ERP's own standard monitor would then show "processed" or the failure, with configuration on
  the SAP side and no custom code. That is a strong demo point for SAP prospects, and it would
  be modelled honestly only as that: an optional, SAP-specific acknowledgement, named as such.
- For the generic mock ERP, the honest default is a monitor that says **Sent**, and the outcome
  on the integration's Admin page and notifications. That is what a Business Central customer,
  and an SAP customer without ALE Audit, actually has.

## 6. The transport trade-off, stated rather than decided quietly

The ERP posts each change to the integration's webhook and gets an HTTP answer. The
integration answers before Commerce has done anything, because it hands the change to Adobe's
event service and returns. That is why the ERP's monitor can only honestly say "Sent".

The alternative is that the integration applies the change to Commerce during the webhook call
and answers with the real result. Then the ERP's own standard monitor shows success or the
Commerce error with no customization on either side. The cost: no Adobe retries, and a slow
Commerce (reads of 30 seconds and more were measured on the sandbox, 2026-09-24) would fail
inside the ERP's own call timeout. The starter kit's pattern is asynchronous for that reason.

Recommendation: keep the asynchronous pattern and the word "Sent"; show the real outcome on
the integration's Admin page and in its notifications (D16, D1's notification row). Revisit
only if a target customer's ERP offers a standard acknowledgement (section 5).

---

## 7. Recommended order

1. F4 and the words in F3 (Sent, a named receiver, no Commerce wording on the ERP's screens).
   Small, and it removes the most visible leaks.
2. F1, with a superseding note on the business-structure research. The largest change and the
   one that most affects what a prospect would believe about the ERP.
3. F2 and the event-name and blocking translation from F3, together: both move knowledge of
   Commerce out of the ERP and into the integration's mapping and ingestion.
4. F5, last, and only if a demo shows the difference.

## 8. What I could not establish

- Which exact IDoc status ALEAUD sets on a receiver failure (community sources only), and
  whether S/4HANA's own business-event enablement adds any outcome acknowledgement beyond
  Event Mesh's delivery-level one.
- Whether Business Central has any outbound message log screen at all (none found).
- Which external-reference field SAP's business partner offers as standard for a web shop's
  customer id; F2's "custom field" claim is inferred from the absence of one in the pages the
  earlier audits read.
- The cost figures in section 2 are estimates from reading the code, not from doing the work.

## 9. Decided (owner, 2026-09-25)

The ERP stays a temporary system filled from Commerce, but filling is separated from running.
Demo Builder does the copy at reset (it holds the credential, the Commerce client and the
reset); the ERP and the integration contain no Commerce-copying code; once filled, everything
behaves as if the ERP were the source. Mappings live by kind: record pairs as integration data,
business structure as Mapping-tab settings, vocabulary as code. This replaces section 7's order;
the work is backlog item AB-26y.
