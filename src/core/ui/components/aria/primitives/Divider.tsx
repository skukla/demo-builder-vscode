/**
 * Divider Component
 *
 * A primitive component for horizontal rules with CSS Module styling.
 * Compatible with React Spectrum's Divider component API for drop-in replacement.
 *
 * @example
 * <Divider />
 * <Divider size="L" marginBottom="size-200" />
 */

import React, { forwardRef, CSSProperties } from 'react';
import stylesImport from './Divider.module.css';
import { cn } from '@/core/ui/utils/classNames';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

export interface DividerProps {
    /** Divider thickness: S (1px), M (2px), L (4px) */
    size?: 'S' | 'M' | 'L';
    /** Top margin using Spectrum tokens or pixels */
    marginTop?: DimensionValue;
    /** Bottom margin using Spectrum tokens or pixels */
    marginBottom?: DimensionValue;
    /** Custom CSS class */
    className?: string;
}

/**
 * Get size class - lazy evaluation to avoid module load timing issues
 */
function getSizeClass(size: 'S' | 'M' | 'L'): string {
    const classes: Record<'S' | 'M' | 'L', string> = {
        S: styles.sizeS,
        M: styles.sizeM,
        L: styles.sizeL,
    };
    return classes[size];
}

/**
 * Divider primitive component
 *
 * Renders a horizontal rule with CSS Module styling.
 * Supports ref forwarding and Spectrum-compatible dimension props.
 */
export const Divider = forwardRef<HTMLHRElement, DividerProps>(
    function Divider({ size = 'M', marginTop, marginBottom, className }, ref) {
        const style: CSSProperties = {};

        if (marginTop !== undefined) {
            style.marginTop = translateSpectrumToken(marginTop);
        }
        if (marginBottom !== undefined) {
            style.marginBottom = translateSpectrumToken(marginBottom);
        }

        return (
            <hr
                ref={ref}
                className={cn(styles.divider, getSizeClass(size), className)}
                style={Object.keys(style).length > 0 ? style : undefined}
            />
        );
    },
);

Divider.displayName = 'Divider';
