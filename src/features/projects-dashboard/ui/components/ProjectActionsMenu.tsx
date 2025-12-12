/**
 * ProjectActionsMenu Component
 *
 * Kebab menu (⋮) for project actions like Export.
 * Handles click propagation to prevent triggering parent selection.
 * Used by both ProjectCard and ProjectRow components.
 */

import React, { useCallback } from 'react';
import { Text, ActionButton, MenuTrigger, Menu, Item } from '@adobe/react-spectrum';
import MoreSmallListVert from '@spectrum-icons/workflow/MoreSmallListVert';
import Export from '@spectrum-icons/workflow/Export';
import type { Project } from '@/types/base';

export interface ProjectActionsMenuProps {
    /** The project to perform actions on */
    project: Project;
    /** Callback to export project settings */
    onExport?: (project: Project) => void;
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
    className,
}) => {
    const handleMenuAction = useCallback((key: React.Key) => {
        if (key === 'export' && onExport) {
            onExport(project);
        }
    }, [project, onExport]);

    // Stop click propagation to prevent triggering parent selection
    const handleMenuClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    // Don't render if no actions available
    if (!onExport) {
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
                <Menu onAction={handleMenuAction}>
                    <Item key="export" textValue="Export Project">
                        <Export size="S" />
                        <Text>Export Project</Text>
                    </Item>
                </Menu>
            </MenuTrigger>
        </div>
    );
};
