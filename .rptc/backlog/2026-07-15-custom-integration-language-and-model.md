# Custom integration — language standard + singular→packages model

## Provenance

Scoped 2026-07-15 during a `/rptc:research` into the on-disk project layout for a project
holding a Mesh + a custom App Builder app, followed by a language clarification with the user.

Two things came out of that session:

1. **Language decision (user-confirmed).** "App Builder app" is the Adobe *implementation
   substrate*, not the product noun. To the end user the thing they add is a **custom
   integration** — an ERP, CRM, or Firefly Services integration (each with its actions). The
   user should not have to know it runs on App Builder.
2. **A confirmed persistence gap** in how a deployed custom integration's state is written.

The user-facing string rename shipped in the same session (see "Already shipped"); this item
records the standard so future UI holds it, plus the two pieces of follow-up work.

## Already shipped (this session)

User-facing displayed strings renamed **"App Builder app" → "custom integration"** across
`KindStage`, `CustomStage`, `IntegrationsStep` empty-state, `AppBuilderCard` (No-app copy +
URL label + Deployed/Error labels), `integrationRows` source line, `deployApp` toasts/title,
`appDeployment` progress, `deployAppHeadless` sign-in warning, `appComponentManager` "already
has" error, and the blank-shell catalog `name`/`description` in `app-builder-components.json`.
Tests synced. **Internal identifiers were intentionally left** (`appState`,
`componentSelections.appBuilder`, `AppBuilderCard`, the `app-builder` feature) — they correctly
name the App Builder substrate; the rename is product language only. The one deliberately
retained user-facing "App Builder app" string is the technical validation error in
`appBuilderComponentRunner.ts` ("not a standalone App Builder app"), where the term is accurate.

## Goal / Scope

Make the code match the sentence: **a project holds one API Mesh + one App Builder app, and the
user's several "custom integrations" (ERP, CRM, Firefly…) are packages inside that one app.**
This is the model already decided for the App Builder app family (backlog §A, "Decided model":
one custom app, multiple integration domains as packages, singleton `appState`, no keyed array).
This item adds the language standard and the two concrete seams found on 2026-07-15.

### 1. Language standard (durable — apply to all future integration UI)
- Product noun for the custom, action-carrying integration = **"custom integration"**, never
  "App Builder app".
- "Integration" is the umbrella (mesh, pre-built, custom) — already the modal's word.
- "App Builder" may appear only in internal identifiers and genuinely technical diagnostics.

### 2. Persist deployed custom-integration state — ✅ SHIPPED 2026-07-15 (`f91669cb`)
**Was:** `deployAppHeadless.ts:137` set `project.appState` then called `saveProject`, but
`ProjectConfigWriter.writeManifest` never serialized `appState` — while `projectFileLoader.ts:117`
*reads* `manifest.appState`. A deployed custom integration's URL/status was dropped on write and
returned `undefined` after a reload. **Fix:** added `appState` to the `writeManifest` allowlist,
mirroring `meshState`, with a serialize/omit regression test. Status summaries
(`meshStatusSummary`/`appStatusSummary`) stay omitted — the loader never reads them; they are
recomputed on load.

**Scope refinement (confirmed while fixing):** the extras `appBuilderComponentSources` and
`additionalConsoleApis` do NOT belong here — the loader (`projectFileLoader.ts:104-128`) reads
neither into the project, so a writer-only change would not round-trip them. They need a
**writer + loader** change and are folded into item 3 / §E below (edit-mode rehydration).

### 3. ADR-011 D3 — durable, independently-managed integrations (KEYSTONE) — ✅ IMPLEMENTED 2026-07-15 (branch `feature/appbuilder-deployables-d3`, pending merge)
**Model correction (deep research 2026-07-15 →
[`../research/app-builder-integration-model/research.md`](../research/app-builder-integration-model/research.md)):**
the model is NOT "one app, many packages." Each integration is a **separate whole App Builder app**
in its own `components/<id>/`, deployed by its own `aio app deploy`; they coexist in **one shared
Adobe I/O workspace** via per-integration OpenWhisk **package renaming** (`deriveOwPackage` +
`appConfigPackages`). N integrations are independently manageable **at runtime** (keyed
`appBuilderComponents` runner + per-id MCP tools) but **not durable** — `writeManifest` serializes
only the singular `meshState`/`appState`, so a reload collapses to 1 mesh + 1 integration. Two
competing add/remove systems exist side by side (legacy singular guarded vs keyed unguarded).

**D3 work (the real keystone):** (a) serialize `appBuilderComponents` in `writeManifest`; (b) have
`projectFileLoader` prefer it over the singular migration; (c) retire the legacy singular/guarded
`addApp`/`removeApp` path so there is ONE add/remove system; (d) unify the mesh treatment. The
2026-07-15 `appState` fix (item 2) patched the singular layer D3 replaces — correct for today's
authority, superseded by D3. Supersedes/absorbs the old "packages inside one app" framing and the
slice-3 premise.

**→ SCOPED as a TDD-ready 9-step plan (2026-07-15):**
[`appbuilder-deployable-model/d3/overview.md`](appbuilder-deployable-model/d3/overview.md)
— D3 is the documented remainder of ADR-011 (D1–D2 shipped). Item 4 (integration `name`) folds into
its Step 01; the mesh→`config.json` edge stays byte-identical throughout (golden test, Step 06).

### 4. Integration display name (was: item #2 "name a custom integration") — folded into D3 (✅ shipped with it)
No user-assignable name exists anywhere (`AppBuilderComponentState` has none; the dashboard row
shows the raw id, the wizard shows the catalog `name` — two derivations). Add `name` to
`AppBuilderComponentState`, default from repo/catalog, user-editable; unify the wizard + dashboard
display to read it. Cosmetic — zero deploy impact. Pointless before D3 (a name would vanish on
reload) and before the shell can be added under distinct ids, so **fold into D3**, don't ship alone.

### 5. Rename the remote Adobe I/O project (was: item #1) — independent, small
Local rename (`renameProjectCore`) never touches `project.adobe.*`; the remote App Builder project
title is written once at creation and never updated. **The SDK primitive exists and is installed:**
`@adobe/aio-lib-console` `editProject(orgId, projectId, { title })` (`index.js:355`), reachable via
the same `getClient()` cast as `createFireflyProject` — just unwired. Add a `renameRemoteProject`
to `adobeEntityFetcher` (org-guarded) + update `project.adobe.projectTitle`. One product decision:
does the local demo rename ALSO rename the remote project, or is it a separate action? Independent
of D3; own small `/rptc:fix`.

### 6. Integrations management UX — two surfaces, one language (prototyped + user-confirmed 2026-07-15)
Direction confirmed via two interactive prototypes in
[`../research/app-builder-integration-model/`](../research/app-builder-integration-model/):
- **Wizard (primary, now)** — `prototype-integrations-wizard.html`. A **calm single-column list**
  in the Build-Your-Project two-column frame (center column beside the "Your project" summary),
  reused in edit mode. Pre-deploy → identity only (name · kind · APIs-it-will-provision ·
  edit/remove); shared destination shown once; add/edit via the **existing** modal. NOT a grid — the
  narrow column rules it out. This is the current `IntegrationResultRow` list, calmed + named.
- **Dashboard (later, post-deploy)** — `prototype-integrations-grid.html`. The **live-management
  grid + detail drawer** (calm cards: dot status, one attention action; detail-on-click for URL/APIs/
  redeploy/verify/remove). **Built-but-unwired today** (`AppBuilderCard`/`AppBuilderComponentsList`
  never rendered — `showDashboard` passes the data, the screen drops it). Reuses keyed data + status
  maps + 4-state machine + `.projects-grid` CSS; net-new = a card-shell + grid composition + (#4)
  name. **Gated on D3** (a grid of N cards collapses to 1 on reload without it).

Both frame each integration as a **co-tenant card in the ONE shared workspace**, not a nested project
with its own destination (load-bearing). `ProjectCard`/`ProjectsGrid`/`ProjectActionsMenu` are
Project-coupled — mirror, don't import; there is no generic `Card` primitive today. The prototypes are
the working spec: their card/row contract defines what D3 must persist and surface. **Build order:
the wizard calm list can ship largely independently (it's the existing list, calmed + named); the
dashboard grid follows D3.**

## Cross-references (do not fork these)
- **Deep research (read first):**
  [`../research/app-builder-integration-model/research.md`](../research/app-builder-integration-model/research.md)
  — the model as built (many apps, one workspace), all gap evidence, and the UX grid assessment.
- Decided model + slices: backlog §A "App Builder app family"
  ([`2026-06-17-appbuilder-app-deploy-spine.md`](../complete/2026-06-17-appbuilder-app-deploy-spine.md)),
  slice 3 ([`2026-06-17-appbuilder-app-package-bound.md`](2026-06-17-appbuilder-app-package-bound.md)).
- Wizard-selection persistence + ReviewStep visibility: backlog §E
  ([`2026-06-21-appbuilder-component-first-class-persistence.md`](2026-06-21-appbuilder-component-first-class-persistence.md))
  — distinct from item 2 here (that item is deployed-runtime `appState`; §E is wizard selections).
- Deterministic integrations (kind picker, custom/import lifecycle):
  [`2026-07-13-deterministic-integrations.md`](../complete/2026-07-13-deterministic-integrations.md).

## Constraints
- Public repo — no secrets in `appState`/manifest; `appBuilderComponentSources` holds only
  owner/repo (already the case).
- Rename is **product strings only**; never rename internal App Builder identifiers.
- Item 2 mirrors the existing `meshState` persistence exactly — no new abstraction.

## Kickoff prompt
> Pick up the custom-integration model work
> (`.rptc/backlog/2026-07-15-custom-integration-language-and-model.md`; read
> `.rptc/research/app-builder-integration-model/research.md` first). Language (item 1), `appState`
> persistence (item 2), and **item 3 (ADR-011 D3, incl. item 4's display name)** shipped — D3 is
> implemented on branch `feature/appbuilder-deployables-d3` (pending merge). Remaining: item 5
> (remote Adobe I/O project rename) — a small independent `/rptc:fix` — and item 6 (integrations
> grid UX), which was gated on D3 and is now unblocked once the branch merges.
