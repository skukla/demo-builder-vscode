/**
 * List Component
 *
 * An accessible list component built with React Aria for keyboard navigation
 * and screen reader support. Replaces @adobe/react-spectrum ListView
 * for non-virtualized list use cases.
 *
 * @example
 * <List selectionMode="single" selectedKeys={selected} onSelectionChange={setSelected}>
 *     {items.map(item => (
 *         <ListItem key={item.id} id={item.id}>{item.name}</ListItem>
 *     ))}
 * </List>
 */

import React, { forwardRef } from 'react';
import {
    ListBox,
    ListBoxItem,
    type Key,
    type Selection,
} from 'react-aria-components';
import stylesImport from './List.module.css';
import { cn } from '@/core/ui/utils/classNames';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

export type SelectionMode = 'none' | 'single' | 'multiple';

export interface ListProps<T> {
    /** List items (static children) */
    children?: React.ReactNode | ((item: T) => React.ReactNode);
    /** Dynamic items array for data-driven rendering */
    items?: Iterable<T>;
    /** Selection mode */
    selectionMode?: SelectionMode;
    /** Selected keys (controlled) */
    selectedKeys?: 'all' | Set<Key>;
    /** Default selected keys (uncontrolled) */
    defaultSelectedKeys?: 'all' | Set<Key>;
    /** Selection change handler */
    onSelectionChange?: (keys: Set<Key>) => void;
    /** Disabled keys */
    disabledKeys?: Set<Key>;
    /** Accessible label */
    'aria-label'?: string;
    /** Additional CSS class */
    className?: string;
}

/**
 * List - Accessible listbox with keyboard navigation
 *
 * Replaces @adobe/react-spectrum ListView for non-virtualized cases.
 * Provides:
 * - Arrow key navigation
 * - Single/multiple selection
 * - Enter/Space selection
 * - Screen reader support with proper ARIA semantics
 */
function ListComponent<T extends object>(
    {
        children,
        items,
        selectionMode = 'single',
        selectedKeys,
        defaultSelectedKeys,
        onSelectionChange,
        disabledKeys,
        'aria-label': ariaLabel,
        className,
    }: ListProps<T>,
    ref: React.ForwardedRef<HTMLDivElement>,
) {
    // Handle selection change to convert Selection to Set<Key>
    const handleSelectionChange = (selection: Selection) => {
        if (selection === 'all') {
            // For 'all' selection, we'd need to know all keys
            // For now, just pass empty set
            onSelectionChange?.(new Set());
        } else {
            onSelectionChange?.(selection);
        }
    };

    return (
        <ListBox
            ref={ref}
            className={cn(styles.list, className)}
            selectionMode={selectionMode}
            selectedKeys={selectedKeys}
            defaultSelectedKeys={defaultSelectedKeys}
            onSelectionChange={handleSelectionChange}
            disabledKeys={disabledKeys}
            aria-label={ariaLabel}
            items={items}
        >
            {children}
        </ListBox>
    );
}

// Use forwardRef with generic type
export const List = forwardRef(ListComponent) as <T extends object>(
    props: ListProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement;

// Add displayName
(List as React.FC).displayName = 'List';

export interface ListItemProps {
    /** Unique ID for the item */
    id: string;
    /** Item content */
    children: React.ReactNode;
    /** Text value for type-ahead and accessibility */
    textValue?: string;
    /** Whether item is disabled */
    isDisabled?: boolean;
    /** Additional CSS class */
    className?: string;
}

/**
 * ListItem - Individual item within a List
 */
export const ListItem = forwardRef<HTMLDivElement, ListItemProps>(
    function ListItem(
        {
            id,
            children,
            textValue,
            isDisabled = false,
            className,
        },
        ref,
    ) {
        // Derive textValue from children if not provided and children is a string
        const derivedTextValue =
            textValue || (typeof children === 'string' ? children : undefined);

        return (
            <ListBoxItem
                ref={ref}
                id={id}
                className={cn(styles.item, className)}
                textValue={derivedTextValue}
                isDisabled={isDisabled}
            >
                {({ isSelected, isFocused, isDisabled: disabled }) => (
                    <div
                        className={cn(
                            styles.itemContent,
                            isSelected && styles.selected,
                            isFocused && styles.focused,
                            disabled && styles.disabled,
                        )}
                        data-selected={isSelected || undefined}
                        data-focused={isFocused || undefined}
                        data-disabled={disabled || undefined}
                    >
                        {children}
                    </div>
                )}
            </ListBoxItem>
        );
    },
);

ListItem.displayName = 'ListItem';
