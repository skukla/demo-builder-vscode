/**
 * SidebarNav Component
 *
 * Navigation list for the sidebar.
 */

import { Flex, Text } from '@/core/ui/components/aria';
import React from 'react';
import type { NavItem } from '../../types';
import styles from '../styles/sidebar.module.css';

export interface SidebarNavProps {
    /** Navigation items to display */
    items: NavItem[];
    /** Callback when an item is clicked */
    onNavigate: (id: string) => void;
}

/**
 * SidebarNav - Renders navigation items for the sidebar
 */
export const SidebarNav: React.FC<SidebarNavProps> = ({ items, onNavigate }) => {
    return (
        <Flex direction="column" gap="size-50">
            {items.map((item) => (
                <NavItemButton
                    key={item.id}
                    item={item}
                    onClick={() => onNavigate(item.id)}
                />
            ))}
        </Flex>
    );
};

interface NavItemButtonProps {
    item: NavItem;
    onClick: () => void;
}

const NavItemButton: React.FC<NavItemButtonProps> = ({ item, onClick }) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        }
    };

    return (
        <div
            role="button"
            tabIndex={0}
            data-active={item.active || undefined}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            className={styles.navItem}
            // SOP: Dynamic style - background depends on item.active prop
            style={{
                background: item.active
                    ? 'var(--spectrum-global-color-gray-200)'
                    : 'transparent',
            }}
        >
            <Text
                className={item.active ? 'font-medium' : ''}
            >
                {item.label}
            </Text>
        </div>
    );
};
