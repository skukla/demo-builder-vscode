---
id: PL-77
kind: feature
area: platform
needs: [PL-75]
value: med
status: backlog
---

# Edit switches a project's Adobe org

Filed 2026-10-13 by the owner, who wants it built before the release. One of four
switches PL-75 left locked in Edit because no operation exists for them (see
`.rptc/plans/edit-applies-only-what-changed/overview.md`).

## How it would work

1. Sign in to the new org (IMS tokens are org-bound, so the switch starts with a sign-in;
   see the `adobe-org-context` skill).
2. Make or pick an Adobe project and workspace in the new org.
3. Redeploy the integrations and the mesh there, and record the new destination.
4. Undeploy them from the old org and delete the old workspaces, after one confirmation.

The undo is switching back.

## Known so far

- The existing move, `moveAppBuilderComponentsToDestination`
  (`app-builder/services/appBuilderComponentMigration.ts`), moves only WITHIN the
  signed-in org: "Org is not compared" (line 278), and `destinationHandlers.ts:57` keeps
  the stored org on purpose. This item is the cross-org case that move does not cover.
- Today Edit's rebuild puts the integrations in new workspaces and updates a kept mesh by
  its old id without org targeting (`executorMeshPhase.ts`), leaving the old ones behind.
- Plugs into PL-75's apply path, so it waits on that.
