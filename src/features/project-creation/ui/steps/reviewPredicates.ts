/**
 * Predicate functions for ReviewStep (SOP §10 compliance)
 *
 * Extracts long validation chains to named functions for improved readability.
 */

/**
 * Minimal state interface for review data validation
 */
interface ReviewState {
    projectName?: string;
    adobeOrg?: { id?: string };
    adobeProject?: { id?: string };
    adobeWorkspace?: { id?: string };
}

/**
 * Check if wizard has all required data for review step (SOP §10 compliance)
 *
 * Required:
 * - Project name (non-empty)
 * - Adobe organization selected
 * - Adobe project selected
 * - Adobe workspace selected
 */
export function hasRequiredReviewData(state: ReviewState): boolean {
    if (!state.projectName) return false;
    if (!state.adobeOrg?.id) return false;
    if (!state.adobeProject?.id) return false;
    if (!state.adobeWorkspace?.id) return false;
    return true;
}
