/**
 * ActionGrid Component
 *
 * Displays the project dashboard actions as small, grouped, prioritized tiles
 * organized into labeled zones:
 *  - Hero zone (accent): Start/Stop (non-EDS, mutually exclusive), Open in Browser, AI.
 *  - Storefront zone (EDS only): Author in DA.live, Sync Storefront.
 *  - Build zone: Deploy Mesh (when hasMesh), Configure, Logs, and a "More" overflow
 *    menu holding Components, Refresh Block Library (EDS only), and Dev Console.
 *  - Delete footer: isolated below the zones, destructive styling.
 *
 * Gating is behavioral, not displayed: the Storefront zone renders only for EDS
 * projects; Start/Stop only for non-EDS; Deploy Mesh only when hasMesh.
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
import MagicWand from '@spectrum-icons/workflow/MagicWand';
import More from '@spectrum-icons/workflow/More';
import PlayCircle from '@spectrum-icons/workflow/PlayCircle';
import PublishCheck from '@spectrum-icons/workflow/PublishCheck';
import Refresh from '@spectrum-icons/workflow/Refresh';
import Settings from '@spectrum-icons/workflow/Settings';
import StopCircle from '@spectrum-icons/workflow/StopCircle';
import ViewList from '@spectrum-icons/workflow/ViewList';
import React from 'react';

/** Overflow menu item keys. */
type OverflowKey = 'components' | 'refreshBlockLibrary' | 'devConsole';

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
    /** Handler for AI — opens the standalone AI surface */
    handleOpenAi: () => void;
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
    handleViewLogs,
    handleDeployMesh,
    handleSyncStorefront,
    handleRefreshBlockLibrary,
    handleConfigure,
    handleViewComponents,
    handleOpenDevConsole,
    handleOpenAi,
    handleDeleteProject,
}: ActionGridProps): React.ReactElement {
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
            {/* Row 1 — two labeled clusters share one row: Primary (universal,
                accent) + Storefront (EDS-only). Storefront hides on non-EDS,
                leaving Primary alone. */}
            <div className="dashboard-zone-row">
                {/* Primary cluster — most-frequent / outcome actions */}
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

                        {/* AI — standalone AI surface */}
                        <ActionButton
                            onPress={handleOpenAi}
                            isQuiet
                            UNSAFE_className="dashboard-action-button dashboard-action-button--hero"
                            aria-label="AI"
                        >
                            <MagicWand size="L" />
                            <Text UNSAFE_className="icon-label">AI</Text>
                        </ActionButton>
                    </div>
                </div>

                {/* Storefront cluster — EDS only (content via DA.live, code via Sync) */}
                {isEds && (
                    <div className="dashboard-zone-section" data-zone="storefront">
                        <span className="dashboard-zone-label">Storefront</span>
                        <div className="dashboard-zone-grid">
                            <ActionButton
                                onPress={handleOpenDaLive}
                                isQuiet
                                isDisabled={isOpeningBrowser}
                                UNSAFE_className="dashboard-action-button"
                            >
                                <Edit size="L" />
                                <Text UNSAFE_className="icon-label">Author in DA.live</Text>
                            </ActionButton>
                            {handleSyncStorefront && (
                                <ActionButton
                                    onPress={handleSyncStorefront}
                                    isQuiet
                                    UNSAFE_className="dashboard-action-button"
                                    data-action="sync-storefront"
                                >
                                    <PublishCheck size="L" />
                                    <Text UNSAFE_className="icon-label">Sync Storefront</Text>
                                </ActionButton>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Build zone — deploy/configure/logs plus an overflow menu */}
            <div className="dashboard-zone-section" data-zone="build">
                <span className="dashboard-zone-label">Build</span>
                {/* On EDS, row 1 is two clusters (Primary | Storefront) on a
                    fixed column grid. Build uses the same aligned column grid so
                    its tiles line up under the clusters above. Non-EDS rows are
                    uniform, so the plain flex grid already aligns. */}
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
