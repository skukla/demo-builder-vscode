import React from 'react';
import { Text } from '@adobe/react-spectrum';
import { cn } from '@/core/ui/utils/classNames';

export interface LoadingOverlayProps {
    /** Whether the overlay is visible */
    isVisible: boolean;
    /** Optional message to display below spinner */
    message?: string;
    /** Use opaque background instead of semi-transparent (for full-screen transitions) */
    opaque?: boolean;
}

/**
 * Modal loading overlay with spinner.
 *
 * Use for blocking operations where user should wait
 * (e.g., "Backend Call on Continue" pattern).
 *
 * For inline loading states, use LoadingDisplay instead.
 *
 * SOP §11: Uses CSS classes from custom-spectrum.css instead of inline styles
 *
 * @example
 * <div style={{ position: 'relative' }}>
 *   <YourContent />
 *   <LoadingOverlay isVisible={isLoading} message="Saving..." />
 * </div>
 *
 * @example Opaque overlay for full-screen transitions
 * <LoadingOverlay isVisible={isTransitioning} message="Loading..." opaque />
 */
export function LoadingOverlay({ isVisible, message, opaque = false }: LoadingOverlayProps): React.ReactElement | null {
    if (!isVisible) {
        return null;
    }

    return (
        <div
            className={cn(
                'loading-overlay-container',
                opaque && 'loading-overlay-container-opaque'
            )}
            data-testid="loading-overlay"
        >
            <div
                className="loading-overlay-spinner-container"
                role="status"
                aria-busy="true"
                aria-label={message || 'Loading'}
            >
                <div className="loading-overlay-spinner" data-testid="loading-spinner" />
            </div>
            {message && (
                <Text
                    UNSAFE_className="loading-overlay-text"
                    data-testid="loading-message"
                >
                    {message}
                </Text>
            )}
        </div>
    );
}
