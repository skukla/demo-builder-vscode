---
id: PL-88
kind: feature
area: platform
needs: []
value: high
status: backlog
---

# A mesh is released and updated like the other components

Owner, 2026-11-01: "A mesh is a demo component. It's release and update process should be consistent
with other components."

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

## What must be settled first

- **Existing projects hold `source.branch: 'stable'`**, and a redeploy clones from it
  (`appBuilderRedeployRun.ts`). Read a mesh's branch from the catalog, or move the record.
- **The `stable` tags must outlive the change.** Extensions already installed clone them on a dashboard add
  and as a fallback, so deleting them breaks those. Delete them once no supported build reads them.
- **Clones.** A mesh on disk may be a shallow clone at a tag, or have no `.git` at all after a release update,
  and the check and the fast-forward both need a usable clone.
- **`main` goes live on every mesh repo.** Headless is 3 commits ahead of `stable`, EDS Commerce 2, both
  rebuilding `mesh.json`. Those two meshes need a PaaS backend to deploy and prove.

## Replaces

`4df075ed5` on `loop/2026-10-31-aco-clear` offers a release to any project whose recorded version cannot be
compared. For Headless and EDS Commerce that release is OLDER than `stable`, so it would offer a step
backward. It was taken off `develop` before any push. It must not reach a release on its own: remove its
updater half here. Its install half (a floating tag is not a version) is proved live on a dashboard add.
