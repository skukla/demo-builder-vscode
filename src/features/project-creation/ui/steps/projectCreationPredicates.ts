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
    isCompleted: boolean,
): boolean {
    if (!progress) return false;
    if (progress.error) return false;
    if (isCancelled) return false;
    if (isFailed) return false;
    if (isCompleted) return false;
    return true;
}

/**
 * Check if Open Project button should be shown (SOP §10 compliance)
 *
 * Button is shown when:
 * - Project creation is completed
 * - No error occurred
 * - Not currently opening project (prevents double-click)
 */
export function isReadyToShowOpenButton(
    isCompleted: boolean,
    progress: ProgressState | undefined,
    isOpeningProject: boolean,
): boolean {
    if (!isCompleted) return false;
    if (progress?.error) return false;
    if (isOpeningProject) return false;
    return true;
}
