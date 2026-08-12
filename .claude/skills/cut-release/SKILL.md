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

## Out-of-band passes (offer BEFORE cutting, once the tree is clean)

A release cut is the natural periodic boundary — the only moment when "look at the
whole thing rather than the thing you just changed" is cheap. Both passes PROPOSE
and never apply, so neither blocks the cut; run them, show the user, and let them
decide what (if anything) to fix before tagging.

- **`codebase-sweep`** — duplication, extraction, cycles, orphans, doc drift (~30s).
- **`dream`** — memory / skills / CLAUDE.md staleness across recent sessions.
- **`npm run data-installer:drift`** — the Data Installer fixtures vs the live
  service (~5s, needs `aio login`). The only check that can catch that API moving:
  the feature's tests are fully offline against committed fixtures, so they stay
  green while the client mis-parses real responses. A non-200 exits non-zero and
  says "unreachable" — it never reports clean when it could not reach the service.
  Drift is a finding for the feature owner, not a blocker on the tag.

Offer them; do not silently skip. If the user declines, say so in the release notes
so the next cut knows the interval. These were documented as "runs at release cuts"
long before anything invoked them — naming the step here is what makes that true.

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

## Hotfix releases — the merge-back is NOT optional

A hotfix branches off the released tag, not off `develop`, so `develop` never receives
its commits. Steps 5–9 above are unchanged; the branch handling differs:

1. `git checkout -b hotfix/beta.<N>-<slug> v1.0.0-beta.<PREV>`
2. Fix, bump to `<N>`, gate, then `git checkout master && git merge --no-ff hotfix/...`
3. Tag, push, package, publish (steps 5–8).
4. **Merge master back into develop and push it.** This step is the one that gets
   skipped, and skipping it is what produced the 2026-08-06 reconciliation: three
   hotfixes (`.123`, `.124`, `.125`) were each *forward-ported* — reimplemented on
   develop — instead of merged, so git had no record that master's commits were
   accounted for. By `.125` the deferred merge had grown to **13 conflicts across
   10 commits**, several in files neither fix touched.

**Forward-porting is not a substitute for the merge.** It reproduces the content and
leaves the history diverged; only the merge tells git the two branches agree. Do both
when the file layouts differ (see below) — port the fix so develop is correct *now*,
then still merge so the divergence closes.

**When develop has restructured the files the hotfix touched**, expect conflicts and
resolve with one rule: **develop wins.** Develop is the branch that continues, and its
version is by definition the newer intent. Concretely, from the `.125` reconciliation:

- A file develop deleted (`GitHubRepoSelectionStep.tsx`, superseded by the v6 rail)
  arrives as a `DU` modify/delete — `git rm` it. Do not resurrect it.
- Both branches may have split the same oversized test file under *different* names.
  Keep develop's split; `git rm` master's. Verify no coverage is lost first by diffing
  the `it(...)` names between the two sets — do not assume.
- A master test can assert behaviour develop deliberately **removed**. One asserted
  `toContain('Product not available')` while develop asserted `not.toContain` for the
  same string. Taking both sides would have committed a contradiction. This is why the
  full suite, not the conflict count, is the gate.

## Verify

- `gh release view v1.0.0-beta.<N>` shows the pre-release with the `.vsix` asset.
- `git tag --contains` / `gh release list` shows the new tag/release at the top.

## Notes

- All releases are **pre-release**, single `.vsix` asset.
- Version naming: tag and release title are both `v1.0.0-beta.<N>`.
- Related memory: `reference_release_process`, `feedback_git_workflow`
  (commit to develop first; reach master only via this release merge).
