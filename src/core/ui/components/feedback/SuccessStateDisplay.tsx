/**
 * SuccessStateDisplay - Convenience wrapper for success states
 *
 * Wraps StatusDisplay with variant="success" for consistent success state rendering.
 * Includes centered checkmark icon and configurable height.
 *
 * @example
 * ```tsx
 * <SuccessStateDisplay
 *   title="Project Created"
 *   message="Your demo project is ready."
 *   details={['Components installed', 'Mesh deployed']}
 *   actions={[{ label: 'Continue', onPress: handleContinue, variant: 'accent' }]}
 * />
 * ```
 */
import React from 'react';
import { StatusDisplay, StatusAction } from './StatusDisplay';

export interface SuccessStateDisplayProps {
    /** Main title text */
    title: string;
    /** Optional description message */
    message?: string;
    /** Optional array of detail lines */
    details?: string[];
    /** Optional action buttons */
    actions?: StatusAction[];
    /** Height of the container (default: 350px) */
    height?: string;
}

export const SuccessStateDisplay = React.memo(function SuccessStateDisplay({
    title,
    message,
    details,
    actions,
    height = '350px',
}: SuccessStateDisplayProps): React.ReactElement {
    return (
        <StatusDisplay
            variant="success"
            title={title}
            message={message}
            details={details}
            actions={actions}
            height={height}
            centerMessage={true}
        />
    );
});

SuccessStateDisplay.displayName = 'SuccessStateDisplay';

export type { StatusAction } from './StatusDisplay';
