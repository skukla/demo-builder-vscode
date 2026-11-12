/**
 * J5 as a guided tour, in the same shape as J4's (`j4Tour.ts`): each stop points at one place, says
 * what to do there, and names the lines of `reviewSteps.ts`'s `decided` lists it shows. What Commerce
 * holds (`commerce`), which datapack the demo uses (`demo`) and how the run ends (`uninstallEnds`)
 * change between stops, which the tour sets in the panel.
 *
 * The order: a clean uninstall that ends on its small result, then one with unsaved changes sent to
 * the background that succeeds, then one sent to the background that fails.
 */

import type { TourStop } from './j1Tour';

export const J5_TOUR: TourStop[] = [
    { point: 'my-luma-card', press: 'my-luma-card', demo: 'My Luma', commerce: 'clean', uninstallEnds: 'succeeds', say: 'The demo uses My Luma. Click My Luma.' },
    { point: 'flyout-more', press: 'flyout-more', say: 'Uninstall is in More. Press More.', decided: [['J5-1', [0]]] },
    { point: 'menu-uninstall', press: 'menu-uninstall', say: 'Choose Uninstall.' },
    { point: 'uninstall-question', press: 'uninstall', say: 'After the check, what My Luma installed, which goes. Press Uninstall.', decided: [['J5-1', [1]]] },
    { point: 'run-steps', onGone: true, say: 'The run, as steps in Install\'s window.', decided: [['J5-2', [0]]] },
    { point: 'uninstall-result', onGone: true, say: '"My Luma Uninstalled", closing itself.', decided: [['J5-2', [1]]] },
    { point: 'my-luma-card', press: 'my-luma-card', demo: 'My Luma', commerce: 'unsaved', say: 'My Luma is in the demo again, and now you have unsaved changes. Click My Luma.' },
    { point: 'flyout-more', press: 'flyout-more', say: 'Press More.' },
    { point: 'menu-uninstall', press: 'menu-uninstall', say: 'Choose Uninstall.' },
    { point: 'uninstall-question', press: 'uninstall', say: 'Press Uninstall.' },
    { point: 'save-and-uninstall', press: 'save-and-uninstall', say: 'Your changes would be lost, so "Save Your Changes First?" follows. Press Save and Uninstall.', decided: [['J5-1', [2]]] },
    { point: 'run-background', press: 'run-background', say: 'The save row comes first. While it runs, Run in Background stands where Cancel was. Press it.', decided: [['J5-3', [0]]] },
    { point: 'notification', onGone: true, say: 'The job went on without the window. It succeeded: a notification in the result\'s own words, which goes by itself.', decided: [['J5-3', [1]]] },
    { point: 'my-luma-card', press: 'my-luma-card', demo: 'My Luma', commerce: 'clean', uninstallEnds: 'fails', say: 'Once more, and this time the job fails. Click My Luma.' },
    { point: 'flyout-more', press: 'flyout-more', say: 'Press More.' },
    { point: 'menu-uninstall', press: 'menu-uninstall', say: 'Choose Uninstall.' },
    { point: 'uninstall-question', press: 'uninstall', say: 'Press Uninstall.' },
    { point: 'run-background', press: 'run-background', say: 'Press Run in Background.' },
    { point: 'notification', press: 'open-debug-logs', say: 'It failed: the notification stays until dismissed, with one button. Press Open Debug Logs.', decided: [['J5-4', [0]]] },
    { point: 'my-luma-card', say: 'My Luma keeps its check. That is the end of J5.', decided: [['J5-4', [1]]] },
];
