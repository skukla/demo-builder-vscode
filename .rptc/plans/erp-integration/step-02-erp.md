# Step 02 — The ERP repository

A public repository (`skukla/…`, name at plan review), a plain App Builder app in the demo's
project and workspace (`kind: system`, decision 13), built to Adobe's App Builder standards with our tooling (decision 16). Nishant Kapoor's
`agilent-erp-mock` (Apache-2.0) is the reference: its `lib/db.js`, `pricing.js`,
`order-payload.js`, `sequence.js`, `write-back.js` are READ first and carried over only
where they meet the bar (paging, error handling, no credentials in code, tests); the Agilent
CSV, the two hard-coded companies, the configurator and the quotes do not come over.

## Layout (runtime manifest at the root, so the spine can rename its package)

```
app.config.yaml            application.runtimeManifest.packages.erp (renamed per component)
actions/                   thin HTTP wrappers, require-adobe-auth: true (decision 12)
lib/                       the logic, testable without credentials
web-src/                   the ERP screen (React Spectrum), hosted static
test/                      node --test over lib/
```

## Records (App Builder Database, one collection each; SAP names, plain fields)

| Collection | What | Key |
|---|---|---|
| `materials` | mirrored products: material number (= SKU), description, list price, unit, stock, plant. Every import from Commerce overwrites what it carries; the ERP's own edits are demo moves that flow to Commerce and come back | SKU |
| `businessPartners` | mirrored companies: partner number, name, sales org, credit limit, credit used, blocked, payment terms; `commerceCompanyId` | partner no. |
| `pricingConditions` | contract prices per partner × material, max-discount ceiling per material and per partner × material | composite |
| `salesOrders` | ERP order: number (monotonic counter, never rewinds), partner, lines, status (created → confirmed → shipped → invoiced), `commerceOrderId`, `commerceIncrementId` | order no. |
| `settings` | display name (from `ERP_DISPLAY_NAME`; a redeploy with a new name renames the ERP unless it was renamed on screen), offline switch, last import / last wipe stamps | singleton |
| `outbox` | what changed that Commerce should hear about; drained and acknowledged by the integration | uuid |
| `counters` | order-number sequence | — |

## API (as built; one runtime package `demo-erp`, every action `require-adobe-auth` + `include-ims-credentials`)

| Action | Routes |
|---|---|
| `health` | `GET` — name, offline, counts, last import/wipe. Answers while offline (the flag is in the body). |
| `settings` | `GET`, `PATCH { displayName?, offline? }` |
| `admin` | `POST /wipe` (every collection but `settings` and `counters`), `POST /import { materials[], partners[], projectName? }` (bulk upsert; ERP-owned fields survive a re-import; creates the default partner) |
| `materials` | `GET`, `GET /:sku`, `PATCH /:sku { listPrice?, stock? }` → outbox `material.price` / `material.stock` |
| `partners` | `GET`, `GET /:id`, `PATCH /:id { creditLimit?, blocked?, paymentTerms? }` → outbox `partner.creditLimit` / `partner.blocked` (carry `commerceCompanyId`) |
| `pricing` | `GET` conditions, `POST` a condition (`contractPrice` / `contractDiscount` / `maxDiscount`), `DELETE /:id`, `POST /quote { partnerId? | commerceCompanyId? | customerGroupId?, lines:[{sku, qty}] }` — resolves the partner in that order, else the default partner |
| `orders` | `GET`, `GET /:number`, `POST { commerceOrderId, commerceIncrementId?, partnerId?, lines, currency?, total? }` (201, idempotent → 200 with the same number), `POST /:number/status { status }` → outbox `order.status` |
| `outbox` | `GET` pending (oldest first), `POST /ack { ids[] }` |

While `settings.offline` is true every record route answers `503 ERP_OFFLINE`; health, settings and
admin keep working (so a reset can run while the ERP is switched off). Errors: `{ status:'ERROR', errorCode, errorMessage }`.

## The screen (web-src)

Dashboard (counts, last import, offline switch, display name), Materials (edit price and
stock), Business partners (credit limit, block), Sales orders (change status), Pricing
conditions (view; edit contract price and ceiling), Settings. Title = display name from
settings (decision 10). No reset button here: reset is the integration's (decision 11); the
screen shows "last reset" only.

## Tests first

`lib/` under `node --test`: pricing (contract price, ceiling, the fallback when a partner
is unknown), order payload mapping, counter monotonic across wipe, outbox emit + ack, import
idempotency (same SKU twice updates once). The actions are wrappers; one smoke per route
against an in-memory db fake.

## Done when

The app deploys to a scratch workspace by hand (`aio app deploy`), the screen opens with
the display name, a bulk import lands, an order posts and gets a number, a price edit
appears in the outbox, offline makes `/health` answer 503.

## Result (2026-09-14)

Built in `skukla/demo-erp` (scratchpad clone; not yet committed or pushed — waiting for "commit").
32 tests under `node --test`. Deployed by hand to a scratch workspace created through the Console
SDK (with `createRuntimeNamespace`, the fix the spike found), smoke-tested live, undeployed, workspace
deleted:

- import → contract quote (25% off for the mirrored company) → order `0000001000` → same Commerce
  order again answers the same number → confirmed → stock edit → two outbox entries → acked →
  offline makes `materials` answer 503 → wipe → the next order is `0000001001` (counter kept).
- The screen opened inside the Experience Cloud shell, signed in with the owner's session, showed
  "Scratch ERP", Online, and the smoke test's counts. Opened at its bare static URL it says where
  to open it instead (no token there).

Two facts learned by deploying, both now pinned in code and tests:

1. **App Builder Database `findOne` with no match is a FAILED request**, not `null`:
   `DbError: Request … to v1/collection/settings/findOne failed: Document not found` (aio-lib-db
   1.0.3). Every handle the ERP uses goes through `lib/db.js` `wrapCollection`, which turns that
   one failure into `null`; the in-memory test double throws the same error so the suite exercises
   the wrapper. The first deploy 500'd on every route because the double had returned `null`.
2. **The shell URL for "Open ERP"** is
   `https://experience.adobe.com/?devMode=true#/custom-apps/?localDevUrl=<static index.html>`
   (printed by `aio app deploy`). On the FIRST load the shell redirected to `#/@<org>/custom-apps/`
   and dropped `localDevUrl`, leaving a blank frame; the second load kept it and rendered. The
   flyout's "Open ERP" should use the org-qualified form
   `#/@<orgSlug>/custom-apps/?localDevUrl=…` when the org slug is known (verify in step 05).

Credit: the request-parsing helper is adapted from `agilent-erp-mock` by **Nishant Kapoor** (the
repository is hosted under jogosset; its package.json declares Apache-2.0, there is no LICENSE
file). `NOTICE` names him and Adobe (the shell loader is the generator template's, unchanged).
