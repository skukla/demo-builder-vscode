/**
 * Select Component
 *
 * An accessible dropdown select component built with React Aria for keyboard
 * and screen reader support. Replaces Spectrum's Picker component.
 *
 * @example
 * <Select
 *   selectedKey={selected}
 *   onSelectionChange={setSelected}
 *   placeholder="Choose option"
 *   aria-label="Options"
 * >
 *   <SelectItem key="opt1">Option 1</SelectItem>
 *   <SelectItem key="opt2">Option 2</SelectItem>
 * </Select>
 */

import React, { forwardRef } from 'react';
import {
    Select as AriaSelect,
    Button,
    SelectValue,
    Popover,
    ListBox,
    ListBoxItem,
    Label,
} from 'react-aria-components';
import type { Key } from 'react-aria-components';
import { cn } from '@/core/ui/utils/classNames';
import styles from './Select.module.css';

// Re-export ListBoxItem as SelectItem for semantic clarity
export { ListBoxItem as SelectItem };

export interface SelectProps {
    /** Select items */
    children?: React.ReactNode;
    /** Selected key (controlled) */
    selectedKey?: Key | null;
    /** Default selected key (uncontrolled) */
    defaultSelectedKey?: Key;
    /** Selection change handler */
    onSelectionChange?: (key: Key) => void;
    /** Visible label above the select */
    label?: string;
    /** Placeholder when no selection */
    placeholder?: string;
    /** Whether select is disabled */
    isDisabled?: boolean;
    /** Accessible label (used when no visible label) */
    'aria-label'?: string;
    /** Additional CSS class */
    className?: string;
}

/**
 * Select - Accessible dropdown select
 *
 * Replaces @adobe/react-spectrum Picker component.
 * Provides:
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Screen reader support
 * - Popover dropdown
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(
    function Select(
        {
            children,
            selectedKey,
            defaultSelectedKey,
            onSelectionChange,
            label,
            placeholder = 'Select an option',
            isDisabled = false,
            'aria-label': ariaLabel,
            className,
        },
        ref
    ) {
        // Use aria-label if provided, otherwise fall back to placeholder for accessibility
        const accessibleLabel = ariaLabel || (label ? undefined : placeholder);

        return (
            <AriaSelect
                className={cn(styles.select, className)}
                selectedKey={selectedKey}
                defaultSelectedKey={defaultSelectedKey}
                onSelectionChange={onSelectionChange}
                isDisabled={isDisabled}
                aria-label={accessibleLabel}
            >
                {label && <Label className={styles.label}>{label}</Label>}
                <Button ref={ref} className={styles.trigger}>
                    <SelectValue className={styles.value}>
                        {({ selectedText }) => selectedText || placeholder}
                    </SelectValue>
                    <span className={styles.chevron} aria-hidden="true">
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="currentColor"
                        >
                            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                    </span>
                </Button>
                <Popover className={styles.popover}>
                    <ListBox className={styles.listbox}>
                        {children}
                    </ListBox>
                </Popover>
            </AriaSelect>
        );
    }
);

Select.displayName = 'Select';
