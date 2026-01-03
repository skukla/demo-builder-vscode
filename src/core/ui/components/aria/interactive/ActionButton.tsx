/**
 * ActionButton Component
 *
 * A quiet button variant optimized for icon-only or icon+text patterns.
 * Built with React Aria for accessibility.
 *
 * @example
 * <ActionButton aria-label="Close">
 *   <CloseIcon />
 * </ActionButton>
 *
 * @example
 * <ActionButton onPress={() => console.log('add')}>
 *   <AddIcon /> Add Item
 * </ActionButton>
 */

import React, { forwardRef } from 'react';
import { Button as AriaButton, ButtonProps as AriaButtonProps } from 'react-aria-components';
import styles from './ActionButton.module.css';
import { cn } from '@/core/ui/utils/classNames';

export interface ActionButtonProps extends Omit<AriaButtonProps, 'className' | 'style'> {
    /** Button content (typically icon or icon + text) */
    children?: React.ReactNode;
    /** Additional CSS class */
    className?: string;
    /** Accessibility label (required for icon-only buttons) */
    'aria-label'?: string;
}

/**
 * ActionButton component
 *
 * Renders a quiet button using React Aria, optimized for icon-based actions.
 * Always renders as quiet (subtle) style by default.
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
    function ActionButton(
        {
            children,
            className,
            ...ariaProps
        },
        ref,
    ) {
        return (
            <AriaButton
                ref={ref}
                {...ariaProps}
                className={cn(styles.actionButton, className)}
                data-quiet=""
            >
                {children}
            </AriaButton>
        );
    },
);

ActionButton.displayName = 'ActionButton';
