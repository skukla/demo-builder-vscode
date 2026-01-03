/**
 * ProjectDashboardScreen Component
 *
 * Main dashboard screen for a demo project. Displays project status,
 * mesh status, and a grid of action buttons.
 *
 * @module features/dashboard/ui/ProjectDashboardScreen
 */

import React, { useState, useEffect } from 'react';
import { ActionGrid } from './components/ActionGrid';
import { isStartActionDisabled } from './dashboardPredicates';
import { useDashboardActions } from './hooks/useDashboardActions';
import { useDashboardStatus, isMeshBusy } from './hooks/useDashboardStatus';
import styles from './styles/dashboard.module.css';
import {
    View,
    Flex,
    Button,
    ProgressCircle,
} from '@/core/ui/components/aria';
import { StatusCard } from '@/core/ui/components/feedback';
import { PageLayout, PageHeader } from '@/core/ui/components/layout';
import { useFocusTrap, useSingleTimer } from '@/core/ui/hooks';
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
    /** Whether this is an EDS project (always published, no start/stop) */
    isEds?: boolean;
    /** Live URL for EDS projects */
    edsLiveUrl?: string;
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
export function ProjectDashboardScreen({ project, hasMesh, brandName, stackName, isEds = false, edsLiveUrl }: ProjectDashboardScreenProps) {
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
        handleOpenLiveSite,
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
        edsLiveUrl,
    });

    // Focus trap for accessibility
    const containerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false,
        containFocus: true,  // Prevent focus escape (WCAG 2.1 AA)
    });

    // Timer for initial focus (with automatic cleanup on unmount)
    const focusTimer = useSingleTimer();

    // Initial focus - uses timer hook for proper cleanup
    useEffect(() => {
        if (projectStatus) {
            focusTimer.set(() => {
                const firstButton = document.querySelector('[data-action-button]') as HTMLElement;
                if (firstButton) {
                    firstButton.focus();
                }
            }, TIMEOUTS.UI.UPDATE_DELAY);
        }
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
                <div className={styles.statusHeader}>
                    <div className="page-container-padded page-header-section">
                        {/* Content wrapper matches grid width for alignment */}
                        <div className={styles.statusContent}>
                            <Flex alignItems="center" gap="size-300">
                                {/* Status indicators */}
                                <View className="flex-1">
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
                                            <ProgressCircle size="S" isIndeterminate className="loading-spinner-small" />
                                        )}
                                    </Flex>
                                )}
                            </View>
                                {/* All Projects button */}
                                <Button variant="secondary" onPress={handleNavigateBack} data-testid="back-button">
                                    All Projects
                                </Button>
                            </Flex>
                        </div>
                    </div>
                </div>

                <div className="page-container-padded pb-4">

                    {/* Center the grid of fixed-width buttons */}
                    <div className={styles.gridContainer}>
                        <ActionGrid
                            isEds={isEds}
                            isRunning={isRunning}
                            isStartDisabled={isStartDisabled}
                            isStopDisabled={isStopDisabled}
                            isMeshActionDisabled={isMeshActionDisabled}
                            isOpeningBrowser={isOpeningBrowser}
                            isLogsHoverSuppressed={isLogsHoverSuppressed}
                            handleStartDemo={handleStartDemo}
                            handleStopDemo={handleStopDemo}
                            handleOpenBrowser={handleOpenBrowser}
                            handleOpenLiveSite={handleOpenLiveSite}
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
