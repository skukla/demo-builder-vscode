/**
 * ProgressCircle Component
 *
 * A circular progress indicator with proper ARIA accessibility.
 * Supports both indeterminate (spinner) and determinate (progress arc) modes.
 *
 * Note: React Aria does not have an equivalent component, so this is
 * a custom SVG implementation with proper accessibility attributes.
 *
 * @example
 * // Indeterminate (spinner)
 * <ProgressCircle aria-label="Loading" isIndeterminate />
 *
 * @example
 * // Determinate (75% complete)
 * <ProgressCircle aria-label="Upload progress" value={75} />
 */

import React, { forwardRef } from 'react';
import stylesImport from './ProgressCircle.module.css';
import { cn } from '@/core/ui/utils/classNames';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

export type ProgressCircleSize = 'S' | 'M' | 'L';

export interface ProgressCircleProps {
    /** Size variant: S (16px), M (32px), L (64px) */
    size?: ProgressCircleSize;
    /** Current progress value (0-100). If undefined, shows indeterminate spinner. */
    value?: number;
    /** Force indeterminate mode (overrides value) */
    isIndeterminate?: boolean;
    /** Accessibility label for screen readers */
    'aria-label'?: string;
    /** Additional CSS class */
    className?: string;
}

/** Size to pixel dimension mapping (matches Spectrum) */
const SIZE_MAP: Record<ProgressCircleSize, number> = {
    S: 16,
    M: 32,
    L: 64,
};

/** Size to stroke width mapping */
const STROKE_WIDTH_MAP: Record<ProgressCircleSize, number> = {
    S: 2,
    M: 3,
    L: 4,
};

/**
 * ProgressCircle component
 *
 * Renders a circular progress indicator using SVG.
 * Includes proper ARIA attributes for accessibility.
 */
export const ProgressCircle = forwardRef<HTMLDivElement, ProgressCircleProps>(
    function ProgressCircle(
        {
            size = 'M',
            value,
            isIndeterminate,
            'aria-label': ariaLabel,
            className,
        },
        ref,
    ) {
        const dimension = SIZE_MAP[size];
        const strokeWidth = STROKE_WIDTH_MAP[size];
        const radius = (dimension - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const center = dimension / 2;

        // Determine if indeterminate: explicit prop OR no value provided
        const showIndeterminate = isIndeterminate || value === undefined;

        // Clamp value to 0-100 range
        const clampedValue = value !== undefined
            ? Math.max(0, Math.min(100, value))
            : undefined;

        // Calculate stroke dash offset for determinate mode
        const strokeDashoffset = clampedValue !== undefined
            ? circumference - (clampedValue / 100) * circumference
            : 0;

        return (
            <div
                ref={ref}
                className={cn(styles.progressCircle, className)}
                role="progressbar"
                aria-label={ariaLabel}
                aria-valuemin={clampedValue !== undefined ? 0 : undefined}
                aria-valuemax={clampedValue !== undefined ? 100 : undefined}
                aria-valuenow={clampedValue}
                data-indeterminate={showIndeterminate ? '' : undefined}
            >
                <svg
                    width={dimension}
                    height={dimension}
                    viewBox={`0 0 ${dimension} ${dimension}`}
                    className={styles.svg}
                >
                    {/* Background track circle */}
                    <circle
                        className={styles.track}
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        strokeWidth={strokeWidth}
                    />
                    {/* Progress/spinner circle */}
                    <circle
                        className={showIndeterminate ? styles.spinnerFill : styles.fill}
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={showIndeterminate ? circumference * 0.75 : strokeDashoffset}
                        transform={`rotate(-90 ${center} ${center})`}
                    />
                </svg>
            </div>
        );
    },
);

ProgressCircle.displayName = 'ProgressCircle';
