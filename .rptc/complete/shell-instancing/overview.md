# Shell instancing — N AI-built integrations via name-derived instance ids

> **Step 0 — RPTC re-initialization (ALWAYS FIRST on re-entry):** if context was cleared,
> re-invoke `/rptc:feat "Plan is approved, continue to implementation"`. Work happens in the
> worktree `…/demo-builder-vscode.worktrees/feature/shell-instancing` (branch
> `feature/shell-instancing`, already created off develop @ `5d6f4956`). Mirror this plan to
> `.rptc/plans/shell-instancing/overview.md` on implementation start.

## Context

Today "Build custom" commits the FIXED catalog id `app-builder-shell`, so id-dedup caps a
project at ONE AI-built integration. The backlog item
(`.rptc/complete/shell-instancing/item.md`) makes the shell repo a
**template, not an identity**: the user names the integration ("Firefly Image Gen"), a
collision-checked instance id derives from the name (`firefly-image-gen`), and the shell clones
under `components/<instanceId>/`. Everything post-add is already id-generic after ADR-011 D3
(keyed `appBuilderComponents` state, per-id lifecycle, `deriveOwPackage` isolation).

**Design spine (both architect perspectives converged):** an instance is *a custom-URL import
whose source is the shell template*. `deployableAppIntegrationEntries` (executor.ts:607) already
resolves unknown selection ids via `appBuilderComponentSources[id] → buildCustomIntegrationEntry`;
we record `sources[instanceId] = {owner:'skukla', repo:'app-builder-shell', branch, name}` and the
whole creation pipeline works unchanged. Zero new state machinery; one new UI stage file, one new
pure module.

**§E fold-in (edit round-trip):** `appBuilderComponentSources`/`additionalConsoleApis` are never
manifest-persisted, so custom/instance selections vanish from edit mode after reload.
- Sources: **derive, don't persist** — `extractSettingsFromProject` reads the keyed
  `appBuilderComponents` map (already durable, carries `source` + `name` post-D3). Then **delete
  `Project.appBuilderComponentSources`** (`types/base.ts:168`, write in executor `buildInitialProject:330`)
  — write-once/read-once today; a persisted parallel copy would drift (remove cleans the keyed map
  only → removed integrations would resurrect in edit mode). No soft deprecation.
- `additionalConsoleApis`: **persist in the manifest** (writer + loader) — not derivable, and the
  dashboard's full-union subscription PUT reads it: today a post-reload redeploy silently drops
  the user's picked APIs (pre-existing bug this feature would inherit).

## Implementation steps (TDD, RED-first; tests live in the mirrored `tests/…` suites)

**Step 1 — Entry resolution carries instance identity** (foundation)
- `project-creation/services/appBuilderComponentCatalogLoader.ts` `buildCustomIntegrationEntry(source, id?)`:
  optional explicit id (map key) + `name: source.name ?? source.repo`; assert id charset
  (GITHUB_NAME-style — it becomes a folder path + `deriveOwPackage` input); no-id call keeps
  today's `${owner}-${repo}` (pin dashboard call-site behavior).
- `handlers/executor.ts:616`: `buildCustomIntegrationEntry(sources[id], id)`.
- Type ripple — widen the inline source-record declarations with `name?: string`:
  `types/base.ts`, `types/webview.ts` (WizardState), `executor.ts` (ProjectCreationConfig ~:186),
  `projects-dashboard/types/settingsFile.ts:111`, `wizardHelpers.ts:279` (ImportedSettings).
- Tests: instance id + name resolution; two shell-sourced selections → two distinct entries;
  catalog ids and legacy imports unchanged; malformed id throws.

**Step 2 — Runner persists `name` into the keyed entry**
- `app-builder/services/appBuilderComponentRunner.ts`: `name: entry.name` in `integrationState`,
  `meshState`, `errorState` (~:187–208); `entryFromState` (~:342): `name: state.name ?? id` so
  redeploys don't clobber the display name.
- Tests: deployed/error keyed state carries the name; redeploy preserves it.

**Step 3 — Pure module `instanceId.ts`** (new, ~60 lines,
`project-creation/ui/components/integration-flow/`, webview-safe)
- `deriveInstanceId(name)` via the existing normalizer in `core/validation/normalizers`
  (`normalizeProjectName` — verify exact export name at implementation); `deriveOwPackage`
  self-truncates long ids, no cap needed.
- `buildReservedIds(...)`: selections + `Object.keys(sources)` + ALL app-builder catalog ids
  (incl. blank + mesh — a name slugging to a catalog id would silently clone the wrong repo via
  the executor's catalog-first lookup) + `COMPONENT_IDS`/`MESH_COMPONENT_IDS` + addons +
  optional deps + `'__existing__'`.
- `evaluateInstanceName(raw, reservedIds)` → `{instance?, message?}` (CustomStage's evaluate shape;
  empty slug and collisions → inline message).
- Tests: 100% coverage — derivation boundary cases, every reserved-id class, valid path.

**Step 4 — Stage machine: `source-blank`**
- `integration-flow/flowStages.ts`: `FlowStageId += 'source-blank'`; `FlowDraft.instance?: {id; name}`;
  `sourceStages('blank') → ['source-blank']` (:82); CANONICAL_ORDER slot after `'source-catalog'`;
  gate `draft.instance !== undefined`.
- Tests: blank order = kind → source-blank → dest… → api-access; gate blocks until set; other
  kinds pinned unchanged.

**Step 5 — Commit path**
- `ui/steps/useProjectBuilder.ts` `onAddCustomAppBuilderComponent(source, instance?: {id; name})`:
  with `instance`, select the INSTANCE id + write `sources[instance.id] = {…source, name}`;
  without it, byte-identical to today (pin).
- `integration-flow/useIntegrationFlow.ts:238`: blank branch → `onAddCustomAppBuilderComponent(
  blankComponent.source, draft.instance)` + `writeApiPicks(draft.instance.id)` (replaces the
  fixed-id toggle); expose `setInstance`.
- Tests: blank finish commits the instance (NOT `app-builder-shell`); picks keyed under instance
  id; two journeys → two ids; remove cleans selection+source+picks (pin existing handler).

**Step 6 — BlankStage UI + modal wiring**
- NEW `integration-flow/stages/BlankStage.tsx` (~70 lines, mirrors `CustomStage.tsx`'s
  evaluate-and-emit + inline `errorMessage` pattern). Copy per the wizard prototype: label
  "Integration name", placeholder "e.g. Order Sync, Salesforce CRM, Firefly Image Gen".
- `AddIntegrationFlowModal.tsx`: render BlankStage for `'source-blank'`; accept `reservedIds`.
- `ui/steps/IntegrationsStep.tsx`: compose `reservedIds` from data it already holds; widen the
  builder Pick pass-through.
- Tests: valid name emits instance; collision (`'app-builder-shell'`, existing instance,
  `'eds-storefront'`) → inline error + undefined; modal journey walks the new stage; Continue
  disabled until valid.

**Step 7 — Rows show the name**
- `integration-flow/integrationRows.ts:110`: custom branch `name: source.name ?? source.repo`;
  when `source.name` present → `kind: 'blank'` + built-with-AI sourceLine (an instance must not
  read "app-builder-shell"); keep the legacy `entry.blank` branch (pre-feature projects).
- `dashboard/ui/components/AppBuilderComponentRow.tsx:70`: `label: name ?? id` (convention already
  exists at `projectStatusUtils.ts:196`).
- Tests: named source → user name/blank kind; unnamed → repo/custom (pin); dashboard label.

**Step 8 — §E fold-in** (as designed in Context)
- `projects-dashboard/services/settingsSerializer.ts:155`: derive sources from keyed map — entries
  with `kind === 'integration'` AND `getAppBuilderComponentEntry(id) === undefined` (catalog +
  mesh excluded — pins row-kind stability) → `{…state.source, name: state.name}`. Cross-feature
  import precedent: `dashboard/handlers/appBuilderComponentHandlers.ts:42`.
- `core/state/projectConfigWriter.ts` + `projectFileLoader.ts`: persist/load `additionalConsoleApis`
  (guarded; absent field tolerated in legacy manifests).
- DELETE `Project.appBuilderComponentSources` (base.ts) + its write (executor `buildInitialProject:330`);
  fix compile fallout.
- Tests: derivation in/exclusion classes + name carried; manifest round-trip; legacy manifest loads.

**Step 10 — Rename-after-add (display name only; USER-ADDED SCOPE, overrides the YAGNI cut)**
- Rule: rename NEVER changes the instance id (folder, ow.package, keyed key are immutable —
  identity rename would orphan the old OpenWhisk package and duplicate instances in edit mode).
  Display name only. Applies to instances + custom imports (`kind:'integration'`, non-catalog);
  mesh and pre-built catalog entries keep fixed names.
- Wizard: "Rename" action on instance/custom rows → modal rename mode reusing BlankStage's
  input (initial value = current name; validate non-empty + not duplicating another row's
  display name); commit updates `sources[id].name` in place (id, picks, selection untouched).
- Dashboard: rename action on `AppBuilderComponentRow` → new message (per the
  `webview-command-handler` skill seam) → handler sets `appBuilderComponents[id].name` +
  `saveProject` → row label refreshes.
- Tests: wizard rename updates the row name without touching id/picks; duplicate-name rejected;
  dashboard handler round-trip; edit-mode rename of a deployed instance persists via the keyed map.

**Step 9 — Per-integration AI addressing + closeout** (per `ai-context-authoring` skill's gates)
- `extend-app-builder-app` skill template + `aiContextWriter.ts` wording → per-integration
  ("work in `components/<id>/`", N instances); bump `AI_CONTEXT_VERSION` 3→4 (`core/constants.ts:32`)
  with the skill's count-pin/test discipline.
- Closeout (non-code): reassess D4 in the backlog (expected: shell instancing subsumes the
  `aio app init` scaffold need); flip the backlog item status; note the promote-to-repo rider stays
  backlogged. Post-merge housekeeping riders: ADR-011 status wording + backlog README D3 line
  ("implemented on branch" → merged `5d6f4956`).

## Explicitly NOT building (YAGNI)
- Name field for imports/mesh/catalog kinds (imports have repo identity; `name?` on the source
  record makes it a trivial later add).
- IDENTITY rename (folder + ow.package + keyed-key migration) — display-name rename ships in
  Step 10; identity stays immutable (remove+re-add covers it).
- Per-instance API-pick attribution in edit mode (flat `additionalConsoleApis` union is the
  shipped D3 model; the union survives via Step 8).
- Migration of legacy fixed-id `app-builder-shell` selections (they keep working via the catalog
  entry + `entry.blank` row branch).
- Instancing from the dashboard Add door (stays the URL importer; Step 1's seams make it a later
  drop-in).

## Reuse (don't re-derive)
- `CustomStage.tsx` evaluate-and-emit + inline-error pattern; `getAppBuilderComponentEntry` /
  `buildCustomIntegrationEntry` (catalog loader); `recordAddedIntegration`/`resolveKeyedComponentId`
  (appComponentManager); `deriveOwPackage`; `normalizeProjectName`/`normalizeRepositoryName`
  (core/validation); keyed-state accessors (`setAppBuilderComponent`, `listAppBuilderComponents`).

## Risks
- A name slugging to a **catalog id** → executor's catalog-first lookup clones the wrong repo:
  catalog ids are in the reserved set, test-pinned (Step 3).
- Type-widening ripple across the source-record declarations: `tsc --noEmit` in the gate.
- Deleting `Project.appBuilderComponentSources`: grep-verified write-once/read-once; compiler
  catches stragglers.
- `isStandaloneApp` add-door: shell template must keep declaring runtime packages (pre-existing
  invariant, now multiplied by N — note for the shell repo, no code change).
- Count-pinned guard suites (`singularStateAccessGuard`, structural invariant) may need moving
  pins per the `appbuilder-component-authoring` discipline.

## Verification (end-to-end)
1. Scoped jest per step (RED→GREEN), then full `gate` (full jest + `tsc --noEmit` + whole-repo lint).
2. Live (Extension Dev Host from the worktree, `npm run watch:all`): create a project; add TWO
   custom integrations ("Order Sync", "Firefly Image Gen") + a mesh → wizard rows show both names;
   `components/order-sync/` + `components/firefly-image-gen/` on disk; both deploy into distinct
   ow.packages; dashboard rows show the names; per-id redeploy/remove works.
3. Reload VS Code → Edit project → both instances (named) + mesh still listed; picked APIs intact
   after a redeploy (the §E fix).
