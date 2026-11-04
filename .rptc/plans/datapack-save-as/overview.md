# Datapacks: Save and Save As

**Status:** plan, awaiting the owner's sign-off. **Target:** beta.153. The owner, 2026-11-03,
would not release with the confusing datapack feature.

## Why

Each project had an automatic pack of its own in the datapack library:
- named for the project (`ownPackName`: the project name plus a hash);
- made at the first save, and renamed when the project was;
- reached two ways: Create Datapack in the header, and "Save store changes to this pack" in a
  pack's menu.

In the release walk, the owner (who designed it):
- could not tell where Create Datapack saved;
- found no name field;
- could not find the pack afterwards.

A review that was not shown this plan reached the same diagnosis on its own. The SC is never
shown which pack the demo installs from, resets to and saves into. It also reached the same model.

## Pivot, 2026-11-04: no pinned card

Walked live, the pinned card above the library was wrong (owner: it looked like nothing else in
the extension, and Save beside Save As did not explain itself). Replaced, before release, by:

- the demo's pack is one of the library's cards, wearing the blue check and outline cards already
  had (a library pack had never been given it: `installedHere` required the service's store);
- **Save Changes** leads that pack's flyout, only when the pack is yours;
- **Save As is removed** as a button: it was the header's Create Datapack a second time. Removal
  and reset still ask a new name when the pack is not yours;
- the newer-version mark is the house amber dot beside the card's version picker;
- a finished save re-reads the library at once, so Close only closes.

The sections below record the model as first designed; where they say "pinned card", read the
above.

## The model

The demo's pack works like an open file: **Save** and **Save As**.

### The pinned card

When a project is open, the Datapacks screen starts with one pinned card, above the library. It
shows the pack this demo uses (`project.datapack`):
- its name and version;
- who owns it: Team, a colleague, or Yours;
- **Changed**, when the store differs from the pack;
- **Newer version**, when one is available (see below).

Its actions:

| Action | When | What it does |
|---|---|---|
| **Save** | Only when the pack is Yours. Absent, not greyed out, otherwise | A new version of this pack |
| **Save As…** | Always | A name field, prefilled with "{pack} Copy" and editable, then the item picker. Makes a new pack of yours and records the pack it came from. The demo now uses it |
| **Reset to {pack}** | Always | Resets the demo to this pack's version (below) |
| Version picker | Always | Picks the version the demo resets to. The newest is marked |

Other changes:
- Create Datapack in the header and "Save Store Changes to This Datapack" in a pack's menu are
  removed. The card is the one way in.
- A demo whose store Demo Builder did not fill from a pack shows the card empty, with Save As
  only.
- The progress and done windows name the pack: "Saving Acme Bodea", then "Saved Acme Bodea,
  version of Nov 3". The done window has **Show in Library**, which scrolls to the pack's card
  and highlights it.
- The plain words replace "Reading the store" and the like: **Reading from Commerce**, then
  **Saving the datapack**. "This store" is gone.

### Reset

- Nothing changed: it just runs.
- Changes in the store: three buttons replace today's checkbox and sentence:
  - **Save and Reset**, or **Save As and Reset** when the pack is not yours, which asks for the
    name first;
  - **Reset Without Saving**;
  - **Cancel**.
- The same choice comes before any removal, and before the dashboard's project reset.
- An agent passes `save` (Save, or Save As with a name) or `changes: "drop"`.

### A newer version

The SC is told on the card when the pack they applied has something newer (owner, 2026-11-03:
in .153, not later). This covers two cases:
1. **A newer version** of the same pack exists: one of your other demos saved one, or a
   colleague published one.
2. **The same version changed after you installed it**: team packs like Bodea are updated in
   place as `main`. The library's `updatedAt` is later than the install record's time.

What the SC sees:
- The card marks it: "Newer version: Nov 3".
- The version picker marks the newest.
- Taking it is a Reset to that version, with the same Save and Reset choice.

It deliberately does not:
- show a notice on the projects list;
- appear in the Updates window, or add to its count.

A demo kept on an older version on purpose (a customer's meeting) would otherwise nag forever and
train SCs to ignore the code updates that matter. Applying it replaces the demo's data, so it is
never batched with code updates.

### Delete a demo

The delete dialog offers "Also Delete {pack}", unticked as today, only when:
- the pack is Yours; and
- no other project on this machine uses it.

Every version goes.

## Decisions

Owner, 2026-11-03:
1. Reset with changes asks: Save and Reset, Save As and Reset, or Reset Without Saving.
2. Delete offers the pack only when it is yours. The review's tighter rule, "and no other local
   demo uses it", is adopted.
3. Old automatic packs are deleted:
   - The one made in today's walk (JustRite) is deleted, as a confirmed cloud step.
   - `ownDatapack` is dropped from the project type. An old manifest still loads, and the field
     is ignored.
   - A project whose `datapack` already points at its old automatic pack keeps it as an ordinary
     pack of yours.
4. Newer-version detection is in .153, on the card, passive (above).

Agent decisions, for the owner to overrule:

5. **A pack's id is generated from the name typed:** a slug plus a short random suffix. The
   name typed is the display name. The library has no "is this name taken" read, and whether it
   refuses a new version under a colleague's name is unverified. A generated id cannot collide.
6. **A colleague's private pack arriving with a project file** is copied into the SC's library
   under its own display name, with a new id. The project uses the copy.
7. **Deferred:** an Update chip on other demos' cards that offers to apply it. The passive mark
   already covers the need.

## Steps

Each step is TDD: test first, then the change, then that step's suites.

1. **Core.**
   - In `demoPack.ts`, remove `ownPackName`, the hash naming and `recordOwnPackName`.
   - Add `packIdFor(displayName)` and `recordSave(project, saved)`.
   - Remove `OwnDatapack` and `Project.ownDatapack` from the types, the manifest writer, the
     loader and the schema.
2. **Save handler** (`storeChangesHandlers.ts`).
   - The request carries `saveAs: { displayName }` for Save As.
   - Save without it writes a new version of `project.datapack`, only when it is `mine`.
     Otherwise it answers `needsName` and writes nothing.
   - `saveFromStore` takes a name.
   - Every save records `project.datapack` as the new version.
3. **The pinned card.**
   - A new card component at the top of `DatapackCatalogView`, fed by `get-datapack-import-target`
     plus the pack's detail. It carries owner, Changed, Newer, Save, Save As…, Reset to {pack}
     and the version picker.
   - Remove Create Datapack from `CatalogHeaderActions` and the menu row from `PackActions`.
4. **Save As flow.**
   - Add the name stage (`PackNameStage`, name only, prefilled) to the `store` route, before the
     picks.
   - When the store was filled from a pack, the picks start at what the pack made.
   - The done window gets Show in Library.
5. **Reset choice.**
   - `removalChanges.ts`, `removalConfirm.ts` and `RemovalConfirmBody` get the three buttons and
     the Save As name step.
   - The dashboard's project reset (`edsResetSampleData.ts`) gets the same.
   - The agent refusal asks for `save` or `changes: "drop"`.
6. **Newer version.**
   - A read for the newest version and `updatedAt` of the demo's pack, compared with
     `project.datapack.version` and the install record's time.
   - Show the card mark and the picker mark.
   - Expose it on the agent surface: `get_datapack` or the project status gains `newerVersion`.
7. **Project delete.**
   - In `deletionConfirmation.ts`, `projectDeletionService.ts` and `deleteProjectTool.ts`, offer
     `project.datapack` when it is `mine` and unused by another local project.
   - `deleteProjectDemoPack` takes a `DatapackId`.
8. **Removed outright:**
   - `demoPackRename.ts` and its call;
   - `recordRename` and `clearOwnPackIfGone`;
   - `ownPackCleared`;
   - the dashboard's `ownDatapackName` prop chain and its "This demo's pack" line;
   - the wizard Sample Data line about "this demo's own pack".
9. **Arriving pack.** In `arrivingPack.ts` and `createProjectFromFileTool.ts`, apply decision 6
   and reword `datapackNote`.
10. **Agent surface and docs.**
    - `save_store_changes_to_pack` and `start_datapack_export` gain `saveAs.displayName`.
    - Their descriptions, consent copy and narration are rewritten.
    - `rename_datapack`, `delete_library_datapack`, `reset_datapack` and `delete_project` lose
      their own-pack sentences.
    - `import-datapack.md` is rewritten, with an `AI_CONTEXT_VERSION` bump to 53.
    - `docs/systems/data-installer.md`, `mcp-server.md` and `mcp-tools.md` are updated, with a
      CHANGELOG entry.
11. **Live**, on the owner's go:
    1. Delete today's automatic JustRite pack.
    2. Walk the flow:
       - Bodea demo: change the store, then **Save As** "Acme Bodea";
       - **Save** again;
       - **Reset to Acme Bodea** with changes, which asks;
       - a second demo on Acme Bodea, saved from the first, shows **Newer version**;
       - delete the demo, which offers the pack.

## Hit every surface

- **Bundles:** Datapacks (`dataInstaller`), the dashboard tile and reset (`dashboard`), the wizard
  (Sample Data line) and the projects list (delete).
- **Agent surface:** step 10.
- **Creation and regeneration:** the AI skill bump covers existing projects.
- **Mocks:** `SaveStoreChangesRequest`, `DatapackRemovalChanges` and `ProjectDatapack` have
  hand-written mocks; grep them before each step's run.

## Out of scope

- Select Everything in the picker: asked for, not yet agreed.
- ACO packs, held back until ACO ships (PL-60).
- The Update chip (decision 7).
