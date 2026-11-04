# beta.153 release tests

The last thing before beta.153 is cut. Every row here is walked live, on the normal build in the
owner's dev host, and marked with its result and date. The cut waits until every row is **passed**,
or the owner has moved it out by name.

Filed 2026-11-04. Build under test: develop at `c5e47a99e` (the last code change is `f65f64bd2`).

## Rules for every live run

- Store writes go to website `justrite_test_website` (store view `justrite_test_store_us`) only.
  Never `justrite`, the live demo.
- Each run that writes to Commerce, GitHub or DA.live starts on the owner's go.
- "Back to zero" after every run: `justrite_test_store` has root Default Category (id 2), no ZZ
  categories, and the library holds no test packs.
- A failure is written here with what was seen, then fixed, then the row is walked again.

How to mark a row: change `open` to `passed 2026-11-DD`, or `failed 2026-11-DD: what happened`.

## 1. Datapacks

The datapack-engine plan's live tests 1 to 5 (`.rptc/plans/datapack-engine/`), plus the Save / Save
As walk from `.rptc/plans/datapack-save-as/overview.md` step 11.

| # | Test | What passes | Result |
|---|---|---|---|
| 1.1 | Live test 1: a throwaway pack holding every kind of data, installed, then removed | Every kind installs; removal leaves the store as it was | passed 2026-11-03 |
| 1.2 | Live test 2: the real `wknd` and Bodea packs | Both install and remove cleanly | `wknd` passed 2026-11-03. Bodea open: needs an instance without Bodea on it |
| 1.3 | The settings layer beside a pack (step 09) | Settings apply with the pack and go back on removal | passed 2026-11-03 |
| 1.4 | Live test 3: two Admin root changes (step 12's one Admin step), in real Chrome | A pack with its own root on a shared-root store asks the one Admin step. Open the Admin, I've Done It (the check reads the new root), and Skip For Now all behave. Done twice, then back to root 2 | open |
| 1.5 | Live test 4: the owner's own clicks on the Datapacks screen | Create Datapack (Select Everything, Select All Data); Save and Save As from the demo's card; Save Changes in the flyout; Remove Datapack; no Data Installer address set shows the SC's packs and no error | open |
| 1.6 | Live test 5: the GitHub and DA.live round trip | A project's datapack travels with it: export the project, create a new one from the file (new GitHub repository, new DA.live site), and the pack comes with it and installs. Exact steps were never written down; confirm them with the owner before the run | open |
| 1.7 | Save / Save As walk (save-as plan step 11) | Delete the old automatic JustRite pack. On Bodea: change the store, Save As "Acme Bodea", Save again, Reset to Acme Bodea with changes (asks first), a second demo on Acme Bodea shows Newer Version, deleting the demo offers the pack | open |
| 1.8 | Colour swatches | One look in the Admin shows the pack's swatches | open |

Known limit: the Data Installer refuses the owner's sign-in (`ERR1201`, missing product profile)
since 2026-11-03. Anything that lists or copies its packs cannot be tested. The store's own packs do
not depend on it. Not a release blocker (owner, 2026-11-03).

## 2. Projects list: select, reset and delete several at once

From `c11fde45a`. Never seen live.

| # | Test | What passes | Result |
|---|---|---|---|
| 2.1 | Selection mode | Select, Select All (only what the filter shows), Done all work; Done leaves selection mode | open |
| 2.2 | Reset Selected | One window asks once for every project, then runs them one at a time, a row each. Grouped by IMS organization. A sign-in pauses and asks in the window | open |
| 2.3 | A failure in a batch | One project fails; the rest still run and the failed row says why | open |
| 2.4 | The open project | Resetting or deleting a batch that includes the open project does not move it | open |
| 2.5 | Datapack name in a reset batch | A pack that is not the SC's and has changes asks for a name, or Remove Without Saving. Other store data is never cleared | open |
| 2.6 | Delete Selected | One window, one ask, each project deleted in turn | open |
| 2.7 | Single delete | Delete Repository, Delete DA.live Site and Delete Datapack are ticked, and it still asks. A repository or site another local project uses is not offered | open |
| 2.8 | Agent delete | `delete_project` never offers a repository or site another local project uses | open |

## 3. Smaller changes since the last live walk

| # | Test | What passes | Result |
|---|---|---|---|
| 3.1 | Setup guide | Check All Steps empties then fills in; the button sits in the footer | open |
| 3.2 | Block libraries | Three cards to a row; the settings link sits in its sentence; the Configure picker shows everything the storefront gets | open |
| 3.3 | Updates | Apply names no number when nothing is ticked; a colleague's reset demo is not offered as an update | open |
| 3.4 | Dialogs | Room for the focus ring, no sideways scroll, the spinner in the checkbox's place | open |
| 3.5 | Commerce Admin | Opens the Unified Shell in the SC's own browser by default; Classic UI keeps the private window | open |

## 4. Before the cut, each with the owner's go

These touch other repositories and real SCs, so they come last.

| # | Step | What passes | Result |
|---|---|---|---|
| 4.1 | Merge `skukla/demo-erp` `feature/remove-orders` into `main` | Merged and pushed first | open |
| 4.2 | Merge `skukla/commerce-erp-integration` `feature/one-reset-rule` into `main` | Its `contract:check` passes against demo-erp `main` | open |
| 4.3 | Point JustRite's four ERP component folders back at `main` | `erp/status` still answers `closesOrdersByStore` and `refundsOnReset` | open |
| 4.4 | Mark the 9 packs as team packs and share them | Each shows as a team pack in the library | open |
| 4.5 | Push develop, then cut beta.153 with the `cut-release` skill | The pre-release is published | open |

Details for 4.1 to 4.3: `.rptc/plans/datapack-engine/overview.md`, "Before beta.153 ships".
