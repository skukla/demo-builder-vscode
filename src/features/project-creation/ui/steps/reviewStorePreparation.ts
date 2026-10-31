/**
 * What the wizard's Review says when Create, or an Edit's Finish, will add the ERP
 * integration (owner, 2026-10-22): its add prepares the store before its ERP is filled, and
 * on a shared Commerce some of that changes settings every website shares. Before the project
 * exists nothing can read its store, so Review names the steps from the catalog; the run
 * checks each first and leaves one already done as it is. The Integrations screen's add reads
 * the store instead (`PrepareOnAddConfirm`, in the Add Integration flow's window).
 *
 * Pure: the catalog is handed in.
 *
 * @module features/project-creation/ui/steps/reviewStorePreparation
 */

import { preparesStoreOnAdd, reachesEveryWebsite } from '@/features/app-builder/services/storePreparation/fixReach';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { WizardState } from '@/types/webview';

/** The integration whose add prepares the store, the steps it applies, and those that reach every website. */
export interface ReviewStorePreparation {
    name: string;
    steps: string[];
    everyWebsite: string[];
}

type ReviewedState = Pick<WizardState, 'selectedAppBuilderComponents' | 'wizardMode' | 'editBaseline'>;

/** The ids an Edit started with (`editChoicesOf` keeps them as JSON); none outside an Edit. */
function idsBefore(state: ReviewedState): string[] {
    const saved = state.wizardMode === 'edit' ? state.editBaseline?.selectedAppBuilderComponents : undefined;
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * @param state - the wizard's selections
 * @param catalog - the App Builder catalog for the stack
 * @returns what Review says, or undefined when no integration being added prepares the store
 */
export function storePreparationOnReview(
    state: ReviewedState,
    catalog: readonly AppBuilderComponentCatalogEntry[],
): ReviewStorePreparation | undefined {
    const before = new Set(idsBefore(state));
    const adding = (state.selectedAppBuilderComponents ?? []).filter((id) => !before.has(id));
    const entry = catalog.find((candidate) => adding.includes(candidate.id) && preparesStoreOnAdd(candidate));
    if (!entry) return undefined;
    const fixed = (entry.setupSteps ?? []).filter((step) => step.fix);
    return {
        name: entry.name,
        steps: fixed.map((step) => step.label ?? step.title),
        everyWebsite: fixed.filter((step) => step.fix && reachesEveryWebsite(step.fix)).map((step) => step.label ?? step.title),
    };
}
