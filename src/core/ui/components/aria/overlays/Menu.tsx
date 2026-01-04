/**
 * Menu Component
 *
 * An accessible dropdown menu component built with React Aria for keyboard navigation,
 * type-ahead search, and proper ARIA semantics. Uses CSS Modules for styling
 * with zero !important declarations.
 *
 * @example
 * <MenuTrigger>
 *   <Button>Actions</Button>
 *   <Menu onAction={(key) => console.log(key)}>
 *     <MenuItem id="edit">Edit</MenuItem>
 *     <MenuItem id="delete">Delete</MenuItem>
 *   </Menu>
 * </MenuTrigger>
 */

import React, { forwardRef } from 'react';
import {
    Menu as AriaMenu,
    MenuItem as AriaMenuItem,
    MenuTrigger as AriaMenuTrigger,
    Popover,
    Separator,
    type Key,
} from 'react-aria-components';
import stylesImport from './Menu.module.css';
import { cn } from '@/core/ui/utils/classNames';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

export interface MenuItemData {
    /** Unique key for the item */
    key: string;
    /** Display label */
    label: string;
    /** Optional icon element */
    icon?: React.ReactNode;
    /** Whether item is disabled */
    isDisabled?: boolean;
}

export interface MenuProps {
    /** Menu items (either data array or children) */
    items?: MenuItemData[];
    /** Action handler - receives item key */
    onAction?: (key: Key) => void;
    /** Menu children (alternative to items prop) */
    children?: React.ReactNode;
    /** Additional CSS class */
    className?: string;
}

/**
 * Menu - Accessible dropdown menu with keyboard navigation
 * Replaces @adobe/react-spectrum Menu component
 *
 * Provides:
 * - Arrow key navigation
 * - Type-ahead search
 * - Enter/Space selection
 * - Escape to close
 * - Proper ARIA semantics
 */
export function Menu({
    items,
    onAction,
    children,
    className,
}: MenuProps) {
    return (
        <AriaMenu
            className={cn(styles.menu, className)}
            onAction={onAction}
            selectionMode="none"
        >
            {children ? children : items?.map((item) => (
                <AriaMenuItem
                    key={item.key}
                    id={item.key}
                    className={styles.menuItem}
                    isDisabled={item.isDisabled}
                    textValue={item.label}
                >
                    {item.icon && (
                        <span className={styles.menuItemIcon} aria-hidden="true">
                            {item.icon}
                        </span>
                    )}
                    <span className={styles.menuItemLabel}>{item.label}</span>
                </AriaMenuItem>
            ))}
        </AriaMenu>
    );
}

Menu.displayName = 'Menu';

/**
 * MenuItem - Individual menu item
 */
export interface MenuItemProps {
    /** Unique key for the item */
    id: string;
    /** Whether item is disabled */
    isDisabled?: boolean;
    /** Text value for type-ahead */
    textValue?: string;
    /** Item content */
    children: React.ReactNode;
    /** Additional CSS class */
    className?: string;
}

export const MenuItem = forwardRef<HTMLDivElement, MenuItemProps>(
    function MenuItem(
        {
            id,
            isDisabled = false,
            textValue,
            children,
            className,
        },
        ref,
    ) {
        // Derive textValue from children if not provided and children is a string
        const derivedTextValue = textValue || (typeof children === 'string' ? children : undefined);

        return (
            <AriaMenuItem
                ref={ref}
                id={id}
                className={cn(styles.menuItem, className)}
                isDisabled={isDisabled}
                textValue={derivedTextValue}
            >
                {children}
            </AriaMenuItem>
        );
    },
);

MenuItem.displayName = 'MenuItem';

/**
 * MenuSeparator - Visual separator between menu items
 */
export function MenuSeparator() {
    return <Separator className={styles.separator} />;
}

MenuSeparator.displayName = 'MenuSeparator';

/**
 * MenuTrigger - Manages menu open/close state
 */
export interface MenuTriggerProps {
    /** Trigger element and Menu */
    children: React.ReactNode;
    /** Controlled open state */
    isOpen?: boolean;
    /** Open state change handler */
    onOpenChange?: (isOpen: boolean) => void;
    /** Additional CSS class */
    className?: string;
}

export function MenuTrigger({
    children,
    isOpen,
    onOpenChange,
    className,
}: MenuTriggerProps) {
    // Extract trigger and menu from children
    const childrenArray = React.Children.toArray(children);
    const trigger = childrenArray[0];
    const menu = childrenArray[1];

    return (
        <AriaMenuTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
            {trigger}
            <Popover
                className={cn(styles.popover, className)}
                placement="bottom start"
                offset={4}
            >
                {menu}
            </Popover>
        </AriaMenuTrigger>
    );
}

MenuTrigger.displayName = 'MenuTrigger';
