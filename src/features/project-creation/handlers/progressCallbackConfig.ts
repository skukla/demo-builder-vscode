/**
 * Progress Callback Configuration
 *
 * Identifies message types that require progress callback support
 * during long-running operations.
 *
 * Part of Step 3: Handler Registry Simplification
 */

/**
 * Message types that require progress callback support
 *
 * These handlers send incremental progress updates to the UI
 * during long-running operations.
 */
const PROGRESS_CALLBACK_TYPES = new Set(['create-api-mesh']);

/**
 * Check if a message type needs progress callback
 *
 * @param messageType - Message type to check
 * @returns true if handler needs progress callback, false otherwise
 */
export function needsProgressCallback(messageType: string): boolean {
    return PROGRESS_CALLBACK_TYPES.has(messageType);
}
