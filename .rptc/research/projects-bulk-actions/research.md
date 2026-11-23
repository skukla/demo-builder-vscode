# Selecting several projects to reset or delete

Research, 2026-11-04. The owner has watched SCs' project lists fill up over time and asked: can a
Select All on the projects list reset or delete many at once, what happens when several reset or
delete, and what UX should it use. Facts below are from the code (file:line); the recommendation
and open questions are at the end.

## What one reset does today

- Entry: kebab Reset → `handleResetProject` (`src/features/projects-dashboard/ui/index.tsx:350-365`),
  id `reset:<name>` (`src/core/utils/operationIds.ts:19-21`); extension side dispatches EDS or not
  (`src/features/projects-dashboard/handlers/projectsListLifecycle.ts:220-261`). Any listed project,
  not only the open one.
- **Asks before it runs, per project** (EDS, `src/features/eds/services/reset/edsResetUI.ts:154-377`):
  1. "Reset Project" (:125-133).
  2. When it has a datapack and Commerce: "Remove Datapack" or "Keep Data"
     (`edsResetSampleData.ts:64-103`).
  3. Other store data: "Remove Those Too" or "Keep Them" (`edsResetOtherData.ts:146-170`).
- **Can ask while it runs:** "Switch IMS Org" when the project's org is not the signed-in one
  (`edsResetPreflight.ts:54-128`); the GitHub Code Sync App prompt (`edsResetPreflight.ts` ~188-216);
  a Save As name when the pack has changes and is not the SC's (`edsResetSampleData.ts:217-227`).
- **Cloud work, all of it real:** repo reset to template, code sync, Config Service, DA.live content,
  publish and purge, product pages, mesh redeploy (`edsResetService.ts:84-233`,
  `edsResetFinalize.ts`). Measured end to end at about **5 minutes 45 seconds**
  (`src/core/utils/resetStages.ts:15-16`); sample-data removal alone measured 470s.
- **It moves the open-project pointer:** every `saveProject` makes the saved project current
  (`src/core/state/stateManager.ts:276, 292`), and reset saves several times. The Updates run already
  avoids this with `createNonSwitchingStateManager` (`workingProjectStateManager.ts:76-86`,
  `updatesModalHandlers.ts:157-158`); reset does not.
- The non-EDS reset stops the *current* demo, not the one being reset
  (`projectResetService.ts:433`, `stopDemo.ts:108-120`).

## What one delete does today

- Entry: kebab Delete → `handleDeleteProject` (`ui/index.tsx:255-271`), id `delete:<name>`;
  `deleteProject` (`projectDeletionService.ts:68-179`).
- **Asks first:** a plain "Delete" for a local-only project (`deletionConfirmation.ts:38-49`); for an
  EDS project or one with a deletable pack, one unticked checkbox per resource: GitHub repo, DA.live
  site, its datapack (`deletionConfirmation.ts:110-141`), shown in the progress window. Governed by
  `demoBuilder.cleanupBehavior` (ask, deleteAll, localOnly).
- **Tears down** only what is ticked: the DA.live site (unpublish, product pages, API key, content,
  permissions, config; `storefrontTeardown.ts:207-222`), the GitHub repo
  (`edsExternalCleanup.ts:285-337`), the SC's own pack versions (`demoPackDeletion.ts:72-119`). Always:
  stops the demo, removes the folder, recent list, the project's secrets
  (`projectFilesDeletion.ts:43-71`). Never: App Builder workspace, mesh, Commerce data.
- **Stops safely partway:** a teardown that cannot finish keeps the local project and says why
  (`projectDeletionService.ts:117-121, 140-145`). A pack failure never fails the delete.
- **Sign-ins can be asked mid-run:** DA.live and GitHub (`edsExternalCleanup.ts:136-155, 342-367`).
- **Shared-resource guard has a gap:** a pack is offered only when no other local project uses it
  (`demoPackDeletion.ts:48-63`), and product pages are kept when another project publishes to the
  same repo (`sharedRepoProjects.ts:24-33`). Nothing stops the **repo or the DA.live site itself**
  being deleted when another project shares it.

## What stands in the way of running several at once

| Constraint | Where | What it means for a batch |
|---|---|---|
| One IMS identity | the token is org-bound; switching is a forced sign-in (`adobe-org-context`) | Projects in different orgs cannot run side by side; each switch is a browser sign-in |
| The screen's runner holds one operation | `useOperationRunner.ts:112-117` | A second start replaces the first's pending modal |
| The open-project pointer | `stateManager.ts:276` | Parallel resets would fight over which project is open |
| No lock on a Commerce instance | `wipeClaims.ts`, reset's removal path | Two resets on one instance could each plan before the other removes anything |
| Questions per project | the three modals and mid-run prompts above | N projects means 3N dialogs unless the batch asks once |
| Rate limits | DA.live and Helix retry 429 (`daLiveApiClient.ts:58-75`, `helixApiClient.ts`) | Parallel resets would hit them harder; nothing limits across projects |

What already supports it: the running-work registry counts several projects at once
(`projectWorkRunning.ts`, "three cards resetting at once"), extension-side progress is keyed per
operation id (`operationProgress.ts:40-43`), and the Updates modal is a working N-item batch with
per-row status.

## House patterns to reuse

- **Select All:** `SelectAllRow` and `CheckboxRow` (`src/core/ui/components/selection/`), with
  all/some states.
- **A batch run with a row per item:** the Updates modal (`UpdatesModal.tsx`, `UpdatesRunView.tsx`,
  `useUpdatesModal.ts`, `updatesModalHandlers.ts`): tick rows, one Apply, one progress window, a
  `WorkRow` per item showing waiting, running, done, failed or skipped, a failed row's reason under
  it, a question shown under the running row, a refusal to start a second run while one runs, and
  handing off to a notification when closed.
- **No card grid has a selection mode today.** `ProjectsGrid`/`ProjectCard` select by click and open
  by cmd-click; the only multi-select list is a Spectrum `TableView` in `AssignProductList.tsx`.

## Decided with the owner, 2026-11-04

**Hard rules for the build.** No explanatory sentences on these screens: labels, fields, statuses and
the steps' own words only. Reuse the extension's existing wording; the only new strings are the
window titles and the button counts. Every label stays on one line; a window too narrow for the
delete table stacks each project's options under its name.

### Selecting
A **Select** button in the projects list header turns on selection: a checkbox on each card (and
row, in the list view), **Select All** at the head covering what the search shows, a count ("3 of 12
selected"), **Reset Selected**, **Delete Selected**, and **Done**. While selecting, clicking a card
ticks it instead of opening it.

### Both batches
- One window: the questions first, once for the whole batch; then a row per project, run **one at a
  time** (resets side by side within an org since 2026-11-04, owner: a reset takes about six minutes;
  `projectsBatch.ts` says how each constraint above is met), the Updates window's shape (`UpdatesRunView`, `WorkRow`). Row state is the house icons only
  (pending, running, success, error); the running row shows the step's own label; a failure shows the
  step's own message under its row; the rest carry on. A second batch cannot start while one runs.
- **Sign-ins pause and ask**, through the house prompt under the running row, exactly as a single
  reset or delete does (DA.live, Adobe, GitHub, Switch IMS Org). A row fails only on a real error.
  After one sign-in the rest of the batch reuses it.
- Projects are run **grouped by IMS org**, the signed-in org first, so each other org costs one switch.
- The open project does not change (`createNonSwitchingStateManager`, as the Updates run does).

### Reset batch

```
Reset 3 Projects

[x] Remove Datapack
[ ] Remove Those Too

Acme Q4    Save Changes As [ Acme Q4 Data ]   [ ] Remove Without Saving
Acme Q3    Save Changes As [ Acme Q3 Data ]   [ ] Remove Without Saving
Frescopa   Saving to your library

                              [Cancel]  [Reset 3 Projects]
```

- Before the questions, the window reads each project's Commerce data ("Reading demo data") to learn
  which have changes.
- A project whose pack has changes and **is not the SC's** gets a **required** name field, suggested
  from the project's name (two Bodea projects must not both suggest "Bodea Copy"), and its own
  **Remove Without Saving** box. A project whose pack is the SC's saves a new version, no question.
- **Remove Those Too is not in the batch** (decided while building, 2026-11-04): a single reset
  shows exactly what it would clear in each store before it asks, and a batch box could not, so it
  would clear data nobody saw. Reset that project on its own to clear it.
- Wording reused: Remove Datapack (reset's own question); Save Changes As, Remove
  Without Saving (the Datapacks removal dialog); "Reset 3 Projects" follows "Apply N Updates" and
  "Reset Project".

### Delete batch

```
Delete 3 Projects

            [-] Delete Repository  [-] Delete DA.live Site  [ ] Delete Datapack
Acme Q4     [x]                    [x]                      [ ]
Acme Q3     [x]                    [x]
Frescopa

                              [Cancel]  [Delete 3 Projects]
```

- Each column header is that column's Select All (`SelectAllRow` semantics: all, some, none). No
  single box selects every column.
- A project shows only the options it has. A pack or repository is offered only when every project
  using it is in the batch.
- **`demoBuilder.cleanupBehavior` sets what starts ticked:** Ask, all unticked; Delete all,
  Repository and DA.live Site ticked, Datapack unticked. **Local only** is a lock, not a default (the
  agent tool refuses cloud deletes under it), so it shows no cloud columns, only the Datapack one. The datapack is never ticked by the setting (its own description promises that): a
  repository and site belong to one project, a datapack is curated data nothing can rebuild.
- "Delete Datapack" replaces "Delete Its Pack", in the single delete too.

## Follow-on changes to single reset and delete (decided)

1. **Done 2026-11-04 (`aeb110743`): reset's Save As name is required, and every Save As name
   starts empty.** Today a blank name silently drops the changes
   (`edsResetSampleData.ts:222`, "leave it empty to lose them"), unlike Create Datapack and the
   Datapacks removal dialog, where losing the changes is its own explicit choice. Fix first.
2. **Done 2026-11-04:** a single delete with Delete all shows its options with Repository and
   DA.live Site ticked, instead of deleting without asking.
3. **Done 2026-11-04:** "Delete Its Pack" is "Delete Datapack", and the window's labels match the
   picker's (Delete Repository, Delete DA.live Site).
4. **Done 2026-11-04: close the shared repository and site gap**, for the button and the agent: nothing today stops deleting a repository or DA.live
   site another project uses (only product pages are protected, `sharedRepoProjects.ts`).

The agent surface is unchanged: `delete_project` and `reset_project` stay one project per call, and
an agent passes its choices explicitly.

## Still open

- A cap on how many a batch takes.
- Other batch actions (Stop, Export): out of scope unless wanted.
