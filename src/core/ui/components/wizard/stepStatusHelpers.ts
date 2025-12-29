/**
 * Pure helper functions for step status calculation (SOP 3 compliance)
 *
 * These functions are separate from JSX-containing helpers for testability.
 */

/**
 * Determine step status based on value presence and completion (SOP 3)
 *
 * Extracts nested ternary: `hasValue ? (isCompleted ? 'completed' : 'pending') : 'empty'`
 */
export function getStepStatus(
    hasValue: boolean,
    isCompleted: boolean,
): 'completed' | 'pending' | 'empty' {
    if (!hasValue) return 'empty';
    if (isCompleted) return 'completed';
    return 'pending';
}
