# State ownership

**Every piece of data lives in exactly one authoritative place.** Written after the
mesh endpoint was stored in two, and the two disagreed.

Duplicated state fails in a specific way: a write can succeed in one place and fail
in the other, and then a read returns a different answer depending which location it
happened to check. Nothing errors. The symptom appears somewhere unrelated, later.

## Who owns what

The manifest is `.demo-builder.json` in the project directory. Its shape is in
`src/types/base.ts`, and the traps in reading it are in
[`src/core/state/README.md`](../../src/core/state/README.md).

| Field | Owns |
|---|---|
| `componentInstances` | installed components, **keyed by id** — ports, paths, status |
| `componentConfigs` | per-component configuration values |
| `commerceStoreStructure` | the discovered store hierarchy |
| `appBuilderComponents` | **the keyed deployables map — the single source of truth** for mesh and integrations ([ADR-011](adr/011-app-builder-deployables.md) D3) |
| `componentApiPicks` | Console API selections, per component |
| `frontendEnvState` | the storefront's environment snapshot |

## The two legacy shapes

`meshState` and `appState` are **manifest-only and read-only**. They predate the
keyed map; manifests migrate on load and forward-migrate on first save. Nothing
should write them.

`additionalConsoleApis` is the flat legacy form of `componentApiPicks`. Same rule.

Both still exist because old manifests do. Neither is a place to put new state.

## The failure this prevents

The mesh endpoint was once written to both `meshState` and the component instance.
Deploy updated one; the dashboard read the other. A deployed mesh displayed "Not
Deployed", and the bug looked like a status problem rather than a storage one.

**The duplicate storage was removed.** The endpoint is no longer held on the
component instance; `appBuilderComponents` is the only place it lives.

That is also why `getMeshComponentInstance` and `getMeshAppBuilderComponent` are two
accessors and not one — they answer different questions, and collapsing them
reproduces the same class of bug.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). `StateManager` is built
once at the composition root; a second instance would fork the caches that make this
map meaningful.
