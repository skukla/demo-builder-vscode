/**
 * Flex Component
 *
 * A primitive component for flexbox layouts with CSS Module styling.
 * Compatible with React Spectrum's Flex component API for drop-in replacement.
 *
 * @example
 * <Flex direction="column" gap="size-200">
 *   <div>Item 1</div>
 *   <div>Item 2</div>
 * </Flex>
 */

import React, { forwardRef, CSSProperties } from 'react';
import { cn } from '@/core/ui/utils/classNames';
import { buildDimensionStyle, DimensionValue } from '@/core/ui/utils/spectrumTokens';
import styles from './Flex.module.css';

export interface FlexProps {
    /** Flex content */
    children?: React.ReactNode;
    /** Flex direction (default: row) */
    direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    /** Gap between items using Spectrum tokens or pixels */
    gap?: DimensionValue;
    /** Align items on cross axis */
    alignItems?: 'start' | 'end' | 'center' | 'stretch' | 'baseline';
    /** Justify content on main axis */
    justifyContent?: 'start' | 'end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
    /** Flex grow/shrink/basis shorthand */
    flex?: number | string;
    /** Whether items should wrap */
    wrap?: boolean;
    /** Width using Spectrum tokens or pixels */
    width?: DimensionValue;
    /** Height using Spectrum tokens or pixels */
    height?: DimensionValue;
    /** Min width using Spectrum tokens or pixels */
    minWidth?: DimensionValue;
    /** Max width using Spectrum tokens or pixels */
    maxWidth?: DimensionValue;
    /** Min height using Spectrum tokens or pixels */
    minHeight?: DimensionValue;
    /** Max height using Spectrum tokens or pixels */
    maxHeight?: DimensionValue;
    /** Top margin using Spectrum tokens or pixels */
    marginTop?: DimensionValue;
    /** Bottom margin using Spectrum tokens or pixels */
    marginBottom?: DimensionValue;
    /** Custom CSS class */
    className?: string;
}

/**
 * Flex primitive component
 *
 * Renders a flex container with CSS Module styling.
 * Supports ref forwarding and Spectrum-compatible dimension props.
 */
export const Flex = forwardRef<HTMLDivElement, FlexProps>(
    function Flex(
        {
            children,
            direction = 'row',
            gap,
            alignItems,
            justifyContent,
            flex,
            wrap,
            width,
            height,
            minWidth,
            maxWidth,
            minHeight,
            maxHeight,
            marginTop,
            marginBottom,
            className,
        },
        ref
    ) {
        // Build base flexbox style
        const baseStyle: CSSProperties = {
            display: 'flex',
            flexDirection: direction,
        };

        if (alignItems !== undefined) {
            baseStyle.alignItems = alignItems;
        }
        if (justifyContent !== undefined) {
            baseStyle.justifyContent = justifyContent;
        }
        if (flex !== undefined) {
            baseStyle.flex = flex;
        }
        if (wrap) {
            baseStyle.flexWrap = 'wrap';
        }

        // Build dimension styles using utility
        const style = buildDimensionStyle(
            { gap, width, height, minWidth, maxWidth, minHeight, maxHeight, marginTop, marginBottom },
            baseStyle
        );

        return (
            <div
                ref={ref}
                className={cn(styles.flex, className)}
                style={style}
            >
                {children}
            </div>
        );
    }
);

Flex.displayName = 'Flex';
