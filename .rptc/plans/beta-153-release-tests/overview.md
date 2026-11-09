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
- Never reset or delete Patch Canary B2B (`skukla/patch-canary-b2b`). The daily patch canary reads
  it, and a reset removes the test page it needs, `/products/ghost-check/canary-ghost-sku` (F27). Use
  a throwaway project instead.
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
| F22 | 3.1 | JustRite's dashboard showed "This demo's source can't be reached" one night and not the next morning: any failed read of the demo's repository (offline, a sign-in, a rate limit, an outage) raised the gone-for-good notice | Only GitHub's 404 raises it. Any other failure says "Couldn't check the <name> demo's repository. Try again in a moment." at reset and shows no notice on the dashboard; the next open checks again (owner, 2026-11-05). Built |
| F23 | 3.2 | The summary said "Block Libraries: 1 selected" beside two ticked cards: it left out the locked library the picker shows | Counts every library the picker shows ticked, locked ones once each, as "N included" (owner, 2026-11-05). Built |
| F24 | 3.2 | Block Libraries headed its second group with a small grey description style, under a divider, and carried a sentence the ticks already said; on Configure the sentence sat under Authoring | Both groups headed the wizard's way (`ConfigSection`): Block Libraries, Custom Block Libraries; no sentence; Configure's outer heading removed, so the picker's own are the only ones (owner, 2026-11-05). Built |
| F25 | 3.2 | The Business Structure step's wait said "Detecting store structure", the old name | "Loading business structure", the wizard's verb for its waits, on the wizard and Configure (owner, 2026-11-05). Built |
| F26 | 3.3 | The Updates window's details sat beside each name at 11px, hard to read, a long one wrapping back under the name; "updates the live site" repeated on most rows; an open group said "1 needs attention" over the row itself, and the note was always singular | Each detail on its own line at 12px, as a run's rows and the delete window's boxes have it. "Storefront updates go to the live site." once under the title, only when one is listed. Shorter details ("Source was reset. Replaces this storefront.", "Verified version" for "Tested version"). The note only on a closed group, "2 need attention" when it is two (owner, 2026-11-05). Built |
| F27 | 2.3, 2.4 | The patch canary went red on 2026-11-05: the walk's resets of Patch Canary B2B on 2026-11-04 removed its test page for a missing product, and the check called a working patch "broken" | The page republished (owner's go), all three checks and the self-test pass against the live canary. The check now says "could not check: the test page is gone" (`skukla/eds-demo-patches@eb86ddb`). This plan's rules keep resets off that project. Done |
| F28 | 3.4 | The Adobe destination line said "Deploys To", and two names and a comma. A two-row version, with Workspace in the wizard, rested on a wrong claim: integrations get their own workspace in the wizard too, and only a mesh uses the chosen one | One row everywhere, "Adobe Project", the name and Change; the Review step still lists the workspace (owner, 2026-11-05). Built |
| F29 | 3.5 | "Configuration saved successfully" said more than it needed | "Configuration saved", as Configure's other save messages read (owner, 2026-11-05). Built |
| F30 | 1.5 | Remove Datapack, Remove Its Store Settings and Save as File showed no wait in the flyout, since the menu they run from has closed; Remove could be chosen twice; Share's button only greyed | A spinner where the answer lands, a second Remove ignored, a spinner on Share's button (owner, 2026-11-05). Built |
| F31 | 1.5 | "As its first version" and "Saving to your library" | "New datapack", "New version", "Saving to your datapacks", "Deleting its datapack" (owner, 2026-11-05). Built |
| F32 | 1.5 | The Community and Data Installer switches each asked the servers again, with the wait on the Refresh button, and there was no way to see only your own packs | One **Show** list: Recommended, My Datapacks, Demo Builder Datapacks, Data Installer Datapacks, Community Datapacks, All Datapacks. It loads once and filters at once. This demo's pack first, then Yours, then A to Z (owner, 2026-11-05). Built |
| F33 | Projects list | Clicks meant to open a project hit the pencil beside its name or the pin | Rename is in the card's menu, the name opens the project, and the pin takes a 24px target (owner, 2026-11-05). Built |
| F34 | 1.5 | The save's progress said "0 of 12 data types: Products, Gift Cards" for a pack of two customer groups; the card with the blue check sat its rows higher than its neighbours' | The line counts what this save is about ("0 of 1 data type: Customer Groups"); the title row keeps the tag's height with the check too (owner, 2026-11-05). Built |
| F35 | Projects list | The 2px hover lift on project cards was irritating, and four other kinds of card and tile did the same | No lift and no hover shadow on any of them: hover changes colour only, as datapack cards always did. Snapshot: nothing moved at rest on 54 captures; on hover and focus only the transform and shadow changed (owner, 2026-11-05). Built |
| F36 | Wizard Datapacks step, Datapacks screen | The wizard had no Show list; Show's label was smaller than its choice; choosing an empty view removed the filter box and moved the row; Recommended could hide a colleague's pack the demo uses | One Show list on both surfaces, and the step loads the whole catalog. The label matches the choice's size. The filter box stays. Recommended keeps the held or chosen pack (owner, 2026-11-05). Built |
| F37 | Every card | With the lift gone, hover barely showed on a black card | Fill one step lighter and outline one step brighter, on every kind of card and tile. Seen on real cards by the owner (2026-11-05). Built |
| F38 | Project dashboard | Datapacks sat in Build, though it is a place an SC goes to use a demo | A fifth Open card, "Sample data". Cards 196px with titles held to one line; the dashboard's header and notices widen to end with them, this screen only. Restart says "Apply changes" (owner, 2026-11-05). Built; the owner's reload after the widening is the fit check |
| F39 | Wizard Integrations, empty | It said integrations deploy "to a shared Adobe I/O project and workspace", which is false: each gets its own | The sentence ends at "your own custom integration." (2026-11-05). Built |
| F40 | 1.5, Create Datapack | The saving step said "New datapack" or "New version", which the window's title already says | It names what is going in ("Customer Groups"), or the count past three kinds ("14 data types") (owner, 2026-11-05). Built |
| F41 | Datapack flyout | Share asked inline under the actions; Save as File and Remove showed a small spinner under them; Remove usually deleted without asking, though it cannot be undone and takes only the version on screen | Share, Stop Sharing, Remove Datapack and Remove Its Store Settings ask in the house confirm dialog, every time. While a menu row works, the flyout shows its title and the medium spinner, no words (owner, 2026-11-05). Built |
| F42 | Settings | The Data Installer address could not be cleared on the settings screen: an empty box failed its "URI expected" check and was never saved. Its description also called it required, which stopped being true when the store became the default | It takes an https address or nothing, and the description says optional (owner, 2026-11-05). Built |
| F43 | Datapacks screen, wizard Datapacks step | Changing the Data Installer address, the store address or the engine did nothing until a Refresh, which an SC would not know to press | Both surfaces read the list again when one of those changes (owner, 2026-11-05). Built |
| F44 | Settings | Turning the Data Installer off meant deleting its address, and pasting it again to turn it back on | A "Data Installer: Enabled" checkbox under the address. Off, it is not asked anywhere, its packs leave every view, and the service engine falls back to Demo Builder's; the address stays (owner, 2026-11-05). Built |
| F45 | Datapack flyout | Its title showed the pack's id while the detail loaded (wrapping to two lines), then jumped to the name; a removed pack's card stayed for seconds after the flyout closed | The title is the card's name from the start; the removed version leaves the list as the flyout closes, and the next list confirms it (owner, 2026-11-05). Built |
| F46 | Create Datapack, Datapacks screen | The pick step felt cramped and waited for the first list as well as the counts; a new pack wore the check and no Mine; a shared pack was missing from Community; the Share sentence was long | The pick step is extra-wide with taller lists and waits only for the counts, the first list loading in its pane. The check sits before the one tag (Mine, or Shared). An SC's shared pack is in Community too. Share says "Everyone can find and install it under Community Datapacks." (owner, 2026-11-05). Built |
| F47 | Create Datapack, Save Changes | The result was a wall of text naming every item the SC had not picked | One line per data type it holds, count first ("4 Customer Groups"), in the pick list's order (the flyout's labels follow it too). A save into the demo's own pack adds what it left out, by count. The agent keeps the whole sentence (owner, 2026-11-05). Built |
| F48 | Datapacks screen | The Data Installer's uncurated packs (test packs, ACO exports, a sample) were tagged Community, and only 2 of its packs showed under Data Installer | Tagged by where a pack lives: every Data Installer pack says Data Installer; Community is colleagues' packs. Empty packs and ACO-only packs are not listed, the SC's own excepted. The 9 hidden curated packs are the SC's own copies, shown once as the store's (owner, 2026-11-05). Built |
| F49 | Datapack cards | "Shared" and "Community" read as the same thing; a tag beside a wrapped name moved with it; the tile was crowded | One word per fact: Mine, Data Installer, Community (an SC's own shared pack is Mine and Community). The tags sit at the right of the version line, pinned to the card's foot. No data type count on the card; the flyout names the types (owner, 2026-11-05). Built |
| F50 | 1.9 | The Updates window still draws collapsible groups with chevrons and nested boxes, where Reset Selected and Delete Selected draw a table (owner, 2026-11-07) | Proposed: the batch windows' table, a Project column with each project's repository under its name, its updates as boxes in an Apply column whose header ticks them all, no chevrons, hairlines between projects, the fixed header and fade; a long list scrolls, no pages, no count (owner, 2026-11-07). The run after Apply is unchanged. `DisclosureToggle`, its only user gone, deleted. In a short window the dialog body scrolled too; now the table is the one scroller, shrinking to the room the dialog has (no measured number, so any zoom). Passed 2026-11-07 (owner) |
| F51 | 1.9 | The **Enabled** setting (Sample Data) still says it lets you "copy your own into its catalog", but Copy to the Data Installer is off the screen until our accounts can write to it | Reword to listing the Data Installer's packs, which Demo Builder installs. To fix at the end Done 2026-11-08, not committed: it now says it lists the Data Installer's datapacks beside Demo Builder's, which Demo Builder installs. |
| F52 | 1.9 | Opening Datapacks signed in to Adobe; after the sign-in finished and the browser tab closed, the corner notice "No browser window opened for the Adobe sign-in? Open the sign-in page here." stayed. VS Code cannot close that kind of notice from code (`offerLinkBeside`, `browserSignInNotice.ts`) | Proposed: show the link notice only if the sign-in is still waiting after about 10 seconds, the case it is for (no browser opened). A sign-in that finishes after it appears still leaves it. To fix at the end. Open question for the owner: was there a "Sign In to Adobe" modal before the progress notice? If it went straight to the browser, that is a bug too Why, read 2026-11-07: the palette's Sign In to Adobe shows only a progress notice, which closes itself, so it ends on the status bar's check. Datapacks signs in through the guard (`ensureAdobeIOAuth`), whose wrapper (`withBrowserSignInNotice`) adds a second, separate notice with the sign-in link as soon as the link is known, about at once; VS Code has no call to take that kind of notice down, so it outlives the sign-in. The dashboard's sign-in and the org switch use the same wrapper. Owner asked why (2026-11-07); answer pending. Owner (2026-11-07) wants every sign-in to behave alike. Proposed: one sign-in path: the palette joins the wrapper, and the wrapper offers the link only after about 10 seconds of waiting. Owner (2026-11-07): a sign-in here must end as it does everywhere else, on the status bar's check, with no wait and nothing left behind. Done, not committed: the notification path no longer adds the link notice (`browserSignInNotice.ts`); the link stays only in a modal's sign-in step, which the modal takes down itself. |
| F53 | 1.9 | Luma's card shows the amber "newer version" dot, and hovering it says nothing: its text is a browser `title` tooltip, which the extension's windows do not show, so the dot has never said anything (1.7 step 6 expects the text) | Proposed (owner to confirm): no tooltip; the flyout gains a row under Updated, only when the card has the dot: "Newer Version: <version>, <date>". The dot keeps its spoken label. To fix at the end Owner asked why no hover text (2026-11-07): there was no good reason. The dot used a browser `title`, which does not show here; the dashboard's dots use Spectrum's tooltip (`DashboardTile`), which does, and the house rule is that a dot's words are its hover text. Now proposed: the same tooltip on this dot. Owner agreed to a tooltip with more helpful text (2026-11-07); mock shown: "Updated Nov 6, after this demo installed it. Import it again to get the changes." or "Newer version <v>, updated Nov 6. Choose it in the version list to use it." Owner (2026-11-07): the hover text still read as AI-written. Second mock: "Updated Nov 6" or "Newer version: Nov 6", nothing more. Built 2026-11-08, not committed: the dot is a quiet button with Spectrum's tooltip, saying "Updated Nov 6" (the version installed changed) or "Newer version available" (a later save is in the list). Owed: the owner's look. |
| F54 | 1.9 | The dot itself is right by its rule but misleading here: Luma's newer version is `import-form`, a test copy in another format made on 2026-11-06, not a newer edition. `luma-bulk-test` is a test pack too. The plan's rules say the store holds no test packs after a run | Proposed: delete `luma@import-form` and `luma-bulk-test` from the datapack store (a store write: the owner's go) Done 2026-11-07 (owner's go): `luma@import-form` and `luma-bulk-test@test-1` deleted from the datapack store. |
| F55 | 1.9 | A pack's versions are of two kinds, and the newer-version dot treats both as one line: a save makes a dated version (`20261104-051753`, `savedVersion` in `demoPack.ts`), one after another, but a named version (`main`, `eds-compatible`, `import-form`, `tierpricingfix`) is a variant beside the others, each changed on its own. The rule (`newerVersionOf`, `projectPackNewer.ts`) calls any version made later "newer", so a named variant flags every older one, as `import-form` flags Luma's `eds-compatible` (owner, 2026-11-07) | Proposed: only a dated version made later counts as newer; a named variant never does, and the version installed is flagged only when it itself changed after the install. And several versions changed at once (owner's question, 2026-11-07): the card's dot stays about the version this demo installed; the version picker shows each version's last change under its name ("Updated Nov 6", Spectrum's item description), so a changed variant the demo does not use is visible without a dot. To fix at the end, with F53 Owner: fix it (2026-11-07). Built, not committed: only a later save (`YYYYMMDD-HHMMSS`) counts as newer, never a named variant; the version picker shows "Updated <day>" under each version. Owed: the owner's look (the picker's closed field should still show the version name alone). Owner: the picker's wording must match the dot's (2026-11-07): both say "Updated <day>" (mock shown). Owner liked the version list (2026-11-07). |
| F56 | 1.9 | Importing a pack the project already has goes straight from the data boxes to Import: nothing on screen says what installing again would change. Agents are told to preview first and to stop when an unchanged pack would change anything (import-datapack skill, 2026-11-06), so the human path is the one without the check (seen 2026-11-07) | Proposed, owner to decide: when the pack is installed already, the dialog shows the preview's one line above the buttons ("Installing again changes nothing", or what it would update, add and take out), from `preview_datapack_changes`' handler Owner asked the point and for software wording (2026-11-07); answer pending. Mock shown 2026-11-07: a Changes row under the data boxes ("None", or "12 updated, 3 added, 2 removed", a spinner while the preview reads), following the ticks, only for a pack the project has. Owner (2026-11-07): counts alone do not say what changes. Second mock: a Changes list grouped by data type, each item named with an Updated, Added or Removed badge, "Up to date" when nothing changes. The preview returns only a few names per data type today; the window needs them all. Owner rejected the list mock (2026-11-07): not in line with the current models. Third mock, two options: A, the run's own rows shown before the run, each data type's line saying what it will change, Back and Import (recommended); B, one sentence per kind of change under the data boxes, as the Remove confirm says the SC's changes. Both work from the preview's few names per data type. Owner chose A with counts, not names (2026-11-07). Built, not committed: Import on a pack the project has reads the preview (silent spinner, Cancel), then shows the run's rows, each "12 updated, 2 removed" or "No changes", with Back and Import; a failed read says so and every row says Not checked; a first install goes straight to the run. Owed: the owner's look. Rebuilt 2026-11-08 as option 2 (owner): the separate review step is gone; the window's install of a pack the project has pauses inside Preparing Import, after the install's own comparison and before any write (`importReview.ts`, counted as the preview counts, `reviewCounts`), showing each data type's counts on its row with Cancel and Continue; no answer in 30 minutes cancels; Cancel writes nothing and brings the form back; agents and first installs never pause. Tests pass, including one that fails without the pause. Not committed. Owed: the engine's live cycle (owner's go) and the owner's look at the pause. Owner's look (2026-11-08): the pause works (58 seconds, every row "No changes", Cancel and Continue), but the line "Check what installing again changes, then Continue" reads as AI-written, and the orange warning on Preparing Import says something is wrong when nothing is. Owner asked whether preparing should be its own window that then becomes the import. Proposed: one window, two views. First, the review: the data types' rows, each with a spinner until its count lands, then "12 updated, 2 removed" or "No changes", with Cancel and Import; when nothing would change, one sentence and Close. Then Import turns it into the run's rows. Same single comparison (the engine's pause), so no second read. Mock owed before code. Owner, after three mocks (2026-11-08): no pause; the window opens on a preparing wait, then the form shows each data type's counts, and Import runs straight away. Built, not committed: the pause is gone (its code back to the last commit, so the import is the one whose live cycle passed; the pause kept as a patch in the session scratchpad only); `useImportChanges` reads the preview for a pack the project has, the window waits on "Comparing with Commerce" (about a minute), each checkbox shows its line, a failed read says so, a first install compares nothing, and the counts go once anything runs. The comparison is read-only. Owner (2026-11-08) asked whether it compares the right store: yes, the one the install record names, the only one a re-import may go to (`engine.ts` `elsewhere`). The form still offered other websites, which Import then refused; now the Website and Store View pickers lock to where the pack is installed (`installedAt` from `get-datapack-removal-scope`, `useLockedScope`). Gate green. Owed: the owner's look after a restart. |
| F57 | 1.9 | The Import dialog's wait: a medium spinner and one small line in the middle of a large dialog that does not fit it, and almost nothing said for 80 seconds: "Starting import", then "Installing the datapack" until "Finishing up". The engine knows each data type's state and count ("450 of 2,046 products", "Checking the products against the datapack"); only agents see them (owner, 2026-11-07) | Built on fix/release-walk-fixes 2026-11-07, committed fdaeba1c1; gate green (2,355 suites). Live 2026-11-07: Luma reinstalled on the test store through the new build (preview first: nothing to change). All 11 kinds ended success in 79 s; the phase reached the status live ("Comparing the store with the datapack"); the check read 2,048 products, all match; no row notes and no store-change lines, as expected for a run that changed nothing; the search-delay line came through. Owed: the owner's look at the window, and Retry and Fix with AI have no live proof (they need a real failure) |
| F58 | 1.9 | The Import dialog's end: a wall of prose under "Imported Luma" (where the categories went, the check, search's delay, images), against the dialog rules, a problem already solved once for the run windows (owner, 2026-11-07) | Built on fix/release-walk-fixes 2026-11-07, committed fdaeba1c1; gate green (2,355 suites). Live 2026-11-07: Luma reinstalled on the test store through the new build (preview first: nothing to change). All 11 kinds ended success in 79 s; the phase reached the status live ("Comparing the store with the datapack"); the check read 2,048 products, all match; no row notes and no store-change lines, as expected for a run that changed nothing; the search-delay line came through. Owed: the owner's look at the window, and Retry and Fix with AI have no live proof (they need a real failure) |
| F59 | 1.9 | The Import dialog's wait offers Run in Background AND Close, and both do the same thing (hand the job to the background), against the dialog rules' "never two buttons that do the same thing". It also keeps the form's large box, so a 32px spinner sits alone in it (found reading the 1.9 screenshots, 2026-11-07) | Built on fix/release-walk-fixes 2026-11-07, committed fdaeba1c1; gate green (2,355 suites). Live 2026-11-07: Luma reinstalled on the test store through the new build (preview first: nothing to change). All 11 kinds ended success in 79 s; the phase reached the status live ("Comparing the store with the datapack"); the check read 2,048 products, all match; no row notes and no store-change lines, as expected for a run that changed nothing; the search-delay line came through. Owed: the owner's look at the window, and Retry and Fix with AI have no live proof (they need a real failure) |
| F60 | 1.9 | Agent surface: preview_datapack_changes lists attribute_options as a kind of the Luma pack (217 in the store), but start_datapack_import refuses it ("Demo Builder does not install attribute_options yet"), so an agent that copies the preview's kinds into the import fails on the first try (found on the live reinstall, 2026-11-07) | Built on fix/release-walk-fixes 2026-11-07, committed fdaeba1c1; full suite green (2,355 suites). The preview keeps the options row (the removal confirm names options apart) and marks it installsWith: product_attributes, which the tool description explains; an import asked for attribute_options now says it installs with product_attributes and to ask for that, instead of "does not install attribute_options yet". Also found: the format-on-edit hook had rewrapped engine.ts (382 to 513 lines) and refusedRows.ts; both put back, the engine proved identical to the rewrapped code by formatting it again. Proven live 2026-11-07 after a reload (build 22:06): the Luma preview's attribute_options row carries installsWith: product_attributes, and a validate asked for product_attributes plus attribute_options answers valid:false with the new reason |
| F61 | 1.9 | Agent surface, cosmetic: the same preview names "manufacturer/" and "activity/" among the options in the store. The Luma pack carries each select attribute's blank option (empty label), so its key is the attribute code and a slash. Install matches it to the store's own blank option and writes nothing, so no harm; it is only noise in the names an agent reads (found 2026-11-07) | Open. Proposed: leave blank-label options out of the preview's names and counts Done 2026-11-08, not committed: the preview neither counts nor names an option with no label (Commerce's own empty choice, which install sends nothing for); a test fails without the fix. |
| F62 | 1.9 | The Import window's work outside any one data type reads as a footnote: "Reading the datapack" and "Comparing the store with the datapack" sit in small grey text under the list with no spinner, while every row says Waiting, so for the first 15 seconds nothing on screen looks busy. The same goes for the work after the last type (recording, store settings, the check). Before the rows appear, a separate "Starting import" spinner screen shows first (owner, 2026-11-07, from screenshots) | Owner proposed a Preparing step first that continues into the import. Proposed: a Preparing row first and a Finishing row last, each with its own spinner and its current step as the status line; the rows show from the start, so the Starting import screen goes; under the list only the clock while it runs. Owner approved the mockup and named it "Preparing Import" (Finishing Import to match). Built and committed 2026-11-07: a stop before any data type now sits on Preparing Import in red; Finishing Import says Not run when the job stopped on a type, Done when only the store settings failed. Data-installer suites 220/220, enforcers 70/70, tsc both 0, eslint 0. Finishing gap fixed and committed 2026-11-07: a failure in any finishing step (recording what was installed, the store settings when that step throws, the final check) now marks every data type Done and puts the reason red on Finishing Import. The engine names the stop 'finishing'; the watcher calls that job partial, never a success; the end screen says Import Stopped with Retry or Fix with AI; Fix with AI says it stopped after every data type was in. Live cycle passed on the new build (owner's go, Justrite test store, Luma eds-compatible, 12 data types): installed again with the preview showing nothing to change, success, no Took out line, 2,048 products all match; removed, success, no note of anything left; installed fresh, success, all 2,048 match, the finishing step shown with Coupons still in progress, 6 minutes. The failure itself is proven by tests only. Seen live 2026-11-07 (owner's screenshot): the run opens on Preparing Import spinning with "Reading the datapack", every data type Waiting, and Finishing Import last. The full run ended the same day with every row Done, Finishing Import included, in 1 minute 16 seconds. Owner approved the commit |
| F63 | 1.9 | The import's review timed out on Luma: "Couldn't check what importing again would change. Request timeout: preview-datapack-changes". The preview takes 59 seconds on Luma (measured through the agent tool 2026-11-07); the window's request gives up at 30. The message also shows transport text | To fix: a named timeout long enough for a large store, and plain words when the read gets no answer. Owner to weigh the minute the review adds before every reinstall |
| F64 | 1.9 | The review's read is a bare spinner, where the run shows its rows from the first press with Preparing Import spinning (owner, 2026-11-07: "I would expect that initial modal screen to be in preparing") | Proposed: the rows at once, Preparing Import spinning on "Checking what would change", each data type waiting, then each row's counts |
| F65 | 1.9 | Datapacks opened from the palette or the projects list ("Open Datapacks") does not say which project an Import or Remove acts on: it uses the current project silently. Its waits also differ from the same screen opened from a project (owner, 2026-11-07, asking whether to remove the standalone screen) | Owner to decide. Both entries open the same screen (`demoBuilder.showDataInstaller`; the dashboard's tile through `handleOpenDataInstaller`) Owner (2026-11-07) asked whether it should be a library instead, like the Prompt Library, ahead of the libraries work (PL-91). Proposed: the palette opens a Datapack Library (browse and manage packs, no store actions); a project's Datapacks names the project and holds Import, Remove and Save Changes. Owner chose the library with two doors, told apart (2026-11-07, option A). Built, not committed: the sidebar's Utilities gains Datapacks (after Tools) and the palette's command is Open Datapack Library (`demoBuilder.showDatapackLibrary`), both opening the Datapack Library (its own panel; no project read; no Import, Save Changes, Create Datapack, Clear Demo Data or Activity; the pack panel's buttons are Save as File and Share, More only removes). A project's Datapacks names the project in its header. The dashboard card's line names the demo's pack ("Luma, eds-compatible", "No Datapack", or "This demo's data" when the name cannot be read without a sign-in), re-read when the dashboard comes back into view. Full suite, both type checks, lint and build pass. Owed: the owner's look. |
| F66 | Datapack Library | With the library and a project's Datapacks open at once, a change in one (rename, delete, share, a file loaded, a new version saved, an import) does not show in the other until it is refreshed by hand; the same is true today of a change an agent makes while the screen is open (owner, 2026-11-07) | Proposed: the extension tells every open Datapacks screen when the packs change, and each reads its list again (the way it already follows a settings change) Owner: yes (2026-11-07). Built, not committed: every action that changes packs, or which pack a project holds, announces it once it succeeds (`announcingChanges` on the import map, so the screens and the agent tools are one path), and an import or removal again when its job ends; both Datapacks screens and the wizard's Datapacks step read their list again (`datapack-list-changed`, which replaced `datapack-settings-changed`), and a project's Datapacks also reads which pack it holds and the open pack's details. Full suite, both type checks, lint and build pass. Owed: the owner's look, with both screens open. |
| F67 | Patches (2026-11-08) | The LKG drift gate was red from 2026-11-06: Adobe rebuilt `scripts/__dropins__/tools/lib/aem/assets.js` in the B2B template, so the aem-assets-sku-sanitization patch (b2b, citisignal-b2b) lost its anchor. The gate's rewrite PR (#3) waited on "Approve and run". After it was approved, verified, merged and released as v1.1.7 (owner's go), the gate also advanced the B2B LKG pointer, and the patch canary then failed to update the canary storefront: "The template update could not be applied: patch failed: component-definition.json:1". Upstream commit 677106e0 ("Remove Universal Editor instrumentation") removed the blocks' `_*.json` model files and rewrote the component JSON files; a storefront whose component-definition.json differs from upstream (block libraries write to it) may hit the same refusal on Check for Updates | Open: owner to decide (roll the B2B pointer back and release, or fix the template update for this upstream change first) Owner: roll back and fix (2026-11-08). Rolled back: eds-demo-patches 2a10411 reverts the pointer advance and the rewrite (B2B as v1.1.6 had it), adds a pointer hold (`b2b/last-known-good.hold`, verified at the held commit, no release for a hold alone; tests added), released as v1.1.8; the drift gate and the patch canary are green. Also there: actions on v7 (3753654) and Node.js 24 (050fbe1). Owed: Demo Builder's template update taking out a file upstream deleted that the storefront changed; then delete the hold and re-apply the rewrite (63c7d0f). |
| F68 | Patches (2026-11-08) | The root `last-known-good` has not moved since 2026-09-23 (c937174): no code ledger tracks it since the citisignal code ledger was deleted on 2026-10-17. Corrected the same day: it is NOT what non-B2B storefronts use. Every current package either names `b2b/last-known-good` (b2b, citisignal-b2b, bodea) or is built on its own template (buildright-eds, isle5), so the root pointer is read only for a patch source that names no `lkgFile` (`lkgReader.ts:63`), which no current package does | Open, low: decide whether anything still needs the root pointer, and delete it if not (no soft deprecation). Tracking it again with a hold was proposed and withdrawn: it would verify nothing |
| F69 | 1.10 (2026-11-08) | The sidebar's Datapacks tile label broke mid-word, "Datapac / ks": the tile gave its label 46px and the word needs about 52px at 11px, so `overflow-wrap: anywhere` split it | Fixed, not committed: the tile's side padding is 2px instead of 8px (`sidebar.css`), giving every label 58px on one line; the tile's size and icon do not move. Owner looked after the reload 2026-11-08: it sits on one line |
| F70 | Dashboard (2026-11-08) | The dashboard's Datapacks card drew with no line and gained "Luma, eds-compatible" a moment later: the card asked the datapack library for the pack's name every time it drew, a network read | Fixed, not committed: a name read once is remembered (`packNames.ts`, global state), so the card shows it at once and the read behind it only keeps it current; a rename records the new name as it lands. Owed: the owner's look |
| F71 | 1.7 (2026-11-08) | The owner asked what Save Changes does in Luma's flyout. It reads what the store now holds and saves it into Luma as a new version. As the flyout's only blue button, under Description, Owner and Visible To, it reads like saving edits to those fields | Proposed, owner to decide: name it for what it does, "Update from Store", and make it a plain button like Import |
| F72 | Dialogs (2026-11-08) | A waiting dialog shows only its title and a spinner (rule of 2026-11-01), so a wait of a minute, like a re-import's comparison, says nothing about what is happening. Owner: widen the rule so a wait can carry a label, and re-audit every waiting dialog for one | Audit done (14 waits: 11 silent, 3 already labelled, inconsistently). Owner approved the progress window's three rows from one word list, matching the extension's own wording and lengths, flyouts included (2026-11-08). Built, not committed: `WAIT_STAGES` (labels 25 max, details 40, "Usually ..." 25, `waitStages.test.ts`), `StageWait`/`StageRows` (the progress window draws its running view with the same rows), `Modal`'s `waiting` takes a label by type, every dialog wait (15 sites plus Manage APIs and the Add Integration project and workspace lists) and the datapack flyout's five; `modal-waits.test.ts` now fails any wordless wait; rule in `dialog-design.md` and the handbook. Gate green. Owed: the owner's look |
| F73 | 1.9 (2026-11-08) | The re-import's comparing wait says "Luma and this demo's Commerce" under "Comparing with Commerce". The owner asked whether that means Commerce data or the Commerce instance: the phrase names neither | Changed, not committed: the line reads "Each data type in Luma", in the words "Reading demo data" already uses ("Each data type, in Commerce"). Owed: the owner's look after a reload |
| F74 | 1.9 (2026-11-08) | After the form's comparison (about a minute), pressing Import runs the same comparison again as its first step: Preparing Import sat on "Comparing the store with the datapack" for 36 seconds or more. Both call the same read (`planRepeat`, in `previewChanges` and in `installPack`) | Owner approved 2026-11-08. Built, not committed: the preview keeps its plans (`recentComparison.ts`) and the run takes them when they are under 5 minutes old (`TIMEOUTS.DATAPACK_COMPARISON_REUSE`) for the same project, pack version, website and store view, with the install record and each data type's rows unchanged; otherwise it reads again. Taken once. Debug Logs say which. Tests: the run on the form's plans reads the store less and sends and reports exactly what a run that read again does. Live 2026-11-08 on Scratch 1028 (Luma eds-compatible, Justrite Test Store US), owner's go: preview showed nothing to update, add or remove; the re-import 22 s later used it (Debug Logs: "using the comparison made 22 s ago"), took 34 s against 74 s before, sent nothing, no Took out line, check all match (2,048 products). Remove took everything (2 min 48 s, no note). A fresh install read the store itself ("comparing the store with the datapack"), 6 min 11 s, check all match |
| F75 | 1.9 (2026-11-08) | With nothing to change, the data types after Preparing Import each turn Done within a second or two, a burst after a long stall. Owner: "almost jerky?" | Proposed: no added delays (the rows would then show work that is not happening). Most of the stall is F74's second comparison; with it gone the run is one short, even pass |
| F76 | 1.9 (2026-11-08) | The re-import's end says "Products can take up to 20 minutes to appear in storefront search" when every data type had no changes. The line is added whenever the pack holds products (`holdsProductRows` in `engine.ts`), not when products were written | Built with F74, not committed: the run reports whether a product or gift card was added or updated (`productsWritten`), and the search and images lines follow that. Live the same run: the re-import's note had no search or images line; the fresh install's had both |

## Questions raised

| # | Seen in | Question | Answer |
|---|---|---|---|
| Q1 | 2.1 | Is a Select button the right way into picking several projects, is it consistent, and is it in the right place? (owner) | Keep the mode (owner, 2026-11-04), with F3 |

## Summary

| # | Test | Result |
|---|---|---|
| 1.1 | Throwaway pack with every kind of data (live test 1) | passed 2026-11-03 |
| 1.2 | Real packs: `wknd` and Bodea (live test 2) | `wknd` passed 2026-11-03; Bodea moved out 2026-11-05 (no second sandbox) |
| 1.3 | Settings layer beside a pack | passed 2026-11-03 |
| 1.4 | Shared root: the one Admin step (live test 3) | open |
| 1.5 | The Datapacks screen by hand (live test 4) | open |
| 1.6 | A datapack travels with a project (live test 5) | open |
| 1.7 | Save Changes, Newer Version, reset and delete with a pack | open |
| 1.8 | Colour swatches | open |
| 1.9 | Demo Builder installs every pack, and checks it (2026-11-06) | open |
| 1.10 | The Datapack Library, a project's Datapacks, and the two staying in step (2026-11-08) | open |
| 1.11 | The newer-version dot and the version list (2026-11-08) | open |
| 2.1 to 2.4 | Projects list: select, reset several, failures, the open project | passed 2026-11-04 |
| 2.5 | A datapack in a reset batch | passed in part 2026-11-04 |
| 2.6 | Delete Selected | open |
| 2.7 | Single delete | passed in part 2026-11-05 |
| 2.8 | Agent delete | open |
| 3.1 to 3.5 | Smaller changes since the last walk | passed 2026-11-05 |
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

**Result:** moved out of beta.153 on 2026-11-05: the owner has no second sandbox, and the one instance already holds Bodea's data for the real Bodea project, so clearing it there is not an option. Not proved live: this pack on a clean store. Say so if it comes up

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
7. Close. Expect a new card with the blue check where its **Mine** tag would be (this demo now uses it).
8. Click the card. In the flyout expect Description, Owner "You", Visible To, Updated, Data.
9. Change something in the Admin (one product's name), then click **Save Changes** in the flyout.
   Expect the dialog **Save <name>**, the **Save** button enabled with nothing extra picked, then
   **Datapack Saved**.
10. In the flyout, **More**, then **Remove Datapack**. Expect "Removed." and the card gone.
    Commerce is not touched.
11. No Data Installer address: in Settings, empty `demoBuilder.dataInstaller.apiBaseUrl`. Reopen
    Datapacks. Expect your packs, no banner, no **Data Installer Datapacks** choice in **Show**, and
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

The Data Installer refused the owner's sign-in (`ERR1201`, missing product profile) from 2026-11-03.
It answers again as of 2026-11-05: its packs list on the Datapacks screen. The store's own packs do
not depend on it.

### 1.9 Demo Builder installs every pack, and checks it (added 2026-11-06)

The changes of 2026-11-06 on `fix/release-walk-fixes` (DI-8, DI-12): the Data Installer's own install
engine and the Engine setting are gone, an install checks its products against the pack, a
reinstall says what it took out, and Copy to the Data Installer is off the screen until our accounts
can write to it. The live install, reinstall and removal of Luma, import-form Luma, Venia and a
Data-Installer-only pack were run through the agent tools that day; this is the owner's look at the
screens.

1. In Settings, search `dataInstaller`. Expect no **Engine** setting under Sample Data.
2. In Datapacks, open a library pack's flyout (Luma). Expect **Import**, and no **Copy to the Data
   Installer**.
3. Import Luma (it is installed on `justrite_test_store_us`, so this is a reinstall). Expect the
   progress notification with a count, then the finish note ending "Checked 2,048 products against
   the datapack: all match." and no "Took out" line.
4. Expect the result to say nothing was changed in the Admin ("Kept …" absent).

**Result:** in progress 2026-11-07. Step 1 passed (no Engine setting under Sample Data; found F51).
Step 2 passed (Luma's flyout: Save Changes, Import, More, no Copy to the Data Installer). Opening
Datapacks asked for an Adobe sign-in (found F52) and showed the newer-version dot (F53, F54). Step 3
passed in substance 2026-11-07: the reinstall took 1 minute 24 seconds and ended "Checked 2,048
products against the datapack: all match", with no "Took out" or "Kept" line; its wait and its end
are F57 and F58. Step 4 passed (nothing kept).

### 1.10 The Datapack Library and a project's Datapacks (added 2026-11-08)

From F65 and F66 (owner, 2026-11-07): one Datapacks screen silently acted on the project opened
last, and two open screens did not hear each other's changes. Have a project open whose pack is one
of your own library packs (scratch-1028 holds Luma).

1. In the sidebar, under Utilities, expect **Datapacks** after Tools. Click it. Expect a tab titled
   **Datapack Library**, the header "Datapack Library" and "Browse and manage datapacks", no
   Catalog and Activity strip, and no card wearing the check.
2. Expect only **Load from File** beside the count: no Create Datapack, no Clear Demo Data.
3. Open your own pack's panel. Expect **Save as File** and **Share** as buttons, and **More**
   holding only Remove Datapack. No Import, no Save Changes. A colleague's pack shows Save as
   File alone.
4. In the palette, run **Demo Builder: Open Datapack Library**. Expect the same tab, not a second.
5. On the project's dashboard, expect the Datapacks card's line to name its pack ("Luma,
   eds-compatible"). Click it. Expect a tab titled **Datapacks** with the project's name under the
   title, the check on its pack, and Import, Save Changes and Create Datapack as before.
6. With both tabs open, rename one of your own packs in the library. Expect the project's
   Datapacks to show the new name without a Refresh. Rename it back.
7. Switch to the dashboard after an import or a removal in the project's Datapacks. Expect the
   card's line to follow ("No Datapack" after a removal).

**Result:** open.

### 1.11 The newer-version dot and the version list (added 2026-11-08)

From F53 and F55 (owner, 2026-11-07): the dot said nothing on hover, and a named variant made later
marked every older version as out of date.

1. Open the version list on a card with several versions (Luma). Expect "Updated <day>" under each
   version's name, and the closed box showing the name alone.
2. Expect no amber dot on Luma's card: its `import-form` variant is deleted, and a named variant
   never counts as newer now.
3. On a pack whose installed version was updated since, or that has a later save, hover the amber
   dot. Expect "Updated Nov 6" (the version installed changed) or "Newer version available" (a
   later save is in the list). Tab to it: the same words show on focus. The card's line keeps its
   height.

**Result:** open.

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

**Result:** passed in part (owner, 2026-11-05). Steps 1 and 2 (single delete, its boxes under `ask`) and Delete Selected looked at, then redesigned (F19, F20). Steps 3 and 4 (two projects on one repository) counted as covered by tests, not run live (owner, 2026-11-05): Delete Selected drops the repository and site boxes another project still uses (`projectsBatch.test.ts`), the single delete takes the same shared check, and the shared site is pinned in `edsExternalCleanup.test.ts`. A live run would only add the real lookup finding a real second project

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

**Result:** passed 2026-11-05: Check All Steps at the footer's left; the checked steps emptied at once and filled one by one, no count text

### 3.2 Block libraries

1. In the wizard's Storefront area, open **Block Libraries**.
2. Expect three cards to a row, fewer as the panel narrows, never stretched when there are only one
   or two.
3. Expect "None added yet. Add them in Block Library Settings." with only
   **Block Library Settings** as a link. Click it: Settings opens at the custom libraries.
4. On a project: **Configure**, the **Storefront** tab, **Block Libraries**. Expect the same
   locked cards ("Included with every storefront", "Included with your storefront") as the wizard.

**Result:** passed 2026-11-05 (owner): cards a fixed width, the empty line with only Block Library Settings as a link, the same locked cards on Configure. Found F23 and F24

### 3.3 Updates

1. Run **Demo Builder: Check for Updates**.
2. Untick everything. Expect **Apply Updates**, greyed.
3. Tick one, then two. Expect **Apply 1 Update**, then **Apply 2 Updates**.
4. A colleague's reset demo: on a storefront made from colleague demo A, reset A, then check for
   updates on the copy. Expect the "Changes from <A>" row unticked, saying the source demo was reset
   to its template.

**Result:** passed 2026-11-05. Steps 2 and 4 passed 2026-11-04 (kmanns/justrite was reset; the row
came up unticked with the reset text, and the button read Apply Updates, greyed). Step 3: Apply 1
Update seen 2026-11-04, Apply 2, 4 and 5 Updates seen 2026-11-05 on the redesigned window (F26), with
"1 needs attention" on the closed group only. Found F1.

### 3.4 Dialogs

1. In the Updates window, Tab to the bottom-right button. Expect its whole focus ring visible.
2. Open an integration's **Manage APIs**. Expect no sideways scrollbar and no sideways shift on a
   trackpad swipe.
3. The checkbox spinner is covered by 1.5 step 4.

**Result:** passed 2026-11-05: the focus ring whole, on Updates and Add Integration; Manage APIs has no sideways scrollbar and no sideways swipe. Step 3 follows 1.5

### 3.5 Commerce Admin

1. On a Cloud Service project with no choice made, click **Manage Commerce**. Expect the Unified
   Shell in your normal browser, signed in.
2. **Configure**, Commerce tab, **Commerce Admin**: choose **Classic UI**, **Save**, click
   **Manage Commerce**. Expect a private window.
3. Set it back to **Unified Shell** and **Save**.

**Result:** passed 2026-11-05 on Bodea: Unified Shell in normal Chrome, signed in; Classic UI in an Incognito window at Adobe's Sign In page; set back to Unified Shell

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
5. **4.5a** The two lapsed quality passes, `codebase-sweep` then `dream`, each proposal shown to the
   owner and only what the owner accepts applied, then `.pipeline.yaml`'s `last:` dates for
   `codebase-sweep` and `reflect` set to the day [PL-95]. Nothing committed until the owner says so.
6. **4.5** Merge `fix/release-walk-fixes` into develop (the walk's fixes and the 2026-11-06 datapack
   work, CI green), push develop, then cut beta.153 with the `cut-release` skill. Expect the
   pre-release published.

Details for 4.1 to 4.3: `.rptc/plans/datapack-engine/overview.md`, "Before beta.153 ships".

**Result:** 4.1 open, 4.2 open, 4.3 open, 4.4 open, 4.5a open, 4.5 open
