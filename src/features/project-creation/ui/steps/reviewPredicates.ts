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
    selectedAppBuilderComponents?: string[];
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

    // Adobe I/O selections required when mesh is included. The mesh lives in
    // selectedAppBuilderComponents (D3); non-mesh integrations don't trip this.
    if (hasMeshInDependencies(state.selectedAppBuilderComponents)) {
        if (!state.adobeOrg?.id) return false;
        if (!state.adobeProject?.id) return false;
        if (!state.adobeWorkspace?.id) return false;
    }

    return true;
}

// `summarizeSelectedAppBuilderComponents` lived here from 2026-06 to 2026-08-23
// WITHOUT A SINGLE PRODUCTION CALLER — built "for the Review step", fully
// unit-tested, never wired, while Review showed no integrations at all. The
// live path is `resolveReviewIntegrationNames` (reviewStepHelpers), which rides
// the same resolver the builder summary renders from and also names custom
// imports and shell instances, which the catalog-only lookup here could not.
