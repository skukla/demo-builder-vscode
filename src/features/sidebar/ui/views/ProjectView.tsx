/**
 * ProjectView Component
 *
 * Displayed in the sidebar when a project is loaded.
 * Shows project status card with Start/Stop controls and quick actions.
 */

import React from 'react';
import {
    Flex,
    Text,
    Button,
    ActionButton,
    Tooltip,
    TooltipTrigger,
    Divider,
} from '@adobe/react-spectrum';
import Play from '@spectrum-icons/workflow/Play';
import Stop from '@spectrum-icons/workflow/Stop';
import Dashboard from '@spectrum-icons/workflow/Dashboard';
import Settings from '@spectrum-icons/workflow/Settings';
import Refresh from '@spectrum-icons/workflow/Refresh';
import type { Project } from '@/types/base';

export interface ProjectViewProps {
    /** Current project */
    project: Project;
    /** Callback to start demo */
    onStartDemo: () => void;
    /** Callback to stop demo */
    onStopDemo: () => void;
    /** Callback to open dashboard */
    onOpenDashboard: () => void;
    /** Callback to open configure */
    onOpenConfigure: () => void;
    /** Callback to check for updates */
    onCheckUpdates: () => void;
}

/**
 * Get status display info
 */
function getStatusInfo(status: Project['status']): {
    label: string;
    color: string;
    isRunning: boolean;
    isTransitioning: boolean;
} {
    switch (status) {
        case 'running':
            return { label: 'Running', color: 'var(--spectrum-global-color-green-500)', isRunning: true, isTransitioning: false };
        case 'starting':
            return { label: 'Starting...', color: 'var(--spectrum-global-color-blue-500)', isRunning: false, isTransitioning: true };
        case 'stopping':
            return { label: 'Stopping...', color: 'var(--spectrum-global-color-orange-500)', isRunning: true, isTransitioning: true };
        case 'stopped':
            return { label: 'Stopped', color: 'var(--spectrum-global-color-gray-500)', isRunning: false, isTransitioning: false };
        default:
            return { label: 'Ready', color: 'var(--spectrum-global-color-gray-500)', isRunning: false, isTransitioning: false };
    }
}

/**
 * ProjectView - Sidebar content when a project is loaded
 */
export const ProjectView: React.FC<ProjectViewProps> = ({
    project,
    onStartDemo,
    onStopDemo,
    onOpenDashboard,
    onOpenConfigure,
    onCheckUpdates,
}) => {
    const statusInfo = getStatusInfo(project.status);

    return (
        <Flex
            direction="column"
            gap="size-200"
            UNSAFE_className="sidebar-project-view"
        >
            {/* Project Status Card */}
            <div className="sidebar-project-card">
                <Text UNSAFE_className="sidebar-project-name">
                    {project.name}
                </Text>
                <Flex alignItems="center" gap="size-100">
                    <span
                        className="sidebar-status-dot"
                        style={{ backgroundColor: statusInfo.color }}
                    />
                    <Text UNSAFE_className="sidebar-status-text">
                        {statusInfo.label}
                    </Text>
                </Flex>
            </div>

            {/* Demo Controls */}
            <Flex direction="column" gap="size-100">
                {statusInfo.isRunning ? (
                    <Button
                        variant="negative"
                        onPress={onStopDemo}
                        isDisabled={statusInfo.isTransitioning}
                    >
                        <Stop size="S" />
                        <Text>Stop Demo</Text>
                    </Button>
                ) : (
                    <Button
                        variant="accent"
                        onPress={onStartDemo}
                        isDisabled={statusInfo.isTransitioning}
                    >
                        <Play size="S" />
                        <Text>Start Demo</Text>
                    </Button>
                )}
            </Flex>

            <Divider size="S" />

            {/* Quick Actions */}
            <Flex direction="column" gap="size-50">
                <Text UNSAFE_className="sidebar-section-header">
                    Quick Actions
                </Text>

                <Flex direction="row" gap="size-100">
                    <TooltipTrigger delay={0}>
                        <ActionButton
                            isQuiet
                            onPress={onOpenDashboard}
                            aria-label="Open Dashboard"
                            UNSAFE_className="sidebar-icon-btn"
                        >
                            <Dashboard size="S" />
                        </ActionButton>
                        <Tooltip>Dashboard</Tooltip>
                    </TooltipTrigger>

                    <TooltipTrigger delay={0}>
                        <ActionButton
                            isQuiet
                            onPress={onOpenConfigure}
                            aria-label="Configure"
                            UNSAFE_className="sidebar-icon-btn"
                        >
                            <Settings size="S" />
                        </ActionButton>
                        <Tooltip>Configure</Tooltip>
                    </TooltipTrigger>

                    <TooltipTrigger delay={0}>
                        <ActionButton
                            isQuiet
                            onPress={onCheckUpdates}
                            aria-label="Check for Updates"
                            UNSAFE_className="sidebar-icon-btn"
                        >
                            <Refresh size="S" />
                        </ActionButton>
                        <Tooltip>Check Updates</Tooltip>
                    </TooltipTrigger>
                </Flex>
            </Flex>
        </Flex>
    );
};
