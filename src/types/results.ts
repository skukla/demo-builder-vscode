/**
 * Result Types
 *
 * Common result patterns for operations that may succeed or fail.
 */

/**
 * SimpleResult - Basic success/failure result
 */
export interface SimpleResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * OperationResult - Extended result with additional metadata
 */
export interface OperationResult<T = unknown> extends SimpleResult<T> {
    duration?: number;
    metadata?: Record<string, unknown>;
}

/**
 * createSuccess - Helper to create success result
 */
export function createSuccess<T>(data?: T): SimpleResult<T> {
    return { success: true, data };
}

/**
 * createFailure - Helper to create failure result
 */
export function createFailure<T = unknown>(error: string): SimpleResult<T> {
    return { success: false, error };
}

/**
 * DataResult - Type alias for SimpleResult
 *
 * Used in authentication handlers for typed responses.
 * Identical structure to SimpleResult, provided for semantic clarity.
 */
export type DataResult<T = unknown> = SimpleResult<T>;
