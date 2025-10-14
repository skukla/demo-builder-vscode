/**
 * Project Creation Handlers - Shared utilities and types
 *
 * Common helpers and type definitions used across project creation modules.
 */

/**
 * Project creation timeout constant
 * Total allowed time for complete project creation workflow
 */
export const OVERALL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Progress tracking helper type
 */
export type ProgressTracker = (
    currentOperation: string,
    progress: number,
    message?: string
) => void;
