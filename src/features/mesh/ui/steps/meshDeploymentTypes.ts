/**
 * Type definitions for MeshDeploymentStep state machine
 *
 * These types define the state machine for the mesh deployment step
 * during project creation, enabling recovery from timeouts and errors.
 *
 * PM Decision (2025-12-06):
 * - Recovery options: Retry and Cancel (no "Skip for Now")
 * - No auto-retry - show options immediately on first timeout
 *
 * @module features/mesh/ui/steps/meshDeploymentTypes
 */

/**
 * Status values for mesh deployment state machine
 *
 * State machine transitions:
 * - 'deploying' -> 'verifying' (on deploy command success)
 * - 'deploying' -> 'error' (on deploy command failure)
 * - 'verifying' -> 'success' (on verification success)
 * - 'verifying' -> 'timeout' (on total timeout reached)
 * - 'verifying' -> 'error' (on verification error)
 * - 'timeout' -> 'deploying' (on retry)
 * - 'error' -> 'deploying' (on retry)
 *
 * Terminal states: 'success', 'timeout', 'error'
 * Recovery-eligible states: 'timeout', 'error'
 */
export type MeshDeploymentStatus =
    | 'deploying'   // Initial deployment command in progress
    | 'verifying'   // Polling for deployment completion
    | 'timeout'     // Total timeout reached (recovery: Retry or Cancel)
    | 'success'     // Deployment verified successfully
    | 'error';      // Deployment failed with error (recovery: Retry or Cancel)

/**
 * State interface for mesh deployment step
 *
 * Contains all information needed to render the UI and track deployment progress.
 */
export interface MeshDeploymentState {
    /** Current deployment status */
    status: MeshDeploymentStatus;

    /** Current verification attempt (1-indexed) */
    attempt: number;

    /** Maximum number of verification attempts before timeout */
    maxAttempts: number;

    /** Elapsed time in seconds since deployment started */
    elapsedSeconds: number;

    /** User-facing status message */
    message: string;

    /** Mesh ID (populated on success) */
    meshId?: string;

    /** Mesh GraphQL endpoint URL (populated on success) */
    endpoint?: string;

    /** Error details (populated on error status) */
    errorMessage?: string;
}

/**
 * Props for MeshDeploymentStep component callbacks
 */
export interface MeshDeploymentCallbacks {
    /** Called when user clicks Retry button */
    onRetry: () => void;

    /** Called when user clicks Cancel button */
    onCancel: () => void;

    /** Called when deployment succeeds and user can continue */
    onContinue: () => void;
}

/**
 * Default state for mesh deployment step
 *
 * Based on TIMEOUTS.MESH_DEPLOY_TOTAL (180s) and MESH_VERIFY_POLL_INTERVAL (10s)
 * maxAttempts = (180s - 20s initial wait) / 10s = 16 attempts
 */
export const INITIAL_MESH_DEPLOYMENT_STATE: MeshDeploymentState = {
    status: 'deploying',
    attempt: 0,
    maxAttempts: 16, // (180s - 20s) / 10s = 16 verification polls
    elapsedSeconds: 0,
    message: 'Deploying API Mesh...',
};
