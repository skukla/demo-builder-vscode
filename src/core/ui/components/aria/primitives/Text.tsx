/**
 * Text Component
 *
 * A primitive component for rendering text content with CSS Module styling.
 * Compatible with React Spectrum's Text component API for drop-in replacement.
 *
 * @example
 * <Text>Hello World</Text>
 * <Text elementType="p">Paragraph text</Text>
 * <Text className="custom">Styled text</Text>
 */

import React, { forwardRef, CSSProperties } from 'react';
import stylesImport from './Text.module.css';
import { cn } from '@/core/ui/utils/classNames';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

export interface TextProps {
    /** Text content */
    children?: React.ReactNode;
    /** HTML element to render (default: span) */
    elementType?: 'span' | 'p' | 'div' | 'label' | 'strong' | 'em' | 'small';
    /** Top margin using Spectrum tokens or pixels */
    marginTop?: DimensionValue;
    /** Bottom margin using Spectrum tokens or pixels */
    marginBottom?: DimensionValue;
    /** Custom CSS class */
    className?: string;
}

/**
 * Text primitive component
 *
 * Renders text content in a semantic HTML element with CSS Module styling.
 * Supports ref forwarding and Spectrum-compatible class props.
 */
export const Text = forwardRef<HTMLSpanElement, TextProps>(
    function Text({ children, elementType = 'span', marginTop, marginBottom, className }, ref) {
        const Element = elementType as React.ElementType;

        const style: CSSProperties = {};
        if (marginTop !== undefined) {
            style.marginTop = translateSpectrumToken(marginTop);
        }
        if (marginBottom !== undefined) {
            style.marginBottom = translateSpectrumToken(marginBottom);
        }

        return (
            <Element
                ref={ref}
                className={cn(styles.text, className)}
                style={Object.keys(style).length > 0 ? style : undefined}
            >
                {children}
            </Element>
        );
    },
);

Text.displayName = 'Text';
