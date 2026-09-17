# How Commerce webhooks and events reach an App Management app (Adobe Commerce as a Cloud Service)

Researched 2026-09-17 for the ERP integration (AB-9, AB-10), after live tests on the Bodea sandbox.
Sources: Adobe's developer documentation (the AdobeDocs `commerce-extensibility`, `app-builder` and
`adobe-io-events` sources behind developer.adobe.com), the published code of
`@adobe/aio-commerce-lib-app` 1.11.0 and `@adobe/aio-commerce-lib-webhooks` 1.2.1, and
`adobe/commerce-integration-starter-kit`. "Observed" marks what was measured on the sandbox;
anything else not quoted from a source is marked inferred.

## What was observed on the sandbox

- Commerce's `GET /V1/webhooks/list` listed the integration's three webhooks with the right Runtime
  URLs, and `GET /V1/webhooks/supportedList` includes all three methods.
- Two guest orders placed through GraphQL both reached the ERP (ERP numbers 1000 and 1001): one
  while the app was **unassociated** in App Management, one after. The order webhook works either
  way.
- Commerce's Webhooks Logs recorded one cart-price call that took 1.9 s against a 1 s soft timeout.
- `aio rt activation list` showed none of those calls. That is expected (below), not a failure.

## Runtime does not keep successful web calls

"I/O Runtime doesn't persist successful activations. The exceptions are asynchronous actions invoked
in a non-blocking fashion." Web actions are blocking, so a successful webhook call leaves no
activation record; a failed one does (a call without a token showed up as the `item-prices`
sequence plus its validator). Ways to see successful calls: Developer Console ▸ App Builder Logs
(which, per the logging guide, "shows logs from all action invocations"), log forwarding, or the
`x-ow-extra-logging: on` header on calls we make ourselves. Activations are kept seven days.

## The webhook lifecycle with App Management

- Webhooks are created by the **installation** step, not by association. Association only stores
  which Commerce instance the app belongs to (the app's own record); App Management keeps its own
  list of associated apps, and associating is done in its screen. No API for it is documented.
- On install the SDK prefixes `batch_name`/`hook_name` with the app id, builds the URL from the
  installing namespace (`https://<namespace>.adobeioruntime.net/api/v1/web/<runtimeAction>`) and
  adds the IMS credential (`developer_console_oauth`) unless the entry says `requireAdobeAuth:
  false`.
- **An existing subscription is never updated.** The SDK skips a webhook already subscribed with
  the same method, type, batch and hook name, so a changed `required`, timeout, `fields` or URL does
  not reach Commerce. Changing them means unsubscribing and subscribing again.
- **Uninstall works from the current config.** It unsubscribes the webhooks the config lists at
  uninstall time; one removed from the config earlier stays in Commerce. Remove a webhook from
  Commerce before removing it from the config.
- Unassociating "removes all configuration values for this instance" (the app's business
  configuration) and clears the app's own association record. Uninstall in App Management before
  undeploying the app, or the unassociate step has no endpoint to call.

## `required` and timeouts

`required` defaults to true: "When `true`, a failure terminates the process"; when false, "the
failure is logged and subsequent hooks continue". `timeout` defaults to 0 (no limit); exceeding
`softTimeout` is only logged. A failing required totals-collector hook applies no modifications.
The Admin Webhooks list may show "Required" for a subscription created as optional; the
subscription's own edit page is the one to read (inferred from reports; unconfirmed).

## Payloads

- Webhooks send the whole default payload unless the subscription declares `fields`; then only
  those are sent. Store context can be added with `source: context_store.get_store.get_id` (and
  similar for website and store group). Admin ▸ System ▸ Webhooks ▸ Webhooks List shows each
  method's default payload.
- The totals-collector hooks (`...get_total_modifications.item_prices` / `.execute`) carry
  `{ total, quote: { entity_id, store_id, items }, shippingAssignment: { items, shipping } }`;
  `item_prices` answers `replace result/price_updates [{ item_id, base_price }]`, `execute`
  answers `replace result` with the discount.
- The `sales_order_place_before` examples do not show `store_id` or `entity_id`.

## Orders to an external system: events, as the starter kit does

Adobe describes webhooks for when "Commerce needs to compute or validate something immediately".
The integration starter kit sends orders with the event `observer.sales_order_save_commit_after`
(fields `id`, `increment_id`, `created_at`, `updated_at`) to a `created` and an `updated` action;
`created` acts only when `created_at === updated_at`. It writes nothing back to Commerce. The
event can also carry `store_id`, `ext_order_id`, `customer_email`, `customer_group_id`,
`base_grand_total` and `items[].sku` (nested fields use `items[].name`); `_isNew` is listed for
this event.

Writing the ERP number back: `POST /V1/orders` with `{ entity: { entity_id, ext_order_id } }` (a
sparse save the integration already uses to clear the field). The save fires the event again
(inferred); `created_at !== updated_at` and an already-set `ext_order_id` both stop a loop.

Delivery to a Runtime action (I/O Events): "delivered at least once", "Event order is not
guaranteed", "Duplicate events may be sent"; each event has an id (`x-adobe-event-id`). 429 and 5xx
(except 505) are retried at 1, 2, 4, 8 minutes and then every 15 minutes for up to 24 hours, then
dropped; other statuses are not retried. A registration failing most deliveries for a day is marked
unstable, and disabled a day later until re-enabled by hand. The action has 60 s.

## Consequences for the ERP integration

1. Orders move from the `sales_order_place_before` webhook to the `sales_order_save_commit_after`
   event, with the ERP number written back afterwards. "Hold orders while the ERP is offline" maps
   onto delivery: on, answer 5xx so I/O Events retries for up to a day; off, answer 4xx and log.
2. The order webhook is unsubscribed from Commerce before it leaves the config.
3. The cart webhooks are unsubscribed and subscribed again for their declared `required: false`
   and the store field to apply.
4. Demo Builder cannot associate an app for the SC; it can direct them to App Management and
   check the result. Its teardown must uninstall before it undeploys.
