/**
 * ActionGrid Component
 *
 * Displays the project dashboard actions as small, grouped, prioritized tiles
 * grouped into zones (no visible headings — spacing + tile labels carry the grouping):
 *  - Primary zone (accent): Start/Stop (non-EDS, mutually exclusive), Open in
 *    Browser, Author in DA.live (EDS only), and Admin Panel (all project
 *    types, always visible — resolved backend-side on click: derived from the
 *    ACCS tenant endpoint for SaaS, or the optional ADOBE_COMMERCE_ADMIN_URL
 *    field for PaaS/override). These are the surfaces you use
 *    the project through — see it as a customer, edit it as a creator,
 *    manage it as an admin.
 *  - Storefront zone (EDS only): Sync Storefront. Sits on row 1 next to
 *    Primary so storefront ops are visually adjacent to the storefront
 *    authoring surface.
 *  - Build zone: Deploy Mesh (when hasMesh), Configure, and a "More"
 *    overflow menu holding Edit + Rename (EDS always, non-EDS while stopped),
 *    Export, Refresh Block Library + Republish Content (EDS only),
 *    Dev Console, Reset, and Delete (destructive, last). (Logs moved to the
 *    sidebar Logs utility; Copy Path lives on the project-card kebab.)
 *  - Delete footer: isolated below the zones, destructive styling.
 *
 * Gating is behavioral, not displayed: Author in DA.live and Sync Storefront
 * render only for EDS projects; Start/Stop only for non-EDS; Deploy Mesh only
 * when hasMesh.
 *
 * AI access is provided globally via the sidebar (Chat + Prompts) — the MCP
 * is wired at the extension level, so a project-scoped AI tile here would be
 * a redundant second door to the same surface.
 *
 * Note: EDS Publish and Reset actions are available via the project card kebab menu,
 * not on this dashboard detail view.
 *
 * @module features/dashboard/ui/components/ActionGrid
 */

import { ActionButton, Item, Menu, MenuTrigger, Text } from '@adobe/react-spectrum';
import Edit from '@spectrum-icons/workflow/Edit';
import Globe from '@spectrum-icons/workflow/Globe';
import More from '@spectrum-icons/workflow/More';
import PlayCircle from '@spectrum-icons/workflow/PlayCircle';
import PublishCheck from '@spectrum-icons/workflow/PublishCheck';
import Refresh from '@spectrum-icons/workflow/Refresh';
import Settings from '@spectrum-icons/workflow/Settings';
import StopCircle from '@spectrum-icons/workflow/StopCircle';
import UserAdmin from '@spectrum-icons/workflow/UserAdmin';
import React from 'react';
import type { AuthoringExperience } from '@/types/base';

/** Overflow menu item keys. */
type OverflowKey =
    | 'edit'
    | 'rename'
    | 'export'
    | 'refreshBlockLibrary'
    | 'republishContent'
    | 'devConsole'
    | 'reset'
    | 'delete';

/**
 * Tile label per authoring experience. "EW" keeps the Author tile at two
 * lines (the audience — Adobe demo engineers — knows the shorthand); the
 * full name rides on the button's aria-label for hover/screen readers.
 */
const EXPERIENCE_LABEL: Record<AuthoringExperience, string> = {
    'da-live-classic': 'DA.live Classic',
    'experience-workspace': 'EW',
};

/** Full name per authoring experience — the accessible label. */
const EXPERIENCE_FULL_NAME: Record<AuthoringExperience, string> = {
    'da-live-classic': 'DA.live Classic',
    'experience-workspace': 'Experience Workspace',
};

/**
 * Props for the ActionGrid component
 */
export interface ActionGridProps {
    /** Whether this is an EDS project (always published, no start/stop) */
    isEds?: boolean;
    /** Whether demo is currently running (ignored for EDS projects) */
    isRunning: boolean;
    /** Whether Start button should be disabled (ignored for EDS projects) */
    isStartDisabled: boolean;
    /** Whether Stop button should be disabled (ignored for EDS projects) */
    isStopDisabled: boolean;
    /**
     * Whether the project includes an API Mesh to deploy. Required (no default)
     * so every caller must decide explicitly — a forgotten prop should not
     * silently show the Deploy Mesh tile (the original bug).
     */
    hasMesh: boolean;
    /** Whether mesh-related actions should be disabled */
    isMeshActionDisabled: boolean;
    /** Whether browser is currently opening */
    isOpeningBrowser: boolean;
    /** Handler for Start button (non-EDS only) */
    handleStartDemo: () => void;
    /** Handler for Stop button (non-EDS only) */
    handleStopDemo: () => void;
    /** Handler for Open in Browser button (non-EDS only) */
    handleOpenBrowser: () => void;
    /** Handler for Open Live Site button (EDS only) */
    handleOpenLiveSite?: () => void;
    /** Handler for Open DA.live button (EDS only) */
    handleOpenDaLive?: () => void;
    /** Resolved authoring experience — drives the Author label (EDS only) */
    authoringExperience?: AuthoringExperience;
    /** Handler for the Admin Panel button (URL resolved backend-side) */
    handleOpenAdminPanel: () => void;
    /** Handler for Deploy Mesh button */
    handleDeployMesh: () => void;
    /** Handler for Sync Storefront button (EDS projects only) */
    handleSyncStorefront?: () => void;
    /** Handler for Refresh Block Library overflow item (EDS projects only) */
    handleRefreshBlockLibrary?: () => void;
    /** Handler for Republish Content overflow item (EDS projects only) */
    handleRepublishContent?: () => void;
    /** Handler for Configure button */
    handleConfigure: () => void;
    /** Handler for Dev Console button (overflow menu) */
    handleOpenDevConsole: () => void;
    /**
     * Handler for the Edit overflow item. Opens the wizard in edit mode for
     * the current project. Optional — gated like the kebab's Edit action
     * (EDS always; non-EDS only while stopped).
     */
    handleEditProject?: () => void;
    /**
     * Handler for the Rename overflow item. Opens the rename dialog (owned by
     * ProjectDashboardScreen). Optional — gated like the kebab's Edit action.
     */
    handleRename?: () => void;
    /** Handler for the Export overflow item */
    handleExportProject: () => void;
    /** Handler for the Reset overflow item (always shown, last in the menu) */
    handleResetProject: () => void;
    /** Handler for Delete button */
    handleDeleteProject: () => void;
}

/**
 * Action grid displaying dashboard control tiles grouped into zones (spacing-only, no headings).
 *
 * Tiles are conditionally rendered/disabled based on project type and state.
 *
 * @param props - Component props
 */
export function ActionGrid({
    isEds = false,
    isRunning,
    isStartDisabled,
    isStopDisabled,
    hasMesh,
    isMeshActionDisabled,
    isOpeningBrowser,
    handleStartDemo,
    handleStopDemo,
    handleOpenBrowser,
    handleOpenLiveSite,
    handleOpenDaLive,
    authoringExperience = 'da-live-classic',
    handleOpenAdminPanel,
    handleDeployMesh,
    handleSyncStorefront,
    handleRefreshBlockLibrary,
    handleRepublishContent,
    handleConfigure,
    handleOpenDevConsole,
    handleEditProject,
    handleRename,
    handleExportProject,
    handleResetProject,
    handleDeleteProject,
}: ActionGridProps): React.ReactElement {
    // Edit/Rename gating mirrors the kebab's Edit: non-EDS only while stopped, EDS always.
    const canEdit = Boolean(handleEditProject) && (isEds || !isRunning);
    const canRename = Boolean(handleRename) && (isEds || !isRunning);

    const handleOverflowAction = (key: React.Key): void => {
        switch (key) {
            case 'edit' satisfies OverflowKey:
                handleEditProject?.();
                return;
            case 'rename' satisfies OverflowKey:
                handleRename?.();
                return;
            case 'export' satisfies OverflowKey:
                handleExportProject();
                return;
            case 'refreshBlockLibrary' satisfies OverflowKey:
                handleRefreshBlockLibrary?.();
                return;
            case 'republishContent' satisfies OverflowKey:
                handleRepublishContent?.();
                return;
            case 'devConsole' satisfies OverflowKey:
                handleOpenDevConsole();
                return;
            case 'reset' satisfies OverflowKey:
                handleResetProject();
                return;
            case 'delete' satisfies OverflowKey:
                handleDeleteProject();
                return;
        }
    };

    return (
        <div className="dashboard-zones">
            {/* Action row — Primary (universal) + Storefront (EDS-only) + Build,
                side by side as one bar. Storefront hides on non-EDS; groups wrap
                to the next line only if the band is too narrow. */}
            <div className="dashboard-zone-row">
                {/* Primary zone — the surfaces you use the project through:
                    see it as a customer (Open in Browser) and edit it as a
                    creator (Author in DA.live, EDS only). Start/Stop also
                    lives here for non-EDS projects as their lifecycle
                    equivalent. */}
                <div className="dashboard-zone-section" data-zone="primary">
                    <div className="dashboard-zone-grid">
                        {!isEds && !isRunning && (
                            <ActionButton
                                onPress={handleStartDemo}
                                isQuiet
                                isDisabled={isStartDisabled}
                                UNSAFE_className="dashboard-action-button dashboard-action-button--hero"
                            >
                                <PlayCircle size="L" />
                                <Text UNSAFE_className="icon-label">Start</Text>
                            </ActionButton>
                        )}
                        {!isEds && isRunning && (
                            <ActionButton
                                onPress={handleStopDemo}
                                isQuiet
                                isDisabled={isStopDisabled}
                                UNSAFE_className="dashboard-action-button dashboard-action-button--hero"
                            >
                                <StopCircle size="L" />
                                <Text UNSAFE_className="icon-label">Stop</Text>
                            </ActionButton>
                        )}

                        {/* Open in Browser — EDS opens the live site, non-EDS the local demo */}
                        {isEds ? (
                            <ActionButton
                                onPress={handleOpenLiveSite}
                                isQuiet
                                isDisabled={isOpeningBrowser}
                                UNSAFE_className="dashboard-action-button dashboard-action-button--hero"
                            >
                                <Globe size="L" />
                                <Text UNSAFE_className="icon-label">Open in Browser</Text>
                            </ActionButton>
                        ) : (
                            <ActionButton
                                onPress={handleOpenBrowser}
                                isQuiet
                                isDisabled={!isRunning || isOpeningBrowser}
                                UNSAFE_className="dashboard-action-button dashboard-action-button--hero"
                            >
                                <Globe size="L" />
                                <Text UNSAFE_className="icon-label">Open in Browser</Text>
                            </ActionButton>
                        )}

                        {/* Author — EDS only. Labeled from the resolved authoring
                            experience (Universal Editor / Experience Workspace). */}
                        {isEds && (
                            <ActionButton
                                onPress={handleOpenDaLive}
                                isQuiet
                                isDisabled={isOpeningBrowser}
                                UNSAFE_className="dashboard-action-button dashboard-action-button--hero"
                                aria-label={`Author in ${EXPERIENCE_FULL_NAME[authoringExperience]}`}
                            >
                                <Edit size="L" />
                                <Text UNSAFE_className="icon-label">
                                    Author in {EXPERIENCE_LABEL[authoringExperience]}
                                </Text>
                            </ActionButton>
                        )}

                        {/* Admin Panel — always visible; the URL (optional
                            ADOBE_COMMERCE_ADMIN_URL) resolves backend-side, so no
                            isOpeningBrowser gating here. */}
                        <ActionButton
                            onPress={handleOpenAdminPanel}
                            isQuiet
                            UNSAFE_className="dashboard-action-button dashboard-action-button--hero"
                        >
                            <UserAdmin size="L" />
                            <Text UNSAFE_className="icon-label">Admin Panel</Text>
                        </ActionButton>
                    </div>
                </div>

                {/* Storefront cluster — EDS only. Sync Storefront pushes
                    storefront code; placed adjacent to the Author surface so
                    storefront-related actions are visually grouped. */}
                {isEds && handleSyncStorefront && (
                    <div className="dashboard-zone-section" data-zone="storefront">
                        <div className="dashboard-zone-grid">
                            <ActionButton
                                onPress={handleSyncStorefront}
                                isQuiet
                                UNSAFE_className="dashboard-action-button"
                                data-action="sync-storefront"
                            >
                                <PublishCheck size="L" />
                                <Text UNSAFE_className="icon-label">Sync Storefront</Text>
                            </ActionButton>
                        </div>
                    </div>
                )}
                {/* Build zone — deploy/configure plus an overflow menu. On the same
                    row as Primary + Storefront so the action groups read as a single
                    bar; tiles pack left within the group. */}
                <div className="dashboard-zone-section" data-zone="build">
                    <div className="dashboard-zone-grid">
                        {hasMesh && (
                            <ActionButton
                                onPress={handleDeployMesh}
                                isQuiet
                                isDisabled={isMeshActionDisabled}
                                UNSAFE_className="dashboard-action-button"
                                data-action="deploy-mesh"
                            >
                                <Refresh size="L" />
                                <Text UNSAFE_className="icon-label">Deploy Mesh</Text>
                            </ActionButton>
                        )}

                        <ActionButton
                            onPress={handleConfigure}
                            isQuiet
                            isDisabled={isMeshActionDisabled}
                            UNSAFE_className="dashboard-action-button"
                        >
                            <Settings size="L" />
                            <Text UNSAFE_className="icon-label">Configure</Text>
                        </ActionButton>

                        {/* Overflow — rarely used actions tucked into a menu */}
                        <MenuTrigger>
                            <ActionButton
                                isQuiet
                                UNSAFE_className="dashboard-action-button"
                                aria-label="More actions"
                            >
                                <More size="L" />
                                <Text UNSAFE_className="icon-label">More</Text>
                            </ActionButton>
                            <Menu onAction={handleOverflowAction}>
                                {canEdit ? <Item key="edit">Edit</Item> : null}
                                {canRename ? <Item key="rename">Rename</Item> : null}
                                <Item key="export">Export</Item>
                                {isEds && handleRefreshBlockLibrary ? (
                                    <Item key="refreshBlockLibrary">Refresh Block Library</Item>
                                ) : null}
                                {isEds && handleRepublishContent ? (
                                    <Item key="republishContent">Republish Content</Item>
                                ) : null}
                                <Item key="devConsole">Dev Console</Item>
                                <Item key="reset">Reset</Item>
                                {/* Destructive — LAST, per overflow-menu convention.
                                    The confirm dialog behind handleDeleteProject
                                    remains the real safety net. */}
                                <Item key="delete" textValue="Delete">
                                    <Text UNSAFE_className="menu-item-destructive">Delete</Text>
                                </Item>
                            </Menu>
                        </MenuTrigger>
                    </div>
                </div>
            </div>
        </div>
    );
}
