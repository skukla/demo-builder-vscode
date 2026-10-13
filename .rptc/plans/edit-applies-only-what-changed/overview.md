# Plan: Edit applies only what changed (PL-75)

Written 2026-10-13 from two read-only maps of the code at `9107c703b`. Owner's direction:
"when they change an existing project, they expect more of an edit behavior", and "a
backend switch is rare". Background and the rejected directions:
`.rptc/research/edit-configure-architecture/research.md`, `.rptc/backlog/2026-10-12-edit-applies-only-what-changed.md`.

## What the SC gets

Edit stays the same wizard on the same project. Finish compares what the SC picked with
what the project has, and does only the difference:

| The SC changed | Finish does | Existing operation |
|---|---|---|
| Nothing | Saves; nothing redeploys or republishes | — |
| Added an integration or the mesh | Deploys just that one | `addAppBuilderComponent` (`app-builder/services/appBuilderAddRun.ts:46`) |
| Removed an integration or the mesh | Removes it, with the Remove button's cleanup | `removeAppBuilderComponent` (`app-builder/services/appBuilderRemoveRun.ts:59`) |
| Datapack | Removes the old pack and imports the new one | `removeSampleData` / `installSampleData` (`data-installer/services/sampleDataInstall.ts:151,168`) |
| Adobe project or workspace | Moves the integrations | `moveAppBuilderComponentsToDestination` (`app-builder/services/appBuilderComponentMigration.ts:88`) |
| Package, same Edge Delivery stack | Resets the storefront onto the new package | `executeEdsReset` (`eds/services/reset/edsResetService.ts:81`), which reads the package at call time |

Destructive steps (a removal, a datapack removal, a reset) are listed in ONE confirmation
before anything runs. Editing again is the undo.

**Not in this plan: backend, stack, Adobe org, repository and site.** No operation exists for
any of them. This plan first said to lock them in Edit; on 2026-10-13 the owner chose to build
them before the release instead, as their own items: [[EDS-42]] (repository or site),
[[PL-77]] (org), [[PL-78]] (backend) and [[PL-79]] (stack, which also covers a headless
package change: headless reset re-clones the frontend from the SAVED repo URL,
`lifecycle/services/projectResetService.ts:184`, so it would not switch). Until each lands,
a change to it still goes through the full rebuild.

## Where it splits

`executeProjectCreation` (`project-creation/handlers/executor.ts`), right after
`loadExistingProjectForEdit`: both the saved project and the picked config exist and nothing
has been touched. In Edit, compute the changes and run the apply path instead of the rebuild.
The rebuild stays for creation, Import and Copy.

The wizard's **storefront-setup step also runs in Edit** (`wizard-steps.json`, no
`createModeOnly`), before Finish, and republishes. It must be skipped when nothing about the
storefront changed, and its reset runs instead when the package changed.

## Steps

1. **The changes object, pure.** `diffEditAgainstProject(existing, config)` →
   `{ integrations: {added, removed}, mesh, datapack, destination, packageChanged, isNoop }`,
   reading what the project records (`componentSelections`, `appBuilderComponents`, `datapack`,
   `adobe`, `selectedPackage`). Unit-tested on its own. No behaviour change yet.
2. **The no-op Finish.** In Edit with `isNoop`, Finish saves the manifest and stops; the
   storefront-setup step is skipped; the completion screen says "Changes saved". This alone
   removes the worst of today's cost.
3. **Integrations and mesh.** Run removals, then additions, through the two runners, with the
   dashboard door's extra steps (guards, `copyWhenTaken`, `recordApiPicks`,
   `replaceDeployedElsewhere` on add; `applyErpOwnership` after a remove). Check the mesh
   caveats first: creation deploys the mesh through `executeMeshPhase`, and the mesh is also a
   stack dependency in `componentSelections.dependencies`; the runners may not write that.
4. **Datapack.** Remove the recorded pack, record the new one, import it.
5. **Adobe destination.** Through the move the Integrations screen uses.
6. **Package on an Edge Delivery stack.** Clear `project.demo` (it wins over the package in
   `resolveStorefrontForProject`), record the package, run the EDS reset. Runs before steps
   3 to 5, because a reset regenerates components but keeps integrations.
7. **One confirmation** listing every destructive step, before anything in 3 to 6 runs.
8. **Removed 2026-10-13.** It locked backend, stack, org, repository and site in Edit; the
   owner chose to build those switches instead (see above).
9. **Delete what the apply path makes dead:** Edit's branch through the rebuild (temp-dir
   install, atomic swap, `carriedOverFromEdit` if nothing else needs it) and their tests. No
   soft deprecation. Waits on EDS-42, PL-77, PL-78 and PL-79: until they land, those changes
   still need the rebuild.

Each step: TDD, `gate`, commit with `Backlog: PL-75`. Steps 3 to 6 make real cloud changes;
their first live run needs the owner's go on a scratch project.

## Open

- The agent surface: `edit_project` hands the wizard to the SC, so nothing changes for agents.
  Agents already have the single-step tools (`add_integration`, `remove_integration`,
  `start_datapack_import`, `set_project_destination`, `reset_project`).
- `delete_mesh` updates nothing in the project (`mesh/handlers/deleteHandler.ts`). Proposed:
  delete it; `remove_integration` does the job properly. Owner has not decided.
