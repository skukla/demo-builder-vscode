/**
 * J7 as a guided tour, in the same shape as J5's (`j5Tour.ts`): each stop points at one place, says
 * what to do there, and names the lines of `reviewSteps.ts`'s `decided` lists it shows. What Commerce
 * holds (`commerce`) changes between stops, which the tour sets in the panel.
 *
 * Every window is the product's own batch window (`ProjectsBatchModal`). The order: one project
 * reset, run to its result; then three projects with unsaved changes, so "Save Your Changes First?" follows;
 * then a delete.
 */

import type { TourStop } from './j1Tour';

export const J7_TOUR: TourStop[] = [
    { point: 'project-menu', press: 'project-menu', commerce: 'clean', say: 'The projects list. Open Kukla Luma\'s menu.' },
    { point: 'menu-reset', press: 'menu-reset', say: 'Choose Reset.' },
    { point: 'batch-question', press: 'run-reset', say: 'The batch window, with one row: "Reset 1 Project?". Press Reset 1 Project.', decided: [['J7-1', [0, 1, 2]]] },
    { point: 'batch-run', onGone: true, say: 'The run: a row per project.', decided: [['J7-1', [3]]] },
    { point: 'batch-result', press: 'close', say: 'The small result, "Projects Reset". Press Close.', decided: [['J7-1', [3]]] },
    { point: 'reset-selected', press: 'reset-selected', commerce: 'unsaved', say: 'Now three projects, with unsaved changes in their datapacks. Press Reset Selected.' },
    { point: 'batch-question', press: 'run-reset', say: '"Reset 3 Projects?": one row each, an Uninstall Datapack box where a project has a pack. Press Reset 3 Projects.', decided: [['J7-2', [0, 1]]] },
    { point: 'save-and-reset', press: 'save-and-reset', say: 'The datapacks have changes, so "Save Your Changes First?" follows, as for Replace and Uninstall: My Luma saves to itself, Bodea as My Bodea. Press Save and Reset.', decided: [['J7-2', [2]]] },
    { point: 'batch-run', onGone: true, say: 'The three run side by side.', decided: [['J7-2', [3]]] },
    { point: 'batch-result', press: 'close', say: '"Projects Reset". Press Close.' },
    { point: 'project-menu', press: 'project-menu', commerce: 'clean', say: 'Open Kukla Luma\'s menu again.' },
    { point: 'menu-delete', press: 'menu-delete', say: 'Choose Delete.' },
    { point: 'batch-question', say: '"Delete 1 Project?": a column per thing it may take, each box naming what it deletes, all unticked. That is the end of J7.', decided: [['J7-3', [0, 1, 2]]] },
];
