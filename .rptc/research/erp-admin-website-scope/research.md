# Why the ERP Admin page offers only "Default Config", and how website scope should work

Date: 2026-09-26. Report only. No code changed, no live endpoint called.

Repo abbreviations used below:
- `INT` = `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/commerce-erp-integration` (at `2d725ba`)
- `LIB` = `INT/node_modules/@adobe/aio-commerce-lib-config/dist/es/index.mjs` (version 1.8.0)
- `APP` = `INT/node_modules/@adobe/aio-commerce-lib-app` (version 2.0.0)

Every claim is labelled **read** (I opened the source or page) or **inferred** (my reasoning from what I read).

## Answer first

**The websites are there. The page throws them away.** The library stores the scope tree
nested: `Global`, then a `Commerce` node whose CHILDREN are the websites, whose children are
the stores, whose children are the store views. The page's picker only looks at the top
level of that tree, drops `global` and `commerce`, and so has nothing left but its own
"Default Config" entry. The unit tests did not catch it because their fixtures invent a
flat tree the library never returns.

Two smaller defects sit next to it and will show up the moment the picker is fixed:
the "Inherited" badge will be wrong at every website/store view, and the picker reads a
`name` field the library does not have.

## 1. The path, end to end

| Step | What happens | Where |
|---|---|---|
| Page opens | `MainPage` calls `api.settings()` once with no scope and keeps `page.scopes` | read: `INT/src/commerce-backend-ui-2/web-src/src/pages/main-page.jsx:42-52` |
| HTTP | `GET /api/v1/web/erp/settings` with the Admin's IMS token | read: `INT/src/commerce-backend-ui-2/web-src/src/api.js:11-21,49-50` |
| Action | `settings` GET returns `settingsPage(params, scope)` | read: `INT/src/commerce-extensibility-1/actions/erp/settings/index.js:25-29` |
| Scopes | `settingsPage` calls `settingScopes(params)` | read: `INT/src/lib/settings.js:224-225` |
| Sync decision | `getScopeTree()`; if any ROOT node has a level other than `global`, return it; otherwise `syncCommerceScopes(...)` with IMS auth and the Commerce base URL | read: `INT/src/lib/settings.js:196-215` |
| Picker | `scopeChoices(tree)` filters the ROOT nodes only: drops `global` and `commerce`, drops code `admin`, labels with `node.name ?? node.code` | read: `INT/src/commerce-backend-ui-2/web-src/src/settings-view.js:41-51` |
| Render | Spectrum `Picker` over those choices | read: `INT/src/commerce-backend-ui-2/web-src/src/components/page-shell.jsx:38-62` |

**When is `syncCommerceScopes` called?** Only from `settingScopes`, i.e. on the first
settings GET after install (or any GET where the tree has no non-global root). Read:
`INT/src/lib/settings.js:204-214`. It is NOT called at install: the only custom
installation step names the event provider (read: `INT/app.commerce.config.ts:385-395`).
The `refresh: true` path exists in `settingScopes` but no action exposes it (read:
`settings/index.js:19-47` passes no refresh flag).

## 2. What the library actually does

**Where the tree lives.** A JSON file `aio-commerce-config/scope-tree.json` in the app's
own `aio-lib-files` storage, with a cached copy in `aio-lib-state` under
`aio-commerce-config:scope-tree` (default TTL 300 s). Read: `LIB:288` (namespace),
`LIB:857,874` (state key), `LIB:898-918` and `LIB:958-964` (file path and read),
`LIB:2004-2014` (cacheTimeout 300). Inferred: storage is per Runtime namespace, so per
App Builder workspace. The page's actions (`commerce-extensibility-1`) and App
Management's own `scope-tree` action (`commerce-configuration-1`) are one app, so they
share it (read: `INT/src/commerce-configuration-1/ext.config.yaml:11,29-30` deploys
`app-management/scope-tree`).

**What an empty tree looks like.** One root node, code `global`, level `global`, label
"Global". Created and saved on first read. Read: `LIB:945-955`, `LIB:908-911`.

**How a sync fills it.** Three Commerce REST reads in parallel: `store/websites`,
`store/storeGroups`, `store/storeViews` (read: `LIB:1355-1402`). Websites become
`level: "website"`, store groups `level: "store"`, store views `level: "store_view"`,
each nested under its parent by `website_id` / `store_group_id` (read: `LIB:1455-1517`).
The websites are then placed as `children` of ONE root node with code `commerce`,
level `commerce`, label "Commerce", which sits BESIDE `global` at the root (read:
`LIB:1597-1614`). Node ids are UUIDs, kept across re-syncs by matching `commerce_id` and
level, so saved values survive a re-sync (read: `LIB:1455-1467,1519-1530`).

So a synced Bodea tree is (inferred from the code above and the owner's store list):

```
[ global,
  commerce ─┬─ website base      ─ store main_website_store ─ store views…
            ├─ website (id 2)    ─ store citisignal_store    ─ …
            ├─ website bodea     ─ store bodea_store         ─ …
            ├─ website evo       ─ store evo_store           ─ …
            └─ website admin(0)  ─ store default(0)          ─ store view admin ]
```

**Credentials.** `syncCommerceScopes(commerceConfig)` takes a Commerce HTTP client config;
ours passes IMS server-to-server auth from the action's inputs and the base URL from
`getCommerceInstance()` (read: `INT/src/lib/settings.js:188-194`; the settings action has
the `AIO_COMMERCE_AUTH_IMS_*` inputs, read:
`INT/src/commerce-extensibility-1/actions/erp/actions.config.yaml:53-66`). A failed
Commerce read is NOT thrown by the library: it returns the old tree plus `error`
(read: `LIB:1655-1685`, `LIB:2050-2062`). Our code turns that `error` into a thrown error
(read: `INT/src/lib/settings.js:211-213`), which the page shows as
"Scopes could not be read: …" (read: `main-page.jsx:51`).

**Inheritance.** A value is read along the path store view → store → website → commerce,
then `global` is merged if it was not on the path, then schema defaults (read:
`LIB:492-506`, `LIB:595-620`, `LIB:640-650`). Each value's `origin` is an OBJECT
`{ code, level }` (read: `INT/node_modules/@adobe/aio-commerce-lib-config/dist/es/index.d.mts:222-237`).

**Storage is keyed by scope CODE only**, not code plus level:
`scope/<code>/configuration.json` (read: `LIB:969-972`). Commerce codes are unique only
within a level. Inferred: a website and a store view with the same code share one values
file. The page already hides code `admin` for this reason (read: `settings-view.js:9-10`).
On Bodea, store group `default` (id 0) and store view `default` (id 1, if it exists) would
collide (inferred; I could not read Bodea's store view codes).

**Store level is read-only in Adobe's model.** Store groups are built with
`is_editable: false`; websites and store views `true` (read: `LIB:1465,1489,1511`). The
library does not enforce it on write (read: only builders and validation mention
`is_editable`), so App Management's UI presumably does (inferred).

**Does anything sync automatically?** In `lib-app`, only the `scope-tree` action's
`POST /commerce` route calls `syncCommerceScopes`; nothing in installation does (read:
`APP/dist/es/actions/scope-tree/index.mjs:90-129`; grep of `APP/dist/es` finds no other
caller).

## 3. What Adobe's docs say

- read (https://developer.adobe.com/commerce/extensibility/app-management/configuration-schema/):
  the tree is "Global, Commerce websites, stores, and store views"; it "reflects Adobe
  Commerce scope structure as of the last sync. It is not kept in lockstep"; App
  Management "does not refresh the scope hierarchy by itself"; the merchant syncs per app
  via "Manage Scopes → Quick actions → Sync commerce scopes"; a sync removes scopes deleted
  in Commerce; `getScopeTree`, `syncCommerceScopes`, `unsyncCommerceScopes`,
  `setCustomScopeTree` are callable directly. Custom scopes are "identified by code only".
  Runtime reads are shown with `byWebsiteId`, `byStoreViewId`, `byCodeAndLevel`.
- read (https://developer.adobe.com/commerce/extensibility/app-management/troubleshooting/):
  new websites missing from Manage scopes means the tree needs a manual sync.
  The fetch tool's summary also said "Neither installation nor association automatically
  syncs"; treat that sentence as the tool's paraphrase, not a quote (it matches the lib
  source above).
- could not find: the Admin menu path to the business-config form, or any statement of
  inheritance order, on either page.

## 4. The cause, with evidence

(a) **Primary, certain from code.** `scopeChoices` walks only the root array
(read: `settings-view.js:42-44`). After any successful sync the root is `[global, commerce]`
(read: `LIB:1597-1607`). Both are filtered out. Result: `[Default Config]`. This happens
whether or not the sync worked.

(b) **Why the tests passed.** `test/web/settings-view.test.js:35-41` hands `scopeChoices` a
FLAT tree with `name` and level `storeView`. The library returns a nested tree with
`label` and level `store_view`. `test/lib/settings.test.js:27-29` mocks the sync as
`[...scopes, { code: "commerce", level: "commerce" }]` with no children. Both are shapes
nobody captured from the library. Read, both files.

(c) **Also possible, not established.** If the first sync failed, the page shows an error
banner and the picker still shows only Default Config. The owner did not mention a banner.
I did not call the live action, so I cannot say which happened. Cause (a) is enough on
its own.

(d) **Hidden by (a), will surface next.**
- `dressField` compares `held.origin !== scopeLevel`: an object against a string, so
  every value at a website or store view shows "Inherited" and Use Default is never
  offered there (read: `INT/src/commerce-backend-ui-2/web-src/src/mapping-view.js:437-440`;
  web fixtures use string origins, `test/web/mapping-view.test.js:63-66`).
- Level names: the page documents `'storeView'`; the library says `store_view`
  (read: `mapping-view.js:498`; `LIB:1515`).
- Label: the page reads `node.name`; the library sets `label` (read: `settings-view.js:47`;
  `LIB:1470`). Without a fix every choice shows its code, not its name.
- Once the tree has a `commerce` root, `hasCommerceScopes` is true forever, so a website
  added later never appears on this page (read: `INT/src/lib/settings.js:196-209`).
- Silent fallback: runtime reads (`settingsFor` by store view, `websiteSettings` by
  website code) fall back to Default Config when the scope is unknown to the tree, with
  only a warn log (read: `INT/src/lib/settings.js:134-174`). Inferred: an unsynced or
  stale tree makes per-website overrides silently not apply at checkout.

## 5. Options to fix

Fixes 1 is needed in every option. The rest is about keeping the tree current.

| # | Option | Good | Cost / risk |
|---|---|---|---|
| 1 | Flatten the tree in `scopeChoices` (depth-first under `commerce`, indent by level), use `label`, use `store_view`, compare `origin.level` (and `origin.code`) in `dressField`. Replace the invented fixtures with a tree captured from a real sync, in a typed or captured fixture | Fixes what the owner saw | Small. Tests must move to the real shape |
| 2 | Keep "sync once on first load", add a **Refresh websites** button that calls the settings action with `refresh=true` (the lib path already exists) | Merchant-controlled, matches Adobe's own "Sync commerce scopes" action, one extra read of 3 endpoints | Stale until someone clicks; needs the action to accept the flag |
| 3 | Sync on every page load | Always current | 3 Commerce reads and a file write per page open; slower page; a Commerce outage shows an error banner on every open (the lib returns the old tree, our code throws) |
| 4 | Sync at install (a custom installation step) | Tree ready before first open | Only covers install time; Adobe explicitly does not do this; one more step to undo on uninstall |
| 5 | Rely on App Management's "Sync commerce scopes" | Nothing to build; same storage (inferred) | Merchant must know a second screen exists; does not fix item 1 |

Recommendation (inferred): 1 + 2, plus treat a sync `error` as a warning that keeps the
old tree instead of failing the page. Hide store groups (level `store`) from the picker to
match Adobe's `is_editable: false`, or keep them if the owner wants them; say which.

Reversibility: a sync writes only the app's own tree file and cache; `unsyncCommerceScopes`
removes the `commerce` node (read: `LIB:2084-2092`). Values saved at a scope later deleted
in Commerce stay as orphan files under `scope/<code>/` (inferred; no cleanup code found).

## 6. Website scope with several ERP targets

Context: the owner decided one integration serving several ERP targets
(read: `demo-builder-vscode.worktrees/feature/erp-integration/.rptc/backlog/2026-09-17-erp-integration-several-erps.md`,
"DECIDED 2026-09-24"). Its stored-shapes table puts `orders_*` integration-wide,
`pricing_*` per target, `structure_sales_org*` per target per scope, `structure_owns*`
per target.

**An ERP should not own websites.** (inferred) The customer story is an M&A company that
sells products from several ERPs through ONE online catalogue (read: same backlog item,
"Why anyone runs several ERPs"). One website therefore carries lines for several ERPs.
Ownership belongs to products (source or attribute rule), and the order is split by line.
Websites stay Commerce's. What varies per website is "which sales organisation, in each
ERP, sells on this website" (read: business-structure research
`.rptc/research/erp-business-structure/research.md:360-382`: sales org ↔ website, one per
ERP).

Where each setting should live (inferred):

| Setting | Scope | Why |
|---|---|---|
| The target list (name, address, prefix, ownership rule) | integration-wide, not per website | A target is a system, not a Commerce place |
| `orders_send`, `orders_hold_offline`, confirm status | per website / store view, integration-wide | "Do we sync orders from this website at all" is a Commerce question |
| `structure_owns*` (which products an ERP owns) | per target, global only | Product ownership does not change by website |
| `structure_sales_org*` | per target × per website | The one true cross-product |
| `pricing_*` | per target, optionally per website | Each ERP prices its own products |

**The mechanism problem.** `lib-config` stores flat named fields per scope, from a static
schema (read: `INT/src/lib/settings.js:25`; schema read from `app.commerce.config.ts`).
There is no "per target" axis. Three ways to add one (inferred):

1. **Fixed target slots** in the schema (`structure_sales_org_1`, `_2`, …). Uses the
   existing picker and inheritance. Caps the number of ERPs; the backlog item already names
   this cost.
2. **One text field per website holding a small map** (`ACME=1000, GLOBEX=EU01`). Unlimited
   targets, keeps website inheritance. Needs a parser and validation; ugly in App
   Management's own form.
3. **Keep the target list and per-target values in the integration's own store** (files or
   state), keyed by target, and use `lib-config` only for Commerce-scoped switches. Clean
   model; loses the free scope inheritance and App Management's form for those values.

Custom scopes (`setCustomScopeTree`) look tempting as "one scope per ERP", but a custom
scope is identified by code only and has no level (read: configuration-schema page), and
it cannot be crossed with a website, so it cannot hold "sales org of ERP X on website Y"
(inferred).

## 7. Open questions for the owner

1. Should the picker offer store groups ("store" level)? Adobe marks them non-editable.
2. Refresh button only, or also sync on each page open?
3. For several ERPs: fixed slots (simple, capped) or a target-keyed store (open-ended)?
4. Is a website ever sold through ONE ERP only, so a "this website's ERP" setting is
   enough? Or always split by product, as the M&A story says?
5. Should the page warn when a website has no sales organisation for an ERP that owns
   products sold there?

## 8. What I could not establish

- Whether the first live sync on Bodea succeeded (no live read made).
- Bodea's store view codes, so whether a code collision exists today.
- The Commerce Admin menu path to App Management's own configuration form (not on the
  pages fetched).
- Whether App Management's Manage Scopes UI reads the same file our page writes. Inferred
  yes (same app, same namespace, same library namespace constant); not observed.
- Adobe's docs on inheritance order; the order above comes from the library source only.
