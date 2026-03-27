/**
 * Predicate functions for ReviewStep (SOP §10 compliance)
 *
 * Extracts long validation chains to named functions for improved readability.
 */

import { hasMeshInDependencies } from '@/core/constants';

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
