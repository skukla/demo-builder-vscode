import { ProgressCircle } from '@adobe/react-spectrum';
import React from 'react';

export interface SpinnerProps {
    /** Size of the spinner */
    size?: 'S' | 'M' | 'L';
    /** Whether the spinner is indeterminate (default: true) */
    isIndeterminate?: boolean;
    /** Optional aria-label for accessibility */
    'aria-label'?: string;
    /** Optional className */
    className?: string;
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
export const Spinner: React.FC<SpinnerProps> = ({
    size = 'M',
    isIndeterminate = true,
    'aria-label': ariaLabel = 'Loading',
    className,
}) => {
    return (
        <ProgressCircle
            size={size}
            isIndeterminate={isIndeterminate}
            aria-label={ariaLabel}
            UNSAFE_className={className}
        />
    );
};
