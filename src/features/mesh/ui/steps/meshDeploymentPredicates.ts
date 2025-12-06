/**
 * Predicate functions for MeshDeploymentStep (SOP §10 compliance)
 *
 * Extracts state logic into testable predicate functions for clean UI rendering.
 * Follows the pattern established in meshPredicates.ts.
 *
 * @module features/mesh/ui/steps/meshDeploymentPredicates
 */

import { MeshDeploymentState } from './meshDeploymentTypes';

/**
 * Check if deployment is currently active (deploying or verifying)
 *
 * Active states are non-terminal - the deployment process is ongoing.
 * UI should show loading indicators during active states.
 */
export function isDeploymentActive(state: MeshDeploymentState): boolean {
    return state.status === 'deploying' || state.status === 'verifying';
}

/**
 * Check if recovery options should be shown (timeout or error)
 *
 * PM Decision (2025-12-06): Recovery options are Retry and Cancel.
 * No "Skip for Now" or "Keep Waiting" options.
 */
export function canShowRecoveryOptions(state: MeshDeploymentState): boolean {
    return state.status === 'timeout' || state.status === 'error';
}

/**
 * Check if deployment completed successfully
 *
 * Success state indicates mesh is deployed and verified.
 * UI should show success message with mesh endpoint.
 */
export function isDeploymentSuccess(state: MeshDeploymentState): boolean {
    return state.status === 'success';
}

/**
 * Check if deployment reached a terminal state
 *
 * Terminal states are: success, timeout, error
 * Once terminal, no further automatic state transitions occur.
 */
export function isDeploymentTerminal(state: MeshDeploymentState): boolean {
    return (
        state.status === 'success' ||
        state.status === 'timeout' ||
        state.status === 'error'
    );
}
