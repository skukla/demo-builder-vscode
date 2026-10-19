---
id: AI-73
kind: fix
area: ai
needs: []
value: high
status: built
---

# An agent's create_project never deletes an existing project, and cleans up when it fails

Found 2026-10-16 while making a failed agent creation clean up like the wizard's
(owner: "a failed agent creation should clean up after itself the way the wizard
does").

**The defect.** Creation's first step, `cleanupOrphanedDirectory`, removes whatever
folder already has the new project's name. The wizard runs a name check first
(`validateProjectConfig`: a safe name, not one a project already has). The agent door
(`runProjectCreation`, behind `create_project`, `create_project_from_file` and
`copy_project`) ran no check at all. So an agent creating a project under a name
already in use deleted that project, and a name with `..` in it reached outside the
projects folder. Verified by reading both doors: `validateProjectNameSecurity` had
exactly two callers, the wizard and rename.

**Found on the way.** The mesh step reported "I created a mesh" even when it only
updated one the workspace already had (`deployNewMesh` self-detects an existing mesh,
then called `onMeshCreated` regardless). The wizard is protected by a second guard
(`meshExistedBeforeSession`, set by its mesh check step); the agent door never runs
that step. So the wizard's cleanup, shared as it stood, would have deleted an SC's
pre-existing mesh when an agent creation failed.

## What was built

- `projectNameProblem` (`creationNameCheck.ts`): the one name check. The wizard
  calls it (its log lines and messages unchanged; its 5 validation suites pass with no
  edits), and `runProjectCreation` calls it before anything is resolved or built.
- `cleanupFailedCreation` (`creationFailureCleanup.ts`): the wizard's cleanup, moved
  out of `createHandler` unchanged. Both of the agent's creation paths call it with the
  context and config creation ran with.
- `deployNewMesh` reports a mesh as created only when there was none before.
- The agent-tool test setup now fakes the cleanup: the real one deletes a folder
  under the real home directory, and those tests fake creation.

Each fix was undone in turn and its tests confirmed red (8 of 8), then restored.

## Not changed

A storefront (GitHub repository, DA.live content) provisioned before a failed creation
stays, in both doors. The wizard never removed it, and the agent's re-run reuses it.

## Shipped so far

- 2026-10-16  fix(ai): create_project refuses a taken or unsafe name, and cleans up when it fails (`15df43067`)
- 2026-10-19  Reassessed 2026-10-19 (loop): the fix 15df43067 is on the branch; built, waiting on the release check
