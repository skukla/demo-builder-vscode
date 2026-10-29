# A second project's ERP integration on a store that already has one (AB-78)

Researched 2026-10-15 from code and Adobe docs. No live test. VERIFIED means the code
or doc was read; CLAIMED means a record or comment says so.

## Verdict

Possible, but harmful. On `loop/2026-10-05-release-candidate` the second install
damages the first. With `c914f8cd7` (branch `fix/first-copy-commerce-app-id`, not
merged) the two installs are separate but still conflict. Recommendation: refuse the
add early and point the SC to the project that already runs the integration.

## Can two installs exist?

- Commerce identifies the app by `metadata.id` (`commerce-erp-integration/app.commerce.config.ts`),
  default `commerce-erp-integration`. Webhook names are prefixed with it; event
  provider instance ids are `{appId}-{key}-{workspaceId}`. VERIFIED.
- On HEAD only COPIES get their own id (`commerceAppId.ts`, `deployInputs.ts`), so the
  first ERP integration in every project shares the default id. VERIFIED.
- Live, 2026-10-08 (AB-69 log): the second install skipped its subscriptions, the
  placement webhook kept pointing at the first workspace, and one project's uninstall
  emptied webhooks and subscriptions for both. CLAIMED.
- `c914f8cd7` slugs the first integration's id from the ERP name; two projects using
  the same ERP name would still collide. VERIFIED (commit message).
- Nothing stops it: `pairWithSameErpElsewhere.ts` skips projects with a different
  `adobe.projectId`. VERIFIED.
- Adobe docs: a store can hold several event providers (events/api, VERIFIED); webhook
  `category` exists for conflict resolution between apps and App Management only warns
  (app-management/installation/webhooks, CLAIMED). Admin UI SDK docs are silent.

## Conflicts if both are installed with different ids

1. `set-event-provider.js` sets the store's event provider only for the default id, and
   clears it on uninstall. With `c914f8cd7` a fresh store's first install would not
   set it, and A's uninstall may stop B's events. Fix before merging that branch.
2. Both apps subscribe to order save; `order-sync.js` skips orders that already carry an
   `ext_order_id`. With "All products" rules both claim every order and one ERP
   silently gets nothing. VERIFIED.
3. Two placement webhooks on one method; the sandbox runs every webhook as required, so
   a stale one (deleted workspace) blocks checkout for both projects.
4. Admin shows two of everything: menu entries, "ERP order"/"ERP parts" grid columns,
   the ERP parts button, the Move stock mass action.
5. Both write tier prices and company fields into the same shared data; each reset
   reverts the other's writes. CLAIMED (AB-15).
6. Admin settings do not collide (per-app config storage). VERIFIED.

The supported shape already exists: one integration serving several ERPs on a store.

## Where the early refusal goes

Before any workspace is made, beside the three `replaceDeployedElsewhere` call sites:
`appBuilderComponentAdd.ts` (above `recordApiPicks`), `erpAddHandler.ts`,
`executorAppBuilderPhase.ts`.

- (a) Local projects: a pure finder beside `pairWithSameErpElsewhere.ts`, matching on
  `deriveCommerceTarget(other).commerceBaseUrl` instead of the Adobe project. Refuse,
  name the other project. Never auto-remove: that would undo another project's store.
- (b) Ask Commerce (read-only `V1/webhooks/list`, `V1/eventing/eventProvider`) to catch
  projects on other machines. Open: which credential can call Commerce before B has a
  workspace.

## Sources

- https://developer.adobe.com/commerce/extensibility/events/api/
- https://developer.adobe.com/commerce/extensibility/webhooks/api/
- https://developer.adobe.com/commerce/extensibility/app-management/installation/webhooks/
- https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/configuration/
