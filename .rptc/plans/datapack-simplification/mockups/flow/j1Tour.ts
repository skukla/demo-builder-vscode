/**
 * J1 as a guided tour (owner, 2026-11-11: "click through the journey and be guided through it rather
 * than have to click through a panel"). Each stop points at one place in the product, says what to do
 * there, and shows what was decided about it. The owner does the action in the product itself and the
 * tour moves on; nothing asks for the tour's own Next.
 *
 * What a stop says it decided is never written here: `decided` names lines of the steps' `decided`
 * lists in reviewSteps.ts, so the tour and the step list cannot say different things.
 */

import type { CommerceState, DemoUses } from './scenarioInstall';
import type { RestoreCommerce, SaveVariant } from './scenarioSave';
import type { UninstallEnding } from './scenarioUninstall';
import type { RetryEnding } from './scenarioFailed';
import type { J6View } from './j6-screen';
import type { J8View } from './j8-flyout';

/** Where in the product a stop points or waits for a press. Resolved to elements by Tour.tsx. */
export type TourTarget =
    | 'clear-menu'
    | 'menu-clear-demo-data'
    | 'menu-clear-instance'
    | 'summary-table'
    | 'review-records'
    | 'type-rail'
    | 'rail-categories'
    | 'rail-customers'
    | 'rail-orders'
    | 'tree'
    | 'kept-tab'
    | 'first-tab'
    | 'record-rows'
    | 'back'
    | 'clear-items'
    | 'problem-row'
    | 'close'
    | 'website-list'
    | 'select-all'
    | 'next'
    | 'warning'
    | 'understand'
    | 'clear-websites'
    // J2 (j2Tour.ts)
    | 'my-luma-card'
    | 'bodea-card'
    | 'flyout'
    | 'flyout-install'
    | 'flyout-close'
    | 'installed-result'
    | 'dry-run'
    | 'dry-result'
    | 'install'
    | 'save-and-replace'
    | 'run-steps'
    | 'replace'
    // J3 (j3Tour.ts)
    | 'save-menu'
    | 'menu-save'
    | 'menu-save-as-new'
    | 'save-as-new'
    | 'create-datapack'
    | 'save'
    | 'create'
    | 'name-field'
    | 'picker'
    | 'select-all-data'
    | 'flyout-more'
    | 'menu-undo'
    | 'undo-question'
    | 'undo'
    | 'cancel'
    | 'done-result'
    // J4 (j4Tour.ts)
    | 'amber-dot'
    | 'flyout-restore'
    | 'restore-question'
    | 'restore'
    | 'restore-result'
    // J5 (j5Tour.ts)
    | 'menu-uninstall'
    | 'uninstall-question'
    | 'uninstall'
    | 'save-and-uninstall'
    | 'run-background'
    | 'uninstall-result'
    | 'notification'
    | 'open-debug-logs'
    // J6 (j6Tour.ts)
    | 'flyout-health'
    | 'flyout-retry'
    | 'flyout-fix'
    | 'retry'
    | 'fix-with-ai'
    | 'dashboard-datapacks'
    // J7 (j7Tour.ts)
    | 'project-menu'
    | 'menu-reset'
    | 'menu-delete'
    | 'batch-question'
    | 'save-and-reset'
    | 'run-reset'
    | 'batch-run'
    | 'batch-result'
    | 'reset-selected'
    // J8 (j8Tour.ts)
    | 'j8-header'
    | 'install-from-file'
    | 'card-tag'
    | 'more-menu'
    | 'menu-delete-datapack'
    | 'delete-question'
    | 'menu-save-file'
    | 'add-from-file';

export interface TourStop {
    /** What to look at: the highlight and the callout sit beside it. */
    point: TourTarget;
    /** What to press to move on; absent (and no `onGone`) means the last stop, which ends with Finish. */
    press?: TourTarget;
    /**
     * Also move on by itself once `point`, seen on screen, has gone: a result that closes itself, or
     * a run window that hands off to its small result.
     */
    onGone?: true;
    /** What Commerce holds from this stop on (J2): the tour sets the panel's select, the owner does not. */
    commerce?: CommerceState;
    /** Which datapack the demo uses from this stop on (J2), set the same way. */
    demo?: DemoUses;
    /** Which save the header's button opens from this stop on (J3), set in the panel the same way. */
    saveVariant?: SaveVariant;
    /** What Commerce holds against the last save from this stop on (J4), set in the panel the same way. */
    restore?: RestoreCommerce;
    /** How the uninstall run ends from this stop on (J5), set in the panel the same way. */
    uninstallEnds?: UninstallEnding;
    /** How a retry of the failed install ends from this stop on (J6), set in the panel the same way. */
    retryEnds?: RetryEnding;
    /** Which J6 screen shows from this stop on: the project's Datapacks or its dashboard. */
    j6View?: J6View;
    /** Which J8 screen shows from this stop on: a project's Datapacks or the Datapack Library. */
    j8View?: J8View;
    /** What to do, in a few words: "Click Clear." */
    say: string;
    /** Lines of reviewSteps.ts steps' `decided` lists that this stop shows: [step id, line indexes]. */
    decided?: Array<[string, number[]]>;
}

export const J1_TOUR: TourStop[] = [
    { point: 'clear-menu', press: 'clear-menu', say: 'Click Clear.', decided: [['J1-1', [0]]] },
    { point: 'menu-clear-demo-data', press: 'menu-clear-demo-data', say: 'Choose Clear Demo Data.' },
    { point: 'summary-table', press: 'review-records', say: 'This is the summary the SC decides on. Press Review Records to check what goes.', decided: [['J1-2', [0, 1, 2]]] },
    { point: 'type-rail', press: 'rail-categories', say: 'The spot check. Click Categories.', decided: [['J1-3a', [0]], ['J1-3c', [0]]] },
    { point: 'tree', press: 'rail-customers', say: 'Categories show as a tree. Now click Customers.', decided: [['J1-3a', [1]]] },
    { point: 'kept-tab', press: 'kept-tab', say: 'Customers has a dot: some of them stay. Press Kept.', decided: [['J1-3b', [0, 1]]] },
    { point: 'record-rows', press: 'rail-orders', say: 'What stays. Now click Orders.', decided: [['J1-3b', [2, 3, 4]]] },
    { point: 'first-tab', press: 'back', say: 'Orders are closed, never removed. Press Back to the summary.', decided: [['J1-3b', [5]]] },
    { point: 'clear-items', press: 'clear-items', say: 'The decision is made here. Press Clear 2,126 Items.', decided: [['J1-2', [3]]] },
    { point: 'problem-row', press: 'close', say: 'The clear ran. One setting could not be reset. Press Close.', decided: [['J1-3d', [0, 1, 2]]] },
    { point: 'clear-menu', press: 'clear-menu', say: 'Now the whole instance. Click Clear.' },
    { point: 'menu-clear-instance', press: 'menu-clear-instance', say: 'Choose Clear Commerce Instance.' },
    { point: 'website-list', press: 'select-all', say: 'Choose the websites to clear. Press Select All.', decided: [['J1-4', [0]]] },
    { point: 'next', press: 'next', say: 'Press Next.' },
    { point: 'warning', press: 'understand', say: 'The same summary, with a warning. Tick I understand.', decided: [['J1-5', [0]]] },
    { point: 'clear-websites', say: 'That is the end of J1: Clear 3 Websites would run it.', decided: [['J1-5', [1]]] },
];
