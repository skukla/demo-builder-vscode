# Plan: Per-integration Adobe API attribution — overview

**Status:** Designed (2026-07-30), decisions locked with PM in-session. **Not started.**
**Parent:** D2 Track B of
[`../appbuilder-deployable-model/overview.md`](../appbuilder-deployable-model/overview.md) — this is the
API half of "what does *this* integration need". **The env-var half already SHIPPED** (that plan's
Track B steps 01 + 04: `envSchema` on catalog entries, `classifyEnvSchema`, `AppBuilderComponentFieldsSection`
in Configure, `appBuilderComponentSecrets` → SecretStorage). This plan follows that precedent rather
than inventing a model.
**Decision record:** [ADR-011 App Builder Deployables](../../../docs/architecture/adr/011-app-builder-deployables.md).

## The idea in one line

A project holds N integrations; each declares the Adobe APIs it needs; the extension **unions** them
into the one App Builder workspace's single subscribe PUT — so API picks must be **attributed to the
integration that wanted them**, not pooled into one anonymous project list.

## The actual defect: attribution is discarded at the write

This is not a missing concept. The model already keys picks per integration and the storage flattens
them:

- `src/types/webview.ts:64` — `selectedConsoleApis?: Record<string, string[]>`, commented
  "Free Console API picks (sdk codes) **per integration id**".
- `src/features/project-creation/ui/wizard/wizardHelpers.ts:731` —
  `additionalConsoleApis: unionConsoleApiPicks(wizardState.selectedConsoleApis)`. The keyed record is
  collapsed into a flat `string[]` at the persist boundary.
- `src/types/base.ts:156-161` — `project.additionalConsoleApis?: string[]`, described as "ad-hoc
  Console API picks beyond `requiredApis` — NOT derivable".
- `flowStages.ts:19` — `RESERVED_EXISTING_KEY = '__existing__'` exists *because* attribution was
  already lost on a prior round-trip; it is the placeholder owner for un-attributable picks.

So the fix is to stop unioning at write time and union at read time instead.

### The configuration model already solved this — for env vars

APIs are the ONLY per-integration input in the whole configuration model that isn't keyed by component.
The env-var path is the shipped precedent this plan copies:

| | declarative (catalog entry) | user-supplied | attributed? |
|---|---|---|---|
| Env vars | `envSchema[]` (`types/appBuilderComponents.ts`) | `componentConfigs[id]` → `.env`; secrets → SecretStorage via `secretKey(componentId, name)` | **yes** |
| Adobe APIs | `requiredApis[]` (same entry) | `project.additionalConsoleApis` | **no — flat** |

`classifyEnvSchema` (`features/project-creation/services/envVarClassifier.ts`) buckets each declared var
into `autoProvisioned` / `autoWired` / `userText` / `userSecret`; `ConfigureScreen` →
`AppBuilderComponentFieldsSection` renders the user buckets **per App Builder component**. So the
declarative halves are already symmetric (`requiredApis` beside `envSchema`) and only the user-supplied
half diverges.

**Consequence — there may already be a home for this UI.** Configure is the existing per-integration
"what does this one need" surface. Adding the API section there (beside that integration's env fields)
may be righter than a second editing surface on the card. Decide in step 05; see Open items.

**The engine is already correct.** `subscribeRequiredApis` (D1 step 07) takes `(catalog, desired)` and
reconciles the full union; `handleSetConsoleApis` sets the extras to *exactly* the given list, so codes
no one holds are genuinely unsubscribed. Only the *input* to `desired` changes.

**`managed` is already project-wide.** `handleListConsoleApis`
(`src/features/dashboard/handlers/consoleApiHandlers.ts:53-93`) computes
`computeRequiredApis(resolveProjectCatalog(project), [])` — every component's catalog `requiredApis`
plus baseline — and renders them locked. What it cannot do today is say *whose* requirement a locked
row is.

## Prior art audit (2026-07-30) — read before planning steps

**⚠️ CONFLICT — [`../unify-api-subscribe-at-rebuild/overview.md`](../unify-api-subscribe-at-rebuild/overview.md)
(user-approved, NOT started — no branch, no worktree).** Its Change 1 is "every integration's APIs land
at **one place — the rebuild**; the modal never provisions," removing the mesh's in-modal subscribe.
Locked decision 3 below says subscription is **immediate on edit**. Both can technically coexist (defer
at *add*, immediate at *live edit*), but that reintroduces two provisioning moments — the exact "mixing
and matching" frustration that plan exists to kill. **Needs an explicit ruling before either proceeds.**

**Taxonomy already shipped — it constrains the resolver.**
[`../../backlog/2026-07-13-deterministic-integrations.md`](../../backlog/2026-07-13-deterministic-integrations.md)
Layer 1 is SHIPPED: **mesh + catalog** integrations have declared `requiredApis`, shown-not-picked,
auto-subscribed at deploy; only **custom (blank shell) + import (repo)** get an interactive picker. So
"Added for *this* integration" rows exist **only for custom/import kinds** — a mesh or catalog
integration has no editable API set at all, and its section must render read-only rather than empty.

**Per-integration re-edit already exists in the wizard.** `useIntegrationFlow.ts:215` `saveEditedPicks`
writes `selectedConsoleApis[componentId]` — attributed — behind FlowMode `api-edit` ("Edit API Access").
The wizard side is DONE; only the live/dashboard side flattens. This reverses the earlier call not to
reuse `api-edit`: it is the shipped per-integration editor, and step 05 should reuse it rather than
build a second one.

**TWO console-API handler surfaces.** `features/project-creation/handlers/consoleApiHandlers.ts`
(wizard, `list-org-console-apis`) and `features/dashboard/handlers/consoleApiHandlers.ts` (live,
`listConsoleApis` / `setConsoleApis`). Step 04 must cover BOTH or they diverge on attribution.

**Migration precedent already shipped.** `buildEditModeIntegrationState` (`useWizardState`) already
rehydrates flat `additionalConsoleApis` as `selectedConsoleApis.__existing__`
([`../../backlog/2026-06-21-appbuilder-component-first-class-persistence.md`](../../backlog/2026-06-21-appbuilder-component-first-class-persistence.md)).
Step 01's migration copies working code, not a sketch.

**Adjacent, NOT incorporated** (tracked separately; no dependency either way):
`2026-07-15-custom-integration-language-and-model` (product noun = "custom integration"),
`2026-07-13-promote-app-to-repo`, `2026-07-16-shell-instancing-named-ai-integrations`, and the
persistence backlog's remaining items (ReviewStep `components.appBuilder` bug,
`selectedOptionalDependencies` rehydration, D3 dual-flow removal).

## Locked decisions (PM, 2026-07-30)

1. **Removal IS allowed, and the union is what makes it safe.** A user who adds APIs for a custom
   integration and finds they don't need them can remove them; unchecking recomputes the union and
   genuinely unsubscribes *only if no other integration holds the code*. What must never be possible is
   removing an API another integration depends on to operate — enforced by locking those rows at render
   time, not by forbidding removal.
2. **Every API is attributed to an integration.** The existing flat `additionalConsoleApis` cannot be
   retroactively attributed, so it migrates into an explicitly unattributed bucket (the `__existing__`
   shape the wizard already models) and is shown as "added directly" in the project view. No owner is
   guessed.
3. **Subscription is immediate**, on edit — not deferred to next deploy. Matches today's dashboard
   semantics; a subscription is a prerequisite, not a build output. **⚠️ CONTESTED** — see the
   conflict with `unify-api-subscribe-at-rebuild` above. Ruling needed: does "one provisioning
   moment" apply only to the ADD journey (leaving live edits immediate), or to every path?

## The four row states (the load-bearing derivation)

For a given integration, every API row resolves to exactly one state. This is a pure function and is
where the safety property lives:

| Row state | Source | Removable | Renders as |
|---|---|---|---|
| Required by *this* integration | its own catalog `requiredApis` | No | locked — "Required by ERP Sync" |
| Added for *this* integration | its own `componentApiPicks[id]` entry | **Yes** | checked, removable |
| Required by *another* integration | any other component's required ∪ added | No | locked — **"Required by Loyalty"** |
| Baseline | always-on | No | locked — "Always on" |

**Kind gate (from the shipped taxonomy).** Only **custom (blank shell)** and **import (repo)**
integrations can have an "Added" row at all. For **mesh** and **catalog** integrations every row is
locked and the section is purely informational — matching `ApiAccessStage` (informational) vs
`ApiPickerStage` (interactive) in the add journey. The resolver must take the kind, not just the id.

**A locked row must state its reason.** Without attribution text, a checkbox that mysteriously refuses
to uncheck reads as a bug rather than a constraint. This is the single highest-value piece of copy in
the feature.

## Two surfaces

**Per-integration (card → Edit → Adobe APIs).** Shows only this integration's needs, using the four
states above. Other integrations' picks appear *only* as locked rows with attribution — never as
editable ones. Editing here changes this integration's intent alone.

**Project level (off the integrations surface header).** The resulting union with attribution: each
subscribed API and which integrations require it, plus any code required by nothing (left behind by a
removed integration — the parent plan's line 316 decision is to *leave APIs subscribed* on removal) with
an explicit cleanup action. This is the only place a workspace-wide unsubscribe is initiated deliberately.

## Store choice: a dedicated `componentApiPicks`, not either existing store

API picks are the user's **intent** ("this integration should have these APIs"). The subscribed union on
the workspace is the **state**. Both existing per-component stores were evaluated and rejected:

- **`componentConfigs[id]` — rejected.** It is not per-component storage. `resolveEnvVarValue`
  (`features/project-creation/helpers/envFileGenerator.ts:125-133`) iterates **every** component's
  config for a key and returns the first match — the comment states the intent: "pulls values from ALL
  componentConfigs, not just the component's own config… enables cross-boundary value sharing." Values
  are then `String()`-ified into `.env`. It is a cross-component pool keyed by env-var name, read
  unattributed by design, destined for `.env`. Storing API picks there would contradict the exact
  property this plan establishes.
- **`appBuilderComponents[id].additionalApis` — rejected.** Merge-safe *today* (`recordDeployOutcome`
  spreads `...existing` before `...outcome`, and a test pins "preserving prior fields"), but it is the
  **deploy-outcome record**, written by every deploy path. User intent living there survives only as
  long as every future writer spreads correctly; one dropped spread silently shrinks the union and
  **unsubscribes APIs with no user action**. Wrong category, and a bad failure mode.
- **`project.componentApiPicks: Record<componentId, string[]>` — chosen.** It is the shape the wizard
  already carries in memory (`selectedConsoleApis`, `types/webview.ts:64`), so step 02 persists the
  record as-is rather than reshaping it. Exactly one writer (the API path); no deploy path touches it;
  no `.env` surface. Migration is the flat array → `{ __existing__: [...] }`, the `RESERVED_EXISTING_KEY`
  shape the wizard already models.

## Steps (TDD-ready; RED before GREEN each step)

| Step | Title | One-line | Key risk |
|---|---|---|---|
| 00 | RPTC re-init | Re-invoke the originating command; baseline GREEN | — |
| 01 | Keyed persistence + migration | `project.componentApiPicks: Record<componentId, string[]>` (see **Store choice** below); `resolveDesiredApis(project)` unions at READ time; one-time migration of flat `additionalConsoleApis` → `{ __existing__: [...] }`. Legacy field still readable. | Silent loss of existing picks on migration; manifest round-trip (`projectConfigWriter.ts:128-132` + `projectFileLoader.ts:128`) |
| 02 | Wizard persists keyed | `wizardHelpers.ts:731` stops calling `unionConsoleApiPicks`; writes the keyed record through. `__existing__` maps to the unattributed bucket. | Wizard round-trip regression; `RESERVED_EXISTING_KEY` double-counting in the union |
| 03 | Four-state row resolver | Pure `resolveApiRows(project, componentId)` → rows tagged `mine-required` / `mine-optional` / `other-required` (+ owner names) / `baseline` | Mis-scoped "other" set silently unlocking a shared code — 100% branch coverage required |
| 04 | Per-integration handlers — BOTH surfaces | `dashboard/handlers/consoleApiHandlers.ts` (`listConsoleApis`/`setConsoleApis`) AND `project-creation/handlers/consoleApiHandlers.ts` (`list-org-console-apis`) take a `componentId`; list returns resolver rows + attribution, set writes that component's `componentApiPicks[id]` entry only | Two handler files drifting on attribution; count-pinned handler-map tests; the wizard picker already passes componentIds — do not regress it |
| 05 | Per-integration Adobe APIs section | **Reuse the wizard's `api-edit` FlowMode** (`saveEditedPicks`, already writes `selectedConsoleApis[componentId]`) rather than building a second editor; retire `EditIntegrationModal`'s project-scoped picker. **First decide the host** (Open items): Configure's `AppBuilderComponentFieldsSection` vs. the card. Do NOT ship both. | `ApiAccessPicker` `locked` needs a reason slot; a second editing surface competing with Configure AND with `api-edit`; kind-gate regressions (mesh/catalog must stay informational) |
| 06 | Project-level union view | Subscribed union + per-code attribution + "required by nothing" orphans with explicit cleanup | Cleanup is a real workspace unsubscribe — confirm dialog, no silent reconcile |
| 07 | Retire the flat write path | Delete `additionalConsoleApis` write side once parity is proven; keep read for legacy manifests | Removing the legacy field before migration is proven on a real project |

## Test strategy

- **Unit (majority):** the step-03 resolver across all four states and their precedence; union
  derivation with 0/1/N integrations; migration mapping including the empty and malformed cases;
  `__existing__` handling.
- **Migration must be UNION-PRESERVING (highest risk in the plan).** A golden test: for a real
  pre-migration project, `resolveDesiredApis(migrate(project))` must equal the pre-migration
  `additionalConsoleApis` set EXACTLY. If migration shrinks the computed union by even one code, the
  next subscribe PUT — which sets extras to exactly the desired list — **unsubscribes a live API on a
  working project**. This is the one failure mode that damages real workspaces rather than just the UI.
- **Regression guard (load-bearing):** an integration holding code X, a second integration also
  holding X — unchecking X on the first must leave X subscribed AND leave the second's row untouched.
  This is the safety property; it gets an explicit named test.
- **Integration:** handler round-trip with mocked SDK (list → toggle → set → re-list reflects the
  change for that component only).
- **Coverage:** 100% on the resolver and the migration.

## Constraints

- Files <500 lines / components <350 / functions <50; no nested ternaries; `TIMEOUTS.*` only.
- No new npm deps. Reuse `subscribeRequiredApis`, `computeRequiredApis`, `resolveProjectCatalog`,
  `ApiAccessPicker`, the keyed `appBuilderComponents` accessors.
- Secrets → SecretStorage; repo is PUBLIC. `fake-test-pw-not-a-secret` in fixtures.
- CI lints the WHOLE repo: `npm run lint` + `npx tsc --noEmit` + full `npx jest --no-coverage` before
  pushing. Never pipe jest through `tail`/`head`/`grep`.

## Open items (not blocking)

- **The mesh.** It is a deployable with catalog `requiredApis` (API Mesh / `GraphQLServiceSDK`) and
  already contributes to the union via `resolveProjectCatalog`. Its card currently has no menu. Decide
  whether it gains a read-only "APIs in use" view for symmetry — it has no user-editable extras.
- **Which surface hosts the API section (decide before step 05).** Configure already renders each
  integration's user inputs via `AppBuilderComponentFieldsSection`. Adding APIs there gives one
  per-integration "what this needs" surface; putting them in the card's Edit modal gives two places to
  edit one integration. Recommendation: **Configure**, with the card's Edit reduced to rename (or
  linking through to Configure). This also resolves what the card kebab's Edit item should do.
- **Catalog coverage.** Only the three meshes declare an `envSchema` today (one var each) and
  `app-builder-shell` declares none, so a per-integration inputs surface is sparse until real
  integration entries land. The API section is the first thing that will reliably have content.

## Interim risk (decide before this plan lands)

`EditIntegrationModal` (shipped 2026-07-30, uncommitted) presents the **project-scoped**
`additionalConsoleApis` picker inside a dialog titled after one integration: unchecking a code there
today unsubscribes it for every integration and the mesh. Either land step 05, or interim-scope the
modal to rename-only and move the API picker to a project-level surface until this plan executes.
