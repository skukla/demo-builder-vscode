/**
 * ProjectActionsMenu Component
 *
 * Kebab menu (three dots) for project actions. Used by both ProjectCard and
 * ProjectRow.
 *
 * Actions are grouped into labeled sections rather than a flat list:
 * - USE: open/run the demo (Start/Stop or Open in Browser, Author Content,
 *   Manage Commerce, Open AI).
 * - MANAGE: project-entry actions (Edit, Integrations…, Pin/Unpin, Reset, Export).
 *   There is NO Rename item: renaming happens in place on the card name /
 *   dashboard title (InlineRenameField).
 *
 *   There is no More… submenu. It held Copy Path and Export plus the
 *   deploy-state-gated Republish Content / Redeploy Mesh. The deploy items moved
 *   to the surfaces that own them, Copy Path was dropped (a developer affordance
 *   on a grid used to PICK a demo, and the path is one click away on the
 *   dashboard), and a submenu wrapping the last survivor charged two clicks for
 *   one action.
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

import { Text, Section, Item } from '@adobe/react-spectrum';
import React, { useCallback, useMemo } from 'react';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import { hasIntegrations } from '@/features/projects-dashboard/utils/projectStatusUtils';
import type { Project } from '@/types/base';
import { isEdsProject } from '@/types/typeGuards';

/** Menu item configuration */
interface MenuItem {
    key: string;
    label: string;
    icon: string;
}

/** The grouped items that make up the menu, built from project state. */
/**
 * Two sections, not three. The "More…" submenu is gone: it held Copy Path and
 * Export, Copy Path was removed, and a submenu wrapping one item charges two
 * clicks for one action.
 */
interface MenuGroups {
    use: MenuItem[];
    manage: MenuItem[];
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
    onOpenAdminPanel?: (project: Project) => void;
    onResetProject?: (project: Project) => void;
    /**
     * Open the Integrations page for this project. Replaced the per-integration
     * redeploy callbacks — that surface owns those actions now.
     */
    onOpenIntegrations?: (project: Project) => void;
    onEdit?: (project: Project) => void;
    /**
     * Commit an inline rename (consumed by the CARD's InlineRenameField, not
     * by this menu): resolve null on success or an error message to show
     * inline. There is deliberately no menu Rename item.
     */
    onRenameSubmit?: (project: Project, newName: string) => Promise<string | null>;
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
export function ProjectActionsMenu({
    project,
    isRunning = false,
    actions,
    className,
}: ProjectActionsMenuProps) {
    const {
        onStartDemo,
        onStopDemo,
        onOpenBrowser,
        onOpenLiveSite,
        onOpenDaLive,
        onOpenAdminPanel,
        onResetProject,
        onOpenIntegrations,
        onEdit,
        onExport,
        onOpenAi,
        onPinToggle,
        onDelete,
    } = actions;

    const isEds = isEdsProject(project);

    // Action dispatch map - avoids a large switch statement. Each key maps to
    // the callback that handles it. The "more" submenu trigger has no entry
    // (it only opens the submenu), so dispatching it is a harmless no-op.
    const actionMap = useMemo<Record<string, ((p: Project) => void) | undefined>>(
        () => ({
            start: onStartDemo,
            stop: onStopDemo,
            open: onOpenBrowser,
            openLive: onOpenLiveSite,
            openDaLive: onOpenDaLive,
            openAdminPanel: onOpenAdminPanel,
            resetProject: onResetProject,
            openIntegrations: onOpenIntegrations,
            edit: onEdit,
            export: onExport,
            openAi: onOpenAi,
            pinToggle: onPinToggle,
            delete: onDelete,
        }),
        [
            onStartDemo,
            onStopDemo,
            onOpenBrowser,
            onOpenLiveSite,
            onOpenDaLive,
            onOpenAdminPanel,
            onResetProject,
            onOpenIntegrations,
            onEdit,
            onExport,
            onOpenAi,
            onPinToggle,
            onDelete,
        ],
    );

    const handleMenuAction = useCallback(
        (key: React.Key) => {
            const actionKey = String(key);
            actionMap[actionKey]?.(project);
        },
        [project, actionMap],
    );

    // Stop click propagation to prevent triggering parent selection
    // Build the grouped items from project state and type. Each item still
    // checks its callback, so callers disable actions by omitting callbacks.
    const groups = useMemo<MenuGroups>(() => {
        const use: MenuItem[] = [];
        const manage: MenuItem[] = [];

        // USE — open / run the demo
        if (isEds) {
            if (onOpenLiveSite) {
                use.push({ key: 'openLive', label: 'Open in Browser', icon: 'globe' });
            }
            if (onOpenDaLive) {
                // Static label — the resolved authoring experience still decides
                // WHERE the action opens (backend-side), not the menu text.
                use.push({ key: 'openDaLive', label: 'Author Content', icon: 'dalive' });
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
        // Manage Commerce's admin-URL resolution is backend-side, so it applies to every project type.
        if (onOpenAdminPanel) {
            use.push({ key: 'openAdminPanel', label: 'Manage Commerce', icon: 'admin' });
        }
        if (onOpenAi) {
            use.push({ key: 'openAi', label: 'Open AI', icon: 'ai' });
        }

        // MANAGE — project-entry actions
        // Edit needs the demo stopped for non-EDS; EDS has no running state.
        if (isEds ? onEdit : !isRunning && onEdit) {
            manage.push({ key: 'edit', label: 'Edit', icon: 'edit' });
        }
        // ONE entry to the surface that owns integrations, replacing the
        // per-integration "Redeploy <name>" items that used to sit in More… and
        // grew with N. Those predate the dedicated Integrations page; now that it
        // exists, per-integration actions belong there and this is the route —
        // the projects list otherwise has none (project → dashboard → Integrations).
        if (onOpenIntegrations && hasIntegrations(project)) {
            manage.push({ key: 'openIntegrations', label: 'Integrations…', icon: 'apiAccess' });
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
        // Export sits directly in the menu. It was behind a "More…" submenu
        // alongside Copy Path; Copy Path is gone (a developer affordance on a
        // grid used to PICK a demo, and the path is one click away on the
        // dashboard), which left a submenu holding one item — two clicks charged
        // for one action, on a hover target that can be missed.
        if (onExport) {
            manage.push({ key: 'export', label: 'Export', icon: 'export' });
        }

        // More… — low-frequency + deploy-state-gated actions, tucked into a submenu.
        return { use, manage };
    }, [
        isEds,
        isRunning,
        project,
        onStartDemo,
        onStopDemo,
        onOpenBrowser,
        onOpenLiveSite,
        onOpenDaLive,
        onOpenAdminPanel,
        onResetProject,
        onOpenIntegrations,
        onEdit,
        onExport,
        onOpenAi,
        onPinToggle,
    ]);

    // Nothing to show — render no trigger at all.
    if (groups.use.length === 0 && groups.manage.length === 0 && !onDelete) {
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
        <CardActionsMenu ariaLabel="More actions" className={className} onAction={handleMenuAction}>
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

            {onDelete ? (
                <Section key="delete">
                    <Item key="delete" textValue="Delete">
                        {renderMenuIcon('delete')}
                        <Text>Delete</Text>
                    </Item>
                </Section>
            ) : null}
        </CardActionsMenu>
    );
}
