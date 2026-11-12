/**
 * Every journey's review steps: the ONE list. The prototype panel's step switcher reads it, and
 * `gen-journeys.mjs` writes `journeys.md` from it, so the two cannot drift apart (they did once:
 * a step added here and not there sent the owner to the wrong step with Next, 2026-11-11).
 *
 * A step with a `window` is built and can be opened; one without is planned and is listed so the
 * owner sees where the walk goes.
 */

import type { TypeSpread } from './scenarioClear';

/** Which window a step opens, and how it starts. */
export type StepWindow =
    | 'none'
    | 'project'
    | 'project-records'
    | 'project-result'
    | 'instance'
    | 'instance-review'
    | 'instance-records'
    // J2: the install window, at the step each review step shows (j2-windows.tsx).
    | 'install-changes'
    | 'install-run'
    | 'replace'
    | 'dry-run'
    // J3: the save, create and undo windows (j3-windows.tsx).
    | 'save'
    | 'create'
    | 'undo'
    // J4: the screen with the amber dot, and the Restore window at each step (j4-windows.tsx).
    | 'restore-dot'
    | 'restore-same'
    | 'restore'
    | 'restore-run'
    // J5: the Uninstall window at each step, and its run sent to the background (j5-windows.tsx).
    | 'uninstall'
    | 'uninstall-run'
    | 'background-success'
    | 'background-failure'
    // J6: the failed install on the card, in the flyout, after retries, and on the dashboard (j6-screen.tsx).
    | 'failed-card'
    | 'failed-flyout'
    | 'failed-fix'
    | 'failed-dashboard'
    // J7: the product's batch window behind reset and delete (j7-screen.tsx).
    | 'reset-one'
    | 'reset-several'
    | 'delete-one'
    // J8: the Datapacks screen itself (j8-screen.tsx); each shows the screen, none opens a window.
    | 'header'
    | 'card-tags'
    | 'flyout-menu';

export interface ReviewStep {
    id: string;
    /** A few words naming the step, shown beside its id: "The Result". */
    title: string;
    /** What to do, as the owner reads it. */
    action: string;
    /** The one question. */
    question: string;
    /**
     * What the review settled, as it stands now: short statements of the end state, never the
     * history (the verdict log keeps that). Shown first in the decisions panel.
     */
    decided?: string[];
    /** The window it opens; absent until the step is built. */
    window?: StepWindow;
    /** For a spot check: the type it opens at. */
    records?: string;
    /** Which types the spot check lists; absent lists the data's own. */
    spread?: TypeSpread;
}

export interface ReviewJourney {
    id: string;
    name: string;
    /** What the SC is doing, for the guide's table. */
    summary: string;
    /** Where in overview.md the journey's decisions come from. */
    plan: string;
    steps: ReviewStep[];
}

export const JOURNEYS: ReviewJourney[] = [
    {
        id: 'J1',
        name: 'Clearing Data',
        summary: 'Clearing data (the window conventions are judged on these windows)',
        plan: 'Phase 6 item 3; Phase 1b',
        steps: [
            { id: 'J1-1', decided: ['Clear is a menu with two items: Clear Demo Data and Clear Commerce Instance.'], title: 'The Clear Menu', action: 'Click Clear under "Datapacks".', question: 'Two choices: Clear Demo Data, Clear Commerce Instance. Are the names right?', window: 'none' },
            { id: 'J1-2', decided: ['The window opens on a summary: one line per data type, its count and what happens (removed, set back to the default value, closed).', 'No grey detail, no names, no \"with their …\" phrases. Each record counts under its own type; a shared catalog\'s customer group counts under Customer Groups.', 'Type names are plain text. Review Records is the one way into the spot check.', 'The decision is made here: Clear N Items.'], title: 'The Summary', action: 'Clear Demo Data opens on the summary: one line per data type.', question: 'Is the summary enough to decide on?', window: 'project' },
            { id: 'J1-3a', decided: ['The spot check: types down the left with their counts; the chosen type\'s records on the right, with a filter.', 'Categories are an indented tree. Filtering keeps a match\'s parent categories, greyed.'], title: 'Categories as a Tree', action: 'The spot check at Categories, drawn as a tree. Try filtering, for example "gloves".', question: 'Can you see the category structure? Does a filtered match keep its place?', window: 'project-records', records: 'Categories' },
            { id: 'J1-3b', decided: ['Every type has Removed and Kept tabs (Closed and Kept for orders). Kept is greyed out when nothing of the type stays.', 'A type with kept records shows a notice dot after its count, and the same dot on its Kept tab.', 'Kept records list by name, like Removed. There is one reason things stay, another demo uses them, and the summary\'s lead says it.', 'Already-closed orders and protected settings are not listed: nothing to know or do.', 'The count shows once, in the left column. Column headers name the columns.', 'Every demo order ends Canceled or Closed, done in Commerce: cancel, else invoice and refund in full. The ERP is brought in line afterwards.'], title: 'What Stays', action: 'The spot check at Customers. A dot after its count means some are kept; switch to Kept. Then open Orders: Closed, with Kept greyed out.', question: 'Will an SC notice what stays, and does it hold up when the kept list is long?', window: 'project-records', records: 'Customers' },
            { id: 'J1-3c', decided: ['The left column holds all 11 types without growing; past that it scrolls inside itself.'], title: 'A Long Type List', action: 'Every type Clear knows (11). Then set "Data types" in this panel to "15 (more than fit)".', question: 'Does the left column hold all 11 without growing, and scroll inside itself past that?', window: 'project-records', records: 'Products', spread: 'all' },
            { id: 'J1-3d', decided: ['The run shows one row per type and keeps one height from the first frame to the last.', 'A problem sits on its row as one line. The fix is one footer button, Open Commerce Admin (the Admin home: the Admin has no deep links).', 'Payment review and a list setting Commerce cannot reset are reported here, not on the summary.'], title: 'The Result', action: 'What pressing Clear shows: the run, then how it ended. One setting could not be reset (a list Commerce cannot write back).', question: 'Does the result say what is left and lead the SC to the fix?', window: 'project-result' },
            { id: 'J1-4', decided: ['Clear Commerce Instance, step 1: the websites, unticked, with Select All. Each names the projects on this computer that use it.'], title: 'Choosing Websites', action: 'Clear Commerce Instance, step 1: tick websites.', question: 'Each website names the projects using it. Clear enough to choose?', window: 'instance' },
            { id: 'J1-5', decided: ['Step 2: the same summary, the warning \"N projects lose their demo data. This can\'t be undone.\", and an I understand box that enables Clear N Websites.', 'Back and Review Records sit at the footer\'s start.'], title: 'Confirming the Instance Clear', action: 'The summary with every website ticked: the warning, the "I understand" box. Try Review Records and Back.', question: 'Enough to stop a mistake?', window: 'instance-review' },
        ],
    },
    {
        id: 'J2',
        name: 'Installing a Datapack',
        summary: 'Installing a datapack the demo does not use, or replacing the one it uses',
        plan: 'Phase 3 (Save Your Changes First; locked types), Phase 4 (one run window, ending small), Phase 5 (flyout actions, Switch), D6 (Dry Run)',
        steps: [
            { id: 'J2-1', decided: ['The screen has no chosen state: clicking a card opens its flyout.', 'Install installs the whole datapack: no data-type checkboxes, since a partial install mixes data. No line says why anything is ticked or locked.', 'The window is Clear\'s summary: one row per type with its count ("Products 56"), nothing else; "53 added, 3 updated" only when some records already exist. Review Records opens the same spot check, read-only, with no tabs.'], title: 'The Changes', action: 'No datapack installed yet. Click Bodea, then Install in its flyout.', question: 'What Bodea adds, one row per type; Review Records for the records. Clear?', window: 'install-changes' },
            { id: 'J2-2', decided: ['Every long job runs in the same window and ends the same way. Install is drawn as steps.', 'A run ends small when it succeeded, has no warning, and no row has a problem or a note. A clean result that is its title alone closes itself after a glance.', 'A run with a problem keeps its steps. "Took …" shows only when the window stays open, and only for runs of a minute or more.', 'A failed run offers Retry while a retry can work, then Fix with AI.', 'Titles: "Installing Bodea" while it runs, "Bodea Installed" when done, "Couldn\'t Install Bodea" when it failed.'], title: 'The Install Run', action: 'Install runs. "Install ends" in this panel picks how it ends.', question: 'One run window with steps; a clean run ends on the small result. Right?', window: 'install-run' },
            { id: 'J2-3', decided: ['On the datapack the demo uses, the button reads Restore My Luma.', 'On Bodea the button reads Switch to Bodea, as My Luma is installed (owner, 2026-11-12: one datapack per project in beta.153, several in DI-15). "Switch to Bodea?", then the same table as Install, no line between of what Bodea adds, no checkboxes (button Switch; with changes Switch Without Saving / Save and Switch).', 'With unsaved changes, "Save Your Changes First?" follows as its own small window: the changes counted by type, no example names. No box: always saving is a setting only (owner, 2026-11-12).', 'No Always Save Changes box (owner, 2026-11-12: "It feels like clutter to me."): it is the setting demoBuilder.dataInstaller.changesOnRemoval only. The first save question answered shows a one-time VS Code notification, "Tip: You can customize saving changes in Settings → Demo Builder", with Open Settings, as delete\'s tip does.', 'The run\'s stages: Uninstalling from Commerce, Installing Bodea.', 'Installed is the blue check and blue border, nothing else. The check moves after the replace.'], title: 'Replacing a Pack', action: 'The demo uses My Luma. Click Bodea, then Install. "Commerce holds" in this panel adds unsaved changes.', question: '"Switch to Bodea?" with what Bodea adds; with unsaved changes, "Save Your Changes First?" next; then the run. Right?', window: 'replace' },
            { id: 'J2-4', decided: ['Dry Run keeps its name. Its results: "Dry Run Passed", "Dry Run Found a Problem", "Dry Run Failed".', 'The result names the datapack and says nothing was written. A pass offers Install.', 'Found a Problem (amber): Close, Back, Fix with AI. Failed (red, the check could not run): Close, Back, Retry.', 'The answer is its own small window; Back returns to the Install window.'], title: 'Dry Run', action: 'Dry Run in the J2-1 window. "Dry Run result" in this panel picks the answer.', question: 'Passed, Found a Problem (Fix with AI), Failed (Retry). Right?', window: 'dry-run' },
        ],
    },
    {
        id: 'J3',
        name: 'Saving, Creating, Undoing',
        summary: 'Saving changes, creating a datapack, undoing the last save',
        plan: 'Phase 2 (versions the SC never manages), Phase 5 (Save Changes says what it saved), Phase 7b (Create Datapack)',
        steps: [
            { id: 'J3-1', decided: ['Saving lives in the header only. On your own datapack it is a menu button, Save ▾, with Save and Save As New; on someone else\'s, a plain Save As New. The flyout has no Save.', '"Save Changes to My Luma": what My Luma will hold, one row per type, read-only. A type with changes adds how many ("2,046, 4 changed"). No line above the table.', 'Review Records opens the same spot check, with Back only.', 'Cancel and Save, then the run: Export from Commerce, its data types under it ("Exporting 19 of 38"), then Save My Luma as one row. Then "Saved to My Luma", which closes itself.', 'Save As New: "Save As New Datapack" with one field, Datapack Name, and Cancel and Save. No line. The name starts empty from your datapack, and "My Bodea" from Bodea. Then "Saving Luma Holiday" and "Saved as Luma Holiday".', 'A refused name shows under the field, in room kept for it: "Give it a name." or "You already have a datapack named My Luma."'], title: 'Save Changes', action: 'The demo uses My Luma. Press Save in the header, then Save. "Save (J3-1)" in this panel opens Save As New, from your datapack or from Bodea.', question: 'Save shows what My Luma will hold, then "Saved to My Luma"; Save As New asks only a name. Right?', window: 'save' },
            { id: 'J3-2', decided: ['With no datapack of yours yet, the header reads Create Datapack.', 'Two windows, both titled "Create Datapack". First what it holds: Select All Data and each kind on the left, the shown kind\'s items on the right, everything ticked; Cancel and Next.', 'A kind\'s count on the left is what the datapack will hold: "48", or "12 of 48" when some are unticked. It shows once, there.', 'Then the name, small: Datapack Name; Back, Cancel and Create. Next waits until something is ticked.', 'The run, then "Created My Luma", which closes itself. The demo then uses My Luma, and the header reads Save ▾.'], title: 'Create Datapack', action: 'No datapack of yours yet. Press Create Datapack in the header.', question: 'What it holds first, then the name with Create. Right?', window: 'create' },
            { id: 'J3-3', decided: ['Undo Last Save is in the More menu of the datapack the demo uses, shown only when there is a save to go back to.', '"Undo Last Save?": "Commerce goes back to My Luma as it was before your last save. Anything you changed since is lost." Cancel, and Undo in the standard blue. No "Save Your Changes First?" on this path.', 'The run is Install\'s: Uninstall My Luma, Install My Luma, Verify Installation, titled "Restoring My Luma".', 'It ends on "Last Save Undone", which closes itself.'], title: 'Undo Last Save', action: 'The demo uses My Luma. Click My Luma, then More, then Undo Last Save.', question: '"Undo Last Save?", then Commerce goes back through the same run window. Right?', window: 'undo' },
        ],
    },
    {
        id: 'J4',
        name: 'Restoring',
        summary: 'Restoring the demo to the last save',
        plan: 'Phase 5 (Restore label, amber dot, the Restore question), Phase 3 (nothing to do ends at the check)',
        steps: [
            { id: 'J4-1', decided: ['The card of the datapack the demo uses shows the house\'s amber notice dot beside its date while My Luma has a save newer than what this demo installed.', 'Its hover: "Newer save available".', 'On that datapack the flyout\'s main button reads Restore My Luma, in place of Install.'], title: 'The Amber Dot', action: 'The demo uses My Luma. Hover the amber dot on its card, then click the card.', question: '"Newer save available". Clear?', window: 'restore-dot' },
            { id: 'J4-2', decided: ['Restore My Luma first checks for your changes, in Install\'s check window and wait.', 'When Commerce already matches the last save, it ends there on "My Luma Is Up to Date", which closes itself. No question, no form, no run.'], title: 'Nothing to Change', action: 'Restore My Luma when Commerce already matches the last save. "Commerce (J4)" in this panel picks what Commerce holds.', question: 'The check, then "My Luma Is Up to Date", closing itself. Right?', window: 'restore-same' },
            { id: 'J4-3', decided: ['When you have unsaved edits, "Restore My Luma?" asks in its own small window: "Commerce goes back to My Luma as you last saved it. Anything you changed since is lost."', 'Cancel, and Restore in the standard blue. No Save Changes First: once saved, there is nothing to restore; keeping changes is the header\'s Save.', 'A newer save alone (the amber dot) asks nothing: nothing of yours is lost, so the run starts after the check.'], title: 'Restore', action: 'Restore My Luma with "Commerce (J4)" on Unsaved edits, then on Newer save.', question: '"Restore My Luma?" / "Commerce goes back to My Luma as you last saved it. Anything you changed since is lost.", Cancel / Restore. Right?', window: 'restore' },
            { id: 'J4-4', decided: ['The run is Undo Last Save\'s: Uninstall My Luma, Install My Luma, Verify Installation, titled "Restoring My Luma", one height from the first frame.', 'It ends on the small result, which closes itself. Its title: "My Luma Restored".'], title: 'The Restore Run', action: 'Restore runs.', question: 'Run window, then the result. Right?', window: 'restore-run' },
        ],
    },
    {
        id: 'J5',
        name: 'Uninstalling and Long Jobs',
        summary: 'Uninstalling, and a long job run in the background',
        plan: 'Phase 4',
        steps: [
            { id: 'J5-1', decided: ['Uninstall is in the More menu of the datapack the demo uses.', 'It first checks for your changes, in Install\'s check window and wait. Then "Uninstall My Luma?" with the same table as Install of what My Luma installed, no line. Cancel, and Uninstall in red: it deletes.', 'With unsaved changes, "Save Your Changes First?" follows as its own small window, as Switch\'s does: Uninstall Without Saving in outline at the start, then Cancel and Save and Uninstall, three on one line. No box.'], title: 'Uninstall', action: 'The demo uses My Luma. Click My Luma, then More, then Uninstall. "Commerce holds" in this panel adds unsaved changes.', question: '"Uninstall My Luma?" with what goes; with unsaved changes, "Save Your Changes First?" next, three buttons on one line. Right?', window: 'uninstall' },
            { id: 'J5-2', decided: ['Uninstall runs in Install\'s run window, drawn as steps: Save Your Changes when saving first, then Uninstall My Luma.', 'Titled "Uninstalling My Luma". It ends on the small result "My Luma Uninstalled", which closes itself, and My Luma\'s card loses its check.', 'A failed run keeps its steps, the problem on its row: "Couldn\'t Uninstall My Luma", with Retry.'], title: 'The Uninstall Run', action: 'Uninstall runs. "Uninstall ends (J5)" in this panel picks how it ends.', question: 'Drawn as steps, like Install. Right?', window: 'uninstall-run' },
            { id: 'J5-3', decided: ['While a run works, Run in Background stands where Cancel was. Pressing it closes the window and the job goes on.', 'When it succeeds, a VS Code notification says so in the result\'s own words, "Uninstalled My Luma". No button; it goes away by itself.'], title: 'Background Success', action: 'Uninstall runs. Press Run in Background.', question: 'Closes on its own, in the result\'s own words. Right?', window: 'background-success' },
            { id: 'J5-4', decided: ['When it fails, the notification stays until dismissed, in the result\'s own words, "Couldn\'t Uninstall My Luma", with one button, Open Debug Logs. No Show Details.', 'My Luma keeps its check: nothing was uninstalled.'], title: 'Background Failure', action: 'Uninstall runs with "Uninstall ends (J5)" on Fails. Press Run in Background.', question: 'A notification that stays, with one button. Right?', window: 'background-failure' },
        ],
    },
    {
        id: 'J6',
        name: 'A Failed Install',
        summary: 'An install that failed',
        plan: 'Phase 5 (error state as integration cards show one)',
        steps: [
            { id: 'J6-1', decided: ['A datapack whose install failed shows the integration card\'s status line under its name: the error dot and "Install failed", in the error colour.', 'No border change and no check: nothing was installed.'], title: 'The Card', action: 'My Luma\'s install failed when the project was created. Look at its card.', question: 'Error dot and "Install failed", no border change. Right?', window: 'failed-card' },
            { id: 'J6-2', decided: ['The flyout shows the same label under the title, and the reason under it, as the integration flyout does: "Commerce didn\'t answer in time".', 'Its one action is Retry, which runs the install again in Install\'s run window, "Installing My Luma".', 'A retry that works ends on "My Luma Installed", which closes itself, and the card gains its check. One that stops keeps its steps, the problem on its row: "Couldn\'t Install My Luma", with Retry.'], title: 'The Flyout', action: 'Click My Luma. Press Retry. "Retry ends (J6)" in this panel picks how it ends.', question: 'Why it failed, and Retry. Right?', window: 'failed-flyout' },
            { id: 'J6-3', decided: ['Once two retries have not helped, the stopped run\'s one action is Fix with AI, beside Close.', 'The flyout\'s action then reads Fix with AI in place of Retry.'], title: 'Fix with AI', action: 'Two retries have not helped. Close, then click My Luma.', question: 'Fix with AI. Right?', window: 'failed-fix' },
            { id: 'J6-4', decided: ['The dashboard\'s Datapacks card reads "My Luma", with the error dot beside its title. The dot\'s hover reads "Install failed". No reason in brackets.'], title: 'The Dashboard', action: 'The project dashboard. Hover the dot beside Datapacks; click the card to open the project\'s Datapacks.', question: '"My Luma" with the error dot, "Install failed" on hover. Right?', window: 'failed-dashboard' },
        ],
    },
    {
        id: 'J7',
        name: 'Resetting or Deleting a Project',
        summary: 'Resetting or deleting a project',
        plan: 'Phase 6',
        steps: [
            { id: 'J7-1', decided: ['Reset and delete use the product\'s approved batch window, unchanged. There is no Commerce radio (owner, 2026-11-12).', 'The lead: "Each project returns to how it was set up. Code changes are lost." Then a row per project, its repository under its name, and an Uninstall Datapack box naming its pack, ticked to start.', 'Cancel, and Reset 1 Project in red. The title counts the projects: "Reset 1 Project?".', 'The run is a row per project. A clean run ends on the small result "Projects Reset", with Close.'], title: 'Reset One Project', action: 'Open Kukla Luma\'s menu and choose Reset. It opens the batch window with one row (today the product asks a single reset in VS Code dialogs instead).', question: 'Should one project\'s Reset open the batch window with one row, as shown?', window: 'reset-one' },
            { id: 'J7-2', decided: ['Reset Selected: "Reset 3 Projects?", the same lead, one row per project. Luma Test has no datapack, so no box.', 'Uninstall Datapack is the column\'s header and its Select All.', 'The button is Reset 3 Projects. When the datapacks have changes, "Save Your Changes First?" follows, as for Switch and Uninstall: columns Datapack and Save As, a filled-in name field on every row: My Luma starts "My Luma" (saved into it; another name saves a new datapack), Bodea starts "My Bodea" ("My Bodea 2" when taken); a taken name shows its problem under the field and Save and Reset waits; Reset Without Saving, Cancel, Save and Reset. The Datapack Changes step is gone.', 'Resets run side by side. The run ends on "Projects Reset".'], title: 'Reset Several', action: 'Press Reset Selected. "Commerce holds" in this panel adds unsaved changes, so the save question follows.', question: '"Reset 3 Projects?", then "Save Your Changes First?" as for Switch and Uninstall. Right?', window: 'reset-several' },
            { id: 'J7-3', decided: ['Delete in a project\'s menu opens the same window: "Delete 1 Project?", after "Reading projects". Delete Selected asks the same over several.', 'The lead: "Project files are removed from this machine. Datapacks stay installed in Commerce unless you uninstall them."', 'A column per thing it may take: Delete Repository, Delete DA.live Site, Uninstall Datapack, each box naming what it deletes, unticked. Cancel, and Delete 1 Project in red.'], title: 'Delete a Project', action: 'Open Kukla Luma\'s menu and choose Delete. Delete Selected in the header opens it over all three.', question: 'The approved delete window, with one row. Right?', window: 'delete-one' },
        ],
    },
    {
        id: 'J8',
        name: 'The Datapacks Screen',
        summary: 'The Datapacks screen itself',
        plan: 'Phase 7',
        steps: [
            { id: 'J8-1', decided: ['The header, in order of how often an SC does each: the save button (Save ▾ on your datapack, Save As New on someone else\'s, Create with none, opening "Create Datapack"), Install from File, then Clear, set apart by a divider.', 'Install from File opens the same install window as a card\'s Install, after VS Code\'s file dialog.', 'The Datapack Library has Add from File alone: it has no store, so no save button and no Clear.'], title: 'The Header', action: 'Look at the header. "Datapacks screen (J8)" in this panel switches to the Datapack Library.', question: 'The save button (Create with none), Install from File (or Add from File in the library), Clear. Right?', window: 'header' },
            { id: 'J8-2', decided: ['Each card\'s tag sits on the date\'s line, one word: Mine on your own datapack, Demo Builder on the extension\'s.', 'One date format, absolute: "Saved Nov 10, 9:15 AM".'], title: 'A Card', action: 'Look at a card.', question: 'One-line tag, "Mine", one date format. Right?', window: 'card-tags' },
            { id: 'J8-3', decided: ['The bar: Install (Switch to Bodea when another datapack is installed), or Restore My Luma on the datapack the demo uses, then More.', 'More\'s first section: Save as File, Undo Last Save (on the datapack the demo uses), Share (on your own).', 'Its own section: Uninstall (on the datapack the demo uses), Delete (on your own). Delete Store Configuration is gone.', '"Delete My Luma?": "Permanently deletes it." No version is named, and there is no Version History (D3).', 'A Demo Builder datapack has no Delete, whoever opens it: its More holds Save as File alone.', 'In the Datapack Library the bar is More alone, with the same rows less those that act on the demo.'], title: 'The Flyout', action: 'My Luma\'s flyout is open. Press More. Then try Bodea, and the Datapack Library.', question: 'Save as File, Share; Uninstall and Delete in their own section, bare verbs. Right?', window: 'flyout-menu' },
        ],
    },
];

/** A step that can be opened. */
export type BuiltStep = ReviewStep & { window: StepWindow };

/** Every built step, in walk order: what Previous, Next and the self-check walk. */
export const STEPS: BuiltStep[] = JOURNEYS.flatMap((j) => j.steps.filter((s): s is BuiltStep => s.window !== undefined));
