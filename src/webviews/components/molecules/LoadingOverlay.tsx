import React from 'react';
import { Spinner } from '../atoms/Spinner';

export interface LoadingOverlayProps {
    /** Whether the overlay is visible */
    visible: boolean;
    /** Size of the spinner */
    size?: 'S' | 'M' | 'L';
    /** Optional message to display */
    message?: string;
    /** Background opacity (0-1, default: 0.3) */
    opacity?: number;
    /** Z-index of overlay (default: 1000) */
    zIndex?: number;
    /** Whether to blur the background content (default: false) */
    blur?: boolean;
}

/**
 * Molecular Component: LoadingOverlay
 *
 * Displays a loading spinner overlay on top of content. Used for indicating
 * loading states that block user interaction without hiding content.
 *
 * Common in "Backend Call on Continue" pattern where selection UI remains
 * visible but disabled during backend operations.
 *
 * @example
 * ```tsx
 * <div style={{ position: 'relative' }}>
 *   <LoadingOverlay visible={isConfirmingSelection} />
 *   <YourContent />
 * </div>
 * ```
 */
export const LoadingOverlay = React.memo<LoadingOverlayProps>(({
    visible,
    size = 'L',
    message,
    opacity = 0.3,
    zIndex = 1000,
    blur = false
}) => {
    if (!visible) return null;

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: `rgba(0, 0, 0, ${opacity})`,
                backdropFilter: blur ? 'blur(4px)' : undefined,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex,
                transition: 'opacity 200ms ease-in-out'
            }}
            role="progressbar"
            aria-label={message || 'Loading'}
            aria-busy="true"
        >
            <div
                style={{
                    backgroundColor: 'var(--spectrum-global-color-gray-50)',
                    padding: message ? '32px' : '24px',
                    borderRadius: message ? '8px' : '50%',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: message ? '16px' : '0'
                }}
            >
                <Spinner size={size} />
                {message && (
                    <span
                        style={{
                            color: 'var(--spectrum-global-color-gray-800)',
                            fontSize: '14px',
                            fontWeight: 500
                        }}
                    >
                        {message}
                    </span>
                )}
            </div>
        </div>
    );
});
