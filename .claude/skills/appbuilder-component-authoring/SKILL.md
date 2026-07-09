---
name: appbuilder-component-authoring
description: Author or extend App Builder catalog components (app-builder-components.json) and work with the deploy/subscribe spine — axis-filter semantics, the full-union subscription PUT, the guard chain, and the test pins that move. Use when adding/editing a catalog entry, touching apiSubscriber/reconcile logic, wiring anything to additionalConsoleApis, or debugging a component that deploys/subscribes wrongly.
---

# App Builder Component Authoring

Everything that runs when a catalog component is added, and the contracts that break
silently if you don't know them. Learned the hard way shipping the blank shell
(2026-07-09, `.rptc/plans/appbuilder-shell-app/`).

## The catalog (`src/features/project-creation/config/app-builder-components.json`)

- Entry shape: schema in `app-builder-components.schema.json`. `kind: 'mesh' | 'integration'`.
  **No runtime validation** — the loader (`appBuilderComponentCatalogLoader.ts`) is a plain
  cast; the schema is documentation plus one structural Jest test.
- **Omitted axes match EVERYTHING.** `compatibleBackends`/`compatibleFrontends` left out
  means the entry appears on every stack — including degenerate empty selections
  (`getAvailableAppBuilderComponents('','')`). Any code that treats "the axis-filtered
  catalog is non-empty" as a signal (e.g. "a mesh needs subscribing") MUST filter by
  `kind` first. This exact bug hit `ensureMeshApiSubscribed` when the axis-unrestricted
  shell landed: the mesh pre-deploy subscribe resurrected on meshless projects.
- Package scoping (`nativeForPackages`/`onlyForPackages`) matches **demo package ids**
  (`citisignal`, `isle5`, …), never storefront/stack ids. The auto-include side is
  dormant — see `.rptc/backlog/2026-06-17-appbuilder-app-package-bound.md` before
  touching it.

## The spine (what happens on add/deploy)

`addAppBuilderComponent` (`appBuilderComponentRunner.ts`): subscribe required APIs →
clone+install (`componentManager.installComponent`) → kind-dispatched deploy under
`withOrgContext` → persist `project.appBuilderComponents[id]` → republish if it
provides env vars. Creation Phase 3b (`executor.ts` `executeAppBuilderIntegrationsPhase`)
routes `selectedAppBuilderComponents` through the same runner but **filters
`kind === 'integration'`** — meshes deploy via the mesh phase/dual-flow; the filter is
what prevents double-deploys. Custom-URL entries synthesize via
`buildCustomIntegrationEntry`.

## The subscription contract (load-bearing)

- `subscribeRequiredApis` (`apiSubscriber.ts`) reconciles the **UNION** of catalog
  `requiredApis` + baseline (`AdobeIOManagementAPISDK`) + `Project.additionalConsoleApis`
  and **PUTs the full list** — the endpoint may replace, so anything omitted from ONE
  reconcile is silently stripped. If you add a new source of subscribed APIs, it must be
  persisted and unioned at EVERY call site: the runner deps wrapper
  (`appBuilderComponentRunnerDeps.ts`) and `ensureMeshApiSubscribed`.
- `additionalConsoleApis` is written by the `add_console_apis` MCP handler
  (`consoleApiHandlers.ts`), **only after a successful subscribe** — never persist an
  unverified code (it would poison every later reconcile with an unentitled service).
- Two credential paths by `platformList`: `apiKey` (AdobeID credential, workspace-scoped
  name) vs `oauth_server_to_server`. Free services subscribe with
  `{licenseConfigs: null, roles: null}`; product-profile services fail — surface the
  Developer Console fallback, don't guess license shapes.

## The guard chain

Every mutation runs `runGuards` (`appBuilderComponentHandlers.ts`, exported):
`ensureAdobeIOAuth` → `detectProjectOrgMismatch` → `testDeveloperPermissions`.
Reuse it; never re-derive org checks (see the `adobe-org-context` skill).

## Test pins that move when the catalog grows

- `appBuilderComponentCatalogLoader.test.ts` — pins the seeded entries by source repo.
- `appBuilderComponentSelection.test.ts` — the "unknown axes" edge expects exactly the
  axis-unrestricted entries.
- `tileStatus.test.ts` — mesh predicates derive from the REAL catalog.
- After any catalog/spine change, run:
  `npx jest tests/features/app-builder tests/features/mesh tests/features/project-creation --no-coverage 2>&1 > /tmp/jest-out.txt`
  (the mesh suites are where axis-semantics regressions surface).

## Related

Template repos are public (`skukla/*`) — no secrets, no org-specific values.
AI-context consequences of catalog work (skills, MCP config, version bump): see the
`ai-context-authoring` skill.
