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

## Live test, 2026-11-02

Each repository published `99.0.0-alpha.1` through `component-release --publish` (`eds-accs-mesh` also `-alpha.2`). All have been
removed again, confirmed by reading each repository's tags and releases, with a control that the `stable` tag survived. Run on a dev
build, on the early-access channel, against `scratch-1028`.

| Repository | Published | Offered by the check | Fresh install | Applied | What was not proved |
|---|---|---|---|---|---|
| `eds-accs-mesh` | Yes | Yes, by version | Not run | Yes, deployed: version recorded, then reads as up to date | |
| `eds-demo-patches` | Its own v1.1.5 | Yes, a fixes-only release | Yes, new repo built from v1.1.5 | Yes: a fix taken out was put back in one commit, v1.1.5 recorded | A release that also moves the tested commit, live: real-git suites cover it |
| `demo-builder-block-library` | Yes | Yes, by version | Tag and alpha were the same commit, so a fresh build cannot show which it read | Yes, add-only: version and commit recorded. With no release it offers nothing | |
| `app-builder-shell` | Yes | Not run | Yes: cloned at the tag, deployed, answered 200, removed | Not run | Update of an installed shell: same code as the mesh |
| `demo-erp` | Yes | Yes, on JustRite | Not run | Update's git steps only, on a clone | A deploy: only JustRite has one, and that is a real demo |
| `commerce-erp-integration` | Yes | Yes, on JustRite | Not run | Update's git steps only, on a clone | A deploy: its install writes to the Commerce store JustRite shares |
| `bodea-source` | Yes | Read at its tag: up to date, correctly | Tag and a brand file read | Not run | A Bodea storefront build: the throwaway stopped at Code Sync |
| `demo-inspector-sdk` | Yes | No row, by decision | 5 files vendored during the throwaway's build. Tag and `main` were the same commit, so it cannot show which it read | Arrives on reset | |
| `citisignal-nextjs` | Yes | Not run | Not run | Update's git steps only, on a clone | No Headless project: it needs a PaaS backend |
| `buildright-eds` | Yes | Not run | Not run | Update's git steps only, on a clone | It is hidden, so no project can select it |
| `commerce-eds-mesh` | Yes | Not run | Clone and build at the tag | Not run | A deploy: it needs a PaaS backend |
| `headless-commerce-mesh` | Yes | Not run | Clone and build at the tag | Not run | A deploy: it needs a PaaS backend |

## What the live test found

- A mesh deploy never recorded the commit it shipped, so a mesh was offered the same update forever. Fixed.
- Removing a component left its version record behind. Fixed for new removals. JustRite still holds one from before, for a mesh it no longer has: harmless.
- A mesh update waits for a DA.live sign-in, because it republishes the storefront's config. If nobody answers, the offer stays on though the mesh is live. Left as it is.
- A brand-new repository waits up to about 100 minutes for the AEM Code Sync app. That is the existing design. The throwaway's repository and DA.live site are gone. Its Config Service record could not be read back (401).

## How the test left things

`scratch-1028`: the mesh is on `eds-accs-mesh` `main` at c0aa9f4, the same commit as before the test. Its repository has two extra commits that cancel out. It now records patches `v1.1.5`, which is true. Test version records were restored by hand, as were JustRite's offers from the test, and the update channel setting.
