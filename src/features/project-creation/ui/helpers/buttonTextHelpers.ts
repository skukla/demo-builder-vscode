/**
 * Button Text Helpers
 *
 * Utility functions for determining button text based on component state.
 * These helpers eliminate nested ternary operators for cleaner, more readable code.
 */

/**
 * Get the cancel/back button text based on the current creation phase.
 *
 * Logic:
 * - If checking mesh, return 'Back' (can go back without cancelling)
 * - If cancelling, return 'Cancelling...' (operation in progress)
 * - Otherwise, return 'Cancel' (can cancel the creation)
 *
 * @param isCheckingMesh - Whether currently checking API Mesh access
 * @param isCancelling - Whether cancellation is in progress
 * @returns 'Back', 'Cancelling...', or 'Cancel'
 */
export function getCancelButtonText(
    isCheckingMesh: boolean,
    isCancelling: boolean,
): string {
    if (isCheckingMesh) {
        return 'Back';
    }
    if (isCancelling) {
        return 'Cancelling...';
    }
    return 'Cancel';
}
