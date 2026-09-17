# The ERP integration's Commerce Admin page becomes its settings page

Status: in progress (2026-09-17): step 1 landed (integration `d32eb96`). Backlog: AB-10 (parent AB-9).

## Why

The integration's page in Commerce Admin (System ▸ ERP integration) is a dashboard: counts,
a sync log, and four buttons. A merchant does not go there to watch numbers; they go there to
decide how the integration behaves. The page also does not look like Commerce: text outside
Spectrum components falls back to the browser's serif font.

Decided with the owner, 2026-09-17:

1. **Storage:** Adobe's configuration library (`@adobe/aio-commerce-lib-config`, declared as
   `businessConfig` in `app.commerce.config.ts`), edited from our own page. Values are kept
   per scope (default → website → store → store view) and inherited like Stores ▸
   Configuration.
2. **Settings, first set:** below.
3. **Layout:** like Live Search (Marketing ▸ SEO & Search): the grey Scope bar, quiet tabs
   (**Settings**, **Status & sync**), and a Settings tab of sections (bold heading, rule, one
   sentence, fields), with Save at the top end, disabled until something changes. Built with
   **Spectrum 2** (`@react-spectrum/s2`), which Adobe recommends for Admin UI SDK pages
   (the `commerce-app-admin-ui` skill in adobe/skills; the v2 extension-point samples), laid
   out after Live Search. Live Search itself is React Spectrum v3 (read from the live admin
   2026-09-17); the owner chose S2 with Live Search's layout on 2026-09-17.
4. **Sales channels** (Commerce websites as SAP distribution channels) are a separate, later
   step: step 6.

Why not Stores ▸ Configuration itself: that page is built from PHP modules' `system.xml`, and
Adobe Commerce as a Cloud Service takes no custom PHP. The installed admin UI library
(1.0.1) extends menus, pages, grid columns, mass actions and order-view buttons only. App
Management's own form for `businessConfig` is under Apps ▸ App Management (inside Commerce
Admin per Adobe's docs), not in our page.

## Association (read 2026-09-17, developer.adobe.com app-management docs)

App Management keeps its own list of apps and their Commerce associations; associating is a
UI step (Apps ▸ App Management ▸ Associate: choose Project and Workspace). The app's
generated `association` action only stores the app's copy, and App Management calls it
itself. No API, `aio` command or Console step to associate is documented. Unassociating
"removes all configuration values for this instance" and clears the app's copy. On Bodea
the owner associated by hand after install and later unassociated; a test order on
2026-09-17 then reached none of the three webhooks although `GET /V1/webhooks/list` still
listed them. Demo Builder's install therefore needs to hand the SC the Associate step and
confirm it, rather than write the app's copy (a separate change, not in this plan's steps).

## The settings

| Group | Setting (`name`) | Type | Default | Today |
|---|---|---|---|---|
| Orders | Send this website's orders to the ERP (`orders_send`) | boolean | true | Every order is sent |
| Orders | Hold orders while the ERP is offline and send them when it is back (`orders_hold_offline`) | boolean | true | **Bug:** the order places, the shopper is told it "will be sent to the ERP separately", and nothing sends it |
| Orders | Mark the order Processing when the ERP confirms it (`orders_status_on_confirm`) | boolean | true | Comment only. Shipped, invoiced and cancelled already create real Commerce documents |
| Pricing | Use ERP contract prices in the cart (`pricing_contract_prices`) | boolean | true | Always on |
| Pricing | Apply the ERP's maximum discount (`pricing_discount_ceiling`) | boolean | true | Always on |
| Connection | ERP online / offline | — | — | Exists; kept in the ERP, not in `businessConfig` |

Customers & credit (copy credit limits and company blocks) is deferred.

No field is a password, so no encryption key is generated: the build hook sets one up only
for password fields (`aio-commerce-lib-app` commands, `requiresEncryptionKey`). **Check at
step 1:** the generated `config` action declares the input
`AIO_COMMERCE_CONFIG_ENCRYPTION_KEY: $AIO_COMMERCE_CONFIG_ENCRYPTION_KEY` regardless; confirm
an unset variable does not break the deploy. If it does, Demo Builder generates a stored
64-hex key for `erp-integration` (a `generatedSecrets` catalog field beside `screen`).

## What the library does (read from node_modules, lib-config 1.7.0 / lib-app 1.11.0)

- Values: Files `scope/<code>/configuration.json`, cached in State for 300 s; the scope tree
  is Files `aio-commerce-config/scope-tree.json`, read on **every** call.
- The tree holds only `global` until `syncCommerceScopes` reads Commerce's websites, stores
  and store views; website/store selectors throw until then.
- `getConfiguration(byStoreViewId(n))` walks store view → store → website → commerce →
  global → schema default and reports each value's `origin`.
- The schema lives in module memory: every action that reads calls `initialize` first.
- Our `erp` actions share the namespace's State and Files with the generated
  `app-management` actions, so either can read or write.

## Design

### Integration (`commerce-erp-integration`)

- **`src/lib/settings.js`** (new): `initialize` with the schema; `settingsFor(params,
  storeViewId)` → the five values, cached in the container for 60 s; on any failure it
  answers the defaults, so a checkout is never stopped by a settings read.
- **`erp/settings` action** (new, web, `require-adobe-auth`): `GET ?scope=<id>` → scope
  tree + values with origins (syncs Commerce scopes first when the tree has none);
  `PATCH` → `setConfiguration`, `null` clears an override. The page talks only to `erp/*`.
- **Orders go to the ERP by event, not by webhook** (owner, 2026-09-17, after
  `.rptc/research/commerce-webhooks-and-events/research.md`): the event
  `observer.sales_order_save_commit_after` (fields: id, increment_id, created_at, updated_at,
  store_id, ext_order_id, customer_email, customer_group_id, base_grand_total,
  base_currency_code, items[] lines) routes to `order-commerce/created`. It skips an order that
  is not new or already has an ERP number, and one whose website has `orders_send` off. It
  creates the ERP order, then writes the number back with `POST /V1/orders`
  (`ext_order_id`) and an order comment. When the ERP is offline or fails: with
  `orders_hold_offline` on it answers 5xx, so I/O Events retries (1, 2, 4, 8 minutes, then every
  15 minutes, up to a day); off, it answers 4xx and logs. The ERP already refuses a duplicate
  `commerceOrderId`, so a repeated delivery creates nothing twice.
- **The order webhook is retired:** unsubscribed from Commerce first (uninstall only removes what
  the current config lists), then removed from the config with its action. The shopper message
  about orders "sent to the ERP separately" goes with it.
- **item-prices / discounts:** skip when the setting is off; the store comes from
  `quote.store_id`. Their subscriptions are removed and created again so the declared
  `required: false` applies (an existing subscription is never updated).
- **order/external/updated:** with `orders_status_on_confirm` on, the comment also sets
  status `processing` (the unused `orders.comment(..., status)` in `lib/commerce.js`).
- **Page:** Spectrum 2 (`@react-spectrum/s2`) inside the lib's shell: Scope
  picker (Default Config, then websites and store views from the synced tree), tabs,
  Settings sections with "Use Default" per field on a non-default scope, Save/Cancel;
  Status & sync = today's health, Sync records, Take offline, Reset.
  `index.css` shrinks to page layout.

### ERP (`demo-erp`)

Nothing for steps 1–5.

### Demo Builder

Docs only (`docs/systems/erp-integration.md`), unless the encryption-key check fails.

## Steps

Each step: tests first, then code, both repos' checks, then a local or live check as named.
Commits and deploys wait for the owner.

1. **Settings store.** Schema in `app.commerce.config.ts`; `npm install` regenerates the
   configuration extension; `lib/settings.js`; `erp/settings` action. Tests: defaults on
   failure, cache, PATCH/clear. Live: deploy, sync scopes, read and write one value at a
   website, confirm inheritance, confirm the deploy with no encryption key.
2. **Read the real payloads without more orders.** Admin ▸ System ▸ Webhooks ▸ Webhooks List
   (the cart hooks' default payload) and the event's field list; confirm
   `sales_order_save_commit_after` is on the store's supported events list. Remove the temporary
   payload logging from Bodea (a redeploy of the pushed code).
3. **Orders by event, settings switches.** The order event and `order-commerce/created`
   (new-order check, ERP-number guard, `orders_send`, write-back, 5xx/4xx by
   `orders_hold_offline`); retire the order webhook (unsubscribe, then remove); cart hooks gated
   and re-subscribed; status on confirm. Tests per switch, on and off, and for a repeated
   delivery. Live: an order reaches the ERP and its number appears on the Commerce order; with
   the ERP offline and hold on, the order arrives after the ERP is back; with send off for the
   Bodea website, nothing is sent; confirming in the ERP marks it Processing.
4. **The page.** Spectrum 2 page in Live Search's layout: Scope picker (Admin website
   hidden: its codes collide with store codes in lib-config's storage), tabs, Settings form,
   Status & sync.
   Local: render against a stand-in for `erp/settings` and `erp/status`. Live: open it in
   Commerce Admin next to Live Search and compare.
5. **Docs and reversibility.** The erp-integration doc: settings survive a reset; unassociating
   in App Management wipes them; uninstall before undeploy; how to see successful webhook and
   event calls (Developer Console ▸ App Builder Logs).
6. **Sales channels** (separate). The mirror reads each product's website ids and the
   websites; the ERP stores `channels` per product (contract change); the product grid gets
   a Sales channel filter (default All channels) and a Channels column; the product page a
   Sales channels card.

## Risks

- Settings reads add a Files read per call; the 60 s container cache and defaults-on-failure
  keep the one-second cart webhooks safe. Measure at step 1.
- The write-back saves the order and fires the event again; the new-order check and the
  ERP-number guard stop a loop. Step 3 checks it live.
- A registration that keeps failing for a day is marked unstable, then disabled until
  re-enabled by hand; an ERP left offline that long needs that step.
- Whether `sales_order_save_commit_after` is on this store's supported events list is checked
  at step 2.
- S2 styles come from the `style` macro; confirm Parcel runs it in the production build at
  step 4.
