/**
 * ProjectDashboardScreen Component
 *
 * Main dashboard screen for a demo project. Displays project status, a grid of
 * action buttons, and the integrations SUMMARY TILE (count + worst status). The
 * integrations card grid itself lives on its own surface — it needs room this
 * band does not have (`.rptc/plans/integrations-surface/overview.md`).
 *
 * @module features/dashboard/ui/ProjectDashboardScreen
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useState, useEffect, useRef } from 'react';
import { ActionGrid } from './components/ActionGrid';
import { AiCapabilitiesModal } from './components/AiCapabilitiesModal';
import { DashboardStatusHeader } from './components/DashboardStatusHeader';
import { OrgContextNotice } from './components/OrgContextNotice';
import { isStartActionDisabled } from './dashboardPredicates';
import { useDashboardActions } from './hooks/useDashboardActions';
import { useDashboardStatus, isMeshBusy } from './hooks/useDashboardStatus';
import { useInlineRename } from './hooks/useInlineRename';
import { useLiveDaLiveUrl } from './hooks/useLiveDaLiveUrl';
import { useOrgSwitchFlow } from './hooks/useOrgSwitchFlow';
import { InlineRenameField } from '@/core/ui/components/forms';
import { PageLayout, PageHeader, ControlPanelLayout } from '@/core/ui/components/layout';
import { useFocusTrap, useSingleTimer } from '@/core/ui/hooks';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DashboardInitialData } from '@/types/webviewPayloads';

/**
 * Props for the ProjectDashboardScreen component
 */
/**
 * Init payload (`DashboardInitialData`), relaxed to Partial: the wire always
 * carries the required fields, but tests render the screen without them.
 */
export type ProjectDashboardScreenProps = Partial<DashboardInitialData>;

/**
 * Project dashboard screen component
 *
 * Displays the control panel for a demo project including:
 * - Project name header
 * - Demo status indicator
 * - Action button grid (Start/Stop, Open, Configure, etc.)
 * - The integrations summary tile — count + the worst status across every
 *   integration AND the mesh, routing to the dedicated integrations surface
 *
 * @param props - Component props
 */
export function ProjectDashboardScreen({
    project,
    hasMesh = false,
    packageName,
    stackName,
    isEds = false,
    edsLiveUrl,
    edsDaLiveUrl,
    initialEdsStorefrontStatus,
    hasAdobeContext,
    dataInstallerAvailable,
    appBuilderComponents,
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

    // The DA.live URL is LIVE (a Configure save can flip the authoring
    // experience while the dashboard is open) — seeded from the open-time prop,
    // kept fresh by the hook's `authoringExperienceUpdate` subscription. The
    // experience itself no longer drives any dashboard UI — the Author tile
    // label is static ("Author Content"); the backend resolves the target.
    const liveEdsDaLiveUrl = useLiveDaLiveUrl(edsDaLiveUrl);

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
        aiEditedFiles,
        aiInventoryLoading,
        aiBusy,
        aiRegenProgress,
        aiRegenError,
        regenerateAiFiles,
    } = useDashboardStatus({ hasMesh, initialEdsStorefrontStatus, hasAdobeContext }, isEdsStable);

    // Action handlers via extracted hook
    const {
        handleStartDemo,
        handleStopDemo,
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
        handleRestartDemo,
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

    // Forced account/org switch flow (attempt flag for the no-loop hint,
    // in-flight "Switching…" state, re-entry-guarded trigger) — extracted hook.
    const { switchAttempted, isSwitchingOrg, onSwitchOrg } = useOrgSwitchFlow(
        orgCheckState,
        handleSwitchOrg,
    );

    // Derived values
    const displayName = statusDisplayName || project?.name || 'Demo Project';

    // Build subtitle from package/stack (e.g., "CitiSignal · Headless + PaaS")
    const brandStackSubtitle = [packageName, stackName].filter(Boolean).join(' · ') || undefined;

    // Button disabled states
    const isStartDisabled = isStartActionDisabled(isTransitioning, meshStatus, status || 'ready');
    const isStopDisabled = isTransitioning || status === 'stopping';
    const isMeshActionDisabled = isTransitioning || isMeshBusy(meshStatus);

    return (
        <div ref={containerRef}>
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
                                // No `normalize`: the field takes the TITLE as typed.
                                // `renameProjectCore` derives the slug from it and moves
                                // the folder to match, so rewriting keystrokes to hyphens
                                // here would only put the enforcement back in the one
                                // place the user has to look at.
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
                        <>
                            <div className="dashboard-grid-container">
                                <ActionGrid
                                    isEds={isEdsStable}
                                    isRunning={isRunning}
                                    isStartDisabled={isStartDisabled}
                                    isStopDisabled={isStopDisabled}
                                    isMeshActionDisabled={isMeshActionDisabled}
                                    isOpeningBrowser={isOpeningBrowser}
                                    demoStatus={demoStatusDisplay}
                                    handleRestartDemo={handleRestartDemo}
                                    hasAdobeContext={hasAdobeContext}
                                    dataInstallerAvailable={dataInstallerAvailable}
                                    appBuilderComponents={appBuilderComponents}
                                    hasMesh={hasMesh}
                                    meshStatus={meshStatus}
                                    handleStartDemo={handleStartDemo}
                                    handleStopDemo={handleStopDemo}
                                    handleOpenBrowser={handleOpenBrowser}
                                    handleOpenLiveSite={handleOpenLiveSite}
                                    handleOpenDaLive={handleOpenDaLive}
                                    handleOpenAdminPanel={handleOpenAdminPanel}
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
                        </>
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
                        editedFiles={aiEditedFiles}
                        isLoading={aiInventoryLoading}
                        onClose={() => setShowCapabilities(false)}
                        onRegenerate={regenerateAiFiles}
                        isBusy={aiBusy}
                        progress={aiRegenProgress ?? undefined}
                        errorMessage={aiRegenError}
                    />
                </DialogContainer>
            )}
        </div>
    );
}
