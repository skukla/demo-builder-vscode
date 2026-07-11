/**
 * ProjectDashboardScreen Component
 *
 * Main dashboard screen for a demo project. Displays project status,
 * mesh status, and a grid of action buttons.
 *
 * @module features/dashboard/ui/ProjectDashboardScreen
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useState, useEffect, useRef } from 'react';
import { ActionGrid } from './components/ActionGrid';
import { AiCapabilitiesModal } from './components/AiCapabilitiesModal';
import type { AppCardState } from './components/AppBuilderCard';
import { DashboardStatusHeader } from './components/DashboardStatusHeader';
import { OrgContextNotice } from './components/OrgContextNotice';
import { isStartActionDisabled } from './dashboardPredicates';
import { useDashboardActions } from './hooks/useDashboardActions';
import { useDashboardStatus, isMeshBusy } from './hooks/useDashboardStatus';
import { useInlineRename } from './hooks/useInlineRename';
import { InlineRenameField } from '@/core/ui/components/forms';
import { PageLayout, PageHeader, ControlPanelLayout } from '@/core/ui/components/layout';
import { useFocusTrap, useSingleTimer } from '@/core/ui/hooks';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';

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
    /** Whether the project has an Adobe org (drives the "Checking organization…" telegraph) */
    hasAdobeContext?: boolean;
    /** Initial App Builder app state (from project.appState/appStatusSummary). Absent = no app. */
    initialApp?: AppCardState;
    /** Keyed appBuilderComponents map (drives the integrations list rows). */
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
    /** Stack-filtered catalog for the add-a-appBuilderComponent picker. */
    appBuilderComponentCatalog?: AppBuilderComponentCatalogEntry[];
}

/**
 * Project dashboard screen component
 *
 * Displays the control panel for a demo project including:
 * - Project name header
 * - Demo status indicator
 * - API Mesh status indicator (if applicable)
 * - Action button grid (Start/Stop, Open, Deploy Mesh, etc.)
 *
 * @param props - Component props
 */
export function ProjectDashboardScreen({
    project,
    hasMesh = false,
    brandName,
    stackName,
    isEds = false,
    edsLiveUrl,
    edsDaLiveUrl,
    initialMeshStatus,
    initialEdsStorefrontStatus,
    hasAdobeContext,
}: ProjectDashboardScreenProps) {
    // Capture isEds on first render and never change it (project type doesn't change)
    const isEdsRef = useRef(isEds);
    if (isEds && !isEdsRef.current) {
        isEdsRef.current = true;
    }
    const isEdsStable = isEdsRef.current;

    // Capture the EDS live (published) URL on first render and preserve it — the
    // live site URL doesn't change during a dashboard session.
    const edsLiveUrlRef = useRef(edsLiveUrl);
    if (edsLiveUrl && !edsLiveUrlRef.current) {
        edsLiveUrlRef.current = edsLiveUrl;
    }
    const edsLiveUrlStable = edsLiveUrlRef.current;

    // The DA.live URL is LIVE: a Configure save can flip the authoring
    // experience while the dashboard is open, so it's state (seeded from the
    // open-time prop) updated by the `authoringExperienceUpdate` message below.
    // The experience itself no longer drives any dashboard UI — the Author
    // tile label is static ("Author Content"); the backend resolves the target.
    const [liveEdsDaLiveUrl, setLiveEdsDaLiveUrl] = useState(edsDaLiveUrl);

    // Tracks whether the user has attempted a forced org switch this session.
    // After an attempt that still leaves them mismatched, the banner adds a
    // no-loop hint (another browser tab may be holding the wrong org).
    const [switchAttempted, setSwitchAttempted] = useState(false);

    // True while the forced switch round-trip (browser login + re-verify) is in
    // flight — drives the banner's disabled "Switching…" button.
    const [isSwitchingOrg, setIsSwitchingOrg] = useState(false);

    // State for browser opening (passed to actions hook)
    const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
    const [showCapabilities, setShowCapabilities] = useState(false);
    // Inline title rename commit (null = success; string = inline error).
    const renameInline = useInlineRename();

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
        orgMismatch,
        orgCheckState,
        imsOrgDisplay,
        aiReady,
        aiSkills,
        aiSkillsError,
        aiMcps,
        aiMcpsError,
        aiBusy,
        aiRegenProgress,
        regenerateAiFiles,
    } = useDashboardStatus(
        { hasMesh, initialMeshStatus, initialEdsStorefrontStatus, hasAdobeContext },
        isEdsStable,
    );

    // Action handlers via extracted hook
    const {
        handleStartDemo,
        handleStopDemo,
        handleDeployMesh,
        handleSyncStorefront,
        handleRefreshBlockLibrary,
        handleOpenBrowser,
        handleOpenLiveSite,
        handleOpenDaLive,
        handleOpenAdminPanel,
        handleConfigure,
        handleEditProject,
        handleOpenDevConsole,
        handleDeleteProject,
        handleExportProject,
        handleRepublishContent,
        handleResetProject,
        handleNavigateBack,
        handleReAuthenticate,
        handleSwitchOrg,
    } = useDashboardActions({
        isOpeningBrowser,
        setIsTransitioning,
        setIsOpeningBrowser,
        edsLiveUrl: edsLiveUrlStable,
        edsDaLiveUrl: liveEdsDaLiveUrl,
    });

    // Focus trap for accessibility
    const containerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false,
        containFocus: true, // Prevent focus escape (WCAG 2.1 AA)
    });

    // Timer for initial focus (with automatic cleanup on unmount)
    const focusTimer = useSingleTimer();

    // Initial focus - uses timer hook for proper cleanup
    useEffect(() => {
        if (projectStatus) {
            focusTimer.set(() => {
                const firstButton = document.querySelector(
                    '.dashboard-action-button',
                ) as HTMLElement;
                if (firstButton) {
                    firstButton.focus();
                }
            }, TIMEOUTS.UI_UPDATE_DELAY);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-once effect for initial focus; focusTimer is stable, projectStatus read only on mount

    // Subscribe to live authoring-experience updates pushed by the Configure save
    // handler. Mirrors the meshStatusUpdate subscription in useDashboardStatus:
    // onMessage returns an unsubscribe fn used for cleanup. Only ever moves the
    // value to a new defined value (never clears it), preserving the prop seed.
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage(
            'authoringExperienceUpdate',
            (data: unknown) => {
                const payload = data as { edsDaLiveUrl?: string };
                if (payload.edsDaLiveUrl) {
                    setLiveEdsDaLiveUrl(payload.edsDaLiveUrl);
                }
            },
        );
        return unsubscribe;
    }, []);

    // Reset the switch-attempt flag once the org check RESOLVES clean (not on the
    // transient 'checking' a re-check passes through — that would drop the no-loop
    // hint), so a future, unrelated mismatch starts without a stale hint.
    useEffect(() => {
        if (orgCheckState === 'none') {
            setSwitchAttempted(false);
        }
    }, [orgCheckState]);

    // Forced account/org switch: mark the attempt so a persistent mismatch
    // surfaces the no-loop hint, show the in-flight "Switching…" state, then
    // trigger the forced sign-in. Cleared on completion regardless of outcome
    // (success, still-mismatched, cancelled) so the button never strands. A ref
    // guards re-entry synchronously (state lags a render, so a fast double-press
    // could otherwise fire the round-trip twice).
    const switchInFlightRef = useRef(false);
    const onSwitchOrg = async () => {
        if (switchInFlightRef.current) return;
        switchInFlightRef.current = true;
        setSwitchAttempted(true);
        setIsSwitchingOrg(true);
        try {
            await handleSwitchOrg();
        } finally {
            switchInFlightRef.current = false;
            setIsSwitchingOrg(false);
        }
    };

    // Derived values
    const displayName = statusDisplayName || project?.name || 'Demo Project';

    // Build subtitle from brand/stack (e.g., "CitiSignal · Headless + PaaS")
    const brandStackSubtitle = [brandName, stackName].filter(Boolean).join(' · ') || undefined;

    // Button disabled states
    const isStartDisabled = isStartActionDisabled(isTransitioning, meshStatus, status || 'ready');
    const isStopDisabled = isTransitioning || status === 'stopping';
    const isMeshActionDisabled = isTransitioning || isMeshBusy(meshStatus);

    return (
        <div ref={containerRef} className="dashboard-left">
            <PageLayout
                header={
                    <PageHeader
                        // Rename-in-place: the title carries a hover-revealed
                        // pencil; commit posts renameProject (backend re-sends
                        // status so the title refreshes). Hidden while running.
                        title={
                            <InlineRenameField
                                name={displayName}
                                disabled={isRunning}
                                onRename={renameInline}
                            />
                        }
                        subtitle={brandStackSubtitle}
                        constrainWidth
                    />
                }
                backgroundColor="var(--spectrum-global-color-gray-50)"
            >
                <ControlPanelLayout
                    className="dashboard-control-panel"
                    masthead={
                        <>
                            <DashboardStatusHeader
                                demoStatusDisplay={demoStatusDisplay}
                                meshStatusDisplay={meshStatusDisplay}
                                meshStatus={meshStatus}
                                aiReady={aiReady}
                                imsOrgDisplay={imsOrgDisplay}
                                orgCheckState={orgCheckState}
                                onReAuthenticate={handleReAuthenticate}
                                onRegenerateAi={() => {
                                    void regenerateAiFiles();
                                }}
                                onViewCapabilities={() => setShowCapabilities(true)}
                                onNavigateBack={handleNavigateBack}
                            />

                            {/* Org-mismatch banner — the actionable half of org-context
                                surfacing (ambient checking/ok/wrong status lives in the
                                "IMS Org" badge above). Shows only on mismatch. */}
                            <OrgContextNotice
                                state={orgCheckState}
                                orgMismatch={orgMismatch}
                                switchAttempted={switchAttempted}
                                isSwitching={isSwitchingOrg}
                                onSwitchOrg={onSwitchOrg}
                            />
                        </>
                    }
                    primary={
                        <div className="dashboard-grid-container">
                            <ActionGrid
                                isEds={isEdsStable}
                                hasMesh={hasMesh}
                                isRunning={isRunning}
                                isStartDisabled={isStartDisabled}
                                isStopDisabled={isStopDisabled}
                                isMeshActionDisabled={isMeshActionDisabled}
                                isOpeningBrowser={isOpeningBrowser}
                                handleStartDemo={handleStartDemo}
                                handleStopDemo={handleStopDemo}
                                handleOpenBrowser={handleOpenBrowser}
                                handleOpenLiveSite={handleOpenLiveSite}
                                handleOpenDaLive={handleOpenDaLive}
                                handleOpenAdminPanel={handleOpenAdminPanel}
                                handleDeployMesh={handleDeployMesh}
                                handleSyncStorefront={handleSyncStorefront}
                                handleRefreshBlockLibrary={
                                    isEdsStable ? handleRefreshBlockLibrary : undefined
                                }
                                handleRepublishContent={
                                    isEdsStable ? handleRepublishContent : undefined
                                }
                                handleConfigure={handleConfigure}
                                handleOpenDevConsole={handleOpenDevConsole}
                                handleEditProject={handleEditProject}
                                handleExportProject={handleExportProject}
                                handleResetProject={handleResetProject}
                                handleDeleteProject={handleDeleteProject}
                            />
                        </div>
                    }
                />
            </PageLayout>

            {/* Capability catalog — reached from the "View AI Capabilities" link,
                NOT the health badge. Two sections (skills + MCP servers) plus a
                Regenerate AI files action (which rewrites both). */}
            {showCapabilities && (
                <DialogContainer onDismiss={() => setShowCapabilities(false)}>
                    <AiCapabilitiesModal
                        skills={aiSkills}
                        mcps={aiMcps}
                        hasSkillsError={aiSkillsError}
                        hasMcpsError={aiMcpsError}
                        onClose={() => setShowCapabilities(false)}
                        onRegenerate={regenerateAiFiles}
                        isBusy={aiBusy}
                        progress={aiRegenProgress ?? undefined}
                    />
                </DialogContainer>
            )}
        </div>
    );
}
