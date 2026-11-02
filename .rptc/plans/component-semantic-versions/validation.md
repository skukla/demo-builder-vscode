# Validating the release process on every repository

The owner's bar for beta.153 (2026-11-02): implemented, tested and validated on every repository the builder owns.

## Dry run, 2026-11-02

`component-release` on a fresh clone of each repository, as version `99.0.0-alpha.1`. Publishes nothing. Passing means every
check passed: version, notes, clean tree, pushed tip of `main`, CI or local checks, and the ERP contract.

| Repository | Dry run | Checked by | `package.json` | First normal release needs |
|---|---|---|---|---|
| `app-builder-shell` | Passes | CI | 1.0.0 | Nothing: 1.0.0 |
| `bodea-source` | Passes | Local lint (its only CI job is skipped here) | 6.0.0 | Nothing: 6.0.0 |
| `buildright-eds` | Passes | CI | 1.0.0 | Nothing: 1.0.0 |
| `citisignal-nextjs` | Passes | CI | 1.0.0-beta.5 | A push bumping it to 1.0.0 |
| `commerce-eds-mesh` | Passes | CI | 1.0.0-beta.2 | A push bumping it to 1.0.0. Its tags reach beta.5, so its `package.json` already disagrees |
| `commerce-erp-integration` | Passes | CI | 0.1.0 | Nothing: 0.1.0, after `demo-erp` |
| `demo-builder-block-library` | Passes | CI | 0.1.0 | Nothing: 0.1.0 |
| `demo-erp` | Passes | CI | 0.1.5 | Nothing: 0.1.5, first of the pair |
| `demo-inspector-sdk` | Passes | Local tests (it has no CI) | 1.0.0 | Nothing: 1.0.0 |
| `eds-accs-mesh` | Passes | CI | 1.0.0-beta.2 | A push bumping it to 1.0.0 |
| `headless-commerce-mesh` | Passes | CI | 1.0.0-beta.2 | A push bumping it to 1.0.0 |
| `eds-demo-patches` | Refused, as it should be | Its own daily gate publishes its release | none | Nothing: at v1.1.5 already |

## The refusals, on real repositories

So a pass above means something. Each ran against the same clones.

| Asked for | Answer |
|---|---|
| `eds-accs-mesh` 1.0.0-beta.1 | Refused: not above 1.0.0-beta.2, and `package.json` disagrees |
| `demo-erp` 0.2.0 | Refused: `package.json` says 0.1.5 |
| Empty notes | Refused |
| Version `1.2` | Refused: no channel accepts it |
| `demo-builder-vscode` | Refused: not in the list. The extension uses `cut-release` |
| `eds-demo-patches` | Refused: publishes its own |
| `commerce-erp-integration` 0.1.0, normal | Refused: no released `demo-erp` to agree with yet |

## Still to do, each needing the owner's go

Each publishes something real, so none has run. An alpha reaches only a collaborator on early access. On the beta channel,
beta.152's install lookup takes a mesh's newest release of any kind, so a mesh's alpha comes down as soon as it is proved.

| Repository | Alpha published | Update check offers it | Installs fresh | Applies on an existing project | Removed |
|---|---|---|---|---|---|
| `app-builder-shell` | | | | | |
| `bodea-source` | | | | | |
| `buildright-eds` | | | | | |
| `citisignal-nextjs` | | | | | |
| `commerce-eds-mesh` | | | | | |
| `commerce-erp-integration` | | | | | |
| `demo-builder-block-library` | | | | | |
| `demo-erp` | | | | | |
| `demo-inspector-sdk` | | | | not offered: arrives on reset | |
| `eds-accs-mesh` | | | | | |
| `headless-commerce-mesh` | | | | | |
| `eds-demo-patches` | its next nightly release, no alpha | | | | not removed |

Commerce and Headless meshes need a PaaS backend to deploy and prove. Anything not provable here gets said so in this table.
