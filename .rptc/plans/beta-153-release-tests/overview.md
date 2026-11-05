# beta.153 release tests

The last thing before beta.153 is cut. Every test here is walked live, on the normal build in the
owner's dev host, and marked with its result and date. The cut waits until every test is
**passed**, or the owner has moved it out by name.

Filed 2026-11-04. Build under test: develop at `eb38f48ac` (the last code change is `f65f64bd2`).
Steps rewritten the same day from the code, with every label read from the source: four labels in
the first version were out of date ("Select Everything" is now Select All Data; the Save As button
and "Reset to <pack>" were removed by the save-as pivot; "Save my changes first" became buttons).

## Rules for every live run

- Store writes go to website `justrite_test_website` (store `justrite_test_store`) only. Never
  `justrite`, the live demo.
- Each run that writes to Commerce, GitHub or DA.live starts on the owner's go.
- Back to zero after every run: `justrite_test_store` has root Default Category (id 2), no ZZ
  categories, and the library holds no test packs.
- A failure is written here with what was seen, then fixed, then the test is walked again.

Mark each test's **Result** line: `passed 2026-11-DD`, or `failed 2026-11-DD: what happened`.

## Found during the walk (fixed together, one branch, at the end)

| # | Seen in | What | Fix |
|---|---|---|---|
| F1 | 3.3 | Ticking a row in Updates moves Close: "Apply 1 Update" is wider than "Apply Updates", and the button grows with its label | The button reserves its widest label's width from the start, the way a pending button already keeps its width (`Modal.tsx`). Built on `fix/release-walk-fixes`; owner saw no shift 2026-11-04 |
| F2 | 2.1 | Entering selection mode made the projects header ~5px taller, dropping every card: Select All carried its list row's padding | Padding removed on that row (`projects-batch.css`). Measured in the harness 2026-11-04: the line under the header at 191.59px in both modes; with the old padding put back, 195.59px |
| F3 | Q1 | "Select" was vague and quieter than the Datapacks header's buttons in the same place | Select Projects, with icons on it and on Reset Selected and Delete Selected, a divider before Done. Built, owner saw it 2026-11-04 |
| F4 | 2.2 | The Reset Projects confirm lists names and says nothing of what a reset does; the single reset says "This will reset all code to the template state and re-copy demo content." It also has no amber icon, which the dialog rules give a dangerous confirm | "Each project returns to how it was set up. Code changes are lost." (shortened to one line, owner 2026-11-05), the amber icon on both confirms, Reset N Projects red (owner, 2026-11-04). Built, owner to check |
| F5 | 2.2 | A question during the run (DA.live sign-in) leaves no way out: the batch window hides its dismiss button, where the single reset's progress window turns it into Cancel (`OperationProgressModal`) | Layout A (owner, 2026-11-04): a sign-in takes the window, its heading the title, naming no project (the pause is the run's, owner 2026-11-04), its sentence with two numbered steps, the fields 24 below, and Cancel, which skips that project; a question about one row stays under it (the 2026-10-21 rule). One view for the progress, Updates and batch windows (`OperationQuestion`). Built, owner to check |
| F6 | 2.2 | The DA.live sign-in field reads "DA.live namespace"; the rules make a label Title Case. The Title Case enforcer cannot see a label in a `.ts` object | "DA.live Namespace" (`daLiveAuthPrompt.ts`). Built. The enforcer gap is not closed |
| F7 | 2.2 | The running row was the one row of a different shape (its step beside the name) | Every work row is two lines, its name then where it stands (Waiting, the step, Finished, or why it failed), in the batch run, the Updates run and the ERP setup steps (`WorkRow`, owner 2026-11-04). Built, owner to check |
| F8 | 2.2 | "Sign in to keep going." read as AI speak; the Adobe sign-in in the batch run had lost its Cancel | "Sign in to continue." (Adobe and DA.live); the question's own Cancel kept when the dismiss is hidden. Built, owner to check |
| F9 | 2.2 | The confirms listed bare project names | Each name with its card's line under it ("Starter (B2B + B2C), Edge Delivery + ACCS") and its datapack, in the run rows' style, on Reset and Delete Selected (owner, 2026-11-04). Built, owner to check |
| F10 | 2.2 | Lists of rows in dialogs had nothing between rows, and org grouping was invisible | A hairline between rows (the flyout's), a finished row's name greyed, and an org heading (14 semibold, the Updates group name's style) only when a reset spans several orgs: batch run and confirms, Updates run, ERP setup steps. Dialog rule rewritten to allow the hairline (owner, 2026-11-04). Built, owner to check |
| F11 | 2.2 | patch-canary-b2b records no IMS org: an agent made it (`create_project`, 2026-10-16), and that tool signs in to Adobe only when a creation deploys something (`adobeIfDeploying`), where the wizard always signs an ACCS project in and records the org. Later Commerce writes then have no credential (the test shopper write was refused that day) | Built (owner, 2026-11-04, this release): `create_project` records the session's org (`select_org`) for every ACCS project, asking for the sign-in or an org first, and says so in its description. Existing agent-made projects judged rare (owner): no on-open repair, but a reset of an ACCS project with no org now signs in and records the org the sign-in lands in (owner, 2026-11-04; `recordSignedInOrg`); patch-canary-b2b given Adobe Demo System by hand (the org of the same Commerce instance's other projects), backup kept |
| F12 | 2.2 | Pressing Sign In on the Adobe sign-in during a reset showed the reset's own line again ("Checking requirements") until the browser's page was known, so the reset looked as though it went on without the sign-in, then the browser jumped up | The window's Finish Signing In step shows from the press ("Sign in to Adobe in your browser.", Cancel), and gains Open Sign-In Page once the page is known (`browserSignInNotice.ts`). Built, owner to check |
| F13 | 2.2 | The confirms' second line (package and stack) read the same for two projects of one package; the run's row said its stage without the count the notification gives | Each project named as its card names it ("Patch Canary B2B", `getProjectDisplayName`), not by its folder, held by the branded `ProjectDisplayName` type on the batch rows (a folder name fails to compile, checked by planting one); the confirms draw the storefront's repository ("skukla/patch-canary-b2b") under each name, the summary only for a project with none; a running row says "Warming product pages (9 of 11)" through the notification's own `stageLine` (owner, 2026-11-04). Built, owner to check |
| F14 | 2.2 | The batch run showed no time, where the single progress window shows a clock and a "Took" | Each row's time right after its name (moved from the dialog's far edge, owner 2026-11-04): counting while it runs (`useRunClock`), kept once it ends (`spanValue`, in the clock module so one wait has one clock); "Took 7 minutes, 20 seconds" under the rows for a run over a minute (`tookValue`) (owner, 2026-11-04). Built, owner to check |
| F15 | 2.2 | A reset's count went "10 of 11", "2 of 11", "11 of 11": the check that the live site serves the reset code runs after the content but reported on step 2, beside the code publish it lives with (`confirmResetCodeServed`); no test covered it | It reports on step 11, renamed "Checking the live site" (the code and the config), which the republish flow's last step shares; two tests pin the step (owner, 2026-11-04). Built, owner to check |
| F16 | 2.2 | One reset takes about six minutes and the batch ran them one at a time, where the notification approach let them overlap | Resets run side by side within an IMS org, up to 3 at once; orgs one after another; resets removing a pack's store data take turns; a DA.live sign-in needed by several is asked once (`SingleFlight`, as the Adobe one already was); a window's questions take turns and a run ending clears only its own (`operationPrompt`); a question with several rows running is asked once above the list (owner, 2026-11-04, this release). Deletes stay one at a time. Walked live 2026-11-04: two side by side, 5 minutes 33 seconds |
| F17 | 2.5 | The reset confirm names a datapack by its internal name ("kukla-justrite-a80dca") where the Datapacks screen shows its display name | The display name, as the Datapacks card shows it. Fixed: the reset reads the pack's display name from the library (`prepareResetBatch`) |
| F18 | 2.5 | The Reset Selected confirm put each pack's save-as name and a discard box under its project, noisy and asking before the SC had chosen what goes | Two steps: Reset N Projects? with a Remove Datapack column, then Datapack Changes (a new name or Discard Changes per pack that asks), Back between them. A pack whose changes could not be read is kept: "Couldn't check for changes. Datapack kept." (owner, 2026-11-04). Built |
| F19 | 2.7 | The single delete's question named the folder ("patch-canary-b2b"), read "Deleting…" while still asking, and had a blue Delete | "Delete Patch Canary B2B?", "Project files are removed from this machine.", a red Delete; the display name in the QuickPick and plain confirm too (owner, 2026-11-05). Built |
| F20 | 2.7 | Delete Selected: "Delete Projects" for one, no word that local files go, the repository under the name rather than beside its box, three columns of names squeezed and wrapping, and no cue a long list scrolls | "Delete N Projects?" and "Reset N Projects?"; "Project files are removed from this machine."; each box names what it deletes; a Project header; Delete Selected extra-wide, no cell wrapping; long lists scroll under a fixed header with the Updates window's fade, now one shared style (owner, 2026-11-05). Built |
| F21 | 2.7 | Colour audit: status text used Spectrum's icon tokens (red text 4.40:1, under AA), and the accent blue's states each used two shades in places | Every status: icon token for icons, text token for text (red text 6.91:1). The blue ramp kept, each state one shade (focus ring 400, selected border 400, link 500, selected hover 200). Both enforced in `status-icons.test.ts` (owner, 2026-11-05). Built |

## Questions raised

| # | Seen in | Question | Answer |
|---|---|---|---|
| Q1 | 2.1 | Is a Select button the right way into picking several projects, is it consistent, and is it in the right place? (owner) | Keep the mode (owner, 2026-11-04), with F3 |

## Summary

| # | Test | Result |
|---|---|---|
| 1.1 | Throwaway pack with every kind of data (live test 1) | passed 2026-11-03 |
| 1.2 | Real packs: `wknd` and Bodea (live test 2) | `wknd` passed 2026-11-03; Bodea open |
| 1.3 | Settings layer beside a pack | passed 2026-11-03 |
| 1.4 | Shared root: the one Admin step (live test 3) | open |
| 1.5 | The Datapacks screen by hand (live test 4) | open |
| 1.6 | A datapack travels with a project (live test 5) | open |
| 1.7 | Save Changes, Newer Version, reset and delete with a pack | open |
| 1.8 | Colour swatches | open |
| 2.1 to 2.8 | Projects list: select, reset and delete several | open |
| 3.1 to 3.5 | Smaller changes since the last walk | open |
| 4.1 to 4.5 | Before the cut | open |

---

## 1. Datapacks

Open the screen with the dashboard's **Datapacks** tile, or the Command Palette's
**Demo Builder: Open Datapacks**.

### 1.2 Bodea pack (rest of live test 2)

Needs a store without Bodea's data already on it.

1. On a project pointed at such a store, open Datapacks, click the Bodea card, then **Import**.
2. Expect it to install with no failed kinds.
3. **Import** again, then **Remove All Data**, then confirm in **Remove from <store>?**.
4. Expect the store back as it was.

**Result:** open

### 1.4 Shared root: the one Admin step (live test 3)

In real Chrome. The step only appears when the pack keeps its own root and the store's root is
shared with another store, on the pack's first install there.

1. Admin change 1: in **Stores > All Stores > JustRite Test Store**, set Root Category to
   `Justrite Catalog` (id 119, shared with the real JustRite store), then **Save Store**.
2. In Datapacks, import the Frescopa pack onto `justrite_test_store_us`.
3. Expect the question **One Step in the Admin to Show <root>'s Categories**, with **Open Admin**,
   **I've done it** and **Skip for Now**.
4. Click **I've done it** without changing anything. Expect it to ask again, starting
   "<store> still uses the root category …".
5. Click **Skip for Now**. Expect the install to finish with "One step is left in the Admin: …".
6. Open the Frescopa card's flyout. Expect the line **1 step left in the Admin** with **Show Step**.
7. Click **Show Step**, then **Open Admin**. Expect the Admin to open.
8. Admin change 2: set the store's Root Category to Frescopa's root, then **Save Store**.
9. Back in the dialog, click **Check**. Expect "<store> now shows the categories under <root>."
   and the flyout line gone.
10. Back to zero: **Import**, **Remove All Data**, confirm. Set the root back to Default Category
    (id 2) and **Save Store**. Expect no ZZ categories.

**Result:** open

### 1.5 The Datapacks screen by hand (live test 4)

1. Open Datapacks. Expect tabs **Catalog** and **Activity**, and the buttons **Create Datapack**,
   **Load from File** and **Clear Demo Data**.
2. Click **Create Datapack**. Expect the dialog **Create Datapack** with an empty, required
   **Datapack Name**. **Continue** stays greyed until you type a name.
3. Type a name, click **Continue**.
4. Tick **Select All Data**. Expect a small spinner in the checkbox's place while it reads, the
   label not moving, then the box back and ticked.
5. Untick it, open one kind, use that list's own **Select All**, then pick a few items by hand.
6. Click **Create**. Expect a window **Creating <name>**, then **Datapack Created** and
   "Saved to the <name> pack."
7. Close. Expect a new card tagged **Yours**, with the blue check (this demo now uses it).
8. Click the card. In the flyout expect Description, Owner "You", Visible To, Updated, Data.
9. Change something in the Admin (one product's name), then click **Save Changes** in the flyout.
   Expect the dialog **Save <name>**, the **Save** button enabled with nothing extra picked, then
   **Datapack Saved**.
10. In the flyout, **More**, then **Remove Datapack**. Expect "Removed." and the card gone.
    Commerce is not touched.
11. No Data Installer address: in Settings, empty `demoBuilder.dataInstaller.apiBaseUrl`. Reopen
    Datapacks. Expect your packs, no banner, no **Include Data Installer Datapacks** switch, and
    no error. Put the address back.

**Result:** open

### 1.6 A datapack travels with a project (live test 5)

The file carries the pack by reference (name, version, store), not its data. Confirm these steps
with the owner before the run: what "the GitHub and DA.live round trip" meant was never written
down.

1. On a project that uses one of your own private packs, open the dashboard's **Share Demo**,
   choose **Send a File**, tick **Setup** and **Storefront**, click **Save**.
2. Expect the question "Your teammates can't use this pack's data. Share it?" with **Share** and
   **Export Anyway**. Choose **Share**.
3. On the projects list, the new-project menu, **Import from File**, and pick that file.
4. Expect the wizard titled **Import Project**, with the pack already chosen in Datapacks.
5. Create it with a new repository name and a new DA.live site.
6. Expect "Installing <name>" during creation, a new GitHub repository, a new DA.live site, and
   the store showing the pack's data.
7. Back to zero: delete the new project with **Delete Repository**, **Delete DA.live Site** and
   the pack's data removed.

**Result:** open

### 1.7 Save Changes, Newer Version, reset and delete with a pack

The save-as plan's walk (`.rptc/plans/datapack-save-as/overview.md` step 11), with the Save As
button and "Reset to <pack>" removed by its own pivot. Uses the Bodea demo.

1. Delete the old automatic JustRite pack if it is still in the library.
2. On the Bodea demo, change the store in the Admin, then **Create Datapack** named "Acme Bodea"
   with your change picked.
3. Change the store again, then **Save Changes** in the Acme Bodea flyout.
4. Create a second demo using Acme Bodea.
5. On the first demo, **Save Changes** once more.
6. Open Datapacks with the second demo current. Expect an amber dot beside Acme Bodea's version
   picker, reading "Newer version: <date>" on hover.
7. On the second demo, change the store, then the dashboard's **Reset**, **Reset Project**.
   Expect "Also remove the datapack this project imported …?" with **Remove Datapack** and
   **Keep Data**. Choose **Remove Datapack**. Your own pack: changes saved into it, no question.
8. Repeat 7 on a demo using a pack that is not yours. Expect a required, empty **Save Changes As**,
   with **Save As New and Remove** and **Remove Without Saving**. A blank name says
   "Datapack name is required".
9. Delete the second demo. Expect **Delete Datapack** offered only if no other local project uses
   the pack, and never ticked to start.
10. Back to zero: delete both demos' packs and data.

**Result:** open

### 1.8 Colour swatches

1. Install a pack whose Product Attributes include a colour swatch attribute.
2. In the Admin: **Stores > Attributes > Product**, open that attribute.
3. Expect the colour swatches with their colours (for example Black #1d1d1d, Blue #286785).
4. Back to zero: remove the pack's data.

**Result:** open

Known limit: the Data Installer refuses the owner's sign-in (`ERR1201`, missing product profile)
since 2026-11-03. Anything that lists or copies its packs cannot be tested. The store's own packs do
not depend on it. Not a release blocker (owner, 2026-11-03).

---

## 2. Projects list: select, reset and delete several

From `c11fde45a`. Never seen live. Open the list from the Demo Builder icon in the activity bar, or
a dashboard's **All Projects**. Have at least three projects, two of them in different IMS orgs.

### 2.1 Selection mode

1. Click **Select** in the count row. Expect a checkbox on every project, **New Project** hidden,
   and **Select All** with "N of M selected".
2. Type a search, click **Select All**, clear the search. Expect only the projects the search
   showed to be ticked.
3. Expect **Reset Selected** and **Delete Selected** greyed while nothing shown is ticked.
4. Click **Done**. Expect selection mode gone and the ticks forgotten. Do it again with Escape.

**Result:** passed 2026-11-04 (all five steps). Owner questioned the design: see "Questions raised".

### 2.2 Reset Selected

1. Pick three projects in this order: A (org 1), B (org 2), C (org 1). Click **Reset Selected**.
2. Expect "Reading demo data", then the window **Reset Projects** with one line per project and
   its pack, and **Reset 3 Projects**.
3. Click it. Expect the title **Resetting Projects**, every project as a row, run order A, C, B,
   and **Run in Background** as the dismiss button.
4. When a sign-in or org switch is needed, expect the question under that row and the window's
   buttons to become its answers.
5. Expect **Projects Reset** at the end and **Close**.

**Result:** passed 2026-11-04 on the walk's build: confirm, run rows, sign-in pause, end (Projects Reset, times, Took). Two resets side by side in 5 minutes 33 seconds (F16). Org grouping not testable here, one org

### 2.3 A failure does not stop the rest

1. Tick two projects, click **Reset Selected**, wait for the questions to show.
2. Delete one project's folder in Finder, then click **Reset 2 Projects**.
3. Expect that row to read "This project is no longer on this computer.", the other to finish, and
   the title **Couldn't Reset Projects** with "1 project(s) not reset."

**Result:** passed 2026-11-04: Patch Canary B2B's folder hidden after the confirm, its row failed at once ("This project is no longer on this computer."), Scratch 1028 ran on to Finished, title Couldn't Reset Projects with the amber icon. Folder restored

### 2.4 The open project never moves

1. Open project X's dashboard, go back to the list.
2. Reset Y and Z with **Reset Selected**.
3. Expect X still the current project in the dashboard and the sidebar.

**Result:** passed 2026-11-04: the open-project pointer read Scratch 1028 before and after a batch reset of it beside Patch Canary B2B; the batch saves through `createNonSwitchingStateManager` (`projectsBatchHandlers.ts`), whose suite pins "saves without moving the pointer while its project is not the current one". The Bodea walk was skipped to save a reset (owner)

### 2.5 A datapack in a reset batch

1. Tick a project on your own pack and one on a pack that is not yours, both with changes.
2. **Reset Selected**, tick **Remove Datapack**.
3. Expect "Saving to your library" for yours. For the other, a required, empty **Save Changes As**
   and **Remove Without Saving**.
4. Expect the run button greyed until the name is filled or **Remove Without Saving** is ticked.
5. Run it. Expect no other store data cleared.

**Result:** passed in part 2026-11-04: Remove Datapack offered only when a picked project has a pack (Bodea has none, JustRite has one), ticked, nothing to save with no changes since install. The save branches (Saving to your library, Save Changes As) not seen live: JustRite's store had no changes. Found F17

### 2.6 Delete Selected

Use throwaway projects only.

1. Tick two, click **Delete Selected**. Expect "Reading Projects", then **Delete Projects** with a
   table: **Delete Repository**, **Delete DA.live Site**, **Delete Datapack**.
2. Expect each column header to tick or untick its column. **Delete Datapack** never ticked to start.
3. Click **Delete 2 Projects**. Expect **Deleting Projects**, then **Projects Deleted**.

**Result:** open

### 2.7 Single delete

1. With the setting `demoBuilder.cleanupBehavior` set to `deleteAll`, open a project's **More** menu, **Delete**.
2. Expect `Delete "<name>"? Its files are removed from this machine. You can also delete what it
   created online.` with **Delete Repository** and **Delete DA.live Site** ticked,
   **Delete Datapack** unticked, and a **Delete** button. It asks first.
3. Make two local projects on the same GitHub repository. Delete one. Expect no
   **Delete Repository** box.
4. Batch-delete both. Expect the box back, because both are going.

**Result:** passed in part (owner, 2026-11-05). Steps 1 and 2 (single delete, its boxes under `ask`) and Delete Selected looked at, then redesigned (F19, F20). Steps 3 and 4 (two projects on one repository) not run yet

### 2.8 Agent delete

1. Ask an agent to delete one of the two shared-repository projects, with the repository too.
2. Expect it deleted and the answer saying "Kept the GitHub repository: <name> also uses it."

**Result:** open

---

## 3. Smaller changes since the last walk

### 3.1 Setup guide

1. Open **Integrations** (dashboard tile), then an integration's "Demo Setup: …" line.
2. Expect **Check All Steps** at the left of the footer.
3. Click it. Expect every checked step to empty at once, then fill in one by one, with no
   "Checking 2 of 5" text.

**Result:** open

### 3.2 Block libraries

1. In the wizard's Storefront area, open **Block Libraries**.
2. Expect three cards to a row, fewer as the panel narrows, never stretched when there are only one
   or two.
3. Expect "None added yet. Add them in Block Library Settings." with only
   **Block Library Settings** as a link. Click it: Settings opens at the custom libraries.
4. On a project: **Configure**, the **Storefront** tab, **Block Libraries**. Expect the same
   locked cards ("Included with every storefront", "Included with your storefront") as the wizard.

**Result:** open

### 3.3 Updates

1. Run **Demo Builder: Check for Updates**.
2. Untick everything. Expect **Apply Updates**, greyed.
3. Tick one, then two. Expect **Apply 1 Update**, then **Apply 2 Updates**.
4. A colleague's reset demo: on a storefront made from colleague demo A, reset A, then check for
   updates on the copy. Expect the "Changes from <A>" row unticked, saying the source demo was reset
   to its template.

**Result:** steps 2 and 4 passed 2026-11-04 (kmanns/justrite was reset; the row came up unticked
with the reset text, and the button read Apply Updates, greyed). Step 3 passed for one (Apply 1
Update); two waiting not seen. Found F1.

### 3.4 Dialogs

1. In the Updates window, Tab to the bottom-right button. Expect its whole focus ring visible.
2. Open an integration's **Manage APIs**. Expect no sideways scrollbar and no sideways shift on a
   trackpad swipe.
3. The checkbox spinner is covered by 1.5 step 4.

**Result:** open

### 3.5 Commerce Admin

1. On a Cloud Service project with no choice made, click **Manage Commerce**. Expect the Unified
   Shell in your normal browser, signed in.
2. **Configure**, Commerce tab, **Commerce Admin**: choose **Classic UI**, **Save**, click
   **Manage Commerce**. Expect a private window.
3. Set it back to **Unified Shell** and **Save**.

**Result:** open

---

## 4. Before the cut, each with the owner's go

These touch other repositories and real SCs, so they come last. Merging to `main` releases the ERP
change to every SC with the ERP integration.

1. **4.1** Merge `skukla/demo-erp` `feature/remove-orders` into `main` and push. First.
2. **4.2** Merge `skukla/commerce-erp-integration` `feature/one-reset-rule` into `main`. Expect its
   `contract:check` to pass against demo-erp `main`. Push.
3. **4.3** Point JustRite's four ERP component folders back at `main`. Expect `erp/status` to still
   answer `closesOrdersByStore` and `refundsOnReset`.
4. **4.4** Mark the 9 packs as team packs and share them. Expect each to show with no tag.
5. **4.5** Push develop, then cut beta.153 with the `cut-release` skill. Expect the pre-release
   published.

Details for 4.1 to 4.3: `.rptc/plans/datapack-engine/overview.md`, "Before beta.153 ships".

**Result:** 4.1 open, 4.2 open, 4.3 open, 4.4 open, 4.5 open
