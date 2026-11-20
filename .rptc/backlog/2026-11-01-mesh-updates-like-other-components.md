---
id: PL-88
kind: feature
area: platform
needs: []
value: high
status: active
---

# A mesh is released and updated like the other components

Owner, 2026-11-01: "A mesh is a demo component. It's release and update process should be consistent
with other components."

## Reworked by PL-89

Owner, 2026-11-02: every component the builder owns moves to semantic-version releases before beta.153. Following `main` is not
the model. PL-89 (`.rptc/plans/component-semantic-versions/overview.md`) moves meshes to releases, keeping the one-step deploy,
shallow clone and `mesh.json` handling. The branch renames stay.

## What is inconsistent, measured 2026-11-01

Only the three meshes use the moving `stable` tag. Integrations follow a branch: the update check compares
the clone with the branch, and updating fetches and deploys in one step. EDS storefronts install from a
branch. The Headless storefront is the one other component updating from GitHub Releases.

A mesh's version depends on how it arrived:

| Route | Gets |
|---|---|
| New project, beta channel | The newest release (for Headless, a release 14 commits behind `stable`) |
| New project, stable channel | The `stable` tag, because no normal release exists |
| Added from the dashboard | The `stable` tag |
| Updater, beta channel | The newest release |
| Updater, stable channel | Nothing |

The channel's default disagrees too: `beta` in `componentInstallation.ts`, `stable` in `updateManager.ts`,
`checkUpdates.ts` and `package.json`.

An update also leaves the live mesh behind until someone redeploys. The integration route has no such gap.

## The shape

Move meshes onto the integration route: `source.branch` in the catalog, `kind: 'mesh'` no longer excluded
from `integrationUpdateCheck.ts`, update means fetch then deploy. Delete `gitOptions.tag`, the release
lookup in `componentInstallation.ts` and the mesh arm of the release updater, in the same change.

## What the change had to get right

- **Existing projects hold `source.branch: 'stable'`**: a project moves to `main` when it loads.
- **The `stable` tags** were deleted on the owner's go, 2026-11-02 (PL-89 records the commits).
- **Shallow clones** could never read as behind, so a clone gains its history on the first check. A rebuilt
  `mesh.json` is tracked, so it had to stop reading as the SC's own edit.
- **Branch names.** Two of the three repositories used `master`, and one also had a stale `main` holding an old Node
  range. All three are on `main` now (owner, 2026-11-01), the stale one kept as `archive/main-2026-01`.
- **`main` goes live on every mesh repo.** Headless and EDS Commerce need a PaaS backend to deploy and prove.

## Not handled

A mesh folder with no `.git`, left by an earlier release update, cannot be compared with its branch. The check
answers unknown and offers nothing. Removing and adding the mesh again puts it right.

## Shipped so far

- 2026-11-01  fix(mesh): a mesh updates from its branch, as the other components do (`a2bea4164`)
