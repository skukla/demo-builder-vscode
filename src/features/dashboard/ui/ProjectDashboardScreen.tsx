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
    Link,
} from '@adobe/react-spectrum';
import React, { useState, useEffect, useRef } from 'react';
import { isStartActionDisabled } from './dashboardPredicates';
import { ActionGrid } from './components/ActionGrid';
import { useDashboardActions } from './hooks/useDashboardActions';
import { useDashboardStatus, isMeshBusy } from './hooks/useDashboardStatus';
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
    /** DA.live authoring URL for EDS projects */
    edsDaLiveUrl?: string;
    /** Initial mesh status from card grid computation (avoids loading flash) */
    initialMeshStatus?: string;
    /** Initial EDS storefront status (for dynamic status display) */
    initialEdsStorefrontStatus?: 'published' | 'stale' | 'update-declined' | 'not-published';
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
export function ProjectDashboardScreen({ project, hasMesh, brandName, stackName, isEds = false, edsLiveUrl, edsDaLiveUrl, initialMeshStatus, initialEdsStorefrontStatus }: ProjectDashboardScreenProps) {
    // Capture isEds on first render and never change it (project type doesn't change)
    const isEdsRef = useRef(isEds);
    if (isEds && !isEdsRef.current) {
        isEdsRef.current = true;
    }
    const isEdsStable = isEdsRef.current;
    
    // Capture EDS URLs on first render and preserve them (URLs don't change during dashboard session)
    const edsLiveUrlRef = useRef(edsLiveUrl);
    const edsDaLiveUrlRef = useRef(edsDaLiveUrl);
    if (edsLiveUrl && !edsLiveUrlRef.current) {
        edsLiveUrlRef.current = edsLiveUrl;
    }
    if (edsDaLiveUrl && !edsDaLiveUrlRef.current) {
        edsDaLiveUrlRef.current = edsDaLiveUrl;
    }
    const edsLiveUrlStable = edsLiveUrlRef.current;
    const edsDaLiveUrlStable = edsDaLiveUrlRef.current;
    
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
    } = useDashboardStatus({ hasMesh, initialMeshStatus, initialEdsStorefrontStatus }, isEdsStable);

    // Action handlers via extracted hook
    const {
        handleStartDemo,
        handleStopDemo,
        handleViewLogs,
        handleDeployMesh,
        handleOpenBrowser,
        handleOpenLiveSite,
        handleOpenDaLive,
        handleConfigure,
        handleOpenDevConsole,
        handleDeleteProject,
        handleNavigateBack,
        handleViewComponents,
        handleReAuthenticate,
    } = useDashboardActions({
        isOpeningBrowser,
        setIsTransitioning,
        setIsOpeningBrowser,
        setIsLogsHoverSuppressed,
        edsLiveUrl: edsLiveUrlStable,
        edsDaLiveUrl: edsDaLiveUrlStable,
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
                const firstButton = document.querySelector('.dashboard-action-button') as HTMLElement;
                if (firstButton) {
                    firstButton.focus();
                }
            }, TIMEOUTS.UI_UPDATE_DELAY);
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
                <div className="dashboard-status-header">
                    <div className="page-container-padded page-header-section">
                        {/* Content wrapper matches grid width for alignment */}
                        <div className="dashboard-status-content">
                            <Flex alignItems="center" gap="size-300">
                                {/* Status indicators */}
                                <View flex>
                                <div className="dashboard-status-grid">
                                {/* Demo Status */}
                                <StatusCard
                                    label="Frontend"
                                    status={demoStatusDisplay.text}
                                    color={demoStatusDisplay.color}
                                    size="S"
                                    className="dashboard-status-badge"
                                />

                                {/* Mesh Status */}
                                {meshStatusDisplay && (
                                    <Flex alignItems="center" gap="size-100">
                                        <StatusCard
                                            label="API Mesh"
                                            status={meshStatusDisplay.text}
                                            color={meshStatusDisplay.color}
                                            size="S"
                                            className="dashboard-status-badge"
                                        />
                                        {meshStatus === 'needs-auth' && (
                                            <Link onPress={handleReAuthenticate} isQuiet>
                                                Sign in
                                            </Link>
                                        )}
                                    </Flex>
                                )}
                                </div>
                            </View>
                                {/* All Projects button */}
                                <Button variant="secondary" onPress={handleNavigateBack}>
                                    All Projects
                                </Button>
                            </Flex>
                        </div>
                    </div>
                </div>

                <div className="page-container-padded pb-4">

                    {/* Center the grid of fixed-width buttons */}
                    <div className="dashboard-grid-container">
                        <ActionGrid
                            isEds={isEdsStable}
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
                            handleOpenDaLive={handleOpenDaLive}
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
