/**
 * ProjectActionsMenu Component
 *
 * Kebab menu (⋮) for project actions like Start/Stop, Open, Export, and Delete.
 * Handles click propagation to prevent triggering parent selection.
 * Used by both ProjectCard and ProjectRow components.
 *
 * For EDS projects:
 * - Start/Stop actions are hidden (EDS sites are always published)
 * - "Open Live Site" replaces "Open in Browser"
 * - Edit is always available (no need to stop first)
 */

import { Text, ActionButton, MenuTrigger, Menu, Item } from '@adobe/react-spectrum';
import Delete from '@spectrum-icons/workflow/Delete';
import Edit from '@spectrum-icons/workflow/Edit';
import Export from '@spectrum-icons/workflow/Export';
import Globe from '@spectrum-icons/workflow/Globe';
import MoreSmallListVert from '@spectrum-icons/workflow/MoreSmallListVert';
import Play from '@spectrum-icons/workflow/Play';
import Stop from '@spectrum-icons/workflow/Stop';
import React, { useCallback, useMemo } from 'react';
import type { Project } from '@/types/base';
import { isEdsProject } from '@/types/typeGuards';

/** Menu item configuration */
interface MenuItem {
    key: string;
    label: string;
    icon: 'play' | 'stop' | 'globe' | 'dalive' | 'edit' | 'export' | 'delete';
}

export interface ProjectActionsMenuProps {
    /** The project to perform actions on */
    project: Project;
    /** Whether the project demo is currently running */
    isRunning?: boolean;
    /** Callback to start the demo */
    onStartDemo?: (project: Project) => void;
    /** Callback to stop the demo */
    onStopDemo?: (project: Project) => void;
    /** Callback to open the demo in browser (for non-EDS projects) */
    onOpenBrowser?: (project: Project) => void;
    /** Callback to open the live site (for EDS projects) */
    onOpenLiveSite?: (project: Project) => void;
    /** Callback to open DA.live for authoring (for EDS projects) */
    onOpenDaLive?: (project: Project) => void;
    /** Callback to edit project settings */
    onEdit?: (project: Project) => void;
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
    isRunning = false,
    onStartDemo,
    onStopDemo,
    onOpenBrowser,
    onOpenLiveSite,
    onOpenDaLive,
    onEdit,
    onExport,
    onDelete,
    className,
}) => {
    const isEds = isEdsProject(project);

    const handleMenuAction = useCallback((key: React.Key) => {
        switch (key) {
            case 'start':
                onStartDemo?.(project);
                break;
            case 'stop':
                onStopDemo?.(project);
                break;
            case 'open':
                onOpenBrowser?.(project);
                break;
            case 'openLive':
                onOpenLiveSite?.(project);
                break;
            case 'openDaLive':
                onOpenDaLive?.(project);
                break;
            case 'edit':
                onEdit?.(project);
                break;
            case 'export':
                onExport?.(project);
                break;
            case 'delete':
                onDelete?.(project);
                break;
        }
    }, [project, onStartDemo, onStopDemo, onOpenBrowser, onOpenLiveSite, onOpenDaLive, onEdit, onExport, onDelete]);

    // Stop click propagation to prevent triggering parent selection
    const handleMenuClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    // Build menu items dynamically based on project state and type
    const menuItems = useMemo<MenuItem[]>(() => {
        const items: MenuItem[] = [];

        if (isEds) {
            // EDS projects: No Start/Stop, always show "Open in Browser" and "Open in DA.live" first
            if (onOpenLiveSite) {
                items.push({ key: 'openLive', label: 'Open in Browser', icon: 'globe' });
            }
            if (onOpenDaLive) {
                items.push({ key: 'openDaLive', label: 'Author in DA.live', icon: 'dalive' });
            }
            // Edit is always available for EDS (no running state)
            if (onEdit) {
                items.push({ key: 'edit', label: 'Edit Project', icon: 'edit' });
            }
        } else {
            // Non-EDS projects: Start/Stop based on running state
            if (isRunning && onStopDemo) {
                items.push({ key: 'stop', label: 'Stop Demo', icon: 'stop' });
            } else if (!isRunning && onStartDemo) {
                items.push({ key: 'start', label: 'Start Demo', icon: 'play' });
            }

            // Open in Browser (only when running)
            if (isRunning && onOpenBrowser) {
                items.push({ key: 'open', label: 'Open in Browser', icon: 'globe' });
            }

            // Edit (only when NOT running - must stop demo first)
            if (!isRunning && onEdit) {
                items.push({ key: 'edit', label: 'Edit Project', icon: 'edit' });
            }
        }

        // Export and Delete always available for all project types
        if (onExport) {
            items.push({ key: 'export', label: 'Export Project', icon: 'export' });
        }
        if (onDelete) {
            items.push({ key: 'delete', label: 'Delete Project', icon: 'delete' });
        }
        return items;
    }, [isEds, isRunning, onStartDemo, onStopDemo, onOpenBrowser, onOpenLiveSite, onOpenDaLive, onEdit, onExport, onDelete]);

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
                            {item.icon === 'play' && <Play size="S" />}
                            {item.icon === 'stop' && <Stop size="S" />}
                            {item.icon === 'globe' && <Globe size="S" />}
                            {item.icon === 'dalive' && <Edit size="S" />}
                            {item.icon === 'edit' && <Edit size="S" />}
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
