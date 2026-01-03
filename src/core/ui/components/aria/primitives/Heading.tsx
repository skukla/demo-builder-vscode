/**
 * Heading Component
 *
 * A primitive component for rendering semantic headings (h1-h6) with CSS Module styling.
 * Compatible with React Spectrum's Heading component API for drop-in replacement.
 *
 * @example
 * <Heading level={1}>Main Title</Heading>
 * <Heading>Section Title</Heading> // defaults to h2
 * <Heading marginBottom="size-200">Spaced Heading</Heading>
 */

import React, { forwardRef, CSSProperties } from 'react';
import { cn } from '@/core/ui/utils/classNames';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';
import styles from './Heading.module.css';

export interface HeadingProps {
    /** Heading content */
    children?: React.ReactNode;
    /** Heading level 1-6 (default: 2) */
    level?: 1 | 2 | 3 | 4 | 5 | 6;
    /** Bottom margin using Spectrum tokens or pixels */
    marginBottom?: DimensionValue;
    /** Custom CSS class */
    className?: string;
}

/**
 * Heading primitive component
 *
 * Renders a semantic heading element (h1-h6) with CSS Module styling.
 * Supports ref forwarding and Spectrum-compatible dimension props.
 */
export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
    function Heading({ children, level = 2, marginBottom, className }, ref) {
        const Element = `h${level}` as keyof JSX.IntrinsicElements;

        const style: CSSProperties = {};
        if (marginBottom !== undefined) {
            style.marginBottom = translateSpectrumToken(marginBottom);
        }

        return React.createElement(
            Element,
            {
                ref,
                className: cn(styles.heading, className),
                style: Object.keys(style).length > 0 ? style : undefined,
            },
            children
        );
    }
);

Heading.displayName = 'Heading';
