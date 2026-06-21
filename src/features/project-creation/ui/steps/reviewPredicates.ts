/**
 * Predicate functions for ReviewStep (SOP §10 compliance)
 *
 * Extracts long validation chains to named functions for improved readability.
 */

import { hasMeshInDependencies } from '@/core/constants';
import { getDeployableName } from '@/features/project-creation/services/deployableCatalogLoader';

/** A selected deployable summarized for the Review step. */
export interface ReviewedDeployable {
    /** Display name (resolved via getDeployableName, falls back to id). */
    name: string;
    /** True when the package marks this deployable required (shown "Included"). */
    included: boolean;
}

/**
 * Minimal state interface for review data validation
 */
interface ReviewState {
    projectName?: string;
    adobeOrg?: { id?: string };
    adobeProject?: { id?: string };
    adobeWorkspace?: { id?: string };
    selectedOptionalDependencies?: string[];
}

/**
 * Check if wizard has all required data for review step (SOP §10 compliance)
 *
 * Required:
 * - Project name (non-empty)
 * - Adobe organization, project, and workspace (when mesh is included)
 */
export function hasRequiredReviewData(state: ReviewState): boolean {
    if (!state.projectName) return false;

    // Adobe I/O selections required when mesh is included
    const deps = [...(state.selectedOptionalDependencies || [])];
    if (hasMeshInDependencies(deps)) {
        if (!state.adobeOrg?.id) return false;
        if (!state.adobeProject?.id) return false;
        if (!state.adobeWorkspace?.id) return false;
    }

    return true;
}

/**
 * Summarize selected deployables for the Review step.
 *
 * Resolves each id to its display name (falling back to the id) and flags
 * required ones as "Included" (locked, auto-included by the package).
 *
 * @param deployableIds - The selected deployable ids
 * @param requiredIds - Ids the package marks required
 * @returns One ReviewedDeployable per selected id
 */
export function summarizeSelectedDeployables(
    deployableIds: readonly string[],
    requiredIds: readonly string[],
): ReviewedDeployable[] {
    return deployableIds.map(id => ({
        name: getDeployableName(id),
        included: requiredIds.includes(id),
    }));
}
