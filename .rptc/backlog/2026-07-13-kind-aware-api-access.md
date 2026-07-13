# Kind-aware API-access step in the Add Integration flow

## Provenance

Scoped 2026-07-13 while improving the Add-Integration API Access screen (the
`cloudGrouping` product sub-grouping + `requiresApproval`/entitlement gating work
that shipped on the same branch). User endorsed the direction; deferred so the
picker improvements land first as a reviewable unit.

## Goal / Scope

Today every integration kind shows the SAME API-access UX: Required (locked/
Included) + an open "Add more APIs (optional)" browse list over the whole org
catalog. That's uniform where it should be **surface-aware**: the right UX
depends on how much we know about the integration's API surface — which is NOT
the same as catalog-vs-custom. The branching signal is "does the entry declare an
API surface (`requiredApis`/`suggestedApis`)?", not `kind`.

| Signal | Surface | Right UX |
|---|---|---|
| `kind === 'mesh'` | Fully known — only `GraphQLServiceSDK`, auto-subscribed at deploy | **Informational only, no picker** |
| declares `requiredApis` **or** `suggestedApis` | Known | Required (facts) + Suggested (curated) + **Advanced** disclosure for the full list |
| declares neither — blank shell (`app-builder-shell`) OR custom `owner-repo` | Unknown — only the user's action code knows | The **full open picker as the primary surface** (current behavior + the shipped grouping/gating) |

Unifying principle: the more we know the integration's API surface, the more the
step is informational/pre-determined; the less we know, the more it's an open
picker. **The shell is the trap:** `app-builder-shell` is a catalog entry
(`kind:'integration'`) but declares no APIs — its design is "add your own APIs
later" (the runtime `add_console_apis` story), so it belongs in the open-picker
bucket alongside custom apps, NOT the Required+Suggested bucket. Branching on
`kind` alone would mis-route it. Verified 2026-07-13: the shell entry has no
`requiredApis`/`suggestedApis`.

**Mesh rationale (load-bearing):** a mesh federates its *sources* by URL +
headers/API-keys in `mesh.config.js`, NOT by workspace-credential API
subscriptions. Subscribing extra org APIs to the mesh credential changes nothing
about what the mesh can federate, so the browse list is un-actionable noise for
mesh. `ensureMeshApiSubscribed` already provisions `GraphQLServiceSDK`
automatically at deploy. (Rare exception: a mesh source injecting the workspace
IMS token — not something the Commerce demo meshes do; don't design around it.)

## Execution plan

1. **Mesh → informational, no picker.** In `ApiAccessStage` (or the stage
   selector in `AddIntegrationFlowModal`), branch on the picked entry's kind.
   For `kind: 'mesh'`, render a one-line confirmation ("API Mesh access
   (GraphQLServiceSDK) is enabled automatically on deploy — nothing to select")
   instead of `CenterColumn`/`ApiAccessPicker`. User chose "informational line,
   no picker" over "skip the step entirely," so keep the step, drop the picker.
2. **Catalog app → Advanced disclosure.** Keep Required (Included column) +
   Suggested visible; move the "All available" browse list behind a collapsed
   "Add more APIs (advanced)" disclosure. Suggested rows one-click / pre-checkable.
   Reuse the in-house collapsible pattern from `NavigationPanel.tsx` (a single
   `useState` boolean `showAllApis` + `ChevronRight`/`ChevronDown` header +
   `{isExpanded && <picker/>}`) — NOT Spectrum's `Disclosure` (available in
   3.46.0 but unused elsewhere; a heavier first-use for one section).
3. **Unknown surface (blank shell OR custom) → full picker, primary.** The full
   picker (with the shipped product sub-grouping + review/profile gating +
   entitlement noise-cleanup) is exactly right here. `app-builder-shell` lands
   here too (it declares no APIs), NOT in the catalog/known bucket.
4. **Branch on the declared surface, not `kind`.** Derive the mode:
   `mesh` → informational; else `requiredApis?.length || suggestedApis?.length`
   → known (Required + Suggested + disclosure); else → open picker. `kind` alone
   mis-routes the shell. The modal already resolves the catalog `entry` and
   passes `required`/`suggested`; add a derived `mode` (or `showPicker` +
   `pickerPrimary`) rather than threading `kind` into `ApiAccessStage`.

## How suggestions work (already config-driven; dormant today)

- `suggestedApis: string[]` is an EXISTING field on `AppBuilderComponentCatalogEntry`
  (`src/types/appBuilderComponents.ts`), stored per entry in
  `app-builder-components.json` next to `requiredApis`. The wizard modal already
  passes `suggested={entry?.suggestedApis}` and the picker already renders a
  "Suggested" group. No new store, no new source of truth.
- **Required vs suggested is the authoring distinction** — this is HOW we suggest:
  - `requiredApis` = the app's actions call it unconditionally (hard dep) →
    auto-subscribed + locked. No judgment.
  - `suggestedApis` = APIs the integration can OPTIONALLY use, or that its demo
    scenario commonly pairs with, but that aren't load-bearing → unchecked,
    listed first. Curated by whoever authors the catalog entry, from the app's
    own manifest/README + the demo narrative it's built for (e.g. a
    commerce-personalization app suggests `FireflyAPISDK` for AI imagery).
- **Dormant today:** no catalog entry populates `suggestedApis` yet — the catalog
  is 3 meshes (need only `GraphQLServiceSDK`, which is *required*/auto → meshes
  suggest nothing) + the blank `app-builder-shell` (unknowable → the custom
  case). The Suggested group lights up with the first authored catalog App
  Builder integration.
- **Do NOT auto-derive suggestions.** App Builder apps don't declare
  workspace-subscription APIs machine-readably, so parsing manifests or learning
  from usage is fragile — YAGNI until enough catalog apps exist (rule of three).
  Suggestions stay reviewed config (a PR to `app-builder-components.json`); if an
  app's API surface changes, its catalog entry changes with it. No drift tooling.

## Constraints

- Selection ≠ provisioning stays intact: required/mesh APIs subscribe at deploy
  (`ensureMeshApiSubscribed`), optional picks union-subscribe on finish.
- Don't regress the shared `ApiAccessPicker` (dashboard Manage APIs uses it too).
  The kind-awareness lives in the wizard stage, not the shared picker.
- Keep the mesh informational copy accurate — it's `GraphQLServiceSDK`, auto at
  deploy, not a user action.

## Kickoff prompt

> Make the Add-Integration API-access step surface-aware per
> `.rptc/backlog/2026-07-13-kind-aware-api-access.md`: branch on the declared API
> surface, NOT `kind`. Mesh → informational line (no picker); entries that declare
> `requiredApis`/`suggestedApis` → Required + Suggested with the full browse list
> behind an "advanced" disclosure; entries that declare neither (the blank
> `app-builder-shell` AND custom `owner-repo` apps) → the full picker as the
> primary surface. TDD; keep the shared `ApiAccessPicker` and the dashboard Manage
> APIs path unchanged.
