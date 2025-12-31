/**
 * ActionGrid Component
 *
 * Displays the 9-button action grid for the project dashboard.
 * Extracted from ProjectDashboardScreen for better separation of concerns.
 *
 * @module features/dashboard/ui/components/ActionGrid
 */

import {
    ActionButton,
    Text,
} from '@adobe/react-spectrum';
import Code from '@spectrum-icons/workflow/Code';
import Delete from '@spectrum-icons/workflow/Delete';
import FolderOpen from '@spectrum-icons/workflow/FolderOpen';
import Globe from '@spectrum-icons/workflow/Globe';
import PlayCircle from '@spectrum-icons/workflow/PlayCircle';
import Refresh from '@spectrum-icons/workflow/Refresh';
import Settings from '@spectrum-icons/workflow/Settings';
import StopCircle from '@spectrum-icons/workflow/StopCircle';
import ViewList from '@spectrum-icons/workflow/ViewList';
import React from 'react';
import { GridLayout } from '@/core/ui/components/layout';

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
    /** Handler for Logs button */
    handleViewLogs: () => void;
    /** Handler for Deploy Mesh button */
    handleDeployMesh: () => void;
    /** Handler for Configure button */
    handleConfigure: () => void;
    /** Handler for Components button */
    handleViewComponents: () => void;
    /** Handler for Dev Console button */
    handleOpenDevConsole: () => void;
    /** Handler for Delete button */
    handleDeleteProject: () => void;
}

/**
 * Action grid displaying dashboard control buttons
 *
 * Shows a 4-column grid of action buttons for controlling the demo project.
 * Buttons are conditionally rendered/disabled based on current state.
 *
 * @param props - Component props
 */
export function ActionGrid({
    isEds = false,
    isRunning,
    isStartDisabled,
    isStopDisabled,
    isMeshActionDisabled,
    isOpeningBrowser,
    isLogsHoverSuppressed,
    handleStartDemo,
    handleStopDemo,
    handleOpenBrowser,
    handleOpenLiveSite,
    handleViewLogs,
    handleDeployMesh,
    handleConfigure,
    handleViewComponents,
    handleOpenDevConsole,
    handleDeleteProject,
}: ActionGridProps): React.ReactElement {
    return (
        <GridLayout columns={4} gap="size-400" className="dashboard-grid">
            {/* Start/Stop - Hidden for EDS projects (always published) */}
            {!isEds && !isRunning && (
                <ActionButton
                    onPress={handleStartDemo}
                    isQuiet
                    isDisabled={isStartDisabled}
                    UNSAFE_className="dashboard-action-button"
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
                    UNSAFE_className="dashboard-action-button"
                >
                    <StopCircle size="L" />
                    <Text UNSAFE_className="icon-label">Stop</Text>
                </ActionButton>
            )}

            {/* Open Live Site - EDS projects only (always enabled) */}
            {isEds && (
                <ActionButton
                    onPress={handleOpenLiveSite}
                    isQuiet
                    isDisabled={isOpeningBrowser}
                    UNSAFE_className="dashboard-action-button"
                >
                    <Globe size="L" />
                    <Text UNSAFE_className="icon-label">Open Live Site</Text>
                </ActionButton>
            )}

            {/* Open Browser - Non-EDS projects only (requires running) */}
            {!isEds && (
                <ActionButton
                    onPress={handleOpenBrowser}
                    isQuiet
                    isDisabled={!isRunning || isOpeningBrowser}
                    UNSAFE_className="dashboard-action-button"
                >
                    <Globe size="L" />
                    <Text UNSAFE_className="icon-label">Open in Browser</Text>
                </ActionButton>
            )}

            {/* Logs */}
            <ActionButton
                onPress={handleViewLogs}
                isQuiet
                UNSAFE_className={`dashboard-action-button ${isLogsHoverSuppressed ? 'hover-suppressed' : ''}`}
            >
                <ViewList size="L" />
                <Text UNSAFE_className="icon-label">Logs</Text>
            </ActionButton>

            {/* Deploy Mesh */}
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

            {/* Configure */}
            <ActionButton
                onPress={handleConfigure}
                isQuiet
                isDisabled={isMeshActionDisabled}
                UNSAFE_className="dashboard-action-button"
            >
                <Settings size="L" />
                <Text UNSAFE_className="icon-label">Configure</Text>
            </ActionButton>

            {/* View Components */}
            <ActionButton
                onPress={handleViewComponents}
                isQuiet
                UNSAFE_className="dashboard-action-button"
            >
                <FolderOpen size="L" />
                <Text UNSAFE_className="icon-label">Components</Text>
            </ActionButton>

            {/* Developer Console */}
            <ActionButton
                onPress={handleOpenDevConsole}
                isQuiet
                UNSAFE_className="dashboard-action-button"
            >
                <Code size="L" />
                <Text UNSAFE_className="icon-label">Dev Console</Text>
            </ActionButton>

            {/* Delete Project */}
            <ActionButton
                onPress={handleDeleteProject}
                isQuiet
                UNSAFE_className="dashboard-action-button"
            >
                <Delete size="L" />
                <Text UNSAFE_className="icon-label">Delete</Text>
            </ActionButton>
        </GridLayout>
    );
}
