---
id: EDS-48
kind: fix
area: eds
needs: []
value: high
status: active
---

# Storefronts stopped receiving Adobe's boilerplate updates after 2026-08-28

Filed 2026-10-16, found from the release-candidate walk. A GitHub email about a
disabled workflow in `skukla/bodea-source` led the owner to ask whether the
boilerplate-first model actually delivers Adobe's updates. It did not.

## What was wrong (measured 2026-10-16)

1. **The extension reads a release; nobody cut one.** The patch ledgers and the
   last-known-good pointer are read at `skukla/eds-demo-patches`'s LATEST RELEASE
   (`resolvePatchRef`), not its `main`. The daily drift gate advanced the pointer on
   `main` every day, but the only release was `v1.0.0` (2026-08-28). Every project
   created since then started on, and Check for Updates compared against, the
   2026-08-28 boilerplate (`bc7a3213`) while the gate had verified 73 newer upstream
   commits (to `48bed04d`, including Adobe's "B2B Rebase" of 2026-10-05). Both ends
   agreed on the stale value, so nothing looked wrong. `cut-release` never mentioned
   the patches repo.
2. **The pointer moved on commit ids, not files.**
   `adobe-commerce/boilerplate-b2b-template` force-pushes nightly (its own sync
   workflow re-makes the top two commits), so the id changes every day over the same
   files: six ids over one file tree, 2026-10-11 to 2026-10-16. The gate advanced
   daily on that. Harmless while releases were manual; once releases are automatic
   it would offer every SC an empty update every day.
3. **A failed compare read as "up to date".** Those re-made commits leave the
   template's history, so the commit a project records is usually on no branch.
   `TemplateUpdateChecker` treated a compare that failed as 0 behind. GitHub still
   answered for the 2026-08-28 commit seven weeks on, so this has not fired; it is a
   guard.

The `bodea-source` email itself was unrelated: that copy of the template's sync
workflow only runs inside `adobe-commerce/boilerplate-b2b-template` and skipped all
63 times it fired. Its base code is not what Bodea projects build from.

## Shipped so far

- 2026-10-16  Patches release `v1.1.0` published by hand at `d15a5337` (pointer `48bed04d`)
- 2026-10-16  `skukla/eds-demo-patches@1fa2046`: the gate publishes the release after a
  green run, and moves only when canonical's files change (`canonical_moved`); both
  proven against the live repos with a positive control
- 2026-10-16  docs(adr-006): re-anchoring, per-ledger exact retirement, and the PR permission (`e63f8edb9`)
- 2026-10-16  feat(patches): a watchdog for the patches release, and the docs for automatic releases (`e7967a5da`)
- 2026-10-16  fix(updates): a template compare that fails is "could not check", not "up to date" (`b95bb50e7`)
- 2026-10-16  feat(patches): the watchdog runs daily and catches a switched-off drift gate (`c716ef379`)
- 2026-10-16  docs(adr-006): Claude drafts rewrites of patches upstream broke (`df4d52519`)
- 2026-10-16  docs(adr-006): the end-to-end test of automatic patch upkeep, and what it fixed (`fda7e7457`)
- 2026-10-16  docs(adr-006): the patches repo now lets its workflow open PRs (`9d346d164`)

## Still open

- Watch the first scheduled run after `1fa2046` (2026-10-17 07:17 UTC): it should
  publish `v1.1.1` (main moved past `v1.1.0` with the workflow change) and leave the
  pointer alone. `npm run patches:released` reads the result.
