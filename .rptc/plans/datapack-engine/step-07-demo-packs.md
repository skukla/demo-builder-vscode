# Step 07: each demo has its own pack, shared by reference

Status: **built, not yet live** (2026-10-29). The library's "unlisted" change is not made: it is the library service's, and waits on the owner's go.

Decided by the owner, 2026-10-27.

A shared library pack (Bodea) is a template. A demo built from it gets its own pack, and every
save from that demo goes there, so one SC's customer edits never change the team's Bodea. The
team's pack changes only on purpose, through "promote" (making a pack shared), which stays a
curator's action.

| Moment | What happens |
|---|---|
| Creating a project | Nothing new: no step, no choice, no write. The Datapacks step shows one line: "Your changes to this data are kept in this demo's own pack." |
| First save (on purpose, or on removal) | The demo's pack is made then, so a demo with no edits never has one. A notice: "Saved to the Acme Demo pack." |
| Naming | It takes the project's name, and follows a project rename until the SC renames the pack themselves. Renamed from the pack's card |
| Each later save | A new version of the demo's pack. Reinstalling uses the newest; older ones stay listed in the pack's flyout |
| Where it is managed | The Data Installer screen's catalog, which already lists Library and Yours packs with a flyout each: the flyout gains Rename and Delete, and Share / Stop sharing on the SC's own pack (decided 2026-10-30, below). The project dashboard shows one line, "This demo's pack: Acme Demo", linking to it |
| Copying a project | The copy starts from the original's demo pack, and gets its own on its first save |
| Deleting a project | Its confirmation offers "Also delete its pack", unticked: keeping is reversible, deleting is not |
| Agents | The same actions under the same names: save, rename, delete, list my packs |

**Sharing a demo with a colleague: by reference, copied on arrival.** A project file already
carries `datapack: { name, version }` (`DatapackReference`, the portable-demos contract, PL-56a).
It gains which store the pack is in, and the pack it was made from. Creating a project from the
file copies the referenced pack into the colleague's own library as that demo's pack, then
installs it; from then on the colleague's demo stands alone. Owner's choice over the file
carrying the whole pack, which makes files heavy (megabytes once images exist) and changes their
format more.

- **The library's "private" becomes "unlisted":** a Yours pack is left out of everyone else's
  catalog, but anyone the library's guard admits (the team) can read it by its exact name and
  version. Today private means only its owner can read it, which would leave a colleague's
  reference unreadable. A truly owner-only pack can be added if one is ever needed.
- **If the referenced pack has gone** (its owner deleted it before the colleague used the file),
  project creation does not stop. The Datapacks step says "The Acme Demo pack this project uses
  has been deleted by its owner. You can continue with Bodea, the pack it was made from; their
  changes won't be included." If that version of Bodea has gone too, it uses Bodea's newest and
  says so; if Bodea has gone entirely, the project continues without sample data and says why.
- **Exporting marks the pack as shared in a file**, and deleting such a pack warns: "You shared
  this pack in a project file on 27 October. Anyone who hasn't created that project yet will get
  Bodea instead."

## Agent surface

Names are proposed; fixed when built.

| Tool | New or changed | Read or write | Chat wording | Dialog |
|---|---|---|---|---|
| `rename_datapack` | new: rename the SC's own pack | write | "Renaming the Acme Demo pack" | yes: names the pack and the new name |
| `find_datapacks` | already lists the SC's own packs (`mine`) | read | unchanged | none |
| `delete_library_datapack` | already deletes the SC's own; warns when the pack was shared in a project file | write | unchanged | unchanged, plus the warning |
| `delete_project` | takes "also delete its pack", off unless asked | write | unchanged | names the pack when asked |
| `create_project_from_file` | copies the referenced pack into the colleague's library, or falls back and says why | write | unchanged | unchanged |

**Battery prompts:** "Rename my demo's pack to Acme Q4", and "Create a project from the file
Priya sent me" with the pack deleted (expects the fallback, said plainly). Each traced, then
`ai-coverage-scan`.

## Reuse

| Need | Reuse | Where it is |
|---|---|---|
| Rename a pack | Rename in place | `InlineRenameField` |
| Rename, Delete, Share / Stop sharing | The flyout's existing actions, and the kebab where the card has one | `DatapackDetailPanel`, `RemoveFromLibraryButton`, `CardActionsMenu` + `renderMenuIcon` |
| Yours and Library tags | As the catalog tags them now | `DatapackCard` |
| "This demo's pack: Acme Demo" on the dashboard | The dashboard's existing Data Installer tile gains the line | `DataInstallerTile` (`BuildZone`) |
| The line on the Datapacks step | The step's own lead sentence | `SampleDataStep`, `LeadText` |
| "The Acme Demo pack … has been deleted; continue with Bodea" | A warning above the step, with its one action | `InlineNotice` (`tone`, `action`) |
| "Also delete its pack" on project delete | A third choice beside the GitHub repository and DA.live site the delete already offers, answered by the same setting | `deletionConfirmation.ts` (`CleanupOptions`, `demoBuilder.cleanupBehavior`) |
| Copying a pack into the colleague's library | The existing copy between stores | `readPackFromStore` + `writePackToStore` |
| The project file's reference | The portable-demos contract, one type | `DatapackReference` (`src/types/demoPackages.ts`) |

## What was built (2026-10-29)

Built with the approved items of `.rptc/research/project-export-datapacks/research.md` (same seam).
Not yet run against a live store or library.

**One datapack type** (`src/types/datapack.ts`). `DatapackStoreName`, `DatapackId`,
`DatapackLocation` (a pack and its store), `DatapackReference` (name, optional version, `store`,
`origin`), `ProjectDatapack` (a reference with its version), `OwnDatapack`, `RecordedPackCheck`,
`DatapackAvailability`, and `recordableDatapack` (the one "keep everything but require a version"
rule; two creation paths had each copied only name and version). The six inline shapes are gone;
`DatapackId` moved out of the data-installer feature and 28 imports follow it. A pack with no
`store` reads as the Data Installer, as before (rule 3, no migration).

**The store is recorded wherever the pack is**: the Datapacks step (the card's store), an import
from the screen (`request.source`, else `installer`), a save (`library`), `configure_project`
(`datapack.store`, zod enum), the Edit and seed paths (whole reference), the shared demo
description. **Creation installs from it**: `installSampleData` sends `source: 'library'` and
asks the same store for the inventory; Demo Builder's engine is now handed the library's reads
on creation (it never was); with the service engine a library pack is refused with the screen's
own sentence (`SERVICE_INSTALLS_ONLY_ITS_OWN`, `handlers/libraryReads.ts`, which also replaced two
copies of the library-reads closure).

**Each demo has its own pack** (`services/demoPack.ts`). "Save store changes" now writes into the
demo's own library pack, named `<slug>-<6 hex of sha256(path|created)>`, version
`YYYYMMDD-HHMMSS` (UTC, to the second), display name the project's until the SC renames it. The
pack installed is never written over; the project records the new version with `store: library`
and `origin` (the pack it was made from, carried from save to save, naming the store its rows were
actually read from), and `ownDatapack` (never exported, so a Copy or an import makes its own at
its first save). The sentence: "Saved to the Acme Demo pack. Bodea is unchanged." `nextVersion`
(the `-saved-` stamp) is deleted.

**Rename** (fork A): `rename-library-datapack` renames every version of the SC's own pack through
the library's `update-datapack-metadata` (PUT, `display_name`), and marks `ownDatapack.renamed`
when it is this demo's; the flyout's title is an `InlineRenameField` on the SC's own library pack
(`DatapackPanelTitle`); agent tool `rename_datapack`. **A project rename follows into the pack**
until the SC renames it (`demoPackRename.ts`, best effort, never fails the rename).

**Deleting a project** offers "Also delete its pack", unticked (fork B,
`deletionConfirmation.ts`, `demoPackDeletion.ts`): every version of the demo's own pack, last,
never failing the delete. `demoBuilder.cleanupBehavior` never deletes a pack (deleteAll keeps the
pack and stops asking about it). Agent: `delete_project` takes `deletePack`.

**Dashboard**: the Data Installer tile's second line reads "This demo's pack: Acme Demo".

**Copied on arrival, and the fallback** (`services/recordedPack.ts`, `arrivingPack.ts`,
`handlers/recordedPackHandlers.ts`). Before creation installs (`executeSampleDataPhase`, so the
wizard, headless, Edit and Copy all meet it): a pack that can't be read is replaced by the pack it
was made from, or that pack's newest version, or none, and the build line says which; a
colleague's own demo pack (library, not mine, not shared) is copied into this SC's library as the
new demo's own pack, then installed. "Not there" is the store's 404. The Datapacks step asks the
same check (`check-recorded-datapack`, a read registered in the wizard map) for a pack the project
arrived with that the catalog does not list, and shows the sentence in an `InlineNotice` with
"Continue with Bodea"; it lists the library when the arriving pack is a library one, and shows the
recorded pack chosen by store and name. `create_project_from_file` answers `datapackNote` (before
and after confirm). The step's lead line: "Your changes to this data are kept in this demo's own
pack."

**Shared in a file** (fork A, `sharedInFiles.ts`): every export door records a library pack in
global state (`demoBuilder.datapacksSharedInFiles`); deleting it from the library warns "You
shared this pack in a project file on 27 October. Anyone who hasn't created that project yet will
get Bodea instead." (the flyout, the Remove button, `delete_library_datapack`).

**The demo package check** asks both stores by name AND version (`availabilityOf`), and says when
the pack is only in the SC's library.

**Fixed on the way**: three manifest fields were saved in memory and never written, so every later
call (which re-reads the manifest) lost them: `commerceConfigChange` (so `set_commerce_config`'s
undo never worked across calls), `demoPackage` (Share's proof of authorship), `frontendEnvState`
("restart to apply" never showed). Pinned by `tests/core/state/projectManifestRoundTrip.test.ts`,
whose table is typed over every `Project` key, so a new field must say whether it is written.

### Agent surface

`rename_datapack` (new, write, confirm, consent names pack and new name); `delete_project`
`deletePack`; `delete_library_datapack` warns; `create_project_from_file` `datapackNote`;
`configure_project` `datapack.store`; `save_store_changes_to_pack` saves into the demo's own pack.
Battery prompts `rename-demo-pack` and `create-from-colleagues-file` added, not run.
`rename_datapack`'s ceiling is pending a live measurement. `ai-coverage-scan` not re-run.

### Not built

- **Sharing a pack**: decided by the owner 2026-10-30 and built; see "Sharing a library pack" below.
- **The library's "unlisted"**: a library-service change (below). Until it lands, a colleague's
  own demo pack is unreadable, so the copy on arrival never triggers and the fallback always does.
- **Step 05's removal box** ("Save my changes to the Acme Demo pack first", "Always") now has
  its pack; not built here.

### What the library service needs ("unlisted")

In `accs-discovery-service` (`feature/datapack-store`, read at `d5cd577`): the three read-by-id
actions AND `visibleTo(email)` onto their filter, so a private pack is invisible to everyone but
its owner, even by exact name and version:
`actions/get-datapack-metadata/index.js:32`, `actions/get-data-item/index.js:51`,
`actions/batch-get-data-items/index.js:77`. "Unlisted" = drop `visibleTo` from those three
(any caller the library's guard admits may read a pack by its exact name and version) and keep it
on `actions/find-datapacks/index.js:62`, so the catalog still lists only shared packs and the
caller's own. No extension change is needed: the extension already reads by exact name and
version.

### Live test (owner's call; project `scratch-1028`, website `justrite_test_website`, never JustRite's own)

See the report of this run; the steps return the library and the store to zero.

## Sharing a library pack (owner, decided 2026-10-30; built 2026-10-30, not yet live)

**Decision.** Any SC shares their OWN pack; no curator role. One action in the pack's flyout reads
**Share** on a private pack and **Stop sharing** on a shared one. Share asks once, in the house inline
confirm: "Everyone with access to the datapack library can see and install this pack." [Share]
[Cancel]; Stop sharing asks the confirm alone. The card shows a small **Shared** label only when the
SC's own pack is shared. Exporting a project whose recorded pack is the SC's own PRIVATE library pack
says once: "Your teammates can't use this pack's data. Share it?", with Share; declining exports
anyway. Never "Public", "Unshare" or "Make shared".

**The library's route** (read only, `accs-discovery-service` on `feature/datapack-store`, `6551560`):
`PUT update-datapack-metadata` with `{datapack_name, version, shared}`
(`actions/update-datapack-metadata/index.js:5-7`, `UPDATABLE` at `:25`); `shared` is read as `true`
or `"true"`, anything else false (`:69`, `actions/lib/datapack.js:99-101`); owner-only, a pack that is
not the caller's answers the same 404 as one that does not exist (`:84-85`,
`actions/lib/store.js:127-130`); it answers `{datapack_name, version, message, data: <merged
document>}` (`:90-95`). Per version, so a share sets every version of the pack.

**What was built.**

| Part | Where |
|---|---|
| the write | `DatapackStoreWriter.updateShared` (one PUT per version; shares `updateMetadata` with `updateDisplayName`) |
| the action | `share-library-datapack` in `datapackLibraryHandlers.ts`: name, `shared` and confirm checked; every version of the SC's own pack (`myVersions`); refuses one not theirs |
| the words | `shareWording.ts` (`SHARE_CONSENT`), one place for the webview and the extension |
| the flyout | `ShareLibraryPackButton.tsx`, in `DatapackDetailPanel`'s actions on `detail.mine` only, built as `RemoveFromLibraryButton` is (reuse-first: no house confirm component fits an inline flyout action; `Modal` would put a dialog inside the drawer, which `DatapackDetailPanel`'s docstring rules out); the catalog reads the card and flyout again after |
| the card | `DatapackCard`: a second `datapack-card-tag`, "Shared", for the SC's own shared pack; no new CSS |
| every export door | `privatePackPrompt.ts`: the projects list's Export and the dashboard's export ask a person once before the save dialog (`offerToShareBeforeExport`); `export_project_settings` and an agent's `export_demo_bundle` answer `packNote` (`privatePackNote`). A library that cannot be asked asks nothing |
| agent | `share_datapack` (write, confirm, `AGENT_ALERT_COPY` naming `datapackName` and `shared`, narrated "Changing who can use the <pack> pack"); `export_project_settings`' and `export_demo_bundle`'s descriptions name `packNote`; battery prompt `share-my-demo-pack`, not run; no ceiling measured |

**Tests.** `datapackStoreWriter.test.ts` (2), `datapackLibraryHandlers-share.test.ts` (7),
`privatePackPrompt.test.ts` (11), `privatePackPrompt-doors.test.ts` (5),
`ShareLibraryPackButton.test.tsx` (6), `DatapackCard.test.tsx` (3), `DatapackDetailPanel.test.tsx` (3).

**Decisions for the owner.**

1. **The export question's decline button** reads "Export Anyway" (Esc does the same). Recommended: keep.
2. **Stop sharing a pack a colleague's project file names**: their file then falls back to the pack
   it was made from, as when it is deleted. Not warned yet. Recommended: reuse the "shared in a
   file" sentence (`sharedInFiles.ts`) on Stop sharing, as Delete does.
3. **The library's "unlisted"** (above) is still not made, so a shared pack is the only way a
   colleague can read one; sharing is now that way.

**Live test** (owner's call; library only, nothing in Commerce): load a throwaway zip pack
`zz-share-db07` into the library; its card shows Yours and no Shared. Flyout: Share, the sentence,
Share: the card shows Shared, and `find_datapacks` (signed in as a colleague, or the library's
`find-datapacks` with `shared=true`) lists it. Stop sharing: the label goes. Export a scratch project
whose recorded pack is it while private: the question shows once; Export Anyway writes the file;
`export_project_settings` answers `packNote`. Back to zero: delete `zz-share-db07` from the library.
