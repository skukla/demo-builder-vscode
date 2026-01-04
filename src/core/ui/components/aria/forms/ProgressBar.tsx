/**
 * ProgressBar Component
 *
 * An accessible progress bar component built with React Aria for screen
 * reader support. Supports determinate and indeterminate modes with
 * size variants.
 *
 * @example
 * // Determinate
 * <ProgressBar value={75} label="Loading..." />
 *
 * // Indeterminate
 * <ProgressBar isIndeterminate label="Please wait..." />
 */

import React, { forwardRef } from 'react';
import { ProgressBar as AriaProgressBar, Label } from 'react-aria-components';
import stylesImport from './ProgressBar.module.css';
import { cn } from '@/core/ui/utils/classNames';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

export type ProgressBarSize = 'S' | 'M' | 'L';

export interface ProgressBarProps {
    /** Current value */
    value?: number;
    /** Minimum value (default: 0) */
    minValue?: number;
    /** Maximum value (default: 100) */
    maxValue?: number;
    /** Label text */
    label?: string;
    /** Show indeterminate animation */
    isIndeterminate?: boolean;
    /** Size variant */
    size?: ProgressBarSize;
    /** Accessible label (when no visible label) */
    'aria-label'?: string;
    /** Additional CSS class */
    className?: string;
}

/**
 * ProgressBar - Accessible progress indicator
 *
 * Replaces @adobe/react-spectrum ProgressBar component.
 * Provides:
 * - Determinate mode (value/maxValue)
 * - Indeterminate mode (animated)
 * - Size variants (S, M, L)
 * - Accessible ARIA attributes
 */
export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
    function ProgressBar(
        {
            value = 0,
            minValue = 0,
            maxValue = 100,
            label,
            isIndeterminate = false,
            size = 'M',
            'aria-label': ariaLabel,
            className,
        },
        ref,
    ) {
        return (
            <AriaProgressBar
                ref={ref}
                className={cn(styles.progressBar, className)}
                value={isIndeterminate ? undefined : value}
                minValue={minValue}
                maxValue={maxValue}
                isIndeterminate={isIndeterminate}
                aria-label={ariaLabel}
                data-indeterminate={isIndeterminate || undefined}
                data-size={size}
            >
                {({ percentage }) => (
                    <>
                        {label && (
                            <Label className={styles.label}>{label}</Label>
                        )}
                        <div className={styles.track}>
                            <div
                                className={cn(
                                    styles.fill,
                                    isIndeterminate && styles.indeterminate,
                                )}
                                style={isIndeterminate ? undefined : { width: `${percentage}%` }}
                            />
                        </div>
                    </>
                )}
            </AriaProgressBar>
        );
    },
);

ProgressBar.displayName = 'ProgressBar';
