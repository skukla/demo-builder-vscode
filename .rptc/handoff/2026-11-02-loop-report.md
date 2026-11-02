# Loop report, 2026-11-02: every component the builder owns ships by release (PL-89)

## Summary

The code is finished, and the full quality check passes (37,009 tests). A push to any repository the builder owns no longer
reaches an SC; publishing a release does, as with the extension. The release step exists, and all 11 repositories it covers pass
its dry run. What is left needs the owner's go: test releases on each repository, and then the real ones. Nothing was pushed,
tagged or published. Beta.153 stays blocked until that is done.

The story: the owner decided every component moves to one versioned approach, then that beta.153 waits for it. The updater, the
installer and the storefront paths each decided "newest" their own way, and several followed a branch. They now share one lookup.

## Shipped, on `feature/component-releases`, awaiting merge

- Meshes, the ERP and its integration, and the shell update to their newest release. An SC's edit still stops the update.
- A Headless update moves the folder rather than replacing it, so an SC's edits survive.
- A folder with no git history, left by the old updater, is cloned again at the release, and the old folder is kept.
- EDS storefronts record the `eds-demo-patches` release they are on. A release of fixes alone is now offered, and applied.
- A failed lookup no longer falls back to the patches repository's `main`, so an unreleased commit cannot reach a storefront.
- Block libraries, Bodea brand assets and the inspector's SDK are read at their release, and `buildright-eds` updates to its release.
- Early access lets a collaborator try a test release, on fresh installs and on updates.
- `component-release` is the shared release step. It is dry by default.

## Handed off: what remains, exactly

1. Merge this branch into develop. It holds 13 commits of work, and replaces PL-88's model.
2. Test each repository live (`validation.md` has the table). Each step publishes a test release that only a collaborator on
   early access sees, so each needs a go. The Commerce and Headless meshes need a PaaS backend to prove.
3. A throwaway storefront, to prove an EDS update live. It creates a GitHub repository and publishes to the CDN.
4. Cut beta.153.
5. Publish first normal releases, in this order: meshes, `demo-erp`, the integration, the rest. Four repositories need a push first,
   bumping `package.json` from a beta to 1.0.0: the three meshes and `citisignal-nextjs`.
6. Delete the fallback to a branch for our repositories (a lookup cannot yet tell "no release" from "could not ask").

## Filed: known limits

- Creating a storefront from `buildright-eds` still copies its default branch, because GitHub's template copy takes no version. It is hidden.
- If the tested-commit lookup fails while creating a storefront, it stays at Adobe's latest and says so in the log. That behaviour is older than this work.
- `component-release` was not run with `--publish`, so publishing itself is untested.

## Retracted / corrected

- I said three repositories had no tests. `demo-inspector-sdk` has tests and no CI, `bodea-source` has CI guards and lint, and `buildright-eds` has only a build. So no tests were added: the step takes each repository's own checks.
- I committed one step before reading a rule failure. The next commit fixed it.
- A first dry run reported failures that were my step's fault, not the repositories': it now takes CI's answer when there is one.
- The tests found three bugs in this work before it was committed, the worst being a library's blocks and authoring files coming from two versions.
- I told a helper the archive function was still used, from a name match. It was not, and it is gone.

## Environment facts

- The dev host is still on develop for the dialog review. This branch was compiled, not loaded in a window, so nothing here has run in the running extension.
- The loop's usual backup push was skipped, because the owner was told nothing is pushed without a go.

## Your decisions

1. The inspector's update row is removed. It never worked: nothing recorded an install and applying it changed no files. A storefront gets the newest SDK when created or reset. Recommended: leave it so, since a real update overwrites a vendored folder and needs its own edit protection.
2. Go on test releases on the 11 repositories.
3. Go on a throwaway storefront.
4. Merge into develop.
