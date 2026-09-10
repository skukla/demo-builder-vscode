# Component version management

Components update independently of the extension. A mesh fix ships without anyone
installing a new VSIX.

## The floating stable tag

A component declares the ref it installs from in `components.json`, and most declare
`"tag": "stable"` — a tag that **moves**. Publishing a fix means moving the tag; no
extension release is involved.

Not everything floats. At least one component pins a real version (`v1.0.0`), which
is the right choice where a moving target would be dangerous rather than convenient.
Pinning is a per-component decision made in the registry, not a global policy.

The cost of floating is that "which version is installed" becomes a question about
the checkout rather than about the extension — which is why the updater records what
it installed rather than inferring it.

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
