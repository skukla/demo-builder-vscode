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

### 3. Plural custom integrations as packages in one app — the real model work
Today the **selection** layer is multi-valued (`selectedAppBuilderComponents[]` →
`componentSelections.appBuilder[]`, one `components/<id>/` per entry) while the **deploy/state**
layer is singular (`appState`, the `addAppComponent` one-app guard). The decided target is
"multiple integration domains as packages inside one app." Realizing it is the existing
**slice 3 (package-bound)** work, currently gated on the first real bound integration. This item
does not duplicate that — it reframes it in the confirmed product language and links it.

## Cross-references (do not fork these)
- Decided model + slices: backlog §A "App Builder app family"
  ([`2026-06-17-appbuilder-app-deploy-spine.md`](2026-06-17-appbuilder-app-deploy-spine.md)),
  slice 3 ([`2026-06-17-appbuilder-app-package-bound.md`](2026-06-17-appbuilder-app-package-bound.md)).
- Wizard-selection persistence + ReviewStep visibility: backlog §E
  ([`2026-06-21-appbuilder-component-first-class-persistence.md`](2026-06-21-appbuilder-component-first-class-persistence.md))
  — distinct from item 2 here (that item is deployed-runtime `appState`; §E is wizard selections).
- Deterministic integrations (kind picker, custom/import lifecycle):
  [`2026-07-13-deterministic-integrations.md`](2026-07-13-deterministic-integrations.md).

## Constraints
- Public repo — no secrets in `appState`/manifest; `appBuilderComponentSources` holds only
  owner/repo (already the case).
- Rename is **product strings only**; never rename internal App Builder identifiers.
- Item 2 mirrors the existing `meshState` persistence exactly — no new abstraction.

## Kickoff prompt
> Pick up the custom-integration follow-ups (`.rptc/backlog/2026-07-15-custom-integration-language-and-model.md`).
> Item 2 (persist `appState`) shipped 2026-07-15 (`f91669cb`). Remaining: persist
> `appBuilderComponentSources` + `additionalConsoleApis` through a save/reload cycle — this needs a
> `writeManifest` **and** `projectFileLoader` change, so pursue it under §E (edit-mode rehydration),
> not as a writer-only tweak. Then reassess item 3 against slice 3 (package-bound) before any model change.
