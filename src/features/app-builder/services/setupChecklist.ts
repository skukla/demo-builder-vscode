/**
 * An integration's demo setup checklist (AB-26x): the steps its catalog entry declares
 * (`setupSteps`), each with where the SC is on it (`appBuilderComponents[id].setupSteps`).
 *
 * The steps are demo setup that Commerce needs and no API can do, so Demo Builder lists
 * them and the SC does them in Commerce Admin (owner, 2026-09-25: the checklist lives in
 * Demo Builder, not the integration; a prospect handed the integration reads its README).
 *
 * Pure, over the bundled catalog (the webview-safe lookup `integrationCardModel` already
 * uses): the flyout draws it with nothing from the extension, and the extension's handlers
 * and agent tools read it the same way.
 *
 * @module features/app-builder/services/setupChecklist
 */

import { getAppBuilderComponentEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';

/**
 * The checklist for one component, or undefined when its entry declares no steps.
 *
 * @param id - the component's id
 * @param state - its saved record (the catalog id, and where the SC is on each step)
 * @returns the steps with their state
 */
export function setupChecklistOf(
    id: string,
    state: Pick<AppBuilderComponentState, 'catalogId' | 'setupSteps'>,
): SetupChecklistItem[] | undefined {
    const steps = getAppBuilderComponentEntry(state.catalogId ?? id)?.setupSteps;
    if (!steps || steps.length === 0) return undefined;
    return steps.map((step) => {
        const saved = state.setupSteps?.[step.id];
        return {
            id: step.id,
            title: step.title,
            why: step.why,
            where: step.where,
            state: saved?.state ?? 'open',
            ...(saved?.note ? { note: saved.note } : {}),
            checkable: step.check !== undefined,
        };
    });
}

/**
 * The one-line summary. A dismissed step is out of the count: the SC decided it does
 * not apply to this demo.
 *
 * @param items - the checklist
 * @returns e.g. "1 of 2 done", or "All done" when nothing is left open
 */
export function setupSummary(items: SetupChecklistItem[]): string {
    const open = items.filter((item) => item.state === 'open').length;
    const done = items.filter((item) => item.state === 'done').length;
    return open === 0 ? 'All done' : `${done} of ${open + done} done`;
}
