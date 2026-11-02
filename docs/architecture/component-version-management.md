# Component version management

Components update independently of the extension, and in the same way: **a push reaches no SC until
it is released.** Every repository the builder owns ships as a GitHub Release with a semantic version
(`RELEASED_REPOS`, `src/core/releases/releasedRepos.ts`, checked against the catalogs by a test).
Repositories it does not own are not ours to release, so they keep following their branch.

The plan this is being built to, with what is still to move: `.rptc/plans/component-semantic-versions/overview.md`.

## How a component moves

| Component | Installs from | Offered an update when | Applying it |
|---|---|---|---|
| API Mesh, ERP, our integrations | Its newest release | A newer release has commits the clone lacks | Fetches the tag and deploys |
| Adobe's starter kit, custom integrations | A branch | The branch has commits the clone lacks | Fetches and deploys |
| EDS storefront | A template repository | The tested boilerplate or template moves | Syncs the repository |
| Headless storefront | GitHub Releases | A newer release | Replaces the folder |

`readNewestRelease` is the one reader of releases: the highest version the channel accepts. A tag that is not a
version never qualifies. Early access reads every track for a component, and is honoured only for a collaborator.

A clone's own remote says which route it takes, so a project holds nothing to migrate. A clone ahead of the release
is never moved back. An owned repository with no release yet offers nothing, and installs from its branch until it
has one.

A mesh keeps `mesh.json` under version control and rebuilds it on every deploy, so a rebuilt one is not read as
the SC's own edit.

The `stable` tags on the mesh repositories stay until no supported extension build reads them: older builds
clone them when a mesh is added. Remove them then, not before.

Not everything floats. A component can pin a real version (`"tag": "v1.0.0"`), which is the right choice where a
moving target would be dangerous rather than convenient. A tag that is not a version records the version from
`package.json` instead.

## Repositories are resolved from the registry

`ComponentRepositoryResolver` reads the repository URL out of `components.json`.
There is no hardcoded map, and adding a component does not mean editing the update
system.

## Extension releases are a different axis

Do not confuse the component `tag` above with a release **track**
(`releaseTrack.ts`), which classifies an EXTENSION release as stable / beta /
early-access by whether its version carries a prerelease suffix. One is where a
component's code comes from; the other is which extension build a user is offered.

Extension releases are published as GitHub **prereleases**, and `releases/latest`
ignores prereleases. Anything asking GitHub for the latest release gets the wrong
answer — a fact that has bitten this repo before. See
[cut-release](../../.claude/skills/cut-release/SKILL.md).

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Every component update
is snapshotted before it starts and rolled back on failure — a half-updated component
is a broken demo the user cannot recover on their own.

## Related

- [`src/features/updates/README.md`](../../src/features/updates/README.md) — the updater,
  and the `.env` rename gap it cannot close (PL-24)
