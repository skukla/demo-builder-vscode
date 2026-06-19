# Research: App Builder deployable model — mesh + integrations as one construct

**Date:** 2026-06-19
**Status:** ✅ Decision made — **Model B** (keyed set of deployables, mesh as one kind). Captured as
[ADR-011](../../../docs/architecture/adr/011-app-builder-deployables.md); plan at
[`../../plans/appbuilder-deployable-model/overview.md`](../../plans/appbuilder-deployable-model/overview.md).
**Provenance:** Use-case-driven investigation requested during slice-2 (curated catalog) kickoff,
after the PM reframed the direction: *"having a mesh is going to be subsumed into using an App
Builder project which deploys a particular kind of mesh."* Extends
[`../app-builder-app-structure/research.md`](../app-builder-app-structure/research.md) (the slice-1
research that decided the singular one-app model). Three parallel codebase traces (mesh lifecycle;
integration lifecycle + multi-integration reality; selection/UX surfaces + edit inventory).

## Question

Driven by four use cases: (1) "I want a mesh — what do I need, what does it depend on?" (2) "I want
an integration — same?" (3) "How is it different if I already have a mesh / another integration?"
(4) "How does this fit config, end-user selection, existing UX, and what must be edited/added?"

---

## Use case 1 — "I want a mesh"

**What you need (the substrate):** Adobe auth (`ensureAdobeIOAuth`) → correct IMS org
(`ensureProjectOrgContext`/`detectProjectOrgMismatch`) → Developer/System-Admin role
(`testDeveloperPermissions`, via `aio app list --json`) → a Console project + workspace + Runtime
namespace (`project.adobe.{organization,projectId,workspace}`, targeted via
`buildOrgTargetFromProjectAdobe` + `withOrgContext`, `exclusive:'adobe-cli'`) → Node 20 + npm build
(`buildComponent` → `npm run build` regenerates `mesh.json` from `mesh.config.js`).

**Deploy:** `deployMeshComponent` (`features/mesh/services/meshDeployment.ts`) — build → **create-vs-update
split** (`aio api-mesh:create` vs `:update`, decided by an `existingMeshId` fetched from Adobe I/O) →
poll `aio api-mesh:get --active --json` → extract endpoint.

**What it depends on / what depends on it (THE load-bearing edge):**
- **Input:** the backend — mesh config consumes `ADOBE_COMMERCE_GRAPHQL_ENDPOINT`, catalog-service
  endpoint, API key, store codes.
- **Output:** the mesh **provides `MESH_ENDPOINT`** (`providesEnvVars` in `components.json`), and that
  endpoint is **wired into the storefront's `config.json`**:
  `meshState.endpoint` → `extractConfigParams` → `mergeComponentConfigs` (`merged.MESH_ENDPOINT`) →
  `{COMMERCE_ENDPOINT}` placeholder → `generateConfigJson` → `republishStorefrontConfig` → GitHub +
  CDN. If no mesh, the storefront falls back to the direct backend endpoint
  (`configGenerator.ts: meshEndpoint || config[endpointKey]`).
- **State:** singular `meshState { endpoint, envVars, sourceHash, lastDeployed, userDeclinedUpdate }`
  with staleness detection (compare local vs deployed config) + a redeploy dashboard surface.

**Selection:** package/stack-driven. `requiresMesh` (package, overridable per-storefront) →
`getResolvedMeshRequirement` → `true` auto-selects, `'optional'` shows a wizard toggle, `false` hides.
The mesh component id lands in `componentSelections.dependencies`; the deploy runs in the
`MeshDeploymentStep` / dashboard redeploy.

## Use case 2 — "I want an integration" (custom App Builder app, slice 1)

**What you need:** the **same substrate** as mesh (auth/org/workspace/namespace/Node/build), gated by
the **same** `projectRequiresAppBuilder` + Developer-role check (mesh and apps share the gate — API
Mesh is itself App-Builder infrastructure). Source = a **public git URL** (validated, owner/repo
charset-checked, canonicalized to `https://github.com/owner/repo.git`).

**Deploy:** `deployAppComponent` (`features/app-builder/services/appDeployment.ts`) — shared
`buildComponent` → **idempotent `aio app deploy`** (no create/update split; `aio-lib-runtime` prunes
orphans) → `aio app get-url --json` (defensive parse; failed get-url after a successful deploy
degrades to empty URL, deploy still succeeds).

**What it depends on:** standalone — it deploys runtime actions/web into the namespace and **does not
provide env vars to the storefront** (slice 1). It *may* consume `MESH_ENDPOINT` if its own code
needs the mesh, but the extension does not auto-wire that. Brings its own `.env.template`; the
`appBuilder` registry category is **empty `{}`** (no curated entries, no `.env` generation yet).

**State:** singular `appState { appId, url, status, deployedUrls, lastDeployed, sourceHash }`.
`getAppBuilderInstance` returns `[0]`; add **rejects a second app** ("remove the existing app first").
Reset reconstructs from `componentInstances[appId].repoUrl`.

## Use case 3 — "How is it different if I already have…"

**…a mesh:** No conflict. Mesh = edge-hosted gateway artifact; app = Runtime packages/actions. They
**coexist in one namespace**, deployed by separate commands; the app never touches `aio api-mesh`.
The only relationship is the optional `MESH_ENDPOINT` an app might read.

**…another integration — THE KEY FINDING.** The slice-1 research decided: *multiple integration
domains = multiple **packages inside the ONE app** (`runtimeManifest.packages`), not separate apps.*
So conceptually a 2nd integration is a new `packages.<domain>` block + redeploy. **But slice 1 models
"the app" as a single git-URL repo and hard-enforces one app per demo.** Consequences:
- Adding a 2nd integration as a 2nd app → **blocked** by the singular guard.
- The only path today: manually edit the existing app repo's `app.config.yaml` to add a package, then
  redeploy (idempotent). **No UI affordance** for "add another integration."
- This is fine *if* integrations are authored together in one repo. It does **not** fit composing
  **independent** integrations (each its own source/repo) — which is what "pick integration A, then
  also pick integration B from a catalog" implies.

## Use case 4 — config / selection / UX / what to edit

**Config model today** (5 registries, all declarative): `stacks.json` (frontend+backend +
`optionalDependencies` [mesh] + `optionalAddons` + `addonDefinitions` w/ source repos),
`demo-packages.json` (package → per-stack storefront + `requiresMesh` + `addons:
required|optional|excluded`), `components.json` (mesh/frontends/backends/**appBuilder {}**/addons +
`selectionGroups`), `block-libraries.json` (**the precedent**: `type:standalone|storefront` +
`stackTypes` + `nativeForPackages`/`onlyForPackages` + custom-URL escape hatch).

**Selection surfaces:** creation-time in the wizard `ArchitectureModal` (stack + addons + **mesh
toggle** when `optional` + block libraries) and `MeshDeploymentStep`; post-creation on the dashboard
(mesh status badge + redeploy; slice-1 `AppBuilderCard` add/deploy/remove). Block-library
standalone-list + `customBlockLibraries` add-list is the established curated+custom picker pattern.

**Edit/add inventory** (if deployables become a config-driven catalog mirroring block-libraries):
new `deployables-catalog.json` + schema + `deployablesLoader` (`getAvailable/getNative/resolveRequirement`);
`base.ts` state (`selectedDeployables` + per-deployable state); generalize the `ArchitectureModal`
mesh toggle into a deployables selector; dashboard card(s) + `deployablesStatusUpdate` channel +
handlers. (Full file-level checklist in the slice-2 plan once the fork below is decided.)

---

## THE CENTRAL FORK (decision needed before slice 2 locks)

The use cases expose a conflict between the **shipped slice-1 model** and the **PM's reframe**:

- **Model A — singular (research/slice-1 as built):** a demo has **one mesh + one app**, both
  singular state. Multiple integrations = packages inside the one app repo. Adobe-idiomatic (1
  namespace; avoids multi-app package-name collisions). *Cost:* composing independent integrations
  means editing one repo's manifest; the catalog becomes "curated multi-package app templates," and
  "mesh is just a deployable" doesn't really hold (mesh stays a special singular artifact).

- **Model B — keyed set of deployables (the reframe implies this):** a demo holds a **set** of
  deployables — one mesh-kind + N integration-kinds — each a config-catalog entry with its own
  source, each selectable, each deployed into the shared workspace. Mesh becomes *one kind of
  deployable.* *Cost:* revisits slice-1's singular `appState` (→ keyed), multiple `aio app deploy`s
  into one namespace (manage package-name collisions — the research's "fragile path"), and a richer
  state/dashboard model.

Everything downstream depends on this: singular vs keyed state; one app repo vs many; whether the
catalog is "app templates" or "deployables (incl. mesh)"; whether the mesh→storefront `MESH_ENDPOINT`
edge is a special case or one instance of a general "deployable provides env vars" mechanism; and the
shape of slices 2–5.

### Recommendation (for PM decision)

Lean **Model B** — model deployables as a **keyed set, with mesh as one kind** — because it matches
the reframe and the compose-from-catalog UX the demo builder exists for, and it unifies the
`providesEnvVars` edge (mesh's `MESH_ENDPOINT` becomes the first instance of "a deployable can feed
the storefront config"). Manage the multi-app namespace-collision risk as an implementation detail
(enforce distinct package prefixes), not as a reason to force singular at the model/UX level. This
**does** mean consciously revising slice-1's singular `appState` toward keyed state — a deliberate
course-correction, sequenced and tested, not a big-bang rewrite. Keep the live mesh deploy path
running until the unified runtime is proven (unify vocabulary/config first, runtime/state second).

## Decisions made (2026-06-19)

1. **Model B chosen.** A demo holds a keyed **set of deployables**; mesh is one kind.
2. **Catalog of pre-built deployables, backend/frontend-aware.** Users pick pre-built pieces from a
   curated list filtered to their chosen stack/backend. Seed entries (all existing meshes, reframed):
   - `skukla/commerce-paas-mesh` — mesh, EDS + **PaaS** (catalog service)
   - `skukla/commerce-eds-mesh` — mesh, EDS + **ACCS/SaaS**
   - `skukla/headless-commerce-mesh` — mesh, **headless** frontend
   Integrations join the same catalog as `kind:"integration"` entries.
3. **Three acquisition modes for a deployable:** (a) **pre-built** — pick a catalog entry; (b)
   **custom URL** — paste a public repo (the slice-1 escape hatch); (c) **AI shell** — scaffold an
   empty app and build it out with AI (the scaffold-and-author slice).
4. **`MESH_ENDPOINT` generalizes** to "a deployable may declare `providesEnvVars` the storefront
   consumes" — mesh is the first instance, not a special case.
5. **Sequencing:** unify config/vocabulary + keyed state first; migrate the mesh *runtime* into the
   unified engine second, keeping the live mesh path working through the transition.

Remaining sub-question to confirm during planning: does each integration deploy from its **own repo**
(keyed, multiple `aio app deploy`s — enforce distinct package prefixes) or bundle into one
multi-package repo *presented* as a set? (Decouples the UX model from deploy mechanics.)

## Sources

Three codebase traces (mesh lifecycle; app/integration lifecycle + multi-integration; selection/UX +
edit inventory), all file:line-cited; cross-referenced with
[`../app-builder-app-structure/research.md`](../app-builder-app-structure/research.md) and the slice
specs in `.rptc/backlog/2026-06-17-appbuilder-app-*.md`.
