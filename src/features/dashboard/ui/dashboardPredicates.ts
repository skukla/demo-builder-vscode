/**
 * Predicate functions for dashboard UI (SOP §10 compliance)
 *
 * Extracts long validation chains to named functions for improved readability.
 */

/**
 * Check if start action should be disabled (SOP §10 compliance)
 *
 * Disabled when:
 * - UI is transitioning
 * - Mesh is deploying
 * - Demo is starting
 * - Demo is stopping
 */
export function isStartActionDisabled(
    isTransitioning: boolean,
    meshStatus: string | undefined,
    status: string
): boolean {
    if (isTransitioning) return true;
    if (meshStatus === 'deploying') return true;
    if (status === 'starting') return true;
    if (status === 'stopping') return true;
    return false;
}
