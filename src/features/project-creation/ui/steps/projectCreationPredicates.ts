/**
 * Predicate functions for ProjectCreationStep (SOP §10 compliance)
 *
 * Extracts long validation chains to named functions for improved readability.
 */

/**
 * Progress state minimal interface for predicate
 */
interface ProgressState {
    error?: string;
    [key: string]: unknown;
}

/**
 * Check if progress is actively running (SOP §10 compliance)
 *
 * Progress is active when:
 * - Progress object exists
 * - No error occurred
 * - Not cancelled by user
 * - Not failed
 * - Not completed
 */
export function isProgressActive(
    progress: ProgressState | undefined,
    isCancelled: boolean,
    isFailed: boolean,
    isCompleted: boolean
): boolean {
    if (!progress) return false;
    if (progress.error) return false;
    if (isCancelled) return false;
    if (isFailed) return false;
    if (isCompleted) return false;
    return true;
}
