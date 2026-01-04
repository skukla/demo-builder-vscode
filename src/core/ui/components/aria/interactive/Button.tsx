/**
 * Button Component
 *
 * An accessible button component built with React Aria for keyboard and screen reader support.
 * Uses CSS Modules for styling with zero !important declarations.
 *
 * @example
 * <Button variant="accent" onPress={() => console.log('clicked')}>
 *   Save Changes
 * </Button>
 *
 * @example
 * <Button isQuiet isDisabled>
 *   Disabled Quiet Button
 * </Button>
 */

import React, { forwardRef, CSSProperties } from 'react';
import { Button as AriaButton, ButtonProps as AriaButtonProps } from 'react-aria-components';
import stylesImport from './Button.module.css';
import { cn } from '@/core/ui/utils/classNames';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

export type ButtonVariant = 'accent' | 'secondary' | 'cta' | 'negative';

export interface ButtonProps extends Omit<AriaButtonProps, 'className' | 'style'> {
    /** Button content */
    children?: React.ReactNode;
    /** Visual variant of the button */
    variant?: ButtonVariant;
    /** Quiet/subtle visual style */
    isQuiet?: boolean;
    /** Top margin using Spectrum tokens or pixels */
    marginTop?: DimensionValue;
    /** Bottom margin using Spectrum tokens or pixels */
    marginBottom?: DimensionValue;
    /** Additional CSS class */
    className?: string;
    /** Accessibility label for icon-only buttons */
    'aria-label'?: string;
}

/**
 * Button component
 *
 * Renders an accessible button using React Aria with CSS Module styling.
 * Supports variants, quiet mode, and Spectrum-compatible dimension props.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    function Button(
        {
            children,
            variant,
            isQuiet,
            marginTop,
            marginBottom,
            className,
            ...ariaProps
        },
        ref,
    ) {
        const style: CSSProperties = {};

        if (marginTop !== undefined) {
            style.marginTop = translateSpectrumToken(marginTop);
        }
        if (marginBottom !== undefined) {
            style.marginBottom = translateSpectrumToken(marginBottom);
        }

        return (
            <AriaButton
                ref={ref}
                {...ariaProps}
                className={cn(styles.button, className)}
                style={Object.keys(style).length > 0 ? style : undefined}
                data-variant={variant}
                data-quiet={isQuiet ? '' : undefined}
            >
                {children}
            </AriaButton>
        );
    },
);

Button.displayName = 'Button';
