import { ProgressCircle } from '@adobe/react-spectrum';
import React from 'react';

export interface SpinnerProps {
    /** Size of the spinner */
    size?: 'S' | 'M' | 'L';
    /** Whether the spinner is indeterminate (default: true) */
    isIndeterminate?: boolean;
    /** Optional aria-label for accessibility */
    'aria-label'?: string;
}

/**
 * Atomic Component: Spinner
 *
 * A loading spinner based on Adobe Spectrum's ProgressCircle.
 * Use for indicating loading states.
 *
 * @example
 * ```tsx
 * <Spinner size="M" aria-label="Loading data" />
 * ```
 */
export function Spinner({
    size = 'M',
    isIndeterminate = true,
    'aria-label': ariaLabel = 'Loading',
}: SpinnerProps) {
    return (
        <ProgressCircle
            size={size}
            isIndeterminate={isIndeterminate}
            aria-label={ariaLabel}
        />
    );
}
