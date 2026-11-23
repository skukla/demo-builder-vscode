/**
 * J6 as a guided tour, in the same shape as J5's (`j5Tour.ts`): each stop points at one place, says
 * what to do there, and names the lines of `reviewSteps.ts`'s `decided` lists it shows. How a retry
 * ends (`retryEnds`) and which screen shows (`j6View`) are set by the tour, not the owner.
 *
 * The order: the failed card, its flyout, two retries that stop again, Fix with AI in the run window
 * and then in the flyout, and last the project dashboard.
 */

import type { TourStop } from './j1Tour';

export const J6_TOUR: TourStop[] = [
    { point: 'my-luma-card', press: 'my-luma-card', retryEnds: 'fails', j6View: 'datapacks', say: 'My Luma\'s install failed when the project was created. Click My Luma.', decided: [['J6-1', [0, 1]]] },
    { point: 'flyout-health', press: 'flyout-retry', say: 'Why it failed, under the title. Press Retry.', decided: [['J6-2', [0, 1]]] },
    { point: 'retry', press: 'retry', say: 'It stopped again, on the same row. Press Retry once more.', decided: [['J6-2', [2]]] },
    { point: 'fix-with-ai', press: 'close', say: 'Two retries have not helped, so the one action is now Fix with AI. Press Close.', decided: [['J6-3', [0]]] },
    { point: 'my-luma-card', press: 'my-luma-card', say: 'Click My Luma again.' },
    { point: 'flyout-fix', press: 'flyout-close', say: 'The flyout offers Fix with AI too. Close the flyout.', decided: [['J6-3', [1]]] },
    { point: 'dashboard-datapacks', j6View: 'dashboard', say: 'The project dashboard. Hover the dot beside Datapacks. That is the end of J6.', decided: [['J6-4', [0, 1]]] },
];
