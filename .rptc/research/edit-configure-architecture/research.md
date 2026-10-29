# Edit and Configure: should they be re-architected?

Researched 2026-10-12, at `181838033` on `loop/2026-10-05-release-candidate`. Asked by the
owner after the Edit/Configure split (`a74724958`): "It still seems like it smells."
Three read-only passes over the code and the record, then the two defects below were
re-checked by hand. **Verified** means the code was read; **inferred** means it was not
traced end to end.

## The answer

Yes. Edit's design is the smell, not its edges. An Edit finish rebuilds the whole project
from wizard state, and the rebuild has no idea what the project already had in the cloud.
Configure works the other way: it changes one thing and offers that thing's follow-up.

The evidence supports the owner's option 1: **Configure becomes the one place to change a
project in place, and a change to what a project is built from becomes a new project (Copy).**
Edit would then be deleted. This reverses the owner's 2026-09-11 decision that "both modes
stay" (`.rptc/backlog/2026-09-11-copy-and-edit-on-one-file.md`, PL-56e), so it is his call.

## Two defects that exist today, whatever is decided (verified)

`buildInitialProject` (`project-creation/handlers/executor.ts:104-165`) builds a new Project
and carries over only `created`, `commerceStoreStructure`, `demo`, `datapack` and
`installedBlockLibraries`. The manifest writer writes exactly that object, with no merge
(`core/state/projectConfigWriter.ts:174-176`). Nothing later restores the rest. So an Edit
finish drops, among others:

1. **`appBuilderComponents`**, each integration's record, including its Adobe workspace.
   `ensureComponentWorkspace` then finds no workspace (`app-builder/services/componentWorkspace.ts:163-164`)
   and **creates a new Adobe workspace** for every integration, then deploys into it. The old
   workspace stays deployed and is no longer tracked. An Edit on Justrite would do this to
   the ERP integration and its ERP.
2. **`aiFileHashes`**, the record that protects hand edits. With no recorded hash the writer
   treats every AI file as unmodified and overwrites it (`generatedFileWriter.ts:183-185`).
   This breaks non-negotiable 2, "a user's own edits are never overwritten".

Also dropped, consequences not traced: `aiPrompts`, `pinned`, `publishKeyRegisteredAt`.
No test covers what survives an Edit.

## What Edit does to each thing (verified unless marked)

| Thing | On change | Old state undone? |
|---|---|---|
| Package, stack | Re-clones components into a temp folder and swaps them in | Local folder replaced. An old storefront stays live, untracked |
| Backend | New backend, `.env` and `config.json` regenerated, datapack re-imported | Old instance's data left (inferred) |
| Adobe project / workspace | Integrations get new workspaces in the new project. A kept mesh is updated by its old id without org targeting (`executorMeshPhase.ts:178-186`) | No. Old mesh and workspaces left |
| Repository / site | Storefront setup runs again, may create a new repo | No. Old repo and site kept and published |
| Integrations | Every selected one is redeployed (see defect 1) | **Deselected ones are never undeployed** |
| Mesh removed | Nothing deletes the cloud mesh | No |
| Datapack | **Re-imported on every Edit**, no "already installed" check | **Cannot be removed**: `datapack ?? existing.datapack` brings it back (`executor.ts:150`) |

**An Edit with no changes** still stops the demo, re-clones and reinstalls every component,
redeploys the mesh and every integration, re-runs storefront setup and publishes, re-imports
the datapack and regenerates the AI files.

**On failure partway**, only the folder swap is rolled back. Workspaces, deploys, mesh
updates, repo commits, publishes and imports stay.

Non-negotiable 1 ("whatever can be done can be undone") fails three times in that table, and
non-negotiable 5 ("cloud operations are confirmed, never speculative") fails for the no-op case.

## What can already change in place, outside Edit (verified)

| Thing | Path today | Reverse |
|---|---|---|
| Project name | Configure, dashboard, projects list, `rename_project` | Rename again |
| Commerce settings | Configure, `configure_project` | Edit the value back |
| Block libraries | Configure (installs and removes on Republish) | Untick |
| Adobe project / workspace | Integrations screen destination, `set_project_destination` | Set it back |
| Integrations | Dashboard integrations screen, `add_integration` and friends | `remove_integration` |
| Mesh | Dashboard deploy, `deploy_mesh` | `delete_mesh`, **agents only** |
| Datapack | Data Installer, `start_datapack_import` | `reset_datapack` |
| Addons | `configure_project` records only; **no human control** | — |
| Package, stack, backend, org | **None** | — |
| Repository / site | **None** (`migrate_storefront_name` only renames) | — |

**Copy from existing already covers the rest.** The human Copy opens the wizard in import
mode seeded from the source, and the Edit locks do not apply there, so the SC can pick a
different package, stack or backend (inferred from `editLocks.ts` and `architectureChange.ts:35`).
It always makes a new repository and site. The `copy_project` agent tool cannot change
package, stack or backend.

## History (from the record)

- Configure came first (`b760521b6`, 2025-10-08). Edit was added in December 2025 because
  nothing structural could change after creation (`.rptc/research/project-editing-post-wizard/`).
- `.rptc/research/edit-mode-removal-audit/research.md` (2026-07-16) found the same root
  cause: "Any field the read path misses is not merely invisible — it is DELETED from the
  manifest", about 19 Edit-specific fixes, and recommended removing Edit in stages in favour
  of Copy. Status: open product decision.
- 2026-09-11: owner decided both modes stay (PL-56e, D14 in `.rptc/plans/portable-demos/`).
- 2026-10-12: Edit locks the name, Commerce settings and block libraries (`a74724958`).
- At least 13 Edit bugs since January, most of them a field the rebuild forgot
  (`04487686e`, `c111de066`, `a7bcb739a`, `e918d8442`, `dd4e202a4`, `d94729132`, ...).

## The case for keeping a rebuild-style Edit, and why it does not hold

- *Only Edit can change the package, stack, backend or org.* True, but each of those is a
  rebuild of the project in all but name, and Copy already does it without touching the
  original. The old project then stays until the SC deletes it, which is the undo.
- *Edit is the only flow that reloads a saved project, so it finds lost-field bugs.* It finds
  them by losing the field in a real project. The portability round-trip tests
  (`projectCopyEditRoundTrip.test.tsx`) find the same class without that cost.

## What option 1 would take

1. **Fix the two defects first**, because they hit any Edit until Edit is gone: carry over
   `appBuilderComponents`, `aiFileHashes` and the other dropped records, and add a test that
   pins what survives an Edit.
2. **Close the in-place gaps in Configure or the dashboard:** a human control for addons;
   a human mesh delete; the Adobe destination reachable from Configure, not only the
   Integrations screen.
3. **Make "change the package, stack or backend" a Copy:** a door from the dashboard that
   opens Copy seeded from this project, and says the original is kept until deleted. Give
   `copy_project` the same overrides, or say plainly that agents cannot.
4. **Delete Edit** in the same change that ships step 3: the edit mode, its executor branch,
   its locks, `edit_project`, and their tests (the July audit estimated about 2,000 lines).
   No soft deprecation.

## Decision (owner, 2026-10-13), superseding the recommendation above

**Edit stays, and its Finish applies only what changed** (PL-75). The recommendation above,
remove Edit and make a foundation change a new project through Copy, was rejected: "We
shouldn't be adding a new project as a duplicate to an existing one. That doesn't track with
what the user expects", and "when they change an existing project, they expect more of an
edit behavior". A middle plan, moving everything onto Configure, was dropped when mapping
showed the gaps were smaller than this file says: the mesh card already has a confirmed
Remove (the "no dashboard delete button" row above is wrong); the one addon, ACO, is offered
by no pickable package and changes nothing when selected; and the Adobe destination move
already lives on the Integrations screen. The diagnosis in this file stands; the cure is a
diff-applying Edit, not a removed one.
