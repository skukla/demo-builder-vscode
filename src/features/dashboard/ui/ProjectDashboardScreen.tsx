/**
 * ProjectDashboardScreen Component
 *
 * Main dashboard screen for a demo project. Displays project status,
 * mesh status, and a grid of action buttons.
 *
 * @module features/dashboard/ui/ProjectDashboardScreen
 */

import {
    View,
    Flex,
    Button,
    ProgressCircle,
} from '@adobe/react-spectrum';
import React, { useState, useEffect } from 'react';
import { isStartActionDisabled } from './dashboardPredicates';
import { ActionGrid } from './components/ActionGrid';
import { useDashboardActions } from './hooks/useDashboardActions';
import { useDashboardStatus, isMeshBusy } from './hooks/useDashboardStatus';
import { StatusCard } from '@/core/ui/components/feedback';
import { PageLayout, PageHeader } from '@/core/ui/components/layout';
import { useFocusTrap } from '@/core/ui/hooks';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Props for the ProjectDashboardScreen component
 */
interface ProjectDashboardScreenProps {
    project?: {
        name: string;
        path: string;
    };
    hasMesh?: boolean;
    /** Resolved brand name (e.g., "CitiSignal") */
    brandName?: string;
    /** Resolved stack/architecture name (e.g., "Headless + PaaS") */
    stackName?: string;
}

/**
 * Project dashboard screen component
 *
 * Displays the control panel for a demo project including:
 * - Project name header
 * - Demo status indicator
 * - API Mesh status indicator (if applicable)
 * - Action button grid (Start/Stop, Open, Logs, Deploy Mesh, etc.)
 *
 * @param props - Component props
 */
export function ProjectDashboardScreen({ project, hasMesh, brandName, stackName }: ProjectDashboardScreenProps) {
    // State for browser opening and logs hover suppression (passed to actions hook)
    const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
    const [isLogsHoverSuppressed, setIsLogsHoverSuppressed] = useState(false);

    // Status management via extracted hook
    const {
        projectStatus,
        isRunning,
        isTransitioning,
        setIsTransitioning,
        demoStatusDisplay,
        meshStatusDisplay,
        displayName: statusDisplayName,
        status,
        meshStatus,
    } = useDashboardStatus({ hasMesh });

    // Action handlers via extracted hook
    const {
        handleStartDemo,
        handleStopDemo,
        handleReAuthenticate,
        handleViewLogs,
        handleDeployMesh,
        handleOpenBrowser,
        handleConfigure,
        handleOpenDevConsole,
        handleDeleteProject,
        handleNavigateBack,
        handleViewComponents,
    } = useDashboardActions({
        isOpeningBrowser,
        setIsTransitioning,
        setIsOpeningBrowser,
        setIsLogsHoverSuppressed,
    });

    // Focus trap for accessibility
    const containerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false,
        containFocus: true,  // Prevent focus escape (WCAG 2.1 AA)
    });

    // Initial focus
    useEffect(() => {
        if (projectStatus) {
            const timer = setTimeout(() => {
                const firstButton = document.querySelector('.dashboard-action-button') as HTMLElement;
                if (firstButton) {
                    firstButton.focus();
                }
            }, TIMEOUTS.UI_UPDATE_DELAY);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, []); // Only on mount

    // Derived values
    const displayName = statusDisplayName || project?.name || 'Demo Project';

    // Build subtitle from brand/stack (e.g., "CitiSignal · Headless + PaaS")
    const brandStackSubtitle = [brandName, stackName].filter(Boolean).join(' · ') || undefined;

    // Button disabled states
    const isStartDisabled = isStartActionDisabled(isTransitioning, meshStatus, status || 'ready');
    const isStopDisabled = isTransitioning || status === 'stopping';
    const isMeshActionDisabled = isTransitioning || isMeshBusy(meshStatus);

    return (
        <div ref={containerRef}>
            <PageLayout
                header={
                    <PageHeader
                        title={displayName}
                        subtitle={brandStackSubtitle}
                        constrainWidth
                    />
                }
                backgroundColor="var(--spectrum-global-color-gray-50)"
            >
                {/* Status Header - matches Projects List header design */}
                <div className="dashboard-status-header">
                    <div className="max-w-800 mx-auto px-4 pt-6 pb-4">
                        {/* Content wrapper matches grid width for alignment */}
                        <div className="dashboard-status-content">
                            <Flex alignItems="center" gap="size-300">
                                {/* Status indicators */}
                                <View flex>
                                {/* Demo Status */}
                                <StatusCard
                                    label="Demo"
                                    status={demoStatusDisplay.text}
                                    color={demoStatusDisplay.color}
                                    size="S"
                                />

                                {/* Mesh Status */}
                                {meshStatusDisplay && (
                                    <Flex direction="row" alignItems="center" gap="size-100" marginTop="size-50">
                                        <StatusCard
                                            label="API Mesh"
                                            status={meshStatusDisplay.text}
                                            color={meshStatusDisplay.color}
                                            size="S"
                                        />

                                        {meshStatus === 'needs-auth' && (
                                            <button
                                                onClick={handleReAuthenticate}
                                                className="action-pill"
                                            >
                                                Sign in
                                            </button>
                                        )}

                                        {meshStatus === 'authenticating' && (
                                            <ProgressCircle size="S" isIndeterminate UNSAFE_className="w-4 h-4" />
                                        )}
                                    </Flex>
                                )}
                            </View>
                                {/* All Projects button */}
                                <Button variant="secondary" onPress={handleNavigateBack}>
                                    All Projects
                                </Button>
                            </Flex>
                        </div>
                    </div>
                </div>

                <div className="w-full max-w-800 mx-auto px-4 pb-4">

                    {/* Center the grid of fixed-width buttons */}
                    <div className="dashboard-grid-container">
                        <ActionGrid
                            isRunning={isRunning}
                            isStartDisabled={isStartDisabled}
                            isStopDisabled={isStopDisabled}
                            isMeshActionDisabled={isMeshActionDisabled}
                            isOpeningBrowser={isOpeningBrowser}
                            isLogsHoverSuppressed={isLogsHoverSuppressed}
                            handleStartDemo={handleStartDemo}
                            handleStopDemo={handleStopDemo}
                            handleOpenBrowser={handleOpenBrowser}
                            handleViewLogs={handleViewLogs}
                            handleDeployMesh={handleDeployMesh}
                            handleConfigure={handleConfigure}
                            handleViewComponents={handleViewComponents}
                            handleOpenDevConsole={handleOpenDevConsole}
                            handleDeleteProject={handleDeleteProject}
                        />
                    </div>
                </div>
            </PageLayout>
        </div>
    );
}
