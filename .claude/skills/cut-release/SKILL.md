---
name: cut-release
description: Cut a Demo Builder VSIX beta release — bump version, merge develop→master, tag, package the VSIX, and publish a GitHub pre-release (which auto-updates all beta users). Use when the user asks to "cut a release", "ship beta.N", or publish a new build.
---

# Cut a Demo Builder beta release

Publishes a new `1.0.0-beta.<N>` VSIX of `adobe-demo-builder` as a GitHub
**pre-release**. Verified against the actual shipping process (see the project's
`docs/CLAUDE.md` checklist — the concrete mechanics below are NOT spelled out there).

## ⚠️ Before anything: this IS user-facing distribution

The GitHub Release is the distribution channel — the in-extension auto-update
system pulls prereleases and pushes them to **all beta users**. CI does **not**
publish on tag; release creation is fully manual via `gh`. Never run this without
the user's explicit intent to ship.

Also expect, on direct pushes to `develop`/`master`:
`Bypassed rule violations ... 2 of 2 required status checks expected` — that's the
branch-protection notice, **not** a failure.

## Preconditions (verify, don't assume)

1. On `develop`, working tree clean (`git status --short` empty).
2. Tests green and the user has done an F5 / manual sanity check. Ask if unsure.
3. `gh` is authenticated (as `skukla`). `gh auth status` if in doubt.
4. Determine `<N>`: current `package.json` version is `1.0.0-beta.<prev>`; the new
   one is `<prev>+1` unless the user says otherwise.

## Steps (run from `develop`)

Let `N` = new beta number, `PREV` = current one.

1. **Bump the version line — do NOT run `npm version`** (it reflows the
   `enum`/`enumItemLabels` JSON arrays in package.json as a side effect).
   Edit by hand:
   - `package.json` → `"version": "1.0.0-beta.<N>"`
   - `package-lock.json` → the two `"version"` fields (root + `packages[""]`).
   Commit: `chore(release): bump version to 1.0.0-beta.<N>` and push develop.

2. **Curate release notes** from the real delta — do not blind-promote the
   CHANGELOG. Source of truth:
   `git log v1.0.0-beta.<PREV>..develop --no-merges`
   - Group into `### Added` / `### Fixed` / `### Changed` / `### Removed` with
     **bold lead-ins** (see prior releases for tone).
   - Watch for add-then-remove arcs across the range (describe the *net* shipped
     behavior, not intermediate states).
   - Skip pure docs/research/test/chore churn; users care about features & fixes.
   - Write the body to a temp notes file (e.g. `/tmp/release-notes-<N>.md`),
     leading with `## v1.0.0-beta.<N>`.

3. **Update `docs/CHANGELOG.md`**: promote `## [Unreleased]` → `## [1.0.0-beta.<N>] - <YYYY-MM-DD>`
   (reconcile it against the curated notes — the `[Unreleased]` section often lags
   and can contain stale entries), and add a fresh empty `## [Unreleased]` on top.
   Commit on develop (can fold into the bump commit if done together) and push.

4. **Merge to master:**
   `git checkout master && git merge --no-ff develop -m "Merge branch 'develop' for v1.0.0-beta.<N>"`

5. **Annotated tag:**
   `git tag -a v1.0.0-beta.<N> -m "v1.0.0-beta.<N>"`

6. **Push:**
   `git push origin master && git push origin v1.0.0-beta.<N>`

7. **Package the VSIX:**
   `npm run package` (= `vsce package`; runs `vscode:prepublish` → compile).
   Produces `adobe-demo-builder-1.0.0-beta.<N>.vsix` in the repo root (`*.vsix` is
   gitignored). A "LICENSE not found" warning is pre-existing and harmless.

8. **Publish the GitHub pre-release** (single VSIX asset, always `--prerelease`):
   ```
   gh release create v1.0.0-beta.<N> --prerelease \
     --title "v1.0.0-beta.<N>" \
     --notes-file /tmp/release-notes-<N>.md \
     adobe-demo-builder-1.0.0-beta.<N>.vsix
   ```

9. **Return to develop:** `git checkout develop`. Report the release URL.

## Verify

- `gh release view v1.0.0-beta.<N>` shows the pre-release with the `.vsix` asset.
- `git tag --contains` / `gh release list` shows the new tag/release at the top.

## Notes

- All releases are **pre-release**, single `.vsix` asset.
- Version naming: tag and release title are both `v1.0.0-beta.<N>`.
- Related memory: `reference_release_process`, `feedback_git_workflow`
  (commit to develop first; reach master only via this release merge).
