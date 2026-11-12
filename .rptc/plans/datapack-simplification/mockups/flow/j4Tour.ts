/**
 * J4 as a guided tour, in the same shape as J3's (`j3Tour.ts`): each stop points at one place, says
 * what to do there, and names the lines of `reviewSteps.ts`'s `decided` lists it shows. What Commerce
 * holds against the last save changes between stops (`restore`), which the tour sets in the panel;
 * a restore or a save that leaves Commerce matching the last save sets it back by itself. A stop with
 * `onGone` moves on by itself when its window goes.
 *
 * The order: the dot (a newer save: the run starts without asking), the same button with nothing left
 * to do, then unsaved edits, which ask first.
 */

import type { TourStop } from './j1Tour';

export const J4_TOUR: TourStop[] = [
    { point: 'amber-dot', press: 'my-luma-card', demo: 'My Luma', restore: 'newer', say: 'The demo uses My Luma, and My Luma was saved again from elsewhere. Hover the amber dot, then click My Luma.', decided: [['J4-1', [0, 1]]] },
    { point: 'flyout', press: 'flyout-restore', say: 'The main button reads Restore My Luma. Press it.', decided: [['J4-1', [2]]] },
    { point: 'run-steps', onGone: true, press: 'close', say: 'Only a newer save, so nothing of yours is lost: after the check, the run starts without asking.', decided: [['J4-2', [0]], ['J4-3', [2]], ['J4-4', [0]]] },
    { point: 'restore-result', onGone: true, say: '"My Luma Restored", closing itself.', decided: [['J4-4', [1]]] },
    { point: 'my-luma-card', press: 'my-luma-card', say: 'Commerce now matches the last save, so the dot is gone. Click My Luma.' },
    { point: 'flyout', press: 'flyout-restore', say: 'Press Restore My Luma again.' },
    { point: 'restore-result', onGone: true, say: 'Nothing to change, so the check is the end: "My Luma Is Up to Date", closing itself.', decided: [['J4-2', [1]]] },
    { point: 'my-luma-card', press: 'my-luma-card', restore: 'edits', say: 'Now you have edited Commerce since your last save. Click My Luma.' },
    { point: 'flyout', press: 'flyout-restore', say: 'Press Restore My Luma.' },
    { point: 'restore-question', press: 'restore', say: 'Your edits would be lost, so it asks first. Press Restore.', decided: [['J4-3', [0, 1]]] },
    { point: 'run-steps', onGone: true, press: 'close', say: 'The same run.' },
    { point: 'restore-result', onGone: true, say: '"My Luma Restored". That is the end of J4.' },
];
