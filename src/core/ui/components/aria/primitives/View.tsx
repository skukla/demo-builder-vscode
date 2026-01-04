/**
 * View Component
 *
 * A primitive component for generic container divs with CSS Module styling.
 * Compatible with React Spectrum's View component API for drop-in replacement.
 *
 * @example
 * <View marginTop="size-200" marginBottom="size-300">
 *   <p>Content with spacing</p>
 * </View>
 */

import React, { forwardRef, CSSProperties } from 'react';
import stylesImport from './View.module.css';
import { cn } from '@/core/ui/utils/classNames';
import { buildDimensionStyle, DimensionValue } from '@/core/ui/utils/spectrumTokens';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

export interface ViewProps {
    /** View content */
    children?: React.ReactNode;
    /** Width using Spectrum tokens or pixels */
    width?: DimensionValue;
    /** Height using Spectrum tokens or pixels */
    height?: DimensionValue;
    /** CSS position property */
    position?: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
    /** Left position using Spectrum tokens or pixels */
    left?: DimensionValue;
    /** Top position using Spectrum tokens or pixels */
    top?: DimensionValue;
    /** Right position using Spectrum tokens or pixels */
    right?: DimensionValue;
    /** Bottom position using Spectrum tokens or pixels */
    bottom?: DimensionValue;
    /** Top margin using Spectrum tokens or pixels */
    marginTop?: DimensionValue;
    /** Bottom margin using Spectrum tokens or pixels */
    marginBottom?: DimensionValue;
    /** Start margin (left in LTR) using Spectrum tokens or pixels */
    marginStart?: DimensionValue;
    /** End margin (right in LTR) using Spectrum tokens or pixels */
    marginEnd?: DimensionValue;
    /** Padding using Spectrum tokens or pixels */
    padding?: DimensionValue;
    /** Custom CSS class */
    className?: string;
    /** Inline style override */
    style?: CSSProperties;
}

/**
 * View primitive component
 *
 * Renders a container div with CSS Module styling.
 * Supports ref forwarding and Spectrum-compatible dimension props.
 */
export const View = forwardRef<HTMLDivElement, ViewProps>(
    function View(
        {
            children,
            width,
            height,
            position,
            left,
            top,
            right,
            bottom,
            marginTop,
            marginBottom,
            marginStart,
            marginEnd,
            padding,
            className,
            style: styleProp,
        },
        ref,
    ) {
        // Build dimension styles using utility, merge with base style and position
        const baseStyle: CSSProperties = { ...styleProp };
        if (position !== undefined) {
            baseStyle.position = position;
        }

        const style = buildDimensionStyle(
            { width, height, left, top, right, bottom, marginTop, marginBottom, marginStart, marginEnd, padding },
            baseStyle,
        );

        return (
            <div
                ref={ref}
                className={cn(styles.view, className)}
                style={Object.keys(style).length > 0 ? style : undefined}
            >
                {children}
            </div>
        );
    },
);

View.displayName = 'View';
