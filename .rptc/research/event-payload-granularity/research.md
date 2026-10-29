# AB-60: How fine-grained can events be, in each direction?

Read 2026-10-04. Labels: VERIFIED (read in code or on the page by me), DOCUMENTED (Adobe docs
say so), UNVERIFIED (not established). Backlog item:
`.rptc/backlog/2026-10-02-event-payload-granularity.md`.

## Summary

1. Commerce to ERP: you choose the event, the fields (a snapshot, never a diff), and optional
   rules that decide whether it is sent at all. `onChange` plus `_origData` is the native way
   to say "only when this field changed".
2. Our app config can already declare those rules (lib-app 2.0.0). It cannot declare a parent
   event, so a rule narrows our subscription; it does not create a named child event.
3. Whether a rule really filters on Commerce as a Cloud Service, and whether the product save
   payload carries `_origData`, are still unproved. Both need a deployed test subscription.
4. ERP to Commerce: the granularity is our design. The ERP is ours, so the ceiling is whatever
   the ERP emits. But the product receiver today ignores the payload's values and re-asks the
   ERP for the current record, so finer ERP events would change the journal, not what Commerce
   applies.
5. No Adobe constraint on ERP event granularity was found. The one hard rule in our own
   receiver: its schema requires `sku` and `price`, so a name-only event is rejected today.

## Direction 1: Commerce to ERP

### What the platform offers

- **Which events.** Two sources, observers and plugins, named in the event code
  (`observer.catalog_product_save_after`, `observer.customer_login`). DOCUMENTED:
  developer.adobe.com/commerce/extensibility/events/configure-commerce/ (2026-10-04).
- **Which fields.** Dot notation for nested fields (`stock_data.qty`). DOCUMENTED:
  configure-commerce page. `quantity_and_stock_status.qty` and a wildcard
  `<field name="*"/>` that captures everything. DOCUMENTED: .../events/conditional-events/
  (2026-10-04). A snapshot of the chosen fields, not a diff. Context fields use a `context_`
  prefix (same page).
- **Previous values.** `_origData` is "the state of the object before any changes were made".
  It is NOT included by default, even with `*`. You add it as a field, or pick single
  members (`_origData.sku`). The payload then carries current values, `_origData` and an
  `_isNew` flag; for new objects the original data is empty. Which events support it: check
  System > Events > Events List or `bin/magento events:info <event_code>`. DOCUMENTED:
  developer.adobe.com/commerce/extensibility/events/events-original-data/ (2026-10-04).
- **Rules.** The conditional-events page shows operators `lessThan`, `in`, `regex`, `equal`
  and `onChange`. `onChange` compares current values with `_origData`, only for events that
  carry it. A rule that evaluates false is "not stored in the database or sent to the
  eventing service". DOCUMENTED: conditional-events page (2026-10-04). (The backlog item also
  lists `greaterThan`; the page text I fetched showed five operators. lib-app's schema has all
  six, see below.)
- **Conditional child events.** XML syntax `<event name="child" parent="parent_event_code">`.
  DOCUMENTED: conditional-events page.
- **Plugin-type caveat.** "Registering a plugin-type event rule causes the system to generate
  a plugin for the parent rule." DOCUMENTED: same page.
- **Priority.** Normal events go out on a cron; priority events go through a queue consumer.
  Our config comment says priority arrived in 5 s while the cron never dispatched on the
  sandbox (measured 2026-09-25). VERIFIED as a claim in code:
  `commerce-erp-integration/app.commerce.config.ts:243-250` (the comment is the repo's own
  measurement; I did not re-measure).
- **Retention and retries.** Default 3 days retention, 7 retries. DOCUMENTED:
  configure-commerce page.
- **SaaS or Cloud Service limits.** Neither the conditional-events nor the `_origData` page
  mentions any (UNVERIFIED for ACCS, "does not say" is not "works"). The configure page's
  Cloud section covers Cloud Infrastructure (PaaS) only.
- Webhooks (the synchronous direction) were not researched here; the item is about events.

### What our app config can express today

All VERIFIED in `commerce-erp-integration`.

- Commerce events are declared under `eventing.commerce[].events[]` at
  `app.commerce.config.ts:251-` with `fields`, `label`, `name`, `priority`, `runtimeActions`.
  Fields use a helper, `field(name, source?)` (`app.commerce.config.ts:3-4`), and the config
  already uses array syntax such as `field("items[].sku")` (the Order Saved event).
- Product save subscription: `observer.catalog_product_save_commit_after`, fields id, sku,
  name, price, type_id, created_at, updated_at, `priority: true`
  (`app.commerce.config.ts:254-270`). No `rules`, no `_origData`.
- Schema, `node_modules/@adobe/aio-commerce-lib-app` 2.0.0 (`package.json:3`),
  `dist/es/app-DwSqUkJA.d.mts:862-866`: `rules` is an optional array of `{ field, operator,
  value }`; operator is one of `regex | greaterThan | lessThan | equal | in | onChange`; all
  three are non-empty strings. The event schema also has an optional `env` (`"paas" |
  "saas"`) (line 868). There is no `parent` field in what I read, so a rule filters our
  subscription to a native event; it does not define a named child event. (The backlog item
  reached the same finding on 2026-10-02.)
- Nothing in `src` references `_origData` (grep of `commerce-erp-integration/src`, no hits).

### Verified, documented, unknown on ACCS

| Question | Status |
|---|---|
| App config accepts `onChange` and other rules | VERIFIED (schema above) |
| Justrite stores each app subscription as a named child with a rules list | VERIFIED per backlog item (Justrite `eventing/getEventSubscriptions`, 2026-10-02); I did not re-run it |
| A rule filters live on ACCS | UNVERIFIED |
| `onChange` works on ACCS | UNVERIFIED |
| Product save payload carries `_origData` on Justrite | UNVERIFIED |
| `_origData` selectable as a field through our config (`field("_origData")`) | UNVERIFIED. The schema takes any field name string; whether Commerce accepts it is check 3 |

## Direction 2: ERP to Commerce

### What the ERP emits now (VERIFIED, `demo-erp`)

- One emit function. `lib/events.js:181` `emit(cols, kind, value, params, deps)` journals the
  event and POSTs it (`lib/events.js:156-160`) as `{ data: { uid, event, value } }` to
  `webhookUrl`, by default `https://<ns>.adobeio-static.net/api/v1/web/ingestion/webhook`
  (`lib/events.js:60-65`). It adds `erpId` to the value (`lib/events.js:142-146`).
- Kinds and wire names (`lib/events.js:23-37`): product.price to
  `be-observer.catalog_product_update`; product.stock to `be-observer.catalog_stock_update`;
  order.canceled, order.confirmed, order.hold, order.invoiced, order.shipped;
  partner.blocked and partner.creditLimit (company events); contract.changed.
- Product edits: ONE kind. `lib/products.js:313-315`: `if (productChanged) { await
  emit(cols, 'product.price', { sku, name: next.name, price: next.listPrice }, params) }`.
  `productChanged` is set by either a name change (`:283`) or a price change (`:288`). So a
  rename and a price edit look the same.
- Journal text says "Price changed" (`lib/journal.js:10`) and "Price of X set to Y"
  (`lib/journal.js:73-74`). That is the owner's observation, confirmed.
- Stock is already finer: one event, an array of per-warehouse changes, emitted only for
  warehouses whose quantity differed (`lib/products.js:300-317`).
- Partners are field-specific already: credit limit and blocked are separate events
  (`lib/partners.js:208,218`).

### How it reaches Commerce (VERIFIED, `commerce-erp-integration`)

ERP POST, then the `ingestion/webhook` action publishes it as an Adobe I/O event
(`src/commerce-extensibility-1/actions/ingestion/webhook/index.js:51-60`, `publishEvent({
client, event: eventType, payload: params.data.value, provider: BACKOFFICE_PROVIDER_KEY })`),
then the registered runtime action handles it. ERP events are declared as `eventing.external`
under provider key `erp`, each with a `runtimeActions` handler, no fields, no rules
(`app.commerce.config.ts:381-`, `be-observer.catalog_product_update` to
`product-backoffice/updated`).

### What the receiver needs

- `product-backoffice/updated` schema: required `sku` and `price`; `name` optional;
  `additionalProperties: true` (`src/commerce-extensibility-1/actions/product/external/updated/schema.json`).
  So extra fields (a changed-fields list, a full record) pass; a name-only event does not.
- The handler uses only `sku` and `erpId` from the event, then fetches the ERP's current
  record (`updated/index.js:44-54`). Applied payload is built from that, not from the event
  values. The transformer writes a sparse save of name and/or price
  (`updated/transformer.js:10-`).
- Consequence: the ERP-side event can say whatever is most truthful ("product changed",
  full record, changed-fields list) without changing what Commerce does. Changing the wire
  name (`be-observer.catalog_product_update`) means touching `app.commerce.config.ts`, the
  handler, and the erp-event-history; keeping the name and enriching the value costs nothing.

### Possible ERP shapes

| Shape | Fit |
|---|---|
| Full record plus `changed: ["name"]` on one `Product changed` event | Standard ERP shape; no config change; keeps `price` so the schema holds |
| Separate event per field (name vs price) | Needs new declarations in `eventing.external`, new handlers, and the schema relaxed |
| Diff (before and after per field) | Possible; nothing in the receiver uses it today |

### Adobe constraints on the ERP path

None found. The ERP is not an Adobe product, and the ERP-to-Commerce hop is our own web
action. Adobe I/O Events limits (event code naming, payload size) would apply at the
`publishEvent` step. UNVERIFIED: my fetches of the I/O Events ingress and custom-events guide
pages returned 404 (guessed URLs), and the Experience League search returned off-target
results. Next step: find the I/O Events "publish events" page via the App Builder guides
index and read its size limit. Note: the lib-app event name pattern is enforced by its own
schema ("Event name must start with ..."; the regex text is cut off in the d.ts line I read,
`app-DwSqUkJA.d.mts:860`), so event names must also satisfy that.

## The three live checks

All three need a test subscription deployed to Commerce, which is a cloud write. Not done
here. Owner (or owner-approved session) runs them on Justrite.

1. **Does ACCS honour `rules` and `onChange`?**
   Run: add a TEMPORARY second subscription to `observer.catalog_product_save_commit_after`
   with a rule `{ field: "name", operator: "onChange", value: "<see below>" }`. `value` is a
   non-empty string in the schema; what the page expects for `onChange` is a custom path only
   "when structures differ", so first try the value the page's example uses (re-read the page
   example before building). Deploy, then in Admin edit a product's price only, then its
   name only.
   Observe: the ERP journal and `eventing/getEventSubscriptions`. Name change delivers and
   price change does not = rules and onChange work. Both deliver = rules stored but ignored.
   Neither = the rule needs `_origData` that the event lacks (go to check 3).
   Undo: remove the subscription (per the repo rule that everything done is undone).
2. **Can app config declare rules, and does the manifest carry them?**
   Mostly answered: schema accepts rules (VERIFIED above); Justrite stores rules per
   subscription (per backlog item). Remaining: confirm the generated manifest from this
   repo's config carries the rule through, by a local config build (no deploy). The parent
   field does not exist in lib-app 2.0.0.
3. **Does the product save payload include `_origData` on Justrite?**
   Run: in Admin open System > Events > Events List, open `catalog_product_save_commit_after`
   (the page says it shows whether original data is available), or run
   `bin/magento events:info` if reachable (not on ACCS, UNVERIFIED). Then, with the test
   subscription from check 1 adding `field("_origData")`, save a product and read the
   delivered payload. `_origData` with old values = supported. Missing or empty on an existing
   product = not supported on this event (rules `onChange` then cannot work).

## Recommendation

Unchanged from the item. Keep full-record events both ways. Do the cheap, proven part now:
the ERP emits "Product changed" with the full record plus a changed-fields list, and the
journal names the fields (AB-26y). Do not build Commerce-side `onChange` or `_origData`
subscriptions until checks 1 and 3 pass, and then only for fields a demo story needs.
One addition from this research: because the product receiver re-reads the ERP and ignores
event values, keep the wire name and the `sku` and `price` fields when enriching the ERP
event, or relax `schema.json` in the same change.

## Sources

Docs, all read 2026-10-04 via WebFetch (small-model summaries, quoted strings are as returned):
- https://developer.adobe.com/commerce/extensibility/events/conditional-events/
- https://developer.adobe.com/commerce/extensibility/events/configure-commerce/
- https://developer.adobe.com/commerce/extensibility/events/events-original-data/
- Tried, 404: developer.adobe.com/events/docs/guides/api/eventsingress_api(/) and
  .../guides/using/custom-events/

Code, all read 2026-10-04 (root `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/`):
- `commerce-erp-integration/app.commerce.config.ts` (lines 3-4, 243-270, 381-)
- `commerce-erp-integration/node_modules/@adobe/aio-commerce-lib-app/dist/es/app-DwSqUkJA.d.mts` (860-868)
- `commerce-erp-integration/src/commerce-extensibility-1/actions/ingestion/webhook/index.js` (51-60)
- `commerce-erp-integration/src/commerce-extensibility-1/actions/product/external/updated/{schema.json,index.js,transformer.js}`
- `demo-erp/lib/events.js` (23-37, 60-65, 142-160, 181)
- `demo-erp/lib/products.js` (279-317), `demo-erp/lib/journal.js` (10, 73-74), `demo-erp/lib/partners.js` (208, 218)
