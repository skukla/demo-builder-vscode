# Step 07: each demo has its own pack, shared by reference

Status: **to do**, after step 05.

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
| Where it is managed | The Data Installer screen's catalog, which already lists Library and Yours packs with a flyout each: the flyout gains Rename and Delete (and Make shared, for curators). The project dashboard shows one line, "This demo's pack: Acme Demo", linking to it |
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

## Reuse

| Need | Reuse | Where it is |
|---|---|---|
| Rename a pack | Rename in place | `InlineRenameField` |
| Rename, Delete, Make shared | The flyout's existing actions, and the kebab where the card has one | `DatapackDetailPanel`, `RemoveFromLibraryButton`, `CardActionsMenu` + `renderMenuIcon` |
| Yours and Library tags | As the catalog tags them now | `DatapackCard` |
| "This demo's pack: Acme Demo" on the dashboard | The dashboard's existing Data Installer tile gains the line | `DataInstallerTile` (`BuildZone`) |
| The line on the Datapacks step | The step's own lead sentence | `SampleDataStep`, `LeadText` |
| "The Acme Demo pack … has been deleted; continue with Bodea" | A warning above the step, with its one action | `InlineNotice` (`tone`, `action`) |
| "Also delete its pack" on project delete | A third choice beside the GitHub repository and DA.live site the delete already offers, answered by the same setting | `deletionConfirmation.ts` (`CleanupOptions`, `demoBuilder.cleanupBehavior`) |
| Copying a pack into the colleague's library | The existing copy between stores | `readPackFromStore` + `writePackToStore` |
| The project file's reference | The portable-demos contract, one type | `DatapackReference` (`src/types/demoPackages.ts`) |
