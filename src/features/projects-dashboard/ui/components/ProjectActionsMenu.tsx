/**
 * ProjectActionsMenu Component
 *
 * Kebab menu (three dots) for project actions like Start/Stop, Open, Export, and Delete.
 * Handles click propagation to prevent triggering parent selection.
 * Used by both ProjectCard and ProjectRow components.
 *
 * For EDS projects:
 * - Start/Stop actions are hidden (EDS sites are always published)
 * - "Open Live Site" replaces "Open in Browser"
 * - Edit is always available (no need to stop first)
 */

import { Text, ActionButton, MenuTrigger, Menu, Item } from '@adobe/react-spectrum';
import Copy from '@spectrum-icons/workflow/Copy';
import Delete from '@spectrum-icons/workflow/Delete';
import Edit from '@spectrum-icons/workflow/Edit';
import Export from '@spectrum-icons/workflow/Export';
import FolderOpen from '@spectrum-icons/workflow/FolderOpen';
import Globe from '@spectrum-icons/workflow/Globe';
import MoreSmallListVert from '@spectrum-icons/workflow/MoreSmallListVert';
import Play from '@spectrum-icons/workflow/Play';
import Rename from '@spectrum-icons/workflow/Rename';
import Revert from '@spectrum-icons/workflow/Revert';
import Stop from '@spectrum-icons/workflow/Stop';
import React, { useCallback, useMemo } from 'react';
import type { Project } from '@/types/base';
import { isEdsProject } from '@/types/typeGuards';

/** Menu item configuration */
interface MenuItem {
    key: string;
    label: string;
    icon: string;
}

/**
 * Bundled project action callbacks.
 *
 * Groups the 13 action callbacks that flow through the component tree
 * (ProjectsDashboard -> Grid/RowList -> Card/Row -> ActionsMenu) into
 * a single object, reducing prop threading from 13 individual props to 1.
 *
 * `onSelect` is intentionally excluded: it is a card/row-level concern,
 * not a menu action.
 */
export interface ProjectActions {
    onStartDemo?: (project: Project) => void;
    onStopDemo?: (project: Project) => void;
    onOpenBrowser?: (project: Project) => void;
    onOpenLiveSite?: (project: Project) => void;
    onOpenDaLive?: (project: Project) => void;
    onResetProject?: (project: Project) => void;
    onRepublishContent?: (project: Project) => void;
    onEdit?: (project: Project) => void;
    onRename?: (project: Project) => void;
    onOpenFolder?: (project: Project) => void;
    onCopyPath?: (project: Project) => void;
    onExport?: (project: Project) => void;
    onDelete?: (project: Project) => void;
}

/** Icon lookup - maps menu item icon keys to Spectrum icon components */
const ICON_MAP: Record<string, React.ReactElement> = {
    play: <Play size="S" />,
    stop: <Stop size="S" />,
    globe: <Globe size="S" />,
    dalive: <Edit size="S" />,
    edit: <Edit size="S" />,
    rename: <Rename size="S" />,
    folder: <FolderOpen size="S" />,
    copy: <Copy size="S" />,
    reset: <Revert size="S" />,
    republish: <Globe size="S" />,
    export: <Export size="S" />,
    delete: <Delete size="S" />,
};

function renderMenuIcon(iconKey: string): React.ReactElement | null {
    return ICON_MAP[iconKey] ?? null;
}

export interface ProjectActionsMenuProps {
    /** The project to perform actions on */
    project: Project;
    /** Whether the project demo is currently running */
    isRunning?: boolean;
    /** Bundled action callbacks */
    actions: ProjectActions;
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
    actions,
    className,
}) => {
    const {
        onStartDemo,
        onStopDemo,
        onOpenBrowser,
        onOpenLiveSite,
        onOpenDaLive,
        onResetProject,
        onRepublishContent,
        onEdit,
        onRename,
        onOpenFolder,
        onCopyPath,
        onExport,
        onDelete,
    } = actions;

    const isEds = isEdsProject(project);

    // Action dispatch map - avoids a 13-case switch statement.
    // Each key maps to the callback that handles it.
    const actionMap = useMemo<Record<string, ((p: Project) => void) | undefined>>(() => ({
        start: onStartDemo,
        stop: onStopDemo,
        open: onOpenBrowser,
        openLive: onOpenLiveSite,
        openDaLive: onOpenDaLive,
        resetProject: onResetProject,
        republishContent: onRepublishContent,
        edit: onEdit,
        rename: onRename,
        openFolder: onOpenFolder,
        copyPath: onCopyPath,
        export: onExport,
        delete: onDelete,
    }), [onStartDemo, onStopDemo, onOpenBrowser, onOpenLiveSite, onOpenDaLive, onResetProject, onRepublishContent, onEdit, onRename, onOpenFolder, onCopyPath, onExport, onDelete]);

    const handleMenuAction = useCallback((key: React.Key) => {
        actionMap[String(key)]?.(project);
    }, [project, actionMap]);

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
                items.push({ key: 'edit', label: 'Edit', icon: 'edit' });
            }
            // Rename is always available
            if (onRename) {
                items.push({ key: 'rename', label: 'Rename', icon: 'rename' });
            }
            // Republish Content (EDS only)
            if (onRepublishContent) {
                items.push({ key: 'republishContent', label: 'Republish Content', icon: 'republish' });
            }
            // Open Project / Copy Path (available for all)
            if (onOpenFolder) {
                items.push({ key: 'openFolder', label: 'Open Project', icon: 'folder' });
            }
            if (onCopyPath) {
                items.push({ key: 'copyPath', label: 'Copy Path', icon: 'copy' });
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
                items.push({ key: 'edit', label: 'Edit', icon: 'edit' });
            }

            // Rename is always available (doesn't affect running demo)
            if (onRename) {
                items.push({ key: 'rename', label: 'Rename', icon: 'rename' });
            }
            // Open Project / Copy Path (available for all)
            if (onOpenFolder) {
                items.push({ key: 'openFolder', label: 'Open Project', icon: 'folder' });
            }
            if (onCopyPath) {
                items.push({ key: 'copyPath', label: 'Copy Path', icon: 'copy' });
            }
        }

        // Reset project - available for all project types
        if (onResetProject) {
            items.push({ key: 'resetProject', label: 'Reset', icon: 'reset' });
        }

        // Export and Delete always available for all project types
        if (onExport) {
            items.push({ key: 'export', label: 'Export', icon: 'export' });
        }
        if (onDelete) {
            items.push({ key: 'delete', label: 'Delete', icon: 'delete' });
        }
        return items;
    }, [isEds, isRunning, onStartDemo, onStopDemo, onOpenBrowser, onOpenLiveSite, onOpenDaLive, onResetProject, onRepublishContent, onEdit, onRename, onOpenFolder, onCopyPath, onExport, onDelete]);

    // Don't render if no actions available
    if (menuItems.length === 0) {
        return null;
    }

    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- click handled by child MenuTrigger/ActionButton which provides keyboard support
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
                            {renderMenuIcon(item.icon)}
                            <Text>{item.label}</Text>
                        </Item>
                    )}
                </Menu>
            </MenuTrigger>
        </div>
    );
};
