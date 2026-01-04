/**
 * ActionGrid Component
 *
 * Displays the 9-button action grid for the project dashboard.
 * Extracted from ProjectDashboardScreen for better separation of concerns.
 *
 * @module features/dashboard/ui/components/ActionGrid
 */

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
import stylesImport from '../styles/dashboard.module.css';
import {
    ActionButton,
    Text,
} from '@/core/ui/components/aria';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};
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
        <GridLayout columns={4} gap="size-400" className={styles.grid}>
            {/* Start/Stop - Hidden for EDS projects (always published) */}
            {!isEds && !isRunning && (
                <ActionButton
                    onPress={handleStartDemo}
                    isDisabled={isStartDisabled}
                    className={styles.actionButton}
                    data-action-button
                >
                    <PlayCircle size="L" />
                    <Text className={styles.iconLabel}>Start</Text>
                </ActionButton>
            )}
            {!isEds && isRunning && (
                <ActionButton
                    onPress={handleStopDemo}
                    isDisabled={isStopDisabled}
                    className={styles.actionButton}
                    data-action-button
                >
                    <StopCircle size="L" />
                    <Text className={styles.iconLabel}>Stop</Text>
                </ActionButton>
            )}

            {/* Open Live Site - EDS projects only (always enabled) */}
            {isEds && (
                <ActionButton
                    onPress={handleOpenLiveSite}
                    isDisabled={isOpeningBrowser}
                    className={styles.actionButton}
                    data-action-button
                >
                    <Globe size="L" />
                    <Text className={styles.iconLabel}>Open Live Site</Text>
                </ActionButton>
            )}

            {/* Open Browser - Non-EDS projects only (requires running) */}
            {!isEds && (
                <ActionButton
                    onPress={handleOpenBrowser}
                    isDisabled={!isRunning || isOpeningBrowser}
                    className={styles.actionButton}
                >
                    <Globe size="L" />
                    <Text className={styles.iconLabel}>Open in Browser</Text>
                </ActionButton>
            )}

            {/* Logs */}
            <ActionButton
                onPress={handleViewLogs}
                className={`${styles.actionButton} ${isLogsHoverSuppressed ? styles.hoverSuppressed : ''}`}
            >
                <ViewList size="L" />
                <Text className={styles.iconLabel}>Logs</Text>
            </ActionButton>

            {/* Deploy Mesh */}
            <ActionButton
                onPress={handleDeployMesh}
                isDisabled={isMeshActionDisabled}
                className={styles.actionButton}
                data-action="deploy-mesh"
            >
                <Refresh size="L" />
                <Text className={styles.iconLabel}>Deploy Mesh</Text>
            </ActionButton>

            {/* Configure */}
            <ActionButton
                onPress={handleConfigure}
                isDisabled={isMeshActionDisabled}
                className={styles.actionButton}
            >
                <Settings size="L" />
                <Text className={styles.iconLabel}>Configure</Text>
            </ActionButton>

            {/* View Components */}
            <ActionButton
                onPress={handleViewComponents}
                className={styles.actionButton}
            >
                <FolderOpen size="L" />
                <Text className={styles.iconLabel}>Components</Text>
            </ActionButton>

            {/* Developer Console */}
            <ActionButton
                onPress={handleOpenDevConsole}
                className={styles.actionButton}
            >
                <Code size="L" />
                <Text className={styles.iconLabel}>Dev Console</Text>
            </ActionButton>

            {/* Delete Project */}
            <ActionButton
                onPress={handleDeleteProject}
                className={styles.actionButton}
            >
                <Delete size="L" />
                <Text className={styles.iconLabel}>Delete</Text>
            </ActionButton>
        </GridLayout>
    );
}
