/**
 * ProjectActionsMenu Component
 *
 * Kebab menu (⋮) for project actions like Export and Delete.
 * Handles click propagation to prevent triggering parent selection.
 * Used by both ProjectCard and ProjectRow components.
 */

import { Text, ActionButton, MenuTrigger, Menu, Item } from '@adobe/react-spectrum';
import Delete from '@spectrum-icons/workflow/Delete';
import Export from '@spectrum-icons/workflow/Export';
import MoreSmallListVert from '@spectrum-icons/workflow/MoreSmallListVert';
import React, { useCallback, useMemo } from 'react';
import type { Project } from '@/types/base';

/** Menu item configuration */
interface MenuItem {
    key: string;
    label: string;
    icon: 'export' | 'delete';
}

export interface ProjectActionsMenuProps {
    /** The project to perform actions on */
    project: Project;
    /** Callback to export project settings */
    onExport?: (project: Project) => void;
    /** Callback to delete project */
    onDelete?: (project: Project) => void;
    /** Optional CSS class for the menu button */
    className?: string;
}

/**
 * ProjectActionsMenu - Kebab menu for project actions
 *
 * Centralizes action menu logic for ProjectCard and ProjectRow.
 * Stops click propagation to prevent parent element selection.
 */
export const ProjectActionsMenu: React.FC<ProjectActionsMenuProps> = ({
    project,
    onExport,
    onDelete,
    className,
}) => {
    const handleMenuAction = useCallback((key: React.Key) => {
        if (key === 'export' && onExport) {
            onExport(project);
        } else if (key === 'delete' && onDelete) {
            onDelete(project);
        }
    }, [project, onExport, onDelete]);

    // Stop click propagation to prevent triggering parent selection
    const handleMenuClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    // Build menu items dynamically (Spectrum requires no undefined children)
    const menuItems = useMemo<MenuItem[]>(() => {
        const items: MenuItem[] = [];
        if (onExport) {
            items.push({ key: 'export', label: 'Export Project', icon: 'export' });
        }
        if (onDelete) {
            items.push({ key: 'delete', label: 'Delete Project', icon: 'delete' });
        }
        return items;
    }, [onExport, onDelete]);

    // Don't render if no actions available
    if (menuItems.length === 0) {
        return null;
    }

    return (
        <div onClick={handleMenuClick}>
            <MenuTrigger>
                <ActionButton
                    isQuiet
                    aria-label="More actions"
                    UNSAFE_className={className}
                >
                    <MoreSmallListVert size="S" />
                </ActionButton>
                <Menu onAction={handleMenuAction} items={menuItems}>
                    {(item) => (
                        <Item key={item.key} textValue={item.label}>
                            {item.icon === 'export' && <Export size="S" />}
                            {item.icon === 'delete' && <Delete size="S" />}
                            <Text>{item.label}</Text>
                        </Item>
                    )}
                </Menu>
            </MenuTrigger>
        </div>
    );
};
