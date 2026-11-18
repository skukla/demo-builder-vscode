/**
 * Project Creation Handlers - Shared utilities and types
 *
 * Common helpers and type definitions used across project creation modules.
 */

import type { OperationPosition } from '@/types/webviewPayloads';

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
    /** On the finishing update only: the steps left to finish (`CreationProgress.stepsRemaining`). */
    stepsRemaining?: number,
) => void;
