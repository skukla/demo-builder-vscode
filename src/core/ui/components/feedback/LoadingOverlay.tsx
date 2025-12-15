import React from 'react';
import { Text } from '@adobe/react-spectrum';

export interface LoadingOverlayProps {
    /** Whether the overlay is visible */
    isVisible: boolean;
    /** Optional message to display below spinner */
    message?: string;
    /** Use opaque background instead of semi-transparent (for full-screen transitions) */
    opaque?: boolean;
}

const styles = {
    container: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--db-loading-overlay-bg)',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        borderRadius: '4px',
        gap: '16px',
    },
    spinnerContainer: {
        backgroundColor: 'var(--spectrum-global-color-gray-50)',
        padding: '24px',
        borderRadius: '50%',
        boxShadow: '0 4px 12px var(--db-loading-overlay-shadow)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    spinner: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        border: '3px solid var(--spectrum-global-color-blue-400)',
        borderTopColor: 'transparent',
        animation: 'loading-overlay-spin 1s linear infinite',
    },
};

// CSS keyframes for spinner (injected once)
const spinKeyframes = `
  @keyframes loading-overlay-spin {
    to { transform: rotate(360deg); }
  }
`;

/**
 * Modal loading overlay with spinner.
 *
 * Use for blocking operations where user should wait
 * (e.g., "Backend Call on Continue" pattern).
 *
 * For inline loading states, use LoadingDisplay instead.
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

    const containerStyle = {
        ...styles.container,
        // Use opaque background for full-screen transitions (hides content behind)
        backgroundColor: opaque
            ? 'var(--spectrum-global-color-gray-50)'
            : 'var(--db-loading-overlay-bg)',
    };

    return (
        <>
            <style>{spinKeyframes}</style>
            <div style={containerStyle} data-testid="loading-overlay">
                <div
                    style={styles.spinnerContainer}
                    role="status"
                    aria-busy="true"
                    aria-label={message || 'Loading'}
                >
                    <div style={styles.spinner} data-testid="loading-spinner" />
                </div>
                {message && (
                    <Text
                        UNSAFE_style={{ color: 'var(--db-loading-text)', fontWeight: 500 }}
                        data-testid="loading-message"
                    >
                        {message}
                    </Text>
                )}
            </div>
        </>
    );
}
