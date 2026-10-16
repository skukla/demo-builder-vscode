/**
 * Project Creation Handlers - Shared utilities and types
 *
 * Common helpers and type definitions used across project creation modules.
 */

import type { OperationPosition } from '@/types/webviewPayloads';

/**
 * Project creation timeout constant
 * Total allowed time for complete project creation workflow
 */
export const OVERALL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * How a creation phase reports: the step (a stage-table label), a percentage, what it
 * is doing now, and its position when the caller knows it better than the creation's
 * own step list (an Edit's reset counts Reset's steps).
 */
export type ProgressTracker = (
    currentOperation: string,
    progress: number,
    message?: string,
    position?: OperationPosition,
) => void;
