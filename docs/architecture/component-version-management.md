# Component version management

Components update independently of the extension. A mesh fix ships without anyone
installing a new VSIX.

## How a component moves

| Component | Installs from | Offered an update when | Applying it |
|---|---|---|---|
| API Mesh | A branch (`main`) | The branch has commits the clone lacks | Fetches and deploys |
| Integration, ERP | A branch | The branch has commits the clone lacks | Fetches and deploys |
| EDS storefront | A template repository | The tested boilerplate or template moves | Syncs the repository |
| Headless storefront | GitHub Releases | A newer release | Replaces the folder |

So pushing to a mesh's `main` is what ships it. Nothing else stands between the two, which is why each mesh
repository runs its checks on every push.

A mesh keeps `mesh.json` under version control and rebuilds it on every deploy, so a rebuilt one is not read as
the SC's own edit.

The `stable` tags on the mesh repositories stay until no supported extension build reads them: older builds
clone them when a mesh is added. Remove them then, not before. A project recorded on that tag moves to `main` when
it loads, and its shallow clone gains the history it needs on the first check.

Not everything floats. A component can pin a real version (`"tag": "v1.0.0"`), which is the right choice where a
moving target would be dangerous rather than convenient. Pinning is a per-component decision made in the registry,
not a global policy. A tag that is not a version records the version from `package.json` instead.

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
