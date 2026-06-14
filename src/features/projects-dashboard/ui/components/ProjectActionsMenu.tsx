/**
 * ProjectActionsMenu Component
 *
 * Kebab menu (three dots) for project actions. Used by both ProjectCard and
 * ProjectRow.
 *
 * Actions are grouped into labeled sections rather than a flat list:
 * - USE: open/run the demo (Start/Stop or Open in Browser, Author in DA.live, Open AI).
 * - MANAGE: project-entry actions (Edit, Rename, Pin/Unpin, Reset).
 * - More…: a submenu for low-frequency actions (Copy Path, Export, and — for
 *   EDS — Republish Content).
 * - Delete sits alone in a trailing un-headed section, isolated from the rest.
 *
 * Empty groups render nothing (no orphaned heading). Gating is unchanged from
 * the previous flat menu — every item still checks its callback, and EDS vs
 * non-EDS / running state decide which items appear.
 *
 * For EDS projects:
 * - Start/Stop actions are hidden (EDS sites are always published)
 * - "Open in Browser" opens the live site
 * - Edit is always available (no need to stop first)
 */

import { Text, ActionButton, MenuTrigger, Menu, Section, SubmenuTrigger, Item } from '@adobe/react-spectrum';
import Copy from '@spectrum-icons/workflow/Copy';
import Delete from '@spectrum-icons/workflow/Delete';
import Edit from '@spectrum-icons/workflow/Edit';
import Export from '@spectrum-icons/workflow/Export';
import Globe from '@spectrum-icons/workflow/Globe';
import MagicWand from '@spectrum-icons/workflow/MagicWand';
import More from '@spectrum-icons/workflow/More';
import MoreSmallListVert from '@spectrum-icons/workflow/MoreSmallListVert';
import PinOff from '@spectrum-icons/workflow/PinOff';
import PinOn from '@spectrum-icons/workflow/PinOn';
import Play from '@spectrum-icons/workflow/Play';
import Rename from '@spectrum-icons/workflow/Rename';
import Revert from '@spectrum-icons/workflow/Revert';
import Stop from '@spectrum-icons/workflow/Stop';
import React, { useCallback, useMemo } from 'react';
import type { AuthoringExperience, Project } from '@/types/base';
import { isEdsProject } from '@/types/typeGuards';

/** Default authoring experience when the backend view model omits it. */
const DEFAULT_AUTHORING_EXPERIENCE: AuthoringExperience = 'da-live-classic';

/** Human-readable label per authoring experience (for the Author item). */
const EXPERIENCE_LABEL: Record<AuthoringExperience, string> = {
    'da-live-classic': 'DA.live Classic',
    'experience-workspace': 'Experience Workspace',
};

/** Menu item configuration */
interface MenuItem {
    key: string;
    label: string;
    icon: string;
}

/** The grouped items that make up the menu, built from project state. */
interface MenuGroups {
    use: MenuItem[];
    manage: MenuItem[];
    more: MenuItem[];
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
    onCopyPath?: (project: Project) => void;
    onExport?: (project: Project) => void;
    onOpenAi?: (project: Project) => void;
    /**
     * Toggle the project's pinned status. The caller flips the boolean
     * based on the project's current `pinned` field.
     */
    onPinToggle?: (project: Project) => void;
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
    copy: <Copy size="S" />,
    reset: <Revert size="S" />,
    republish: <Globe size="S" />,
    export: <Export size="S" />,
    ai: <MagicWand size="S" />,
    more: <More size="S" />,
    pinOn: <PinOn size="S" />,
    pinOff: <PinOff size="S" />,
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
        onCopyPath,
        onExport,
        onOpenAi,
        onPinToggle,
        onDelete,
    } = actions;

    const isEds = isEdsProject(project);

    // Resolved authoring experience rides in the view model (computed backend-side).
    // Drives the dynamic "Author in X" label only — the flip control was relocated
    // to the Configure webview (setup-time preference with an explicit Save).
    const experience = project.resolvedAuthoringExperience ?? DEFAULT_AUTHORING_EXPERIENCE;

    // Action dispatch map - avoids a large switch statement. Each key maps to
    // the callback that handles it. The "more" submenu trigger has no entry
    // (it only opens the submenu), so dispatching it is a harmless no-op.
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
        copyPath: onCopyPath,
        export: onExport,
        openAi: onOpenAi,
        pinToggle: onPinToggle,
        delete: onDelete,
    }), [onStartDemo, onStopDemo, onOpenBrowser, onOpenLiveSite, onOpenDaLive, onResetProject, onRepublishContent, onEdit, onRename, onCopyPath, onExport, onOpenAi, onPinToggle, onDelete]);

    const handleMenuAction = useCallback((key: React.Key) => {
        actionMap[String(key)]?.(project);
    }, [project, actionMap]);

    // Stop click propagation to prevent triggering parent selection
    const handleMenuClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    // Build the grouped items from project state and type. Each item still
    // checks its callback, so callers disable actions by omitting callbacks.
    const groups = useMemo<MenuGroups>(() => {
        const use: MenuItem[] = [];
        const manage: MenuItem[] = [];
        const more: MenuItem[] = [];

        // USE — open / run the demo
        if (isEds) {
            if (onOpenLiveSite) {
                use.push({ key: 'openLive', label: 'Open in Browser', icon: 'globe' });
            }
            if (onOpenDaLive) {
                use.push({
                    key: 'openDaLive',
                    label: `Author in ${EXPERIENCE_LABEL[experience]}`,
                    icon: 'dalive',
                });
            }
        } else {
            if (isRunning && onStopDemo) {
                use.push({ key: 'stop', label: 'Stop Demo', icon: 'stop' });
            } else if (!isRunning && onStartDemo) {
                use.push({ key: 'start', label: 'Start Demo', icon: 'play' });
            }
            // Open in Browser only when running (non-EDS)
            if (isRunning && onOpenBrowser) {
                use.push({ key: 'open', label: 'Open in Browser', icon: 'globe' });
            }
        }
        if (onOpenAi) {
            use.push({ key: 'openAi', label: 'Open AI', icon: 'ai' });
        }

        // MANAGE — project-entry actions
        // Edit needs the demo stopped for non-EDS; EDS has no running state.
        if (isEds ? onEdit : (!isRunning && onEdit)) {
            manage.push({ key: 'edit', label: 'Edit', icon: 'edit' });
        }
        if (onRename) {
            manage.push({ key: 'rename', label: 'Rename', icon: 'rename' });
        }
        if (onPinToggle) {
            manage.push({
                key: 'pinToggle',
                label: project.pinned ? 'Unpin' : 'Pin',
                icon: project.pinned ? 'pinOff' : 'pinOn',
            });
        }
        if (onResetProject) {
            manage.push({ key: 'resetProject', label: 'Reset', icon: 'reset' });
        }

        // More… — low-frequency actions, tucked into a submenu
        if (onCopyPath) {
            more.push({ key: 'copyPath', label: 'Copy Path', icon: 'copy' });
        }
        if (onExport) {
            more.push({ key: 'export', label: 'Export', icon: 'export' });
        }
        if (isEds && onRepublishContent) {
            more.push({ key: 'republishContent', label: 'Republish Content', icon: 'republish' });
        }

        return { use, manage, more };
    }, [isEds, isRunning, project.pinned, experience, onStartDemo, onStopDemo, onOpenBrowser, onOpenLiveSite, onOpenDaLive, onResetProject, onRepublishContent, onEdit, onRename, onCopyPath, onExport, onOpenAi, onPinToggle]);

    // Nothing to show — render no trigger at all.
    if (groups.use.length === 0 && groups.manage.length === 0 && groups.more.length === 0 && !onDelete) {
        return null;
    }

    // One menu row (icon + label). Inferred return type keeps it assignable to
    // Spectrum's Item collection-child type.
    const renderItem = (item: MenuItem) => (
        <Item key={item.key} textValue={item.label}>
            {renderMenuIcon(item.icon)}
            <Text>{item.label}</Text>
        </Item>
    );

    // Spectrum's Section accepts only Item children, so the "More…" submenu is a
    // top-level sibling of the sections (not nested inside one).
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
                <Menu onAction={handleMenuAction}>
                    {groups.use.length > 0 ? (
                        <Section key="use" title="Use">
                            {groups.use.map(renderItem)}
                        </Section>
                    ) : null}

                    {groups.manage.length > 0 ? (
                        <Section key="manage" title="Manage">
                            {groups.manage.map(renderItem)}
                        </Section>
                    ) : null}

                    {groups.more.length > 0 ? (
                        <SubmenuTrigger>
                            <Item key="more" textValue="More">
                                <More size="S" />
                                <Text>More</Text>
                            </Item>
                            <Menu onAction={handleMenuAction}>
                                {groups.more.map(renderItem)}
                            </Menu>
                        </SubmenuTrigger>
                    ) : null}

                    {onDelete ? (
                        <Section key="delete">
                            <Item key="delete" textValue="Delete">
                                {renderMenuIcon('delete')}
                                <Text>Delete</Text>
                            </Item>
                        </Section>
                    ) : null}
                </Menu>
            </MenuTrigger>
        </div>
    );
};
