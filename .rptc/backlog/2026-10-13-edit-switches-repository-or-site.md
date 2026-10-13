---
id: EDS-42
kind: feature
area: eds
needs: [PL-75]
value: med
status: backlog
---

# Edit switches a project's repository or site

Filed 2026-10-13 by the owner, who wants it built before the release. One of four
switches PL-75 left locked in Edit because no operation exists for them (see
`.rptc/plans/edit-applies-only-what-changed/overview.md`, "Locked in Edit for now").

## How it would work

1. Set up the storefront in the newly picked repository and DA.live site, through the
   storefront setup creation already runs.
2. Record the new repository and site on the project.
3. Ask whether to delete the old repository and site or keep them. Deleting already
   exists: `repoLifecycle.deleteRepository` (`eds/services/github/githubRepoLifecycle.ts:269`)
   and `deleteDaLiveSites` (`eds/commands/cleanupDaLiveSites.ts:246`).

The undo is switching back. That only works if the old ones were kept, so the
confirmation has to say so before a delete.

## Known so far

- Today Edit's full rebuild runs storefront setup again, may create a new repository,
  and leaves the old repository and site live and untracked
  (`.rptc/research/edit-configure-architecture/research.md`).
- `migrate_storefront_name` only renames; it does not move to another repository.
- Plugs into PL-75's apply path, so it waits on that.
- Estimated the smallest of the four (an estimate, not measured).
