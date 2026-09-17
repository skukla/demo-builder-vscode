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
   React Spectrum v3, which Live Search uses (read from the live admin 2026-09-17), inside the
   S2 shell `@adobe/aio-commerce-lib-admin-ui` requires.
4. **Sales channels** (Commerce websites as SAP distribution channels) are a separate, later
   step: step 6.

Why not Stores ▸ Configuration itself: that page is built from PHP modules' `system.xml`, and
Adobe Commerce as a Cloud Service takes no custom PHP. The installed admin UI library
(1.0.1) extends menus, pages, grid columns, mass actions and order-view buttons only. App
Management's own form for `businessConfig` opens outside Commerce Admin.

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
- **order-create:** skip when `orders_send` is off. On a failed or offline ERP answer, with
  `orders_hold_offline` on, store the ERP order in State (`erp-held-order.<key>`) and answer
  the fallback. The fallback message is corrected to say the order is held for the ERP.
- **Held orders:** the minute timer's job also sends held orders; a sent order gets its ERP
  number written with `POST orders` (`ext_order_id`), and leaves State. `erp/status` reports
  the count; `erp/reset` clears them.
- **item-prices / discounts:** skip when the setting is off.
- **order/external/updated:** with `orders_status_on_confirm` on, the comment also sets
  status `processing` (the unused `orders.comment(..., status)` in `lib/commerce.js`).
- **Page:** React Spectrum v3 (`@adobe/react-spectrum`) inside the lib's S2 shell: Scope
  picker (Default Config, then websites and store views from the synced tree), tabs,
  Settings sections with "Use Default" per field on a non-default scope, Save/Cancel;
  Status & sync = today's health, held orders, Sync records, Take offline, Reset.
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
2. **Capture real webhook payloads.** Log the payload's key names (not values) in
   order-create and item-prices for one live cart and order; confirm `store_id` (store view
   id) is there. Remove the logging after.
3. **Behaviour switches.** order-create send/hold, held-order sender on the timer, fallback
   message, item-prices and discounts gates, status on confirm. Tests per switch, on and off.
   Live: turn the ERP offline, place an order, see it held; turn it online, see it sent and
   its ERP number on the Commerce order; confirm an order in the ERP, see Processing.
4. **The page.** Spectrum v3 page, Scope picker, tabs, Settings form, Status & sync.
   Local: render against a stand-in for `erp/settings` and `erp/status`. Live: open it in
   Commerce Admin next to Live Search and compare.
5. **Docs and reversibility.** Reset clears held orders; settings survive a reset and are
   listed in the erp-integration doc (what removing the integration leaves in the
   namespace).
6. **Sales channels** (separate). The mirror reads each product's website ids and the
   websites; the ERP stores `channels` per product (contract change); the product grid gets
   a Sales channel filter (default All channels) and a Channels column; the product page a
   Sales channels card.

## Risks

- Settings reads add a Files read per call; the 60 s container cache and defaults-on-failure
  keep the one-second cart webhooks safe. Measure at step 1.
- A replayed order's key: the before-place hook may have no `entity_id`; the held copy keys
  on the quote id and is matched to the placed order by increment id when sent.
- Writing `ext_order_id` with `POST orders` is used today but never checked live on this
  platform; step 3 checks it.
- React Spectrum v3 inside the S2 provider: two providers, two stylesheets; check the
  bundle size and that the page's fonts and tokens come from v3 at step 4.
