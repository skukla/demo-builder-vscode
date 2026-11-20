/**
 * J3 as a guided tour, in the same shape as J2's (`j2Tour.ts`): each stop points at one place, says
 * what to do there, and names the lines of `reviewSteps.ts`'s `decided` lists it shows. Which
 * datapack the demo uses changes between stops (`demo`), and which save the header's button opens
 * (`saveVariant`), which the tour sets in the panel. A stop with `onGone` moves on by itself when
 * its window goes (a run handing off to its small result, a result that closes itself).
 *
 * The order is the SC's: save your datapack, branch it, branch someone else's, create one from
 * nothing, then undo the last save.
 */

import type { TourStop } from './j1Tour';

export const J3_TOUR: TourStop[] = [
    { point: 'save-menu', press: 'save-menu', demo: 'My Luma', saveVariant: 'save', say: 'The demo uses My Luma, your datapack. Saving lives in the header. Press Save.', decided: [['J3-1', [0]]] },
    { point: 'menu-save', press: 'menu-save', say: 'Choose Save.' },
    { point: 'summary-table', press: 'review-records', say: 'What My Luma will hold, one row per type. Press Review Records.', decided: [['J3-1', [1]]] },
    { point: 'type-rail', press: 'back', say: 'The records, read-only. Press Back.', decided: [['J3-1', [2]]] },
    { point: 'save', press: 'save', say: 'Press Save.' },
    { point: 'run-steps', onGone: true, press: 'close', say: 'The save runs in its own window.' },
    { point: 'done-result', onGone: true, say: '"Saved to My Luma", closing itself.', decided: [['J3-1', [3]]] },
    { point: 'save-menu', press: 'save-menu', say: 'Now a new datapack from this one. Press Save.' },
    { point: 'menu-save-as-new', press: 'menu-save-as-new', say: 'Choose Save As New.' },
    { point: 'name-field', press: 'save', say: 'One field. Type Luma Holiday, then press Save. (Save with no name, or "My Luma", shows the error.)', decided: [['J3-1', [4, 5]]] },
    { point: 'run-steps', onGone: true, press: 'close', say: 'Saving Luma Holiday.' },
    { point: 'done-result', onGone: true, say: '"Saved as Luma Holiday", closing itself.' },
    { point: 'save-as-new', press: 'save-as-new', demo: 'Bodea', saveVariant: 'as-new-other', say: 'Now the demo uses Bodea, which is not yours. The header offers only Save As New. Press it.' },
    { point: 'name-field', press: 'cancel', say: 'The same window, with no line about Bodea. Press Cancel.' },
    { point: 'create-datapack', press: 'create-datapack', demo: 'none', say: 'No datapack of yours yet: the header reads Create Datapack. Press it.', decided: [['J3-2', [0]]] },
    { point: 'picker', press: 'select-all-data', say: 'First, what it holds: everything in the store by kind, all ticked. Press Select All Data.', decided: [['J3-2', [1]]] },
    { point: 'picker', press: 'select-all-data', say: 'Each kind\'s count is what the datapack will hold. Press Select All Data again.', decided: [['J3-2', [2]]] },
    { point: 'picker', press: 'next', say: 'Press Next.' },
    { point: 'name-field', press: 'create', say: 'Then the name, in its own small window. Type My Luma, then press Create.', decided: [['J3-2', [3]]] },
    { point: 'run-steps', onGone: true, press: 'close', say: 'Creating My Luma.' },
    { point: 'done-result', onGone: true, say: '"Created My Luma", closing itself.', decided: [['J3-2', [4]]] },
    { point: 'my-luma-card', press: 'my-luma-card', say: 'The demo now uses My Luma, and the header reads Save ▾. Click My Luma.' },
    { point: 'flyout-more', press: 'flyout-more', say: 'Press More.', decided: [['J3-3', [0]]] },
    { point: 'menu-undo', press: 'menu-undo', say: 'Choose Undo Last Save.' },
    { point: 'undo-question', press: 'undo', say: 'The question. Press Undo.', decided: [['J3-3', [1]]] },
    { point: 'run-steps', onGone: true, press: 'close', say: 'Commerce goes back through Install\'s run.', decided: [['J3-3', [2]]] },
    { point: 'done-result', onGone: true, say: '"Last Save Undone", closing itself.', decided: [['J3-3', [3]]] },
    { point: 'my-luma-card', say: 'That is the end of J3.' },
];
