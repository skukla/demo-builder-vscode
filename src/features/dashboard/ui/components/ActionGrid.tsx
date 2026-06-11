/**
 * ActionGrid Component
 *
 * Displays the project dashboard actions as small, grouped, prioritized tiles
 * organized into labeled zones:
 *  - Primary zone (accent): Start/Stop (non-EDS, mutually exclusive), Open in
 *    Browser, and Author in DA.live (EDS only). These are the surfaces you
 *    use the project through — see it as a customer, edit it as a creator.
 *  - Storefront zone (EDS only): Sync Storefront. Sits on row 1 next to
 *    Primary so storefront ops are visually adjacent to the storefront
 *    authoring surface.
 *  - Build zone: Deploy Mesh (when hasMesh), Configure, Logs, and a "More"
 *    overflow menu holding Components, Refresh Block Library (EDS only),
 *    and Dev Console.
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

import {
    ActionButton,
    Item,
    Menu,
    MenuTrigger,
    Text,
} from '@adobe/react-spectrum';
import Delete from '@spectrum-icons/workflow/Delete';
import Edit from '@spectrum-icons/workflow/Edit';
import Globe from '@spectrum-icons/workflow/Globe';
import More from '@spectrum-icons/workflow/More';
import PlayCircle from '@spectrum-icons/workflow/PlayCircle';
import PublishCheck from '@spectrum-icons/workflow/PublishCheck';
import Refresh from '@spectrum-icons/workflow/Refresh';
import Settings from '@spectrum-icons/workflow/Settings';
import StopCircle from '@spectrum-icons/workflow/StopCircle';
import Switch from '@spectrum-icons/workflow/Switch';
import ViewList from '@spectrum-icons/workflow/ViewList';
import React from 'react';
import type { AuthoringExperience } from '@/types/base';

/** Overflow menu item keys. */
type OverflowKey = 'components' | 'refreshBlockLibrary' | 'devConsole';

/** Human-readable label per authoring experience. */
const EXPERIENCE_LABEL: Record<AuthoringExperience, string> = {
    'universal-editor': 'Universal Editor',
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
    /** Whether the project includes an API Mesh component */
    hasMesh?: boolean;
    /** Whether mesh-related actions should be disabled */
    isMeshActionDisabled: boolean;
    /** Whether browser is currently opening */
    isOpeningBrowser: boolean;
    /** Whether to suppress hover on Logs button */
    isLogsHoverSuppressed: boolean;
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
    /** Resolved authoring experience — drives the Author label + flip target (EDS only) */
    authoringExperience?: AuthoringExperience;
    /** Handler for the authoring-experience flip control (EDS only) */
    handleSetAuthoringExperience?: () => void;
    /** Handler for Logs button */
    handleViewLogs: () => void;
    /** Handler for Deploy Mesh button */
    handleDeployMesh: () => void;
    /** Handler for Sync Storefront button (EDS projects only) */
    handleSyncStorefront?: () => void;
    /** Handler for Refresh Block Library overflow item (EDS projects only) */
    handleRefreshBlockLibrary?: () => void;
    /** Handler for Configure button */
    handleConfigure: () => void;
    /** Handler for Components button (overflow menu) */
    handleViewComponents: () => void;
    /** Handler for Dev Console button (overflow menu) */
    handleOpenDevConsole: () => void;
    /** Handler for Delete button */
    handleDeleteProject: () => void;
}

/**
 * Action grid displaying dashboard control tiles grouped into labeled zones.
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
    hasMesh = true,
    isMeshActionDisabled,
    isOpeningBrowser,
    isLogsHoverSuppressed,
    handleStartDemo,
    handleStopDemo,
    handleOpenBrowser,
    handleOpenLiveSite,
    handleOpenDaLive,
    authoringExperience = 'universal-editor',
    handleSetAuthoringExperience,
    handleViewLogs,
    handleDeployMesh,
    handleSyncStorefront,
    handleRefreshBlockLibrary,
    handleConfigure,
    handleViewComponents,
    handleOpenDevConsole,
    handleDeleteProject,
}: ActionGridProps): React.ReactElement {
    const otherExperience: AuthoringExperience =
        authoringExperience === 'experience-workspace' ? 'universal-editor' : 'experience-workspace';
    const handleOverflowAction = (key: React.Key): void => {
        switch (key) {
            case 'components' satisfies OverflowKey:
                handleViewComponents();
                return;
            case 'refreshBlockLibrary' satisfies OverflowKey:
                handleRefreshBlockLibrary?.();
                return;
            case 'devConsole' satisfies OverflowKey:
                handleOpenDevConsole();
                return;
        }
    };

    return (
        <div className="dashboard-zones">
            {/* Row 1 — Primary (universal) + Storefront (EDS-only). Storefront
                hides on non-EDS, leaving Primary alone. */}
            <div className="dashboard-zone-row">
                {/* Primary zone — the surfaces you use the project through:
                    see it as a customer (Open in Browser) and edit it as a
                    creator (Author in DA.live, EDS only). Start/Stop also
                    lives here for non-EDS projects as their lifecycle
                    equivalent. */}
                <div className="dashboard-zone-section" data-zone="primary">
                    <span className="dashboard-zone-label">Primary</span>
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
                            >
                                <Edit size="L" />
                                <Text UNSAFE_className="icon-label">
                                    Author in {EXPERIENCE_LABEL[authoringExperience]}
                                </Text>
                            </ActionButton>
                        )}

                        {/* Flip control — EDS only. Switches to the other experience. */}
                        {isEds && handleSetAuthoringExperience && (
                            <ActionButton
                                onPress={handleSetAuthoringExperience}
                                isQuiet
                                UNSAFE_className="dashboard-action-button"
                            >
                                <Switch size="L" />
                                <Text UNSAFE_className="icon-label">
                                    Switch to {EXPERIENCE_LABEL[otherExperience]}
                                </Text>
                            </ActionButton>
                        )}
                    </div>
                </div>

                {/* Storefront cluster — EDS only. Sync Storefront pushes
                    storefront code; placed adjacent to the Author surface so
                    storefront-related actions are visually grouped. */}
                {isEds && handleSyncStorefront && (
                    <div className="dashboard-zone-section" data-zone="storefront">
                        <span className="dashboard-zone-label">Storefront</span>
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
            </div>

            {/* Build zone — deploy/configure/logs plus an overflow menu. */}
            <div className="dashboard-zone-section" data-zone="build">
                <span className="dashboard-zone-label">Build</span>
                {/* On EDS, row 1 is two clusters (Primary | Storefront) on a
                    fixed column grid. Build uses the same aligned column grid
                    so its tiles line up under the clusters above. */}
                <div className={`dashboard-zone-grid${isEds ? ' dashboard-zone-grid--aligned' : ''}`}>
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

                    <ActionButton
                        onPress={handleViewLogs}
                        isQuiet
                        UNSAFE_className={`dashboard-action-button ${isLogsHoverSuppressed ? 'hover-suppressed' : ''}`}
                    >
                        <ViewList size="L" />
                        <Text UNSAFE_className="icon-label">Logs</Text>
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
                            <Item key="components">Components</Item>
                            {isEds && handleRefreshBlockLibrary ? (
                                <Item key="refreshBlockLibrary">Refresh Block Library</Item>
                            ) : null}
                            <Item key="devConsole">Dev Console</Item>
                        </Menu>
                    </MenuTrigger>
                </div>
            </div>

            {/* Delete footer — isolated and destructive */}
            <div className="dashboard-zone-footer" data-zone="delete">
                <ActionButton
                    onPress={handleDeleteProject}
                    isQuiet
                    UNSAFE_className="dashboard-action-button dashboard-action-button--destructive"
                >
                    <Delete size="L" />
                    <Text UNSAFE_className="icon-label">Delete</Text>
                </ActionButton>
            </div>
        </div>
    );
}
