# Release test plan, 2026-10-10: what to walk by hand before the next beta

Written 2026-10-10 for the owner. It covers the work of 2026-10-08 to 2026-10-10: the file
splits, the ERP ownership work, the storefront fixes, and the big merge. Ordered the way an SC
moves through Demo Builder, so you walk it once without going back. Item ids are in brackets at
the end of each row, for the record only. Part 1 is the walk. Part 2 is what the last plan left
open.

**Widened 2026-10-14 to the whole release.** Every feature and fix commit since the last
release (beta.149, 2026-09-30) was checked against this list, about 360 of them. 34 rows were
added for what had no row: Edit applying only what changed, block library removal, moving
integrations to another Adobe project, the Node 24 move, AI files on existing projects, and
more. Rows that a later change made wrong are fixed or marked in Part 2.

**Widened 2026-10-20.** 24 built items had no row. 20 rows were added: 1.13, 2.14, 2.15,
3.22 to 3.29 and 6.12 to 6.16, plus four in Part 2's "Nothing to click" table for the
tooling and the refactor. Two were checked the same day by the agent (row 3.27 and the
patches release). None is starred. Row 2.15 replaces row 2.4's add: a second project on
the same Commerce can no longer add the ERP integration.

**101 checks in Part 1. About 3½ hours for all of them**, plus waiting (adding an ERP takes
about 10 minutes, a fill about 3). **The 26 ★ rows alone take about 2 hours** and cover what
is most likely to be broken. **Part 2 holds 65 more rows** (several need a second Commerce and cannot run now) carried from the 2026-10-04 plan,
which was never finished. It is a second sitting.

Checks per section (starred ones in brackets): startup and updates 12 (3), creating a project
13 (3), the dashboard and storefront 21 (6), integrations and ERPs 29 (9), the ERP's own
screens 7 (3), agent tools 11 (0), cleanup 8 (2).

## Before you start

1. **The build.** Test `loop/2026-10-05-release-candidate`, the branch the dev window runs
   from. Since 2026-10-11 it holds everything in this list in one place: the big merge, the
   test-writing run's commits (with the wizard's ERP naming fix, row 2.4), Prepare this store
   (rows 4.13 to 4.19), and the fix for the browser that opened on reload (row 1.10). The same
   work without that last fix is pushed as `integration/2026-10-11`. Since then it also holds
   the complete storefront copy (EDS-40), block libraries on Configure (EDS-39), the Configure
   fixes (PL-76) and Edit applying only what changed (PL-75); pushed head `20bd3db3d` on
   2026-10-13. Note the commit you tested; on 2026-10-11 the window was serving `84d3aef1e`.
2. **Start it properly.** Run `npm run compile`, then press F5. A window reload is not enough:
   almost every change is on the extension side.
3. **Justrite** is needed for 44 rows (marked `[needs Justrite]`). It has two ERPs today:
   Justrite ERP owns everything nobody else claims, and Accuform ERP owns the 96 products tagged
   `erp_owner=accuform`. The ERPs and the integration were redeployed there on 2026-10-09.
4. **A scratch project** is needed for 36 rows (marked `[scratch project]`). You create it in
   section 2 and delete it in section 7. **There is one Commerce to test with (owner,
   2026-10-12), so the scratch project points at Justrite's Commerce.** That is fine for the
   storefront rows, which write to GitHub and DA.live. It sets three rules:
   - **Never add the ERP integration to the scratch project.** Commerce holds one install of
     it per store, so adding it would take over Justrite's, and removing it would remove
     Justrite's. Rows 2.4, 4.19 and 7.3 are rewritten for this.
   - Use an Adobe project that is not Justrite's.
   - Anything the scratch project writes to Commerce lands in Justrite's store. Row 3.9 is the
     only one that does; it stops at the dry run.
   - Rows marked `[no cloud]` (21 of them) need neither.
   - **Never copy Justrite through to the end**, by screen or by agent. A copy carries the ERP
     integration and would install it on Justrite's Commerce a second time. Part 2 marks the two
     rows that did.
5. **One project at a time.** A screen acts on the project that is current, not the project
   named in its title. If an agent or another window opens a different project, close and
   reopen the screen before you press anything on it. This is a known open problem [AI-15].
   *Since 2026-10-19 (AI-15 built) a screen keeps acting on the project it shows, and an
   agent's write stops if the open project changed under it (AI-76, row 6.16). Keep the
   habit until row 6.16 passes.*
6. **The button names.** An ERP card's menu says **Fill from Commerce**; the integration's says
   **Fill ERPs from Commerce**. Some messages still call this "Load demo data". They are the
   same thing.

Rows that change live data say so, and say how to undo it.

## Who walks what (2026-10-14)

All 102 rows is about 3½ hours, too long for one sitting. So each row has an owner. Rows
not listed under **You** or **Me** are skipped this beta (23 of them). Most start "*Only
if…*" or need something we do not have to hand: an expired session, a second Adobe project,
a headless project, a second org. Four are skipped as low value now: 1.12 (this machine
already moved to Node 24), 2.12 (renaming an Adobe project title), 4.12 (a known open
problem, AI-15) and 6.10 (it needs the Adobe sign-out that 1.4 skips).

**You, starred first (about 1½ hours with the waits).** These need eyes on a screen.
In walk order: 1.1, 1.5, 2.4, 2.5, 3.2, 3.7, 3.10, 3.15, 3.16, 3.17, 4.2, 4.3, 4.4, 4.5, 4.6,
4.9, 4.14, 4.19, 4.28, 4.30, 4.31, 5.2, 5.3, 5.7, 7.1, 7.4.
Section 2's wizard rows make the scratch project the rest depends on, so start there after 1.5.

**You, if there is time (about 45 minutes).** 1.2, 1.6, 2.1, 2.2, 2.3, 2.6, 2.9, 3.1, 3.4, 3.9,
3.11, 3.19, 4.1, 4.7, 4.8, 4.13, 4.15, 4.17, 4.22, 4.23, 4.26, 5.4, 5.5, 5.6, 6.11, 7.7.

**You, added 2026-10-20 (about 30 minutes).** 1.14, 1.15, 1.16, 2.14, 2.15, 3.23, 3.24, 3.25, 3.26, 3.28, 3.29,
6.12, 6.16. Rows 1.13 and 3.22 only when their condition holds (an update offered, an
expired session).

**Me, while you walk.** Agent-tool rows and checks I can read myself (GitHub, DA.live,
aem.live, Commerce, the ERPs, Developer Console): 1.7, 1.8, 1.11, 2.7, 2.8, 2.10, 2.11, 3.3,
3.6, 4.18, 4.20, 4.25, 5.1, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.2, 7.3, 7.5, 7.6,
7.8. Added 2026-10-20: 3.27 (done), 6.13, 6.14, 6.15. Row 6.15 needs one ask in your chat:
my tool opens a new agent connection for every call, so a project it picks does not carry
to the next call. I also read back the result of your rows where a file or a page shows it (3.4, 3.7,
3.19, 7.4). The ones that change live data (3.3, 3.6, 4.25, 6.1, 6.2, 6.5, 6.7, 6.8, 7.6) each
say how they are undone, and I run them only after your one go for the list. Row 6.1 needs
you for a moment: it stops until you install the GitHub app.

**Part 2 is skipped this beta** unless you pick rows from it. `readiness` will then say
"not ready" for the items only Part 2 checks; the release notes say which.

# Part 1. The walk

## 1. Startup and updates

| # | Do this | Expect | Needs | Result |
|---|---|---|---|---|
| 1.1 ★ | Press F5. Do not sign in to anything. | You are still signed in to DA.live from before. Nothing asks you to sign in again [EDS-35] | `[no cloud]` | pass 2026-10-14 (second F5, fresh sign-in). The first F5 showed the expired-sign-in notice: the earlier DA.live token had run out (a new one lives about 4h20m), not been lost |
| 1.2 | Sign out of DA.live, then sign in again with a fresh token on the clipboard. Then ask the agent "am I signed in to DA.live?" | No token box opens. The status bar names the namespace and your email. The agent says yes [EDS-35, EDS-8] | `[no cloud]` |  |
| 1.3 | Sign in to DA.live again, this time with an empty clipboard. Paste an expired token first, then a good one. | The token box opens. The expired token is refused in words ("Token has expired...") and nothing is stored. The good one signs in [EDS-8] | `[no cloud]` |  |
| 1.4 | Sign out of Adobe and sign in again. Then open a project that lives in a different Adobe org. | The browser opens once. The org list refreshes. The other-org project shows the "Switch IMS Org" warning, and no browser opens by itself [EDS-8] | `[no cloud]` |  |
| 1.5 ★ | Open every screen once: Create Project, Edit Project, Project Dashboard, Configure, the sidebar, Your Projects, the AI overview and Prompt Library, Integrations, Data Installer, Manage Site Access. | Each one draws and loads its data. Your Projects ends with a dashed **New project** card. Integrations ends with a dashed **Add an integration** card [EDS-8, PL-69, PL-62] | `[no cloud]` | pass 2026-10-14: every screen drew and loaded. Two fixes came out of it: the dashboard now re-reads status after an Adobe sign-in from another screen (`1896352bd`), and Site Access first loads behind the house full-window spinner (`bac79ab35`, EDS-41) |
| 1.6 | On the dashboard of a storefront project and of a non-storefront one, look at the tiles. Open and close Export, Save as Package, and View AI Capabilities (close that one with Esc). Click AEM Assets. | Tiles are where they were: Open, Storefront (storefront projects only), Build, Share. Each dialog opens and closes. AEM Assets opens for this project [EDS-8, EDS-21] | `[no cloud]` |  |
| 1.7 | Open the dashboard of a project whose mesh is deployed and unchanged. | No "redeploy" prompt [EDS-8] | `[no cloud]` |  |
| 1.8 | Run **Check for Updates** with Justrite open. *Only shows a row if the ERP or the integration has newer code.* If you apply it: **changes live data** (redeploys to Justrite; there is no undo, and it is what you want anyway). | One row per pair, "Justrite: ERP Integration and Justrite ERP", ticked because Justrite is open. Applying it deploys the new code and then brings Commerce up to it [AB-73, AB-13] | `[needs Justrite]` | pass 2026-10-14: one row for the pair, applied, deployed both ERPs and the integration (12:37 to 12:42). It was unticked because bju was the open project at the time (log 12:36:49), which is the designed behaviour; the ticked-when-open half was not seen |
| 1.10 ★ | *Only when your Adobe session has really expired, for example first thing in the morning.* Reload the window (or press F5) and touch nothing. Then run **Check for Updates** and pick an integration update if one is listed. | No browser opens by itself and nothing asks you to sign in. Debug Logs may say "attempting silent IMS refresh"; that is fine. An integration update is still listed. Only when you apply it does the window ask "Adobe sign-in required to continue", and it carries on after you sign in [AB-73] | `[needs Justrite]` |  |
| 1.9 | *Only if you have a project in another Adobe org with an integration update waiting.* Run Check for Updates. | Its row is not ticked and says to open that project and update it from its Integrations screen [AB-73] | `[no cloud]` |  |
| 1.11 | Add a line of your own to the AGENTS.md of a project made before this build (not bju). Run **Regenerate AI Files** on it. Open its sync-changes skill. | Your line is still there, and the result says AGENTS.md was skipped because you changed it. The skill says `promote_block_to_library` adds a block to this site's own DA.live block library, not "push back to source library" [AI-8, PL-58] | `[no cloud]` | pass 2026-10-14 (agent, on Justrite): result `skippedFiles: ["AGENTS.md"]`, the added line survived; sync-changes says "adds it to this site's own DA.live block library". Line removed afterwards |
| 1.12 | Open Create Project and read the prerequisites Node row. Then start the demo on a headless project made before 2026-10-07. | The Node row is one line, Demo Builder's own Node. The demo starts and serves pages. If "Updating to Node 24" appears, it shows only "Preparing Node" and "Reinstalling packages (1 of N)", never fnm's own output. *This machine has probably already moved, since the dev build has been running this code* [PR-1a] | `[no cloud]` |  |
| 1.13 | *Only if Check for Updates offers a storefront code update for an Edge Delivery project.* Apply it. If it reports a conflict, press **Reset to template**. **Changes live data** (a commit to that storefront's repository). | The update brings the storefront to the version the patches repo tested, not Adobe's newest commit; I read the recorded version against `npm run patches:released`. Demo Builder's fixes are still on it afterwards: a missing page shows the site's 404, and Quick Edit opens. A Reset to template puts them back too. If an agent applies it, it asks before a reset that rewrites the repository [EDS-51] | `[scratch project]` |  |
| 1.14 | Run **Check for Updates** with Justrite open. *Rows 1.8 to 1.10 describe the picker this replaced (PL-80); read their checks against this window instead.* | The "Checking for updates" notification shows while it checks. With nothing waiting it says "Demo Builder is up to date", and nothing opens. Otherwise Your Projects opens with the Updates window straight on the list, with no spinner of its own: every update under Demo Builder, JustRite first, the other projects by name and the template repositories, every row ticked except an integration, which reads "Newer version, redeploys to Adobe" and is unticked until you tick it. Each project is a panel like a row in the projects list's list view. It starts closed, showing a count ("3 of 4") and, when a row starts unticked, "1 waiting for you"; clicking its line opens it and turns the chevron at its end down. The checkbox beside the name unticks all that project's rows without opening it, and shows a dash while only some are ticked. Project names keep their own casing, and there is no sentence under the title. An integration in a project of another Adobe org is unticked and locked, saying to open that project [PL-80] | `[no cloud]` |  |
| 1.15 | In the Updates window untick everything but one update on the scratch project, then press **Apply 1 update**. **Changes live data** (whatever that update changes). | The window closes and the progress window shows the run. A question it needs (stop the running demo, a template conflict, replace a library's blocks) is asked in the progress window, not as a notification. It ends green, and only that update was applied. If something did not apply, the progress window ends with one warning line, and after you close it the Updates window lists what and why [PL-80] | `[scratch project]` |  |
| 1.16 | Reload the window with an update waiting (a library or the extension) and leave it for a minute. | Nothing opens by itself. One notification says "N Demo Builder updates available." with **Review**, which opens the Updates window. No separate "Demo Builder X is available. Update Now?" message appears [PL-80] | `[no cloud]` |  |
| 1.17 | Run **Check for Updates** and open JustRite's group. Then run **Storefront Report** on JustRite. | JustRite lists "Changes from kmanns/justrite" (only if Khalil has pushed since) and "Adobe boilerplate, Tested version, updates the live site". The report's "Where this storefront comes from" says "Adobe boilerplate: started at adobe-commerce/boilerplate-b2b-template 71a67e0 (matched by its first commit)" and that a newer tested version waits. Debug Logs say "kmanns/justrite started at ... 71a67e0" once, and JustRite's project file now has `boilerplateBase` [EDS-56] | `[no cloud]` |  |
| 1.18 | *On a throwaway storefront made from a colleague's demo, never JustRite or a live demo.* Tick only its **Adobe boilerplate** row and Apply. **Changes live data** (a commit to that storefront's repository). | One commit, "chore: update the Adobe boilerplate to the tested version", with no `.github` changes; the storefront's own edits are still there. If it reports a conflict, the files are named, nothing was pushed, and no reset is offered. Afterwards the row is gone and the report says it is on the tested version [EDS-56] | `[scratch project]` |  |

## 2. Creating a project (the wizard)

Open any project that is **not** Justrite first, and leave it open. Then start a new project:
an Edge Delivery storefront, with a block library ticked.

**In the store step, pick the Justrite website** (website `justrite`, store `juststore`, store
view `justeng`). It is the only website on this Commerce with products assigned; picking Main
Website gives a storefront whose category and product pages are empty (found 2026-10-14, when
the plan did not say so). Rows 2.7 and 2.10 need products to check.

| # | Do this | Expect | Needs | Result |
|---|---|---|---|---|
| 2.1 | Walk the Adobe steps. | The org, project and workspace lists fill. Back, Continue and Cancel work on every step [EDS-8] | `[scratch project]` | Pass, 2026-10-15. Walked with Back at every step. |
| 2.2 | In the Storefront area, make a new repository: **New**, type a name, **Create**. Then try a name that is already taken. **Changes live data** (a GitHub repository; row 7.4 deletes it). | The field gets a checkmark, the line under it reads "Created as", and the new repository is first in the list and selected. The taken name shows an error under the field and selects nothing [EDS-8, EDS-18] | `[scratch project]` |  |
| 2.3 | In the Integrations area, open Add Integration and reach the API access stage. Type in the filter and press a product pill. | The list narrows. Ticking an API does not move the rows [EDS-8] | `[scratch project]` |  |
| 2.4 ★ | Still in the Integrations area: add the **ERP Integration** and type a name for its ERP, for example "Scratch ERP". Look at the Integrations area and at the Review step. **Then remove it again before you finish the wizard**: this project shares Justrite's Commerce. | The area and the Review step show ONE pair: the ERP Integration under its own name, with an ERP called what you typed. There is no second, custom integration named after the ERP. *What the created project holds is proven by tests only (`2f1c7ea58`), since it cannot be created here* [PL-70, AB-16o] | `[scratch project]` | Pass, 2026-10-15 (owner, recorded 2026-10-17). |
| 2.5 ★ | Watch the storefront setup step. If the repository does not have the AEM Code Sync app, install it when asked. | Progress is shown for each phase. The install dialog pauses the run, and it carries on by itself after the install, with no Retry. It ends on a centred green check and "Click Continue to proceed with project creation." [EDS-8, EDS-20, EDS-23] | `[scratch project]` | Pass, 2026-10-15. Fixed during the walk: a green "AEM Code Sync is installed" check after the install; "Using your new repository" for a repository just created. |
| 2.6 | Watch the last step to the end, then press **View Projects**. | "Initializing" and a Cancel button are there from the first moment. While it runs you see what it is doing. It ends on "Project Created Successfully", and View Projects opens Your Projects [EDS-8] | `[scratch project]` | Pass, 2026-10-15. |
| 2.7 | Open the new storefront in a browser. Open a category page and a product page. Open the site in DA.live. | The menu has the catalog. The category page lists products. The product page opens at once. The block library is in DA.live and the AEM Assets panel shows [EDS-8, EDS-24] | `[scratch project]` |  |
| 2.8 ★ | Press F5 again, then run **Check for Updates**. | Nothing offers "<library>: install" for the new project. The project that was open during creation shows no library it never picked [EDS-37] | `[scratch project]` |  |
| 2.9 | Copy the new project's `.env` files and the storefront's `config.json` somewhere. Press Save on Configure without changing anything. Compare. | Only the "Generated" time line differs [EDS-8] | `[no cloud]` |  |
| 2.10 | On the new storefront, look at product images on a category page and a product page. If the catalog has a SKU with an underscore, open that product. Read `commerce-assets-enabled` in `config.json`. | Images show, none broken. The underscore product's page opens, not "Page Not Found". `commerce-assets-enabled` is true [ADR-024] | `[scratch project]` |  |
| 2.11 | *Only if you made a new Adobe project in 2.1.* After creation, open it in Developer Console. | It has one workspace, Production. No Stage workspace was made [AB-24] | `[scratch project]` |  |
| 2.12 | In the wizard's Adobe project picker, rename the scratch Adobe project's title, then rename it back. Try one title Adobe refuses. | The title changes in the picker and in Developer Console; the project's name and id do not. The refused title shows a plain message under the field [AB-23] | `[scratch project]` |  |
| 2.13 | *Optional, a second scratch project.* Create a storefront from an added demo (for example `sayurihanki/aistore`). **Changes live data** (a repository and a site; delete them the same way as row 7.4). | On the new site, cart, checkout, search and wishlist open. `/metadata.json` and `/placeholders/cart.json` answer, and so do the two `/enrichment/` pages. If the demo is B2B, `config.json` has `commerce-b2b-enabled`. The finish names any page the source has that the copy lacks, or names none. *Proven on bodea by reset on 2026-10-12, not yet by a fresh create* [EDS-40, EDS-13] | `[scratch project]` |  |
| 2.14 | In the store step, pick **Main Website** and its store view first. Then pick the Justrite website, store and store view. | With Main Website, a warning says shoppers who are not signed in will see no products. It is a warning, not a block: Continue still works. With the Justrite website it goes away [EDS-46] | `[scratch project]` |  |
| 2.15 | In the Integrations area, open **Add Integration**. | The ERP Integration tile is greyed out, saying JustRite already has one on this Commerce instance. *Since 2026-10-15 this replaces row 2.4's add and remove: a second project on the same Commerce cannot add it* [AB-78] | `[scratch project]` |  |

## 3. The project dashboard and storefront

All on the scratch project. Deleting it is row 7.4, once nothing else needs it.

| # | Do this | Expect | Needs | Result |
|---|---|---|---|---|
| 3.1 | On Configure, rename the project with capitals and spaces and save. Then blank a required field in a section that is not on screen. | The title changes and the folder name under the field matches. After the rename, Configure's Commerce password reads "Saved — type to replace" and Save is enabled. The section's tab shows the error and Save is disabled [EDS-8, PL-64] | `[no cloud]` |  |
| 3.2 ★ | On Configure, change the store view code and save. Accept the prompt. **Changes live data** (the scratch storefront's `config.json`; change it back the same way). | The republish prompt appears, and the mesh redeploy prompt too if the project has a mesh. After accepting, `config.json` on GitHub has the new code, and the prompt and the amber Republish tile clear [EDS-8] | `[scratch project]` | Pass, 2026-10-15. Store changed to CitiSignal and republished; the store change then replaces the pages (EDS-44). |
| 3.3 | Copy `config.json` from the repository. Press **Republish** on the dashboard. Compare. | The republish finishes, the pages are live, the tile stays green, and `config.json` is identical [EDS-8] | `[scratch project]` |  |
| 3.4 | Hand-edit one entry in `component-definition.json` on GitHub. Then on **Configure**, open **Block Libraries**, tick a second library, save, and press **Republish** in the prompt. *This row used Edit until 2026-10-13; Edit now shows block libraries locked and points to Configure [EDS-39, PL-75].* **Changes live data** (one commit to the scratch repository). | The prompt names the library ("Block libraries: add …"). After Republish, the library's entries are there once each, your hand edit is still there, the file's indentation has not changed, and the DA.live block picker lists the new blocks [EDS-39, EDS-36, EDS-8, EDS-28] | `[scratch project]` | Pass, 2026-10-16, on Demo Team Block Collection (re-run after the fixes). Fixed during the walk: told in the Configure progress modal, not overlapping notifications; a library change publishes only what changed (was ~100s). Hand-edit and indentation read-back not done. |
| 3.5 | *Only if a library you installed has a newer commit.* Delete one of its block folders on GitHub and remove the HTML example from one of its entries. Run Check for Updates and apply it. | Neither comes back. A "Left out ... removed by hand" line names both [EDS-36] | `[scratch project]` |  |
| 3.6 | In DA.live, make a page that is not in the template (for example `/leftover-test`) and publish it. | It answers on the live site. This sets up row 3.7 [EDS-33] | `[scratch project]` | Pass, 2026-10-16. Made with the agent tool `write_page` (publish), answered 200 on aem.live with its heading. |
| 3.7 ★ | Press **Reset** on the dashboard. Reload the live home page a few times while it runs. **Changes live data** (it rebuilds the scratch storefront; there is no undo, which is why this is a scratch project). | Under "Checking requirements" it names your DA.live sign-in, your Adobe sign-in, the Adobe organization and the GitHub app. The home page never goes down. It says how many product pages it removed, and product pages answer again afterwards. At the end `/leftover-test` answers 404 and nothing warns that old pages may still be live. Check for Updates then finds nothing [EDS-33, EDS-26, EDS-8] | `[scratch project]` | Pass, 2026-10-17, re-run after the 2026-10-16 fixes (warnings in the modal; Reset no longer unpublishes the customer pages). Home page 200 on all 35 checks over 6 min; "Removed 39 product pages", all 39 re-published and answering; `/leftover-test` 404 (one of 12 pre-reset pages taken off); "serves all 76 pages the source has"; the 5 customer pages answer; Check for Updates: up to date. Not seen: the requirements list (owner did not watch it). Warning "1 of 19 sheets failed to publish (/placeholders/checkout.json)": live sheet equals the source, reason not logged, now logged (`fix(eds): a sheet that fails to publish says why`). |
| 3.8 | *Only when your DA.live session has really expired, for example first thing tomorrow.* Start a Reset or a Republish. | The progress window shows a sign-in form headed "Your DA.live session has expired." You sign in and it carries on. It does not stop and say you lack permission [EDS-34, EDS-8] | `[scratch project]` |  |
| 3.9 | Open the Data Installer, pick a pack, press **Dry run**. Stop there: an import would write products into Justrite's Commerce. | Dry run reads "Checking", then a result with Back. *The import's progress and its "Run in background" close button are not walked on this pass* [EDS-8] | `[scratch project]` |  |
| 3.10 ★ | Open Configure and leave it open. In a chat, ask the agent to set the store view code on this project. Then on Configure change only another field (for example the customer group) and save. *[PL-76]* | The agent's answer says to republish, and the dashboard's Republish tile turns amber. The store view code the agent set is still there after your save; your field changed too. Before the fix, the open window put the old store view code back | `[scratch project]` | Pass, 2026-10-17, after three fixes the walk found. A store view code alone cannot be changed here (each store has one view), so the agent switched website, store and view. Final run: Configure open on Bodea, the agent switched to CitiSignal, the stale window saved only a rename: disk shows CitiSignal and `my-commerce-demo-3`. Found and fixed on the way: (1) the dashboard tile stayed plain after an agent's change, since only Configure refreshed it (`719c89f30`); (2) "republish needed" never cleared when settings were put back to what is live (`7dcaf234e`); (3) the same Configure window dropped a rename back, or any value put back, after an earlier save (`87dbf9c3f`). Filed: EDS-52 (the new-category offer reads the saved store before it is published), AB-79 (the mesh flag likely has the same one-way shape). |
| 3.11 | Rename the project from the dashboard's inline rename while Configure is open. Then press **Configure** on the dashboard again, change nothing, and save. *[PL-76]* | Configure reopened on the Project tab with the NEW name, and the save leaves it. Before the fix, the save renamed it back | `[no cloud]` |  |
| 3.12 | *Headless project only.* Start the demo. On Configure change a setting that is not a Commerce connection field and save; answer **Later**. Change another setting and save again. *[PL-76]* | The restart prompt has **Restart Demo** and **Later**, and it appears again on the second save. Pressing Restart Demo stops and starts the demo | `[no cloud]` |  |
| 3.13 | *Headless project with a mesh, demo running.* On Configure change the store view code and save. **Changes live data** (redeploys the scratch mesh). *[PL-76]* | The prompt's button reads **Redeploy and Restart**. After it, the mesh is redeployed and the demo restarts | `[scratch project]` |  |
| 3.14 | *Only when your DA.live session has really expired, as for row 3.8.* On Configure change the store view code, save and press **Republish**. **Changes live data.** *[PL-76]* | You are asked to sign in to DA.live. If you decline, the message says the change reached GitHub but the live storefront still serves the previous configuration; it does not say "republished successfully", and the Republish tile stays amber | `[scratch project]` |  |
| 3.15 ★ | Press **Edit** on the scratch project. Look at the name, the Commerce area and block libraries. Go Back to Welcome, then forward to the end. Change nothing and Finish. | Name, Commerce settings and block libraries are shown but locked, with a note pointing to Configure. Welcome does not keep redrawing. No storefront step runs. The last screen reads "Changes Saved". The dashboard shows the same Adobe project, repository and DA.live site. Nothing was redeployed or republished [PL-75] | `[scratch project]` || Pass, 2026-10-17. Log: "Nothing changed: saving only, nothing redeployed"; no storefront step; "Changes Saved". The walk reshaped Edit first (uncommitted at the time of writing): Commerce opens on Backend; the three Commerce settings steps and Block Libraries are left out of Edit, said once each by a quiet line linking to project configuration, which hands Edit over to the dashboard with Configure on top (asking first if Edit has changes); the summary shows every setting, store view code included, and counts block libraries as the picker shows them; the review says "Existing site" and heads with the project name. Configure closing as the last screen now opens the dashboard. Open: renaming in Edit (recommended: same rename as Configure); the last screen's wording is Create's. |
| 3.16 ★ | Add a line to the scratch project's AGENTS.md. Edit the project, add the blank starter app named "Edit Test", Finish. Edit again, remove it, Finish. **Changes live data** (a workspace in the scratch Adobe project; the second Edit removes it). | The first Finish adds only that app. There is no storefront step and nothing else redeploys. The second Finish asks first, naming Edit Test, then removes it, and its workspace is gone in Developer Console. Your AGENTS.md line is still there [PL-75] | `[scratch project]` || Pass, 2026-10-17, removal from the Integrations page rather than Edit (owner agreed; Edit's removal confirmation is covered by tests). Add: "Applying in place: adding [my-app], removing []", no storefront step, nothing else redeployed, workspace "My App" made in a new Adobe project; AGENTS.md line kept. Remove: asked first naming My App; removed from Commerce (46.7s), undeployed, the leftover sweep deleted 3 actions the undeploy missed (0 failed), workspace deleted; AGENTS.md line kept. Found: the add's leftover check cost a new app ~16s for nothing (AB-80, fixed: skipped when the add made the workspace; its line now "Looking for old code to remove"); the Create New Project form floated mid-window (SteadyHeight now pins the integration window's steps to the top). |
| 3.17 ★ | Edit the scratch project and pick another demo package on the same stack. Finish and accept. **Changes live data** (rebuilds the scratch storefront, as Reset does). | Before anything runs, it asks to reset the storefront onto the new package and says hand edits stay in the repository's history. It runs Reset, not a rebuild. The live site shows the new package [PL-75] | `[scratch project]` | Pass, 2026-10-17, Starter to CitiSignal. Asked to reset in a dialog first. "Applying in place: changed [selectedBlockLibraries, selectedPackage]", then Reset of the same repository (skukla/my-commerce-demo): no new repository, no new DA.live site, about 6.5 minutes. Live site shows CitiSignal on its content; catalog menu rebuilt (8 category pages, 3 reused). Warnings, none blocking: /placeholders/checkout.json failed to publish (400), 14 of 15 sheets published; 6 source pages under /experiments missing; content patch index-product-teaser-sku-accs found nothing to patch on CitiSignal's home page. Expected: changing the package clears the backend pick, so Commerce asks for it again. Found: the OAuth client ID and secret boxes opened and then closed while the shared-credential check ran (fixed: nothing renders until it answers). |
| 3.18 | *Only if you have a second Adobe project, not Justrite's, in the same org.* Edit the scratch project and pick it. Finish. **Changes live data** (moves the project's integrations; move back the same way). | If the project has an integration, it asks first. Afterwards integrations run in the new Adobe project and nothing is left running in the old one [PL-75] | `[scratch project]` |  |
| 3.19 | On GitHub, hand-edit one block from the library row 3.4 added. On Configure, Block Libraries, untick that library, save, press **Republish**. **Changes live data** (one commit to the scratch repository). | The prompt says "Block libraries: remove …". The library's blocks leave the repository and the DA.live block picker. The block you edited stays and is named [EDS-39] | `[scratch project]` | Pass, 2026-10-16, on Demo Team Block Collection (re-run after the fixes). The modal ends on "Removed Demo Team Block Collection (9 blocks)." Hand-edited-block read-back not done. |
| 3.20 | *Only if the scratch project has the API Mesh.* On its Integrations screen press Deploy on the mesh card. **Changes live data** (redeploys the scratch mesh). | Progress stays in the modal and ends green. The storefront is republished; if your DA.live session has expired it asks you to sign in first. A product page still loads afterwards [EDS-8] | `[scratch project]` |  |
| 3.21 | *Headless project that has an integration in its folder.* Press Reset and read the question. Cancel there unless it is a project you can lose. | The question says integrations are left as they are. If you run it, the integration's folder and card are unchanged; only the mesh is fetched again [AB-23] | `[no cloud]` |  |
| 3.22 | *Only when your DA.live session has really expired, as for row 3.8.* Ask the agent "am I signed in to DA.live?" Then press **Republish** on the dashboard. | The agent says the DA.live sign-in has expired, not that you are signed in. Republish asks you to sign in to DA.live before it publishes anything. It never says "No publishable pages found", and Debug Logs show no "Failed to grant access … 401" with the run carrying on after it [EDS-30, EDS-29, EDS-54] | `[scratch project]` |  |
| 3.23 | After row 3.2's store change and its Republish, open a category page and a product page on the live site. | Both show the new store's catalog. The product page opens, not "Page not found". No offer to add pages for the new store's categories follows [EDS-44] | `[scratch project]` |  |
| 3.24 | Ask the agent to switch the scratch project to another website's store, and decline the republish it asks for. Reload the window. Then press **Republish**. **Changes live data** (the new store's pages; switch back the same way). | While the republish is pending, no "new categories have no page yet" offer appears, after the reload too. After the republish the new store's pages are in place [EDS-52] | `[scratch project]` |  |
| 3.25 | *Only on a project with the API Mesh.* On Configure, change a setting the mesh reads (for example the store view code), save, answer **Later**. Change it back and save again. | After the first save the dashboard says the mesh needs a redeploy. After the second it does not [AB-79] | `[no cloud]` |  |
| 3.26 | On a B2B storefront (its `config.json` has `commerce-b2b-enabled: true`; the scratch storefront does), open an address that does not exist, for example `/no-such-page`. | The site's 404 page, with header and footer. Not a blank page [EDS-45] | `[scratch project]` |  |
| 3.27 | Read the served page settings of `/customer/account`, `/cart` and `/checkout` on the scratch storefront. | Account has template "My Account, Columns". Cart and checkout have robots "noindex, nofollow". Checkout has cache-control "no-store". The same as Adobe's own pages [EDS-50] | `[scratch project]` | pass 2026-10-20 (agent): all three read from aem.live as expected; CitiSignal's own account page has the same template |
| 3.28 | At the next Reset of a project on CitiSignal's content (row 3.7 or row 6.5), read the result's warnings. | No sheet fails to publish; `/placeholders/checkout.json` is not named. The checkout shows text, not keys like `Checkout.LoginForm.title` [EDS-53] | `[scratch project]` |  |
| 3.29 | The next time you add the blank starter app into a new workspace (row 3.16, or before row 4.28), watch the progress. Then press **Redeploy** on its card. | The add has no "Looking for old code to remove" step. The Redeploy still has it [AB-80] | `[scratch project]` |  |

## 4. Integrations and ERPs

On Justrite, unless a row says otherwise. Rows 4.2 to 4.9 are one story: add a test ERP, give it
products, take them back, remove it. Rows 4.13 to 4.19 are **Prepare this store** [AB-77]: the
setup steps the extension now applies instead of only checking. Row 4.14 and row 4.4 put
`erp_owner` into the same attribute sets, so whichever runs first leaves the other nothing to
add. On Justrite both were already written on 2026-10-10, through the agent tool: `erp_owner`
went into eleven attribute sets and is still there, and the card payments switch went on and
back off. So on Justrite rows 4.13 to 4.15 check the SCREEN against a store that is mostly
prepared; row 4.19 is the full run on a store that is not.

| # | Do this | Expect | Needs | Result |
|---|---|---|---|---|
| 4.1 | Open Justrite's Integrations screen. Type in the filter. | The mesh card is first. The grid and the "N of M" count follow what you type, and the add card steps aside. The "Deploys to" row names the Adobe project [EDS-8] | `[no cloud]` |  |
| 4.2 ★ | Press **Add another ERP**. Do not press Add yet. Read the dialog, change the name, switch between the two ownership choices. | The wording is short plain sentences. While the store is being read you see a loading view, never "The store has no websites." "After adding" has one line per ERP: its count, its rule in words and up to three example SKUs. The lines follow what you change. Owning by product attribute is the default. Choosing websites lists the store's websites to pick from [AB-75, AB-70, AB-64] | `[needs Justrite]` | pass 2026-10-18 (owner + agent): fixed on the way: the read took about 2 minutes, then 5 s, and now starts when the dashboard opens, so the dialog opens with counts ready; the loading view sits lower; the name box says only "Can't be renamed once deployed." The list is headed "Products each ERP will own" and shows each ERP's count and rule, with no example SKUs; it follows the name and the rule (dialog tests). Websites: the store has six besides Admin (Main, CitiSignal, Bodea, Justrite, Justrite Test, BJU), read live; the dialog lists the same read minus Admin |
| 4.3 ★ | Name it "Test ERP", keep "by product attribute", press **Add**. Keep the Project Dashboard open beside it. About 10 minutes. **Changes live data** (a new Adobe workspace and ERP on Justrite; row 4.9 removes it). | The card shows it deploying, on both screens, then done. The result says Test ERP owns no products yet and offers **Assign products**. Justrite ERP still owns everything nobody claims; its rule did not change. After row 4.5, an assigned product's `erp_owner` reads `test`, named for the ERP, not `erp` or a component id like `demo-erp-2` [AB-75, AB-74, AB-72, EDS-8, AB-51] | `[needs Justrite]` | | pass 2026-10-19, with **Acme ERP** standing in for Test ERP: added and deployed; the result offered **Assign products**; Justrite ERP's rule still "every product no other ERP claims" (read from the integration); assigned products read `erp_owner=acme`, named for the ERP. Not seen: the card deploying on both screens |
| 4.4 ★ | Open the integration's setup guide and read the check about the `erp_owner` attribute. Press its fix. *If row 4.14 ran first, the check already passes and there is nothing to press.* **Changes live data** (adds `erp_owner` to attribute sets on Justrite; row 4.8 takes it out). | It names the attribute sets that lack `erp_owner` (seven on Justrite on 2026-10-09, eight on 2026-10-10). After the fix the check passes [AB-74] | `[needs Justrite]` | | pass 2026-10-19: the check already passed (Product attributes ticked in the guide), so there was nothing to press |
| 4.5 ★ | On Test ERP's card, press **Assign products**. Set the Owner filter to Justrite ERP, tick a few, read the line under the table, then **Assign**. About 30 seconds. **Changes live data** (tags products on Justrite; row 4.6 undoes it). | The dialog opens with its search, filters and column headings at once, then lists the store's products by SKU, Name, Category and Owner; Test ERP's own products are greyed. The line under the table says how many and where they come from ("3 selected, all from Justrite ERP."). The progress window follows the write to the end, then **Updating the ERPs** sends only the moved products to Test ERP. Test ERP then holds those products, and Justrite ERP shows them as discontinued [AB-74, AB-70] | `[needs Justrite]` | | pass 2026-10-19 on Acme ERP, with the table dialog (owner walked it; this row's wording follows it). Products moved from Justrite ERP; Acme ERP then owned them; Justrite ERP had them discontinued (its later "Marking 3 of 3 products sellable again"). A move of one product sent "1 of 1 products" to the one ERP gaining it |
| 4.6 ★ | On Test ERP's card, press **Undo last assignment**. | The products go back to how they were tagged. Test ERP owns none. In Justrite ERP they are sellable again, not discontinued [AB-74, AB-70] | `[needs Justrite]` | | pass 2026-10-19 on Acme ERP: the tags read back as before (`erp_owner=justrite`, from Commerce), Acme ERP owns none, Justrite ERP shows them sellable (51BSCB, a configurable product, carries no status there). An undo of an ERP's only assignment now ends green, without "owns no products yet" |
| 4.7 | On the integration's card, press **Fill ERPs from Commerce**. About 3 minutes. **Changes live data** (refills both ERPs; safe to repeat). | Justrite ERP gets only what Accuform does not claim. It ends on a green tick with counts. If the price step runs long it says "Publishing prices, still running" once and still ends green, with no orange warning about 60 seconds. Open an ERP afterwards: it has its own products, companies, price groups and price lists [AB-72, AB-26z, AB-26y, AB-44] | `[needs Justrite]` |  |
| 4.8 | In the setup guide, press **Take erp_owner out again**. If you want Justrite to keep the attribute (it does help), press the fix from row 4.4 once more afterwards. | It takes the attribute out of the sets it added, because no product in them is tagged now [AB-74] | `[needs Justrite]` |  |
| 4.9 ★ | Remove Test ERP from its card. **Changes live data** (this is the undo of row 4.3). | The progress window runs the removal and shows its notes inside the window. No separate pop-up opens. Afterwards the integration's flyout names only Justrite ERP and Accuform ERP: no Test ERP, and no old Kukla ERP [PL-59, AB-70] | `[needs Justrite]` | | pass 2026-10-19 (owner confirmed Acme ERP is gone; the log has the removal and its workspace deleted after a 504 re-checked). Not checkable: the flyout naming only the two ERPs, since the integration was removed afterwards |
| 4.10 | *Only if a card offers them* (after an install or a removal that did not finish): press **Reinstall in Commerce** or **Remove anyway**. | Each opens the progress window. Neither runs as a bare notification [PL-59] | `[needs Justrite]` |  |
| 4.11 | *Only if an Update fails at its deploy step* (Adobe answering 504 is the usual cause): press **Update** again. | It deploys the code it already fetched and says so. It does not say "already up to date". The update badge stays on until the deploy works [AB-71] | `[needs Justrite]` |  |
| 4.12 | Open the Integrations screen of a project that has the ERP integration. Leave it open. From Your Projects, open a project that has **no** ERP integration. Go back to the first screen and press **Add another ERP**, then Add. | It refuses before anything is deployed: the ERP integration "is not in the current project", naming the project that is current, and tells you to open the one that has it. If the first screen closed or switched by itself instead, write that down: it is also fine [AI-15] | `[no cloud]` |  |
| 4.13 | On the ERP Integration card's menu press **Prepare this store**. Do not press Prepare. Read the nine steps against Commerce Admin (Stores, Configuration; Stores, Attribute Set; Stores, Inventory; Catalog, Shared Catalogs; Stores, Order Status). | Nine steps, each with a state. On Justrite since 2026-10-10: eight **Done** (the two order statuses among them, since Justrite already has them, and the attributes step, applied that day), and one **Will apply** with the exact change under it: `payment/payment_services/active` 0 to 1 at the website, with a line that the PayPal sandbox connection stays by hand. Each state matches what the Admin shows. Close it: nothing is written [AB-77] | `[needs Justrite]` |  |
| 4.14 ★ | Open the setup guide and find the `erp_owner` and `brand` attributes step. On Justrite it was applied on 2026-10-10, so there is nothing to apply: press **Undo this step**, confirm, then **Apply this step** again. **Changes live data** (takes `erp_owner` out of eleven attribute sets on Justrite and puts it back; leave it applied). | The step's check passes and it offers **Undo this step**, not Apply. The undo names the eleven sets (Phones, Watches, Server, Accessories, Audio, Cables, Coolers, Plans, Power Supply, Home Internet, Gift Cards) and the step then offers **Apply this step**. Applying ends **Applied** with the same eleven and nothing refused, and creates neither attribute: both exist. In Admin, Stores, Attribute Set, each set has `erp_owner` again [AB-77, AB-74] | `[needs Justrite]` |  |
| 4.15 | Open **Prepare this store** again, read the preview (card payments is now the only Will apply), press **Prepare**. Then, from the card's menu, **Undo preparation** and confirm. **Changes live data** (round trip: the undo puts the switch back). | Progress stays in the modal. The result lists card payments **Applied** (0 to 1 at the website), the attributes step **Already done**, nothing refused, and the PayPal sandbox connection by hand. In Admin, Stores, Configuration, Sales, Payment Methods, Payment Services is on for the website. After the undo it is off again, and the preview reads Will apply for it once more [AB-77] | `[needs Justrite]` |  |
| 4.16 | *Only if a step reads **Could not check** in the preview* (its check could not read Commerce when the preview opened, for example a dropped connection). | The step shows the check's own words beside the state. It is not counted done anywhere: the card's "Demo setup" line, the guide and the preview all leave it open, and Prepare does not apply it [AB-77] | `[needs Justrite]` |  |
| 4.17 | Open the setup guide and read every step's buttons without pressing any. | A step whose check passes offers neither button. A step with a fix that is not done offers **Apply this step**. A step this walk applied and has not undone offers **Undo this step**. The two order statuses offer nothing: they stay a guided Admin walk. The price scope step no longer says "No API sets this" [AB-77] | `[needs Justrite]` |  |
| 4.18 | With Justrite open, ask the agent: "What would preparing this store change? Do not apply anything." | It answers the same nine steps and states as row 4.13, through `prepare_commerce_store`, and writes nothing. No confirmation is asked for a preview [AB-77] | `[needs Justrite]` | pass 2026-10-14 (agent): nine steps, eight done or applied, card payments applicable (0 → 1 at the website) with the PayPal note; `confirmed: false`, nothing written |
| 4.19 ★ | *The owner accepted what this leaves behind (2026-10-12).* While Test ERP from row 4.3 still exists (so before row 4.9): open **Prepare this store** and read the warehouse step, then apply that step from the setup guide, then **Undo this step**. **Changes live data** (a `test_warehouse` source and its link to a stock on Justrite. The undo removes the link and DISABLES the source. Commerce cannot delete a source, so a disabled `test_warehouse` stays on Justrite for good). | The preview shows the warehouse step **Will apply**, naming a source for Test ERP only: Justrite's and Accuform's exist. Applying ends **Applied** with the source created and linked to the website's stock, nothing refused, and a line that moving quantities stays by hand. In Admin, Stores, Inventory, Sources, it is there and enabled. After the undo the link is gone and the source is disabled, which the result says in words [AB-77] | `[needs Justrite]` |  |
| 4.20 | After row 4.3, open Justrite's Adobe project in Developer Console. Change nothing. | Test ERP has its own workspace, named in letters and digits only. Its credential has Adobe Commerce as a Cloud Service with a product profile. Justrite's own workspace gained no new APIs [AB-23] | `[needs Justrite]` |  |
| 4.22 | After row 4.7, sign in to the storefront as a Northgate buyer. Open a product Justrite ERP owns and add it to the cart. | The listing, the product page and the cart show Northgate's ERP price, not the list price [AB-26z, AB-44] | `[needs Justrite]` |  |
| 4.23 | On Accuform ERP's card press **Simulate downtime** and start it for 2 minutes. Open it again and press **End downtime**. **Changes live data** (Accuform ERP answers as down until ended; ending is the undo). | While it is down, the dialog offers End downtime. After ending, Accuform ERP's screens answer again [AB-59] | `[needs Justrite]` |  |
| 4.24 | *Only if an update is waiting.* Change one file in the ERP Integration's folder and do not commit it. Press **Update**. Then undo your change and press Update again. | The first Update refuses and names your file, and only your file (never `app.config.yaml`). Nothing is deployed. The second one updates [AB-13] | `[needs Justrite]` |  |
| 4.25 | Press **Redeploy** on the ERP Integration card. Then ask the agent to list the Runtime packages, triggers and rules in that integration's workspace. Delete nothing. **Changes live data** (the same code redeployed). | The redeploy ends green with no warning about code it could not delete. The list holds no `erp/order-grid` and no timer the app no longer declares. The Orders grid and the ERP Integration page still work [AB-33, AB-58] | `[needs Justrite]` | pass 2026-10-14 (agent): workspace holds only declared packages plus `acp` and `bound_package` (made by Commerce's installer, AB-33 note); triggers are the two declared timers. Redeploy half covered by the 16:39 pair update |
| 4.26 | From the ERP Integration card's menu press **Open Commerce Admin**. Then press it on the dashboard. | Each opens a private window and the Admin loads, with no "Request Header Or Cookie Too Large" [AB-26] | `[needs Justrite]` |  |
| 4.27 | *Only if an add or Add another ERP stops part-way* (Adobe answering 504 is the usual cause). Read the message, press **Retry**, then reload the window. | The message says what was left behind, not "Nothing was changed". Retry re-runs the add and ends with one card, not a second copy. The dashboard and Integrations screen still open after the reload [AB-23] | `[needs Justrite]` |  |
| 4.28 ★ | On the scratch project, with the blank starter app added (Part 2): on its Integrations screen, change **Deploys to** to another Adobe project. Read the question, accept, then press Open on the starter's card. **Changes live data** (a workspace deleted in one Adobe project and made in another; move back the same way). *Never run live before.* | A question names what leaves which project. Progress says which integration it is on. The starter's card ends deployed, and Open goes to its workspace in the new project. The old project no longer has that workspace [AB-23] | `[scratch project]` |  |
| 4.29 | *Only if the scratch project has the API Mesh.* On its Integrations screen remove the mesh, then add it back. **Changes live data** (the scratch mesh; the add puts it back). | If the package needs the mesh, Remove says "This demo needs the API Mesh. Without it, the storefront won't work." The storefront is republished after the removal and again after the add. Pages show products at the end [PL-75] | `[scratch project]` |  |
| 4.30 | On **Justrite ERP**'s card (the ERP on every product no other ERP claims), press **Assign products**. Set the Owner filter to Test ERP, tick one, and **Assign**. Then **Undo last assignment** on Justrite ERP's card. **Changes live data** (the undo puts the tag back). | Justrite ERP's own products are greyed. The progress says "Clearing erp_owner on 1 products" and ends green; the product then shows as Justrite ERP's. The undo puts its Test ERP tag back [AB-74] | `[needs Justrite]` | pass 2026-10-19 on Acme ERP: "Clearing erp_owner on 1 products", then the undo restored `acme` |
| 4.31 | Remove the ERP integration from its card, after rows 4.5 and 4.15 have left a tag and a preparation in place. **Changes live data** (removes the integration and its ERPs; adding it back is its undo). | The Remove dialog says its store setup is undone first. Before anything is taken down the progress runs **Undoing the store setup**: the ERPs' product tags cleared, erp_owner out of the sets Demo Builder added it to, the preparation put back. Afterwards no product carries an ERP's tag and the preparation's settings read as before. If any of it fails, nothing is removed and the card shows **Removal stopped** with **Remove anyway** [AB-77] | `[needs Justrite]` |  |

## 5. The ERP's own screens (order to cash)

On Justrite. Open each ERP from its card. Buyer: Northgate. If an ERP's order page has no
next-step button, that ERP is on older code: press Update on its card first.

| # | Do this | Expect | Needs | Result |
|---|---|---|---|---|
| 5.1 | Open Justrite ERP's Sales Orders. | The two old open orders are gone (the 2026-10-09 reset cleared them) [AB-16n] | `[needs Justrite]` | pass 2026-10-14 (agent): Justrite ERP holds one order, 0000001004 from 2026-10-12, Completed; no open orders |
| 5.2 ★ | Place one order on the storefront with a product tagged for Accuform and a product with no tag. **Changes live data** (an order in Commerce and both ERPs; row 7.1 clears the ERP side). | The order goes through. It is not refused as claimed by two ERPs. Accuform ERP gets only the tagged line. Justrite ERP gets only the untagged one. Checkout does not hang [AB-72, AB-16, AB-55] | `[needs Justrite]` |  |
| 5.3 ★ | In one ERP, open the order and keep pressing its main button. | The button reads, in turn: Confirm, Create shipment, Post shipment (with its number), Create invoice, Post payment. Commerce shows the shipment and the invoice. The ERP's stock drops by what shipped. The invoice ends up Paid and the company's credit in Commerce comes back [AB-26s, AB-63; demo-erp, contract v21] | `[needs Justrite]` |  |
| 5.4 | In the other ERP, confirm its order and create a shipment but do not post it. Try to create a second shipment for the same goods. Then press **Close remaining**. | The second shipment is refused. Close remaining closes only the quantity that is not on a shipment [demo-erp, contract v21] | `[needs Justrite]` |  |
| 5.5 | On that same order, press **Cancel** on the waiting shipment. | The waiting shipment is removed [demo-erp, contract v21] | `[needs Justrite]` |  |
| 5.7 ★ | In Commerce Admin, open the **ERP Integration** page from the menu. Watch it load, then reload the page and watch again. | A spinner the whole way until the page is drawn. No blank white frame between the spinner and the page. *The fix was deployed to Justrite on 2026-10-11 and has not been seen in the Admin yet* [commerce-erp-integration `0d18d10`] | `[needs Justrite]` |  |
| 5.6 | In Commerce Admin, open Sales, Orders and press **Refresh registrations**. Then open Apps, App Management. | The Orders grid has ONE set of ERP columns. App Management lists the integration once [AB-69] | `[needs Justrite]` |  |

## 6. Agent tools

Only the ones where a real window is the point. Ask in a project's chat.

| # | Ask the agent | Expect | Needs | Result |
|---|---|---|---|---|
| 6.1 | "Create a storefront project called agent-scratch" on a repository that does not have the AEM Code Sync app. **Changes live data** (a repository and a site; row 6.2 removes them). | VS Code shows a message with a button that opens the app's install page. The progress card shows each phase, not a bare "Creating the project". After you install the app it finishes. agent-scratch's `config.json` has `commerce-assets-enabled: true` and the store codes. Note: the new project becomes the current one [AI-14, AI-15] | `[scratch project]` |  |
| 6.2 | "Delete agent-scratch, including its repository and its DA.live site." | It asks first. Then the files, the repository and the site are gone, and its pages answer 404 [AI-9, EDS-33, EDS-8] | `[scratch project]` |  |
| 6.3 | With Justrite open: "What would adding an ERP called Preview ERP look like? Do not add it." | It answers the same preview as the dialog in row 4.2 and deploys nothing [AB-75] | `[needs Justrite]` | pass 2026-10-14 (agent): preview names Preview ERP (`erp_owner=preview`, 0 products), Justrite 225, Accuform 96; `confirmed: false`, nothing deployed |
| 6.4 | With Justrite open: "What updates are waiting? Do not apply any." | It lists the same things Check for Updates did in row 1.8, integration pairs included [AB-73] | `[needs Justrite]` | pass 2026-10-14 (agent): nothing waiting, right after the pair update was applied |
| 6.5 | On the scratch project: "Reset this project's storefront." **Changes live data** (same as row 3.7). | It asks first, resets, and its answer says whether any old pages were left live [EDS-33, EDS-8] | `[scratch project]` |  |
| 6.6 | Set Engine to Claude Code. In a storefront project's chat, type `/mcp`. Set Engine back afterwards. | commerce-extensibility, playwright and dropins are all connected. None failed to start [AI-13, PR-1a] | `[no cloud]` |  |
| 6.7 | Before row 7.1, with Justrite open: "Through the ERP's own API, put Accuform's part of my test order on hold, then release it." **Changes live data** (undone in the same row). | A consent dialog names the method and the route before each write. The ERP shows the order on hold, then released [AB-31] | `[needs Justrite]` |  |
| 6.8 | With Justrite open: "Run the ERP integration's erp/status action and show me its answer." | It asks first, runs it, and shows the answer and the run's log lines [AB-31] | `[needs Justrite]` | pass 2026-10-14 (agent): HTTP 200, the status answer and its log lines |
| 6.9 | Open Justrite's AGENTS.md. Then ask: "List the Adobe APIs on the ERP integration's own workspace." | AGENTS.md has an "Integration workspaces" list naming each ERP's workspace. The answer is that workspace's APIs, not the whole project's [AB-23] | `[needs Justrite]` | pass 2026-10-14 (agent), with a note: the API list is the integration workspace's. Justrite's AGENTS.md lacks the Justrite ERP line because the file was hand-edited after 2026-10-02 and is protected from overwrite, by design |
| 6.10 | During row 1.4, while signed out of Adobe, ask the agent to list Justrite's Runtime packages. Cancel the sign-in. | A VS Code modal asks for the Adobe sign-in, not a corner notification. After you cancel, the agent says it is waiting on you, not "done" [AI-12] | `[needs Justrite]` |  |
| 6.11 | Run **Register Global MCP**. Open `~/.claude.json` and `~/.copilot/mcp-config.json`. | Both files list demo-builder [AI-12] | `[no cloud]` |  |
| 6.12 | Keep **Your Projects** open during row 6.1. Try to open, rename or delete the new tile while the agent works. | The tile appears soon after the agent starts and says it is being created. It cannot be opened, renamed or deleted. When the agent finishes, it turns into the finished project without reopening the screen [PL-82] | `[scratch project]` |  |
| 6.13 | Just before row 7.4, while the scratch project still exists: "Create a project called my-commerce-demo." *A throwaway name on purpose: before this fix, a taken name deleted the existing project.* | It refuses before anything is built and says the name is taken. The scratch project's folder is untouched [AI-73] | `[no cloud]` |  |
| 6.14 | *Only with `demoBuilder.cleanupBehavior` set to `deleteAll`.* Instead of row 6.2's wording, ask only "Delete agent-scratch." | Its question names the repository and the DA.live site as well, and both are deleted, as the Delete button does with the same setting [AI-71] | `[scratch project]` |  |
| 6.15 | Open patch-canary-b2b (it has no Adobe workspace). Ask: "Read this store's store views through the Commerce REST API." | It answers with the store views, using your own Adobe sign-in. It does not refuse for lack of an Adobe workspace. *A write was proven the same way on 2026-10-17* [AI-72] | `[no cloud]` |  |
| 6.16 | With Justrite open, ask "what's the current project?" Then open another project from Your Projects. Ask the agent to rename the ERP Integration to "Test". Then ask it to go back to Justrite, and do not let it rename. | The rename does not run: the answer says the open project changed from JustRite to the other one, and nothing is renamed. Going back works, and your screens stay on the project you opened [AI-76, AI-15] | `[needs Justrite]` |  |

## 7. Cleanup of what the test left behind

| # | Do this | Expect | Needs | Result |
|---|---|---|---|---|
| 7.1 ★ | On Justrite's integration card, press **Reset ERPs**. **Changes live data** (this is the undo of section 5: it closes the test orders and wipes and refills both ERPs). | It does not stop at 60 seconds. It ends on a green tick with counts and no warning. Both ERPs have no orders and are refilled [AB-26z, AB-16n, AB-61, AB-47] | `[needs Justrite]` |  |
| 7.2 | Look at each ERP's product count. | Close to where it started: about 225 for Justrite ERP and 96 for Accuform ERP [AB-72] | `[needs Justrite]` |  |
| 7.3 | Confirm the scratch project has no ERP integration (row 2.4 removed it before creation). | Its Integrations screen shows none. Nothing was installed in Commerce for it. *Removing an ERP integration from a project, with its App Management warning, is not walked on this pass* [AB-69, AB-12, AB-33] | `[scratch project]` |  |
| 7.4 ★ | Delete the scratch project from Your Projects. In the question, press **Select all**. | Select all ticks both boxes. The files are gone, the repository is gone on GitHub, the DA.live site is gone, and the home page, a category page and a product page all answer 404 on aem.live. The result does not say it fell back to the DA.live list [EDS-33, EDS-26, EDS-8] | `[scratch project]` |  |
| 7.5 | In Adobe Developer Console, check that the Test ERP workspace from row 4.3 is gone from Justrite's project. | It is gone. A workspace's Runtime namespace can take about 11 minutes more to go. No warning that Runtime kept leftovers appears in the 20 minutes after row 4.9 [AB-69] | `[needs Justrite]` | | pass 2026-10-19: Acme ERP's workspace confirmed gone; Adobe confirmed its Runtime namespace deleted at 14:03; no "Runtime kept leftovers" warning for it |
| 7.6 | Run **Manage GitHub Repositories**. Look for `skukla/bodea-jen`, left by the agent run of 2026-10-08, and anything from today. Delete them there. | Nothing from the tests is left [AI-14] | `[no cloud]` |  |
| 7.7 | The Adobe project **Kukla Bodea Mesh**: it cannot be deleted while it is read-only. Revoke, then delete. *Carried from 2026-10-09 as written; see the note under "Open questions".* | The project is gone from Developer Console | `[no cloud]` |  |
| 7.8 | Run **Check for Updates** one last time with Justrite open. | Nothing unexpected is waiting, and no block library offers "install" on Justrite [EDS-37] | `[needs Justrite]` |  |

## 8. Release steps

Follow the `cut-release` skill (`.claude/skills/cut-release/SKILL.md`). It is not repeated here.
In short, it asks for:

1. The tested branch merged to `develop`, a clean tree, and a green gate.
2. `npm run node:resolve -- --check`.
3. The out-of-band passes offered (`npm run sweep` and the others it names). You can decline
   them, and the release notes then say so.
4. The version bump by hand (never `npm version`), curated notes, the changelog, the merge to
   `master`, the tag, the package, and the GitHub pre-release.

Before that, fill in each row's **Result** here (`pass`, or `fail` and a few words), then run:

`node .claude/skills/backlog-item/backlog.mjs readiness`

It reads this file and says what is ready, what failed and what is still unchecked.

## Open questions

- **Row 7.7** came to this list as one line: "the Kukla Bodea Mesh project cannot be deleted
  while read-only (revoke, then delete)". What has to be revoked is not written down anywhere in
  the backlog. You know; the list does not.
- **Part 2 is the unfinished 2026-10-04 plan.** Decide whether to walk its ★ rows before this
  beta or to ship without them. `readiness` will keep saying "not ready" until every ★ row in
  both parts has a result. The old file, `2026-10-04-release-test-plan.md`, is now a copy that
  nothing reads: delete it once you accept this one.
- **"Load demo data" and "Fill from Commerce" are the same button under two names.** The menu
  was renamed on 2026-10-01; the messages were not.
- **The ERP Integration page's design in the Admin is being reworked** (two mockups on
  2026-10-11, neither accepted). Row 5.7 checks only how the page LOADS. Do not judge the
  page's look against this list.
- **There is one Commerce, so four things in Prepare this store get no live run** (owner,
  2026-10-12): creating the two attributes, the shared catalog per company, the price scope
  switch, and a full prepare-then-undo of all seven steps. Justrite already has each of them,
  so the steps read Done and are skipped. Tests cover them; the first real run will be an SC's.
  A second Commerce, even for an hour, would close this. Row 4.19 is the one piece Justrite
  can still prove, and it costs a disabled warehouse left behind.
- **Section 2's scratch project never gets an ERP integration**, for the same reason. The
  wizard's ERP naming fix (row 2.4) is seen in the wizard and proven after creation by tests.

## Not on this list, and why

- **The rest of the file-split checks.** In each one the code was moved, not changed, and the
  tests prove the move. Left out: the
  prerequisites install progress, the Quick Edit commits, the product page pre-publish log,
  Repair Site Configuration, Manage Site Access after an edit, Import Storefront Zip, Export Demo
  Bundle, the Manage APIs dialog, the repository picker's not-ready cases, the storefront setup
  failure screen, creating Adobe projects and workspaces (renaming a title is row 2.12), deleting an Adobe project
  that has event providers, applying a component update and its rollback, and deleting a project
  with neither box ticked. Several rows in sections 1 to 3 pass through the same code anyway.
- **`set_commerce_config` through the agent.** It is the same read-first, write-what-differs
  path the card's settings steps use, and it was proven live on Justrite on 2026-10-10
  (`sales/totals_sort/tax` 40 to 41 and back). Rows 4.15 and 4.19 cover the path [AB-77].
- **The PayPal sandbox connection, the two order statuses, and moving stock to the new
  warehouse.** Prepare this store leaves all three by hand: Commerce has no write route for an
  order status, and moving quantities is a per-product decision the feature does not offer.
  The preview says so on each step; row 4.13 reads it [AB-77].
- **A data import, and removing an ERP integration from a project.** Both would write to
  Justrite's Commerce from the scratch project. Rows 3.9 and 7.3 say what was left out.
- **Assign products through the agent tool.** Proven live on Justrite on 2026-10-09, with an
  undo. Rows 4.5 and 4.6 test the screen, which was not.
- **The first ownership pass** (a fill that says "Kukla ERP owns no products yet"). Passed live
  on 2026-10-09.
- **An order refused because two ERPs claim a product.** Setting it up means giving two ERPs
  the same product on a live store. Tests only.
- **The DA.live token's move out of the old storage.** It runs once per machine and has already
  run on yours if row 1.1 passes. Tests cover the rest.
- **Reset from Your Projects** (a notification instead of a window) and **the datapack question
  inside a reset**. Same code as row 3.7; tests cover the difference.
- **The rest of the test-writing run's commits.** They add tests and change nothing an SC
  would see. Row 2.4 is the one exception found so far.
- **The test-writing work itself and the clone clean-up notes "for the owner".** Nothing to
  click. A green gate is the proof [PL-70, PL-69]. *The Node 24 move is no longer here: it
  reinstalls components at startup and moves where the AI tools start from, so rows 1.12 and
  6.6 check it [PR-1a].*
- **Changing the datapack in Edit.** It imports into Justrite's Commerce from the scratch
  project. Tests cover it [PL-75].
- **Removing the ERP integration undoes its Commerce writes** (credit limits, blocks, ERP order
  numbers). It would remove Justrite's install. Tests only.
- **Edit's switches for the repository or site, the Adobe org, the backend and the stack**
  (EDS-42, PL-77, PL-78, PL-79). Filed, not built.
- **Saving a storefront block as a library** (EDS-43). Designed, not built; after this release.

# Part 2. Still open from the 2026-10-04 plan

**65 rows, carried over word for word. 11 already have a result. 17 are starred.** Not
part of the two hours above. The old plan put itself at about 3 hours in full, and most of it
is here. The rows are here because this file is now the newest plan, and `readiness` reads only
the newest.
The 14 rows of the old plan that a row in Part 1 now covers were left behind. "Today" in a row
means 2026-10-04.

**Opening Demo Builder and the AI tools**

| | Do this | Expect | Result |
|---|---|---|---|
| ★ | Sidebar → Chat → **Pick an earlier chat** | Claude Code opens its own list of past chats in a new tab [AI-4b] | pass (2026-10-06) |
| ★ | With **AI Assistant → Engine** (`demoBuilder.ai.engine`) left at its default (Copilot in VS Code), Sidebar → **Chat**, ask "list my projects" | VS Code's chat panel opens in agent mode and answers from the demo-builder tools; no terminal opens [AI-12] | pass (2026-10-06) |
| ★ | From the dashboard's **Prompts**, pick any prompt | It is sent in VS Code's chat panel and runs [AI-12] | Pass 2026-10-06: sent with the active-project preamble; 3 tool steps, answered "justrite (active)" |
| | With Engine at Copilot in VS Code, look at the sidebar's **Chat**; then set Engine to Claude Code | A plain button (no menu) that opens the panel; with Claude Code it becomes the Continue / Pick earlier / New menu, without a reload [AI-12] |  |
| | In a terminal at the projects root, run `copilot` yourself and type `/mcp` | demo-builder is listed (trust the folder when asked) — Copilot CLI is no Chat choice, but its tools still work [AI-12] |  |
| | Set **AI Assistant → Permissions** to Auto, then Full access, and start Claude Code | The terminal's command line carries `--permission-mode auto` / `--dangerously-skip-permissions` [AI-12] |  |
| | On a scratch project, ask Copilot in the panel to delete it | Demo Builder asks once in the chat, naming the project; declining changes nothing [AI-12] |  |
| | On a machine (or user) without Claude Code, set **Engine** to Claude Code | A warning appears at once, "Claude Code (the command-line tool) is not installed…"; **Use Copilot in VS Code** sets Engine back to the default [AI-12] |  |
| | On a machine (or user) without Claude Code, click **Open in Claude Code** | A message says it isn't installed and points at Copilot in VS Code (no install button); the AI badge isn't green [AI-4a] |  |

**Your Projects**

| | Do this | Expect | Result |
|---|---|---|---|
| ★ | Look at Your Projects in grid view and list view | No header "New" button. A dashed **New project** card is last; it opens New / Copy from existing / Import from file. It hides while you filter [PL-62] | Pass 2026-10-06: dashed card last, menu offers all three, hidden while filtering |
| ★ | **Export** Justrite | The file is named `justrite.project.demo-builder.json`. Open it: no passwords, keys or tokens anywhere [PL-56c] | Pass 2026-10-06: right name; only endpoints, store codes and Adobe ids — no secrets. Notice now names the path with Open File / Reveal in Finder |
| ★ | **Import from file** using that export (into a new name) | It asks you to sign in to GitHub and DA.live like a new project does. It gets its own repository. Integrations, datapack, store setup and settings all come back [PL-56d] |  |
| | **Copy from existing** on Justrite. **Stop before Finish** (added 2026-10-14): the copy carries the ERP integration, and finishing would install it on Justrite's Commerce a second time | The wizard opens with Justrite's choices, datapack and store structure, no credentials, and a new repository [PL-56e] |  |
| | ~~**Edit** a project~~ Replaced 2026-10-14 by Part 1 rows 3.15 to 3.18: Edit now locks the name, Commerce settings and libraries, and no longer pre-selects the demo's datapack | See those rows | replaced |
| | Delete the scratch copy | It's gone, and its stored secrets go with it [PL-64] |  |

**Creating a project: storefront**

| | Do this | Expect | Result |
|---|---|---|---|
| | Create a new repository in the Storefront area | The new repository becomes the selected one; the Code Sync notice sits centred [EDS-18, EDS-19] |  |
| | Pick an **empty repository an organization made for you** | Setup writes a first commit, applies the template and finishes [EDS-17 — *built, not yet tried live*] |  |
| | Trigger a GitHub organization refusal (single sign-on not authorized, or an org that hasn't approved the app) | A plain message saying what to do, not "Access denied" [EDS-17] |  |
| ★ | **Add a demo** by link to a colleague's storefront (e.g. `sayurihanki/aistore`) | It shows "Built on Adobe's Commerce boilerplate …", warns if older than 6.0.0, and says whether you can read their DA.live site, and who must grant access if not [EDS-13, EDS-22] |  |
| | Zip or share a storefront that has a `.env` file in it | The `.env` file is never in the zip, the shared bundle or the sync [security fix] |  |

**The project dashboard**

| | Do this | Expect | Result |
|---|---|---|---|
| ★ | Run the **Storefront Report** on a storefront forked from our template | It says what it's built on and which fixes fit. If the template has newer code, it offers to bring it in, and the default is No [EDS-13f] |  |

**Category and product pages (Edge Delivery storefronts)**

| | Do this | Expect | Result |
|---|---|---|---|
| | Before creating, hand-build a page for one category at another address (a product list block naming it) | No second page is written; the menu links to your page and the summary says so [EDS-24 — *not yet run live*] |  |
| | Edit one Demo Builder category page in DA.live, then **Republish** | Your edit survives [EDS-24] |  |
| | **Reset** the scratch project | The nav and the unedited category pages come back exactly; edited pages are left alone [EDS-24] |  |
| ★ | With the project open, add a category in Commerce Admin set to "Include in Menu" (wait a few minutes) | A notice names it and offers **Add pages** or **Always add for this project**. **Add pages** writes and publishes it [EDS-27 — *notice not yet seen live*] |  |
| | Turn on `demoBuilder.categoryPages.autoAdd` and add another category | Its page is added and published without asking, then a notice says what was added, with **Stop for this project** [EDS-27 — *not yet seen live*] |  |
| | Ask the agent "Are any categories missing pages? Add them." | It lists them, then asks before adding. It can't turn the automatic setting on [EDS-27 — *proven on Justrite*] |  |
| | Reset or delete a project whose storefront repository another project on this machine also uses | It refuses and names the other project [EDS-26] |  |
| | Command palette → **Manage DA.live Sites**, delete a throwaway site | The confirmation says its pages come off the live site. Afterwards its aem.live pages answer 404; if any couldn't be unpublished, the message names the site [EDS-31 — *not yet run live*] |  |

**App Builder integrations (scratch project)**

| | Do this | Expect | Result |
|---|---|---|---|
| ★ | Add the blank starter app, name it, then use **Save to GitHub** on its card | It asks first (public repository, file count). One commit lands on GitHub, with no `.env`, `node_modules` or `dist`. Then **Delete its GitHub repository** undoes it, and the app is a starter again [AB-1c — *first real run*] |  |
| | Add any integration | It gets its own Adobe workspace, and no Stage workspace is created [AB-23, AB-24]. *Also covered by Part 1 rows 2.11 and 4.20* |  |
| | Open an integration's **Settings** from its tile | Settings are edited there, not on Configure Project; saving redeploys [AB-21] |  |
| | Read the integration's detail panel, then **Remove** it | The panel explains the optional App Management listing. Remove warns the listing stays until unassociated in Commerce Admin, and reports anything left behind [AB-11, AB-12, AB-33] |  |
| | (If you can) use a project where you aren't a developer on the Commerce product profile | A plain explanation of who can fix it, not a raw Adobe error [AB-18] |  |
| | After redeploying the ERP integration, ask the agent to list the workspace's Runtime triggers | No `erp-prices-hourly-timer` or other timer left from an earlier deploy [AB-58] |  |

**The ERP pair (scratch project, or Justrite after a reset)**

| | Do this | Expect | Result |
|---|---|---|---|
| ★ | **Add the ERP integration** and type an ERP name | The first ERP is named what you typed. It can't be renamed later, by design [AB-16o, AB-67] | skip: one Commerce (2026-10-12). Row 2.4 checks the name in the wizard; tests cover the rest |
| ★ | **Add another ERP** on its card | *Replaced by Part 1 rows 4.2 and 4.3.* The warehouse choice was removed and owning by product attribute is now the default | See those rows | replaced |
| | In the ERP, open the **user menu → Appearance**, then **Settings** | Appearance has a live preview of theme, logo and navigation style; Settings is a form an ERP user edits. *Simulate downtime moved from the ERP's Settings to its card (row 4.23); the rest is not re-checked* [AB-59] |  |

**Running the demo: order to cash, on Justrite**

| | Do this | Expect | Result |
|---|---|---|---|
| ★ | In each ERP, confirm, ship and invoice its part | Commerce shows the shipments and invoices. Each ERP's on-hand stock drops by what it shipped [AB-26g, AB-63] |  |
| | Ship or invoice from **Commerce Admin** instead | The change reaches the right ERP [AB-26g] |  |
| | Order with a cart price rule | Each ERP line shows its discount, carried through the invoice, return and credit memo [AB-16l] |  |
| ★ | Create a return in Commerce Admin for both lines | Each ERP gets a return for its line; receiving it and posting a credit memo gives Commerce a credit memo for just those lines, and the return closes [AB-16e, AB-26r] |  |
| | **Repeat order** in the ERP | A new order with the same lines [AB-26r] |  |
| | Rename a product in the ERP twice within 20 seconds | The second edit sticks [AB-62] |  |
| ★ | At **1280 pixels wide**, go through Pricing, Sales Orders, an order with open lines, Customers and Settings | No button is cut off. Remove, Edit and Close are first in their rows. Settings is one column [today's fix] |  |
| | Drag a few column edges in any ERP grid | Text and number columns resize [grid audit] |  |
| | Follow the order's progress strip on an order with a return | All stages fit at 1280 with no sideways scroll [today's fix] |  |

**Using an agent (in a project's Claude Code chat)**

| | Ask the agent | Expect | Result |
|---|---|---|---|
| ★ | "Edit the home page headline and publish it" | It asks before writing, and again before publishing [write_page] |  |
| | "Copy the Justrite project as justrite-copy" | A new project with no credentials [PL-56f] | skip unless the copy can leave the ERP integration out: it would install on Justrite's Commerce a second time (added 2026-10-14) |
| | "Create a project for the Justrite website and store view" | The store scope is set, so the right products show [AI-11] |  |
| ★ | "Add the ERP integration; call the ERP Brand B ERP" (scratch project) | The first ERP is named Brand B ERP. The agent asks you for the name first, because it can't change later [AB-67] | skip: one Commerce (2026-10-12) |
| | Give it a short catalog brief (scratch store) | It shows a plan before writing, works in a safe order, checks shoppers can see the result, and lists how to undo it [AI-10 — *first real run*] |  |
| | "Why did the last deploy fail?" | It reads Runtime activations, including the App Management installer's runs [AB-31, AB-32] |  |
| | "List this project's event setups and remove the unused one" | It lists them and asks before removing [AB-6] |  |
| | "Add the blank starter app; call it Test App" (scratch project) | Its answer calls it Test App, not the catalog name [AB-34] |  |
| | "Does the ERP have a record for SKU NOT-A-REAL-SKU?" | A plain answer that Commerce doesn't have that product, not a 500 error [AB-54] |  |
| | "Show the Accuform ERP's settings, then set its sales organization for one website" (on Justrite now, since the scratch project has no ERP; set it back afterwards) | It reads both settings, asks before the write, and the Admin page's Settings tab shows the same value [AB-16j] |  |
| | "Delete the test customer you just created" (scratch store) | A consent dialog before anything is deleted; the customer is gone afterwards [AB-29] |  |

**Nothing to click: the gate is the proof**

| | What | Proof | Result |
|---|---|---|---|
| | Test and enforcer fixes | The suites that pin them are green [PL-35, PL-36, PL-51, PL-63, PL-67] | gate |
| | Dead handshake field removed; every AI-bundle writer goes through the hash-and-skip seam | `ai-bundle-coherence.test.ts` reads every writer [PL-37, PL-58] | gate |
| | A component update carries a renamed environment variable | `envMerge` tests; no shipped component has renamed one yet [PL-24] | gate |
| | The wizard's two config warnings reach Debug Logs | Only a hand-edited project file triggers them; `wizardHelpers` tests pin the sink [PL-65] | gate |
| | Moving projects feature page | `docs/systems/moving-projects.md`, pinned by `cited-identifiers.test.ts` [PL-56g] | gate |
| | ERP research the programme was built on | The findings are the deliverable; AB-26 used them [AB-26a, AB-26x] | gate |
| | A mutation widen refuses a module with too many importers, or mixed test environments | `scripts/focusModule.selftest.mjs`, run by `tests/scripts/focusModule.test.ts` [PL-71] | gate |
| | The hooks: the jest-concurrent proof cannot collide with a real pid; a shell edit after `cd` is checked in the folder it writes | `tests/hooks/rule-proofs.test.ts` runs `15-jest-concurrent.proof.sh` and `writtenPaths.probe.py` [PL-74, PL-83] | gate |
| | Storefront warnings travel one route; an empty block palette is said on the completion screen | The storefront setup, reset and `edsPipeline` suites. DA.live's documentation says the palette reads blocks only through the site config's library tab, so a failed registration cannot be made on a live site without breaking it [EDS-55, EDS-38] | gate |
| | The patches release keeps up with the drift gate | `npm run patches:released` on 2026-10-20: "main is released as v1.1.1"; the watchdog runs daily [EDS-48] | gate |
| | The real-VS-Code UI tests | Run `npm run test:ui` and say whether it passes [PL-66] |  |

**Known gaps as of 2026-10-04: do not report these as bugs** (not re-checked since)

- One ERP heading ("Amount") is still cut at 1280 on an order line that has both a discount and
  quantity left to close. The button still shows. Fixing it needs a column removed (your call).
- **Guest prices on Justrite show $0.00.** Signed-in company buyers see prices; guests and the
  General group get none, while a request with no group gets list prices. Under investigation, not
  caused by the page work.
- **Signed-out visitors can't open product pages on Justrite** (they land on Not Found). Commerce's
  `products(skus:)` returns nothing for the guest group while search works — the same catalog bug as
  the $0.00 prices, reported to the product team. Signed-in buyers are fine.
- An expired DA.live sign-in can read as "no publishable pages" on Republish, and as still signed
  in [EDS-29, EDS-30, filed].
- Optimizer support (PL-60) and app-only projects (AB-1b) are designs only.
- The card payment path (AB-26s card half) needs a card payment method on Justrite first.
