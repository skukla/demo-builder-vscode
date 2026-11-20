/**
 * J9 as a guided tour, in the same shape as J4's (`j4Tour.ts`): each stop points at one place, says
 * what to do there, and names the lines of `reviewSteps.ts`'s `decided` lists it shows. The flyout
 * state (`j9State`) is set in the panel by the tour.
 *
 * The order: Update on Luma (one type left out, which keeps the dot; then the rest, which clears it
 * and makes Restore Luma the main button); Restore Luma; My Luma with nothing unsaved (one point);
 * My Luma with unsaved edits (the choice; Original asks to save first).
 */

import type { TourStop } from './j1Tour';

export const J9_TOUR: TourStop[] = [
    { point: 'amber-dot', press: 'luma-card', j9State: 'luma-newer', say: 'The demo uses Luma, a Demo Builder datapack. You updated Luma in the library; this demo has the older copy and some edits of your own. Hover the amber dot, then click Luma.', decided: [['J9-1', [0]]] },
    { point: 'flyout-update', press: 'flyout-more', say: 'The library copy is newer, so the main button reads Update Luma. Press More.', decided: [['J9-1', [1]]] },
    { point: 'more-menu', press: 'menu-uninstall', say: 'Luma is Demo Builder\'s: no saves, so no Undo Last Save. Uninstall in its own section. Choose Uninstall to close the menu (it does nothing here).', decided: [['J9-1', [2]]] },
    { point: 'flyout-update', press: 'flyout-update', say: 'Press Update Luma.' },
    { point: 'update-table', press: 'review-records', say: 'After the check: only the types the new Luma changed, with bare counts, each ticked. Nothing says your edits are kept. Press Review Records.', decided: [['J9-2', [0, 1]]] },
    { point: 'kept-tab', press: 'kept-tab', say: 'The spot check, as Install\'s. Products has the dot: some of its records are ones you edited. Press Kept.' },
    { point: 'back', press: 'back', say: 'The products you edited, which the update leaves as they are. Press Back.' },
    { point: 'tick-cart-rules', press: 'tick-cart-rules', say: 'You can apply only some of it. Untick Cart Rules.' },
    { point: 'update', press: 'update', say: 'Update is blue: nothing is deleted. Press Update.' },
    { point: 'run-steps', onGone: true, say: 'The run: one row per chosen type, then Verify Installation.' },
    { point: 'update-result', onGone: true, say: '"Luma Updated", closing itself.' },
    { point: 'amber-dot', press: 'luma-card', say: 'Cart Rules is still to apply, so the dot stays. Click Luma.' },
    { point: 'flyout-update', press: 'flyout-update', say: 'Press Update Luma.' },
    { point: 'update', press: 'update', say: 'Only Cart Rules is left. Press Update.' },
    { point: 'run-steps', onGone: true, say: 'The same run, one row.' },
    { point: 'update-result', onGone: true, say: '"Luma Updated".' },
    { point: 'luma-card', press: 'luma-card', say: 'Everything is in, so the dot is gone. Click Luma.' },
    { point: 'flyout-restore-pack', press: 'flyout-restore-pack', say: 'Nothing newer now, so the main button is Restore Luma. Press it.' },
    { point: 'restore-luma-question', press: 'restore', say: 'A Demo Builder datapack has one point to go back to. Press Restore.', decided: [['J9-5', [0, 1]]] },
    { point: 'run-steps', onGone: true, say: 'J4\'s run: Uninstall Luma, Install Luma, Verify Installation.' },
    { point: 'luma-restored', onGone: true, say: '"Luma Restored", closing itself.' },
    { point: 'my-luma-card', press: 'my-luma-card', j9State: 'my-clean', say: 'Now the demo uses My Luma, your own datapack, with nothing unsaved. Click My Luma.' },
    { point: 'flyout-more', press: 'flyout-more', say: 'Restore My Luma is the main button. Press More.' },
    { point: 'more-menu', press: 'menu-uninstall', say: 'Your own datapack has saves, so Undo Last Save is here. Choose Uninstall to close the menu (it does nothing here).' },
    { point: 'flyout-restore-pack', press: 'flyout-restore-pack', say: 'Press Restore My Luma.' },
    { point: 'restore-my-question', press: 'restore', say: 'Nothing unsaved, so the original is the only point: one line, no choice. Press Restore.', decided: [['J9-6', [0]]] },
    { point: 'luma-restored', onGone: true, say: '"My Luma Restored".' },
    { point: 'my-luma-card', press: 'my-luma-card', j9State: 'my-edits', say: 'Now you have unsaved edits in My Luma. Click My Luma.' },
    { point: 'flyout-restore-pack', press: 'flyout-restore-pack', say: 'Press Restore My Luma.' },
    { point: 'restore-choice', press: 'radio-original', say: 'Two points now: Last Saved throws your edits away; Original is My Luma\'s first state. Pick Original.', decided: [['J9-7', [0, 2]]] },
    { point: 'restore', press: 'restore', say: 'Press Restore.' },
    { point: 'save-and-restore', press: 'save-and-restore', say: 'Original with unsaved edits asks to save first. Last Saved would not: saving first would leave nothing to restore. Press Save and Restore.', decided: [['J9-7', [1]]] },
    { point: 'run-steps', onGone: true, say: 'The run, with Save Your Changes first.' },
    { point: 'luma-restored', onGone: true, say: '"My Luma Restored".' },
    { point: 'my-luma-card', say: 'That is the end of J9.' },
];
