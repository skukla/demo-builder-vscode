# Mesh

Deploys the project's API Mesh to Adobe I/O Runtime, and tells the user when the
deployed mesh no longer matches what is on disk.

## Where to start

`services/meshDeployment.ts` — `deployMeshComponent` is the spine. Everything else
either feeds it or checks its result.

## The deploy sequence

Validate `mesh.json` → `aio api-mesh update` → poll for completion
(`meshDeploymentVerifier`, up to 3 minutes) → verify it exists
(`meshVerifier`) → record the outcome.

The poll is not optional. `aio api-mesh update` returns as soon as Adobe accepts the
request, not when the mesh is live, so a deploy that skipped the poll would report
success against a mesh that is still building.

## Staleness — the part that is not obvious

The extension cannot ask Adobe "is this the same config?", so it decides locally by
comparing two things captured at deploy time (`stalenessDetector.ts`):

- **Environment variables** the mesh reads. A changed value means a different mesh
  even though `mesh.json` is byte-identical.
- **A hash of the source files** — resolvers, schemas, `mesh.json`.

A project whose recorded state is missing reports `unknownDeployedState` rather than
guessing. That case is deliberate: telling a user their mesh is current when nobody
knows is worse than asking them to redeploy.

## Two accessors, and they are not interchangeable

- `getMeshComponentInstance` — the component instance. Its `status` drives
  deploying/error in the UI.
- `getMeshAppBuilderComponent` — the deploy record: endpoint, `lastDeployed`.

Code using both is doing it deliberately. Collapsing them reads as a simplification
and reproduces the 2026-08-04 regression where a deployed mesh displayed
"Not Deployed".

## How it fits

Since [ADR-011](../../../docs/architecture/adr/011-app-builder-deployables.md) D3 the
mesh is **one kind of App Builder component**, not a special case — it lives in the
keyed `project.appBuilderComponents` map alongside integrations, and shares the
deploy spine with `features/app-builder`. The singular `meshState` field still on
older manifests is legacy read-only; manifests migrate on load.

Adobe calls are wrapped in `withOrgContext` so they target the project's org rather
than whatever `aio` was last pointed at — see
[adobe-org-context](../../../.claude/skills/adobe-org-context/SKILL.md).

Authentication is checked BEFORE any mesh operation. Without that, an expired session
launches a browser in the middle of a deploy, which reads as a crash.

## Conventions this feature is bound by

The rules live in [the handbook](../../../docs/development/handbook.md); this feature
has no exemptions from them. The one worth naming here: **there is no
`features/mesh/index.ts`** and one must not be added
([ADR-022](../../../docs/architecture/adr/022-barrel-files.md)) — import the module
that defines the symbol.
