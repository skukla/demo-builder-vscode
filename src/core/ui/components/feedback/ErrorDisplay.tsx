import React from 'react';
import Refresh from '@spectrum-icons/workflow/Refresh';
import { StatusDisplay } from './StatusDisplay';

export interface ErrorDisplayProps {
    /** Error title */
    title?: string;
    /** Error message */
    message: string;
    /** Optional retry handler */
    onRetry?: () => void;
    /** Retry button label (default: "Try Again") */
    retryLabel?: string;
    /** Icon size (ignored - StatusDisplay uses fixed size) */
    iconSize?: 'S' | 'M' | 'L' | 'XL';
    /** Whether to center the display (ignored - StatusDisplay is always centered) */
    centered?: boolean;
    /** Maximum width of error text */
    maxWidth?: string;
    /** Error severity (affects icon color) */
    severity?: 'error' | 'warning';
}

/**
 * @deprecated Use `StatusDisplay` with `variant="error"` instead.
 * This component will be removed in a future version.
 *
 * @example
 * // Before:
 * <ErrorDisplay title="Error" message="Something went wrong" onRetry={handleRetry} />
 *
 * // After:
 * <StatusDisplay
 *   variant="error"
 *   title="Error"
 *   message="Something went wrong"
 *   actions={[{ label: 'Try Again', onPress: handleRetry, variant: 'accent' }]}
 * />
 */
export const ErrorDisplay = React.memo<ErrorDisplayProps>(({
    title = 'Error',
    message,
    onRetry,
    retryLabel = 'Try Again',
    maxWidth = '450px',
    severity = 'error'
}) => {
    // Log deprecation warning in development
    if (process.env.NODE_ENV === 'development') {
        console.warn(
            'ErrorDisplay is deprecated. Use StatusDisplay with variant="error" instead.'
        );
    }

    // Map severity to StatusDisplay variant
    const variant = severity === 'warning' ? 'warning' : 'error';

    // Build actions array if onRetry is provided
    const actions = onRetry
        ? [{ label: retryLabel, onPress: onRetry, variant: 'accent' as const, icon: <Refresh size="S" /> }]
        : undefined;

    return (
        <StatusDisplay
            variant={variant}
            title={title}
            message={message}
            actions={actions}
            maxWidth={maxWidth}
        />
    );
});
