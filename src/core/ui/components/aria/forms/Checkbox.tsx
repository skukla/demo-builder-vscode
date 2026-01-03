/**
 * Checkbox Component
 *
 * An accessible checkbox component built with React Aria for keyboard
 * and screen reader support. Uses CSS Modules for styling.
 *
 * @example
 * <Checkbox
 *   isSelected={enabled}
 *   onChange={setEnabled}
 * >
 *   Enable feature
 * </Checkbox>
 */

import React, { forwardRef } from 'react';
import { Checkbox as AriaCheckbox } from 'react-aria-components';
import { cn } from '@/core/ui/utils/classNames';
import styles from './Checkbox.module.css';

export interface CheckboxProps {
    /** Label content */
    children?: React.ReactNode;
    /** Whether checkbox is selected */
    isSelected?: boolean;
    /** Default selection state (uncontrolled) */
    defaultSelected?: boolean;
    /** Selection change handler */
    onChange?: (isSelected: boolean) => void;
    /** Whether checkbox is disabled */
    isDisabled?: boolean;
    /** Additional CSS class */
    className?: string;
}

/**
 * Checkbox - Accessible checkbox with label
 *
 * Replaces @adobe/react-spectrum Checkbox component.
 * Provides:
 * - Accessible label association
 * - Keyboard toggle (Space key)
 * - Custom checkbox indicator styling
 */
export const Checkbox = forwardRef<HTMLLabelElement, CheckboxProps>(
    function Checkbox(
        {
            children,
            isSelected,
            defaultSelected,
            onChange,
            isDisabled = false,
            className,
        },
        ref
    ) {
        return (
            <AriaCheckbox
                ref={ref}
                className={cn(styles.checkbox, className)}
                isSelected={isSelected}
                defaultSelected={defaultSelected}
                onChange={onChange}
                isDisabled={isDisabled}
            >
                {({ isSelected: selected }) => (
                    <>
                        <div
                            className={cn(
                                styles.box,
                                selected && styles.selected
                            )}
                            data-selected={selected || undefined}
                        >
                            {selected && (
                                <svg
                                    className={styles.checkmark}
                                    viewBox="0 0 12 10"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <polyline points="1,5 4,8 11,1" />
                                </svg>
                            )}
                        </div>
                        {children && (
                            <span className={styles.label}>{children}</span>
                        )}
                    </>
                )}
            </AriaCheckbox>
        );
    }
);

Checkbox.displayName = 'Checkbox';
