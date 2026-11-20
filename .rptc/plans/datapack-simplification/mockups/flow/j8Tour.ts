/**
 * J8 as a guided tour, in the same shape as J5's (`j5Tour.ts`): each stop points at one place, says
 * what to do there, and names the lines of `reviewSteps.ts`'s `decided` lists it shows. Which
 * datapack the demo uses (`demo`) and which screen shows (`j8View`) are set by the tour.
 *
 * The order: the header and its file action, a card's tag, the flyout of the demo's datapack and its
 * More menu, a Demo Builder datapack's More, and last the Datapack Library's header.
 */

import type { TourStop } from './j1Tour';

export const J8_TOUR: TourStop[] = [
    { point: 'j8-header', press: 'install-from-file', demo: 'My Luma', j8View: 'project', say: 'The header, in order of how often an SC does each: Save, Install from File, then Clear, set apart. Press Install from File.', decided: [['J8-1', [0]]] },
    { point: 'cancel', press: 'cancel', say: 'After VS Code\'s file dialog, the same window as a card\'s Install. Press Cancel.', decided: [['J8-1', [1]]] },
    { point: 'card-tag', press: 'my-luma-card', say: 'Each card\'s tag sits on its date\'s line: Mine for yours, Demo Builder for the extension\'s. Click My Luma.', decided: [['J8-2', [0, 1]]] },
    { point: 'flyout-more', press: 'flyout-more', say: 'Restore My Luma, then More. Press More.', decided: [['J8-3', [0]]] },
    { point: 'more-menu', press: 'menu-delete-datapack', say: 'Two sections: what any datapack offers, then what removes. Choose Delete Datapack.', decided: [['J8-3', [1, 2]]] },
    { point: 'delete-question', press: 'cancel', say: 'No version is named. Press Cancel.', decided: [['J8-3', [3]]] },
    { point: 'bodea-card', press: 'bodea-card', say: 'Bodea is a Demo Builder datapack. Click it.' },
    { point: 'flyout-more', press: 'flyout-more', say: 'Press More.' },
    { point: 'more-menu', press: 'menu-save-file', say: 'Save as File alone: no one can delete a Demo Builder datapack. Choose Save as File.', decided: [['J8-3', [4]]] },
    { point: 'add-from-file', j8View: 'library', say: 'The Datapack Library: Add from File alone. That is the end of J8.', decided: [['J8-1', [2]], ['J8-3', [5]]] },
];
