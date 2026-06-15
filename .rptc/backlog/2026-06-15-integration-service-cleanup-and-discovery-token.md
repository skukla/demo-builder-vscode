# integration-service / appBuilderApps cleanup + store-discovery least-privilege token

## Provenance

Surfaced 2026-06-15 while fixing the store-discovery credential race
(`feature/store-discovery-creds-payload`). The fix shipped credentials in the
`discover-store-structure` payload and removed the dead `sync-component-configs` cache.
A follow-on question — "should discovery use a scoped token instead of admin
username/password?" — led to investigating downstream admin-credential consumers.

Two deferred efforts came out of that investigation. They are sequenced: **cleanup → token.**

## Research findings (consumer map for admin username/password)

`ADOBE_COMMERCE_ADMIN_USERNAME` / `ADOBE_COMMERCE_ADMIN_PASSWORD` are declared `required`
on the `adobe-commerce-paas` backend and written to the project `.env`. Who actually reads them:

| Consumer | Uses admin user/pass? | Notes |
|---|---|---|
| API Mesh (`headless-commerce-mesh`) | No | `.env.example` has none; mesh `Authorization` is request-header passthrough |
| Headless storefront | No | URL + store codes + `ADOBE_CATALOG_API_KEY` + `MESH_ENDPOINT` only |
| `commerce-demo-ingestion` (via ToolManager) | No (in practice) | builder configures it with `ACO_*` creds; ingestion methods have no live callers (only cleanup is wired) |
| **Store discovery** | **Yes** | mints an ephemeral admin token via `POST /rest/V1/integration/admin/token` |
| **`integration-service`** (kukla-integration-service) | **Yes** | `lib/commerce/auth.js` hard-requires `COMMERCE_ADMIN_USERNAME/PASSWORD`; `app.config.yaml` injects them into deployed actions |

**Key nuance:** `integration-service` is **dormant** — the wizard's App Builder selection
section was removed (`ComponentSelectionStep.tsx`: "sections were removed"), it's in no demo
package, and `defaults.json` has `appBuilderApps: []`. But it is **not deleted**: the
`components.json` entry, the `kukla-integration-service` repo, the deployment predicate, and
the `useComponentSelection` hook capability all still exist. So today discovery is the only
*live* consumer, but a token swap is unsafe until integration-service's fate is decided.

## Effort 1 — Remove integration-service + the appBuilderApps mechanism (no soft deprecation)

`integration-service` is the **only** member of `appBuilderApps`, so removing it makes the
whole mechanism dead (same shape as the retired b2b feature-pack).

**Remove (~25 files):**
- `components.json`: `appBuilderApps.integration-service` def; the `appBuilderApps` list;
  `optionalComponents: ["integration-service"]` in the `eds-paas` + `headless-paas` stacks;
  the `AWS_ACCESS_KEY_ID/SECRET` env-var defs (grouped only under integration-service)
- `components.schema.json`: the `appBuilderApps` schema block
- `prerequisites.json`: the `integration-service` prerequisite
- `defaults.json`: the `appBuilderApps: []` field
- Code: `ComponentRegistryManager.ts` (appBuilderApps handling), `serviceGroupTransforms.ts`
  (group def), `useComponentSelection.ts` (`selectedAppBuilder`/`handleAppBuilderToggle`),
  `ComponentSelectionStep.tsx` (stale note), `types/components.ts` (`appBuilderApps` fields),
  `componentRepositoryResolver.ts`, `discoveryTools.ts`, `skillsWriter.ts`
- Tests: ~15 files (mostly `ComponentRegistryManager-*` + registry test utils)

**Must NOT remove:**
- `ADOBE_COMMERCE_ADMIN_USERNAME/PASSWORD` env-var **definitions** — still used by store discovery
- `projectAppBuilderPredicate.ts` — also serves **mesh** (keep; its `appBuilder` category just empties)

(Decide separately whether to also archive/retire the `kukla-integration-service` repo.)

## Effort 2 — Store-discovery least-privilege token (after Effort 1)

Once integration-service is gone, store discovery is the sole admin-cred consumer, so a scoped
**Commerce integration access token** (Bearer) can cleanly replace admin username/password:
- Replace the backend's `ADOBE_COMMERCE_ADMIN_USERNAME/PASSWORD` with e.g.
  `ADOBE_COMMERCE_API_TOKEN` (components.json, envVarKeys, serviceGroupTransforms, wizard fields)
- `StoreDiscoveryParams` / `DiscoverStoreStructurePayload` / `FetchStoresParams`: carry the token
- `commerceStoreDiscovery.ts`: use the token directly as Bearer; delete `getAdminToken` (no minting)
- `useAutoStoreDetect`: gate `autoDetectKey` on URL + token; pass the token
- The deferred-token NOTE in `edsHandlers.ts handleDiscoverStoreStructure` points here

Trade-off: least-privilege + no admin password at rest, at the cost of user setup (create an
integration in Commerce admin). Confirm no other future consumer needs admin user/pass first.

## Constraints

- Repo is public — no secrets in git history.
- `develop`-first; merge to `master` via the release process.
- No soft deprecation — delete outright, don't leave "(deprecated)" stubs.

## Kickoff prompt

`/rptc:feat "Remove the dormant integration-service component and the now-single-member
appBuilderApps mechanism (no soft deprecation), keeping the admin-cred env-var definitions
and the mesh-serving projectAppBuilderPredicate. Then, as a follow-up, replace PaaS store
discovery's admin username/password with a scoped Commerce integration token. See
.rptc/backlog/2026-06-15-integration-service-cleanup-and-discovery-token.md"`
