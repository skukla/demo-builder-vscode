/**
 * J2 as a guided tour, in the same shape as J1's (`j1Tour.ts`): each stop points at one place, says
 * what to do there, and names the lines of `reviewSteps.ts`'s `decided` lists it shows. Which
 * datapack the demo uses and what Commerce holds change between stops (`demo`, `commerce`), which
 * the tour sets in the panel, since on the real screen they are the demo's state, not something the
 * SC picks. A stop with `onGone` moves on by itself when its window goes (a result that closes
 * itself). Every action starts on a card: clicking it opens its flyout, where the actions live.
 *
 * The tour starts with the run ending clean and the Dry Run passing; the panel's selects show the
 * other endings from the step list.
 */

import type { TourStop } from './j1Tour';

export const J2_TOUR: TourStop[] = [
    { point: 'bodea-card', press: 'bodea-card', demo: 'none', commerce: 'clean', say: 'This demo has no datapack yet. Click Bodea.', decided: [['J2-1', [0]]] },
    { point: 'flyout', press: 'flyout-install', say: 'Bodea\'s flyout. Press Install.' },
    { point: 'summary-table', press: 'review-records', say: 'What Bodea adds, one row per type. Press Review Records.', decided: [['J2-1', [1, 2]]] },
    { point: 'type-rail', press: 'back', say: 'Bodea\'s records, read-only. Press Back.' },
    { point: 'dry-run', press: 'dry-run', say: 'Press Dry Run.' },
    { point: 'dry-result', press: 'back', say: 'The Dry Run\'s answer, in its own small window. Press Back.', decided: [['J2-4', [0, 1, 2, 3]]] },
    { point: 'install', press: 'install', say: 'Press Install.' },
    { point: 'run-steps', onGone: true, press: 'close', say: 'The run, in its own window, drawn as steps.', decided: [['J2-2', [0, 2, 3]]] },
    { point: 'installed-result', onGone: true, say: 'A clean run ends on the small result, which closes itself.', decided: [['J2-2', [1, 4]]] },
    { point: 'my-luma-card', press: 'my-luma-card', demo: 'My Luma', commerce: 'unsaved', say: 'Now the demo uses My Luma, and Commerce has changes you have not saved. Click My Luma.' },
    { point: 'flyout', press: 'flyout-close', say: 'The demo\'s own datapack offers Restore My Luma, not Install (J4 builds it). Close the flyout.', decided: [['J2-3', [0]]] },
    { point: 'bodea-card', press: 'bodea-card', say: 'Click Bodea.' },
    { point: 'flyout', press: 'flyout-install', say: 'Press Install.' },
    { point: 'replace', press: 'replace', say: 'The question, with what Bodea adds. Press Switch.', decided: [['J2-3', [1]]] },
    { point: 'save-and-replace', press: 'save-and-replace', say: 'Save Your Changes First? follows: the sentence and the changes by type, no box. Press Save and Switch.', decided: [['J2-3', [2, 3]]] },
    { point: 'run-steps', onGone: true, press: 'close', say: 'Save Your Changes, Uninstall My Luma, then Install Bodea.', decided: [['J2-3', [4]]] },
    { point: 'installed-result', onGone: true, say: 'Bodea Installed, closing itself.' },
    { point: 'bodea-card', say: 'The check moved to Bodea. That is the end of J2.', decided: [['J2-3', [5]]] },
];
