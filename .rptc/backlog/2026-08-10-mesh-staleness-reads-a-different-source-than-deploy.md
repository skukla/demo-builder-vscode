# Mesh staleness reads a different source than mesh deploy

Deploy records what the mesh's `.env` file says. Staleness compares against a flattened
merge of every component's `componentConfigs`. When those two disagree about a mesh env
var, the mesh shows a permanent **"Update available"** that redeploying cannot clear.

## Provenance

Found 2026-08-10 on the live `demo-builder-test` project. The user asked why their mesh
read "Update available" and wondered whether it was fallout from the Configure step-rail
work. It is not — nothing in that work touches mesh `.env` generation, the staleness
detector, or these values.

Reproduced against the real manifest (`~/.demo-builder/projects/demo-builder-test`):

| Source | `ACCS_WEBSITE_CODE` | `ACCS_STORE_CODE` | `ACCS_STORE_VIEW_CODE` |
|---|---|---|---|
| `components/eds-accs-mesh/.env` — what deploy reads | `base` | `main_website_store` | `default` |
| deployed snapshot (`appBuilderComponents['eds-accs-mesh'].envVars`) | `base` | `main_website_store` | `default` |
| `componentConfigs['adobe-commerce-accs']` — wins the flatten | `citisignal` | `citisignal_store` | `citisignal_us` |

Three vars mismatch → `hasChanges: true` → display status `stale` →
`statusVocabulary.ts` renders **"Update available"**.

## The two code paths

**Deploy side** — `updateMeshStateImpl` (`src/features/mesh/services/stalenessDetector.ts`),
whose own comment states the intent:

```ts
// Read env vars from the mesh component's .env file (not componentConfigs)
// This is the actual deployed state since .env file is used during mesh deployment
const envVars = await readMeshEnvVarsFromFile(meshInstance.path);
```

**Staleness side** — `detectMeshChangesImpl`, same file (~:508):

```ts
const allConfigs: Record<string, unknown> = {};
for (const config of Object.values(newComponentConfigs)) {
    Object.assign(allConfigs, config as Record<string, unknown>);
}
const newEnvVars = getMeshEnvVarsImpl(allConfigs);
```

Both answer "what env is the mesh running with?" from different places, and nothing keeps
them in agreement. This is the `architecture-duplication-scan` shape: two paths that must
agree about one fact while nothing makes them.

## Why it matters

1. **The badge is unclearable.** Redeploy re-reads the same `.env`, re-records the same
   snapshot, and staleness keeps comparing the flattened value. The user is told to act
   and the action does nothing — the worst kind of status.
2. **It can mask a real misconfiguration.** On `demo-builder-test` the mesh is deployed
   against store view `default` while the Commerce backend config says `citisignal_us`.
   If CitiSignal is the intended catalog, the mesh is genuinely pointed at the wrong store
   view and this badge is the only thing saying so — but it says it in a form that reads
   as noise.
3. **The flatten is order-dependent.** `Object.assign` over `Object.values(componentConfigs)`
   means the last component wins. Here `adobe-commerce-accs` happens to sort after
   `eds-accs-mesh`; had the order differed, the same disagreement would read as clean.
   The answer depends on manifest key order, which nothing pins.

Not specific to this project: any project where a mesh env var is set on the backend
component but differs on the mesh component gets the same stuck badge.

## Goal / scope

One source of truth for "what env is the mesh running with", used by both the deploy
recorder and the staleness comparison.

**Decide first, then implement — this is a decision, not a refactor.** The candidates:

- **`.env` on both sides.** Matches what actually gets deployed (the mesh CLI reads
  `.env`), and deploy already does this. Staleness would read the same file instead of
  flattening configs. Risk: config edits that have not yet been written to `.env` would
  not register as staleness, so the `.env` write must be reliably part of save.
- **`componentConfigs` on both sides, scoped not flattened.** Read
  `componentConfigs[meshComponentId]` — the mesh's own entry — and drop the flatten
  entirely. Risk: the flatten exists for a stated reason (the comment says cross-boundary
  vars like the PaaS GraphQL endpoint live under the backend, not the mesh), so scoping
  may under-report for PaaS meshes. **Check that claim against the PaaS path before
  choosing** — it is the one thing that would rule this option out.
- **Keep both, reconcile explicitly.** Make the disagreement itself the surfaced state
  ("config differs between backend and mesh") rather than mislabelling it as an available
  update. Heavier, but it is the honest reading of what is actually true.

Whichever wins, the order-dependence must go: no behaviour should depend on
`componentConfigs` key order.

Out of scope: fixing the `demo-builder-test` data (a user-level config choice — set the
store view in Configure → Business Structure and redeploy), and the broader question of
whether backend and mesh components should ever hold different values for the same key.

## Constraints

- `updateMeshStateImpl` is the documented writer chokepoint for every mesh deploy path
  (creation, EDS reset, project reset, dashboard deploy) — ADR-011 D3 Steps 07+09.
  Changing what it records changes all of them at once. That is the leverage and the risk.
- The keyed `appBuilderComponents[id]` map is the single durable model; the legacy
  singular `meshState` write-side is retired. Do not reintroduce a second store.
- `getRelevantMeshEnvVars` already scopes the comparison per mesh type (ACCS vs PaaS).
  Whatever replaces the flatten must keep that scoping — it exists to stop cross-backend
  vars producing false mismatches.
- ACCS snapshots carry four vars; `ACCS_MESH_ENV_VARS` lists five (`ACCS_CUSTOMER_GROUP`
  is absent from the recorded snapshot). Confirm whether that is intended before treating
  a missing key as a change.

## Verification

The bug is invisible to the current tests, so a test that fails first is the deliverable:

1. A project fixture where the mesh `.env` and a backend component disagree on one mesh
   env var. Assert the mesh does NOT read stale. Confirm it fails before the fix.
2. **Order-independence control**: the same fixture with `componentConfigs` keys in the
   opposite order must produce the same verdict. Today it does not — that asymmetry is
   the cleanest proof of the defect.
3. A genuine change (edit a mesh var, write it through to `.env`) must still read stale —
   the control that stops the fix from simply disabling staleness.
4. Live: on a project with the disagreement, confirm the badge clears without a redeploy
   once the sources agree, and that a real config change still raises it.

## Kickoff prompt

```
/rptc:fix Mesh staleness and mesh deploy read different sources for the same fact, so a
mesh can show a permanent "Update available" that redeploying never clears.

Read .rptc/backlog/2026-08-10-mesh-staleness-reads-a-different-source-than-deploy.md
first — it has the reproduction, both code paths with line references, and the three
candidate fixes with the risk that rules each in or out.

Start by settling which source wins; do not start with code. The deciding question is
whether the flatten is load-bearing for PaaS meshes (cross-boundary vars stored under the
backend component) — verify that against the PaaS path before choosing, because it is the
one thing that rules out the scoped-componentConfigs option.

Write the order-independence test first: the same disagreement with componentConfigs keys
in the opposite order currently yields different verdicts, and that failure is the
clearest statement of the bug.
```
