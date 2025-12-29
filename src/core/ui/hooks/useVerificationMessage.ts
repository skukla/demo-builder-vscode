/**
 * useVerificationMessage Hook
 *
 * Maps status values to formatted verification messages with type indicators.
 * Useful for displaying verification status in UIs with consistent styling.
 *
 * @module core/ui/hooks/useVerificationMessage
 */

import { useMemo } from 'react';

/**
 * Verification message with display type
 */
export interface VerificationMessage {
    /** Display text */
    text: string;
    /** Message type for styling */
    type: 'info' | 'success' | 'warning' | 'error';
}

/**
 * Default messages for each status type
 */
const DEFAULT_MESSAGES: Record<string, VerificationMessage> = {
    checking: { text: 'Verifying...', type: 'info' },
    success: { text: 'Verified', type: 'success' },
    warning: { text: 'Warning', type: 'warning' },
    error: { text: 'Verification failed', type: 'error' },
};

/**
 * Hook to format status into verification message with type
 *
 * @param status - Current verification status
 * @param message - Optional custom message override
 * @returns VerificationMessage with text and type
 *
 * @example
 * ```tsx
 * const { text, type } = useVerificationMessage('checking');
 * // Returns { text: 'Verifying...', type: 'info' }
 *
 * const { text, type } = useVerificationMessage('error', 'Auth failed');
 * // Returns { text: 'Auth failed', type: 'error' }
 * ```
 */
export function useVerificationMessage(
    status: string,
    message?: string,
): VerificationMessage {
    return useMemo(() => {
        const defaultMessage = DEFAULT_MESSAGES[status];

        if (defaultMessage) {
            return {
                text: message || defaultMessage.text,
                type: defaultMessage.type,
            };
        }

        // Unknown status - return with custom message or 'Unknown'
        return {
            text: message || 'Unknown',
            type: 'info' as const,
        };
    }, [status, message]);
}
