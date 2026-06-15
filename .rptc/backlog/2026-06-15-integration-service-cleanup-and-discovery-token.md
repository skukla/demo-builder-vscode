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

## Effort 1b — SUPERSEDED (do not execute as a standalone cleanup)

**Status: superseded 2026-06-15 by the "Attach App Builder projects" feature below.**

1b was going to remove the residual `appBuilder` *selection-field* plumbing that Effort 1
deliberately left behind: `ComponentSelection.appBuilder` (webview.ts/base.ts/messages.ts/
handlers.ts ProjectConfig), `componentDataHelpers.findComponentById`, the wizard
(`wizardHelpers`, `useWizardState`), review (`reviewStepHelpers`, `ReviewStep`), configure
(`configureTypes`/`configureHelpers`/`useSelectedComponents`), `executor`, `projectResetService`,
`settingsFile.ts`, plus ~12 test files (~50 files total). It is always-empty/harmless today.

**Why superseded:** the owner expects a fast-follow feature to attach one or more App Builder
projects to any project. That plumbing is exactly the multi-select scaffolding the feature needs.
Removing it now and rebuilding it in weeks is pure churn. So **do not run 1b** — repurpose the
plumbing instead (see the feature seed below). If the feature is shelved, 1b can be reinstated.

## Feature seed — Attach App Builder project(s) to any project

**Provenance:** anticipated fast-follow (raised 2026-06-15) after the `integration-service` /
`appBuilderApps` removal (Effort 1). Effort 1 cleared the *dormant, curated, single-entry*
catalog (`appBuilderApps` registry section + hardcoded `integration-service` + `getAppBuilder` +
the `appBuilder` registry category + the executor `app-builder` install branch + predicate
appBuilder gating). This feature is a fresh, GENERAL build, not a revival of that mechanism.

**Goal:** let a user attach 1+ App Builder projects to any demo project (the prior model was a
curated catalog with one dormant entry; the new model is user-supplied/multi-select).

**Reuse vs. rebuild:**
- REUSE (the residual 1b plumbing): `ComponentSelection.appBuilder` multi-select set threaded
  through wizard → review → configure → state/settings. This is most of the UI/state scaffolding.
- REBUILD (removed in Effort 1, in a more general form): an `appBuilder` registry/category OR a
  user-supplied "attached app-builder projects" concept; a `getAppBuilder`-style accessor;
  re-include app-builder in `projectAppBuilderPredicate` so the IMS Developer/System-Admin role
  check fires when a project is attached; an executor install/deploy path for the attached
  project(s).

**Key design decision to settle first:** where do available App Builder projects come from?
(a) a curated registry list (like the old catalog), (b) the user points at their own Console
project / git repo, or (c) both. This drives whether any catalog concept returns or it's purely
user-supplied. The user's "attach your own 1+" framing leans toward (b).

**Watch-outs:**
- `projectAppBuilderPredicate` is currently mesh-only — re-add the app-builder path (Developer-role
  gating). Both call sites (`deployMesh`, `executor`) already fail-closed via
  `testDeveloperPermissions()`.
- The `'app-builder'` type label in `executor`/`projectResetService` `buildComponentList` currently
  tags ADDONS, not app-builder apps — disambiguate when wiring real app-builder install/deploy.
- Deployment: attached App Builder projects need `aio app deploy` against the right workspace;
  reconcile with the existing mesh/app-builder Developer-role + workspace gating.

**Kickoff prompt:**
`/rptc:research "Design a feature to attach one or more user-supplied App Builder projects to any
demo project — selection (reuse ComponentSelection.appBuilder plumbing), registry-vs-user-supplied
source decision, Developer-role gating via projectAppBuilderPredicate, and install/deploy. See
.rptc/backlog/2026-06-15-integration-service-cleanup-and-discovery-token.md (Feature seed)."`

## Effort 2 — Store-discovery least-privilege token (GATED: after the App Builder attach feature)

**Sequencing (decided 2026-06-15):** do the App Builder attach feature FIRST, then Effort 2.
Effort 2's clean case depends on store discovery being the *sole* admin-credential consumer. The
attach feature likely re-introduces admin-cred consumers (attached App Builder projects that call
Commerce admin APIs, as the old integration-service did via `lib/commerce/auth.js`). Settle that
feature's credential model before swapping discovery to a token — otherwise this is churn (swap to
token, then need admin user/pass back) or a half-measure (token + user/pass coexisting). Revisit
the "sole consumer" premise once the attach feature lands.

Once store discovery is confirmed the sole admin-cred consumer, a scoped
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
