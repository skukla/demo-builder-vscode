/**
 * Predicate functions for ReviewStep (SOP §10 compliance)
 *
 * Extracts long validation chains to named functions for improved readability.
 */

import { hasMeshInDependencies } from '@/core/constants';
import { getStackById } from '../hooks/useSelectedStack';

/**
 * Minimal state interface for review data validation
 */
interface ReviewState {
    projectName?: string;
    adobeOrg?: { id?: string };
    adobeProject?: { id?: string };
    adobeWorkspace?: { id?: string };
    selectedStack?: string;
    selectedOptionalDependencies?: string[];
}

/**
 * Check if the project requires Adobe I/O credentials.
 * True when: mesh is included OR ACCS backend is selected.
 */
function needsAdobeIO(state: ReviewState): boolean {
    const deps = [...(state.selectedOptionalDependencies || [])];
    if (hasMeshInDependencies(deps)) return true;

    const stack = state.selectedStack ? getStackById(state.selectedStack) : undefined;
    if (stack?.backend === 'adobe-commerce-accs') return true;

    return false;
}

/**
 * Check if wizard has all required data for review step (SOP §10 compliance)
 *
 * Required:
 * - Project name (non-empty)
 * - Adobe organization, project, and workspace (when Adobe I/O is needed)
 */
export function hasRequiredReviewData(state: ReviewState): boolean {
    if (!state.projectName) return false;

    // Adobe I/O selections required when mesh is included OR ACCS backend selected
    if (needsAdobeIO(state)) {
        if (!state.adobeOrg?.id) return false;
        if (!state.adobeProject?.id) return false;
        if (!state.adobeWorkspace?.id) return false;
    }

    return true;
}
