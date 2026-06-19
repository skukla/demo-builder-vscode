# Research: App Builder app structure — workspace model, code structure, add/remove lifecycle

**Date:** 2026-06-17
**Type:** Hybrid (codebase + Adobe platform)
**Status:** Complete
**Feeds:** `/rptc:feat` — "Add App Builder app(s) to a demo project"
**Companion:** [`../adobe-io-deployable-workspace/research.md`](../adobe-io-deployable-workspace/research.md) (deploy-core reuse + workspace-cost analysis). This doc answers the upstream "what's the *right* structure" question that one defers to planning.

---

## Question

What is the correct way to structure Adobe App Builder for a demo: the workspace structure, the
code structure, and how the extension adds/removes things to a project that already has code?

## Methodology

Four parallel research agents — two on this codebase (component add/deploy/remove lifecycle;
workspace targeting + config-driven composition), two on the Adobe platform (workspace structure;
app code structure + lifecycle), ~40 sources cross-verified.

---

## Headline

Adobe's documented model and this codebase's existing state model **agree on one shape**:

> **One workspace per demo, holding the API Mesh (a separate edge artifact) + one custom App
> Builder app. Multiple integration domains live as multiple PACKAGES inside that one app —
> not as separate apps and not as separate workspaces.**

This collapses the "multiple App Builder apps" framing: the mesh is a distinct coexisting artifact,
and everything custom is one app subdivided into packages. The only true multi-*app* /
multi-*workspace* case is rare and forced (see constraints). Because it is one app per demo, the
existing **singleton** state model (`project.meshState` shape) fits — the keyed `appBuilderApps[]`
array the earlier backlog feared is unnecessary for the common case.

---

## Workspace structure (Adobe — confidence: HIGH, 21 sources)

- Workspaces are **environments** (Production / Stage / per-developer sandboxes), **not** packaging
  units for unrelated capabilities. Adobe documents no "workspace per feature" model. The code
  organization primitive is the Runtime **package**, not the workspace.
- Hard limits: **1 Runtime namespace per workspace** (auto-provisioned), **1 API Mesh per workspace**.
- A mesh and one-or-more custom apps **coexist** in a single workspace — the mesh is an edge-hosted
  gateway, custom apps are runtime actions/web in the namespace. Different artifact types, no conflict.
- Two *separate app repos* deploying into one namespace **collide only if package names overlap**
  (deploy is an OpenWhisk `PUT ?overwrite=true` upsert). Distinct package names make it technically
  safe, but it is the fragile path; prefer one app.
- A second workspace is **forced** only by: (1) a 2nd mesh, (2) a distinct product-profile /
  entitlement / sandbox binding, (3) deliberate lifecycle/quota isolation, or (4) the conventional
  Stage-vs-Prod environment split. **Two domains alone never force one.**
- **Credentials:** runtime creds (`AIO_RUNTIME_*`) auto-provision with the workspace. The OAuth
  Server-to-Server credential and **API subscriptions do not** — they need
  `createOAuthServerToServerCredential` → `getServicesForOrg` → `subscribeCredentialToServices`
  (`@adobe/aio-lib-console`). The extension already creates a **bare** S2S credential
  (`createWorkspaceCredential`, `adobeEntityFetcher.ts:438`); the one unbuilt piece is programmatic
  **API subscription**, and it only matters when the app calls Adobe product APIs or a 2nd workspace
  is needed.
- No Adobe mechanism aggregates endpoints/creds across workspaces — another reason to keep mesh + app
  in one workspace.

## Code structure (Adobe — confidence: MEDIUM-HIGH)

- `app.config.yaml` → `runtimeManifest.packages` is a **map**. One key per domain
  (`erp-integration:`, `foo-integration:`), all deployed together into the one namespace.
- Actions address as `package/action`, so identical action names never collide across packages.
  Packages cannot nest (single level). Use a domain prefix per package; `$include` splits a large
  manifest across files.
- This is the idiomatic multi-domain model — **not** separate apps, and **not** "extensions" (those
  surface into Adobe product UIs: Exc Shell, AEM editors — a different axis).
- Source for each package conventionally lives in its own subfolder (`src/<domain>/actions/...`), but
  the **deploy-time boundary is the `packages:` entry in the manifest**, not the folder. Subfolders
  are organization; the manifest entry is what creates the package.
- **Recommendation: one multi-package app per demo.** Split into separate apps/repos only when a
  domain needs a genuinely independent release cadence or isolation.

## Add / remove from existing code

### Adobe side (confidence: HIGH on verbs)

- `aio app deploy` is **idempotent and prunes orphans** (`aio-lib-runtime` `syncProject` /
  `deleteEntities`) — no create-vs-update split like mesh, so no `existingId` bookkeeping.
- Add a domain: `aio app add action` → hand-edit the manifest into a new `packages.<domain>` block →
  `aio app deploy`. (No `aio app add package` verb exists.)
- Remove: `aio app delete action pkg/name`, or drop-from-manifest + redeploy (relies on prune).
- Subset deploy/undeploy: `-a action` / `-e extension`; undeploy granularity is by extension or
  component-type, **no per-action undeploy flag**.
- URLs via `aio app get-url --json`.
- **Caveat:** triggers/rules orphan on rename and need manual `aio runtime trigger/rule delete`.

### This codebase (confidence: HIGH)

- **No incremental "add one component" path today.** Wizard edit mode wipes `componentInstances` and
  re-clones every component (`executor.ts:351-365`); reset does `rm -rf components/`
  (`projectResetService.ts`). An app-add path must bypass both or apps get destroyed on edit/reset.
- The **only** additive-without-clobber precedent is **block-library install**
  (`blockCollectionHelpers.ts:127-298`): discover what exists → add only new → track per-item
  version; already runs at create, reset, *and* incrementally on add-on update
  (`updateExecutor.ts:583-607`). **Copy this pattern.**
- **Workspace-targeting seam already exists and is clean:**
  `withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg), () => /* aio app deploy */)`
  (`orgContextEnv.ts`, `commandExecutor.ts:98-107` injects `AIO_CONSOLE_*`; `exclusive: 'adobe-cli'`
  serializes). Mesh, reset, and MCP paths all use it; app deploy drops straight in.
- **Mesh is the deployable analog but a hard singleton:** `project.meshState` (singular),
  `getMeshComponentInstance()` = `…BySubType('mesh')[0]` (`typeGuards.ts:449-453`), ~12 call sites
  assume one mesh. For one-app-per-demo this singleton shape *fits* — add a sibling `appState` rather
  than reusing the mesh getter. Do NOT reuse the mesh `[0]` getter for apps.
- **Leftover `appBuilder` plumbing (Effort 1 / `c98e5125` kept it; always empty):**
  `componentSelections.appBuilder: string[]` round-trips types → wizard → executor persist → review →
  configure → prereqs, but `wizardHelpers.ts:690` hardcodes `[]` and nothing populates it. The
  install path derives `app-builder`-typed items from `selectedAddons` (also empty), and the registry
  has **no `app-builder` category** — `projectRequiresAppBuilder` reads only `registry.components.mesh`.
  Scaffolding to repurpose, not working wiring.
- **App-only / no-storefront blockers:** every stack requires `frontend` + `backend`
  (`stacks.schema.json:74`, `executor.ts:1101` throws); no `app-builder` registry category; the
  `appBuilder` field doesn't feed the installer; `projectRequiresAppBuilder` conflates App Builder
  with the mesh group. App-only needs all four seams touched.

---

## Recommendations

1. **Adopt "one workspace = mesh + one multi-package app."** (HIGH) Adobe-idiomatic; fits the
   singleton state model. Model the app as one deployable component with a singular `appState`
   (mirror `meshState`); represent multiple domains as packages inside the repo, not as components.
2. **Build the deploy path as a SIBLING of mesh, not a fork.** (HIGH) Reuse build→deploy→poll→persist
   and `withOrgContext`; swap `aio api-mesh:*` for idempotent `aio app deploy` + `aio app get-url`.
3. **Copy the block-library additive engine for add/remove on a live project.** (HIGH) The only
   non-clobbering pattern here, with incremental-update precedent.
4. **Defer multi-workspace + API-subscription automation** to an explicit edge case. (MEDIUM) Build it
   only when a demo's app calls product APIs or needs a 2nd mesh.
5. **Treat the four acquisition front-ends as one deploy tail with different heads.** (HIGH)
   Import-URL and curated/package-bound templates are config/UX over one engine; scaffold-and-author
   is the only one needing `aio app init` + a code home + a repo decision.

## Open decisions for `/rptc:feat` planning

- **Sequencing the four acquisition front-ends** (lean: import public git URL first — thinnest, proves
  `aio app deploy` end-to-end).
- **Scaffold-and-author (case 1):** where scaffolded code lives; whether GitHub-repo creation is in v1.
- **App-only / no-storefront project:** in this feature or a follow-on? (touches stack schema, a real
  `app-builder` registry category, wiring the dead `appBuilder` field, extending the predicate).
- **Three live-verification probes:** deploy-prune on by default? does `aio app delete action` also
  undeploy? trigger/rule orphan-on-rename in our CLI version?

## Sources

- Codebase: `meshDeployment.ts`, `deployMesh.ts`, `componentInstallationOrchestrator.ts`,
  `componentManager.ts`, `blockCollectionHelpers.ts`, `projectResetService.ts`, `orgContextEnv.ts`,
  `commandExecutor.ts`, `resourceLocker.ts`, `ensureOrgContext.ts`, `typeGuards.ts`, `base.ts`,
  `projectConfigWriter.ts`, `projectAppBuilderPredicate.ts`, `executor.ts`, the four config JSONs.
- Adobe (developer.adobe.com): App Builder Deployment / Configuration / Runtime / Packages / Security
  guides; API Mesh Create / CI/CD / Command Reference; OAuth S2S implementation; aio-cli-plugin-app /
  -console / -api-mesh and aio-lib-console / aio-lib-runtime READMEs; Apache OpenWhisk packages/upsert
  docs; Sarah Xu "Projects and Workspaces". ~40 sources across the two web agents, cross-verified.
