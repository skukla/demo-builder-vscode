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
    DialogContainer,
} from '@adobe/react-spectrum';
import React, { useState, useEffect, useRef } from 'react';
import { ActionGrid } from './components/ActionGrid';
import { AiCapabilitiesModal } from './components/AiCapabilitiesModal';
import { AppBuilderCard, type AppCardState } from './components/AppBuilderCard';
import { DashboardRenameDialog } from './components/DashboardRenameDialog';
import { OrgContextNotice } from './components/OrgContextNotice';
import { isStartActionDisabled } from './dashboardPredicates';
import { useDashboardActions } from './hooks/useDashboardActions';
import { useDashboardStatus, isMeshBusy } from './hooks/useDashboardStatus';
import { useRenameDialog } from './hooks/useRenameDialog';
import { StatusCard } from '@/core/ui/components/feedback';
import { PageLayout, PageHeader } from '@/core/ui/components/layout';
import { useFocusTrap, useSingleTimer } from '@/core/ui/hooks';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AuthoringExperience } from '@/types/base';

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
    /** Resolved authoring experience (drives the Author label + flip target) */
    authoringExperience?: AuthoringExperience;
    /** Initial mesh status from card grid computation (avoids loading flash) */
    initialMeshStatus?: string;
    /** Initial EDS storefront status (for dynamic status display) */
    initialEdsStorefrontStatus?: 'published' | 'stale' | 'update-declined' | 'not-published';
    /** Whether the project has an Adobe org (drives the "Checking organization…" telegraph) */
    hasAdobeContext?: boolean;
    /** Initial App Builder app state (from project.appState/appStatusSummary). Absent = no app. */
    initialApp?: AppCardState;
}

/**
 * Whether to render the App Builder card: shown when the project has an Adobe
 * workspace to deploy into (so the "Add an App Builder app" affordance is
 * reachable) or already carries an app. Extracted to keep the screen component's
 * cyclomatic complexity in check.
 */
function shouldShowAppCard(hasAdobeContext: boolean | undefined, app: AppCardState | undefined): boolean {
    return Boolean(hasAdobeContext) || Boolean(app);
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
export function ProjectDashboardScreen({ project, hasMesh = false, brandName, stackName, isEds = false, edsLiveUrl, edsDaLiveUrl, authoringExperience, initialMeshStatus, initialEdsStorefrontStatus, hasAdobeContext, initialApp }: ProjectDashboardScreenProps) {
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

    // Authoring experience + DA.live URL are LIVE: a Configure save can flip the
    // experience while the dashboard is open, so they're state (seeded from the
    // open-time props) updated by the `authoringExperienceUpdate` message below.
    const [liveAuthoringExperience, setLiveAuthoringExperience] = useState(authoringExperience);
    const [liveEdsDaLiveUrl, setLiveEdsDaLiveUrl] = useState(edsDaLiveUrl);

    // App Builder app state — seeded from initialApp (project.appState) and
    // updated live by the `appStatusUpdate` channel (mirrors the mesh card). When
    // initialApp is absent the project has no app yet; the card still renders its
    // No-app ("Add an App Builder app") state as long as the project has Adobe
    // context (see the render gate below).
    const [appState, setAppState] = useState<AppCardState | undefined>(initialApp);

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
    const { showRenameDialog, openRenameDialog, closeRenameDialog, confirmRename } = useRenameDialog();

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
    } = useDashboardStatus({ hasMesh, initialMeshStatus, initialEdsStorefrontStatus, hasAdobeContext }, isEdsStable);

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
        handleConfigure,
        handleOpenDevConsole,
        handleDeleteProject,
        handleCopyPath,
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
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-once effect for initial focus; focusTimer is stable, projectStatus read only on mount

    // Subscribe to live authoring-experience updates pushed by the Configure save
    // handler. Mirrors the meshStatusUpdate subscription in useDashboardStatus:
    // onMessage returns an unsubscribe fn used for cleanup. Only ever moves the
    // value to a new defined value (never clears it), preserving the prop seed.
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('authoringExperienceUpdate', (data: unknown) => {
            const payload = data as { authoringExperience?: AuthoringExperience; edsDaLiveUrl?: string };
            if (payload.authoringExperience) {
                setLiveAuthoringExperience(payload.authoringExperience);
            }
            if (payload.edsDaLiveUrl) {
                setLiveEdsDaLiveUrl(payload.edsDaLiveUrl);
            }
        });
        return unsubscribe;
    }, []);

    // Subscribe to App Builder app status pushed by the deployApp command. Mirrors
    // the meshStatusUpdate subscription: the payload's {status, message, url} maps
    // straight onto the card's AppCardState.
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('appStatusUpdate', (data: unknown) => {
            const payload = data as { status?: AppCardState['status']; message?: string; url?: string };
            if (!payload.status) return;
            setAppState(prev => ({
                status: payload.status as AppCardState['status'],
                message: payload.message,
                url: payload.url ?? prev?.url,
                deployedUrls: prev?.deployedUrls,
            }));
        });
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

                                {/* Mesh Status — `needs-auth` surfaces a "Sign in"
                                    remediation through the shared StatusCard.action
                                    (user-initiated re-auth; allowed to open a browser). */}
                                {meshStatusDisplay && (
                                    <StatusCard
                                        label="API Mesh"
                                        status={meshStatusDisplay.text}
                                        color={meshStatusDisplay.color}
                                        size="S"
                                        className="dashboard-status-badge"
                                        action={meshStatus === 'needs-auth'
                                            ? { label: 'Sign in', onPress: handleReAuthenticate }
                                            : undefined}
                                    />
                                )}

                                {/* AI Ready Status — a failing/incomplete badge
                                    (red/yellow) surfaces the "Regenerate AI files"
                                    fix through the shared StatusCard.action. The
                                    always-on "View AI Capabilities" navigation stays
                                    a separate link below (it's not a remediation). */}
                                <StatusCard
                                    label={aiReady.label}
                                    status={aiReady.text}
                                    color={aiReady.color}
                                    size="S"
                                    className="dashboard-status-badge"
                                    action={(aiReady.color === 'red' || aiReady.color === 'yellow')
                                        ? {
                                            label: 'Regenerate AI files',
                                            onPress: () => { void regenerateAiFiles(); },
                                            testId: 'ai-regenerate-trigger',
                                        }
                                        : undefined}
                                />

                                {/* IMS Org status — ambient org-context health (blue checking →
                                    green org name / red wrong org). Shown only for Adobe projects.
                                    The `unknown` case (couldn't check non-interactively on open)
                                    surfaces a quiet "Sign in to check" via StatusCard.action — a
                                    user-initiated sign-in (allowed to open a browser). The
                                    actionable mismatch banner is separate (below). */}
                                {imsOrgDisplay && (
                                    <StatusCard
                                        label="IMS Org"
                                        status={imsOrgDisplay.text}
                                        color={imsOrgDisplay.color}
                                        size="S"
                                        className="dashboard-status-badge"
                                        action={orgCheckState === 'unknown'
                                            ? { label: 'Sign in to check', onPress: handleReAuthenticate }
                                            : undefined}
                                    />
                                )}

                                {/* AI capability discovery — always-on navigation to
                                    the capability catalog (NOT a status remediation, so
                                    it stays a standalone link, not a StatusCard.action).
                                    Placed at column 2 so it's flush with the status
                                    labels above, not the dot column. */}
                                <Flex
                                    direction="row"
                                    gap="size-200"
                                    alignItems="center"
                                    UNSAFE_style={{ gridColumn: '2 / -1' }}
                                >
                                    <Link
                                        data-testid="ai-view-capabilities-trigger"
                                        onPress={() => setShowCapabilities(true)}
                                        isQuiet
                                        UNSAFE_className="text-sm cursor-pointer"
                                    >
                                        View AI Capabilities
                                    </Link>
                                </Flex>
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

                {/* Org-mismatch banner — the actionable half of org-context
                    surfacing (ambient checking/ok/wrong status lives in the "IMS
                    Org" badge above). Shows only on mismatch, with Switch IMS Org. */}
                <OrgContextNotice
                    state={orgCheckState}
                    orgMismatch={orgMismatch}
                    switchAttempted={switchAttempted}
                    isSwitching={isSwitchingOrg}
                    onSwitchOrg={onSwitchOrg}
                />

                <div className="page-container-padded pb-4">

                    {/* Center the grid of fixed-width buttons */}
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
                            authoringExperience={liveAuthoringExperience}
                            handleDeployMesh={handleDeployMesh}
                            handleSyncStorefront={handleSyncStorefront}
                            handleRefreshBlockLibrary={isEdsStable ? handleRefreshBlockLibrary : undefined}
                            handleRepublishContent={isEdsStable ? handleRepublishContent : undefined}
                            handleConfigure={handleConfigure}
                            handleOpenDevConsole={handleOpenDevConsole}
                            handleRename={openRenameDialog}
                            handleCopyPath={handleCopyPath}
                            handleExportProject={handleExportProject}
                            handleResetProject={handleResetProject}
                            handleDeleteProject={handleDeleteProject}
                        />
                    </div>

                    {/* App Builder app card — sibling of the mesh surface. Shown
                        whenever the project has an Adobe workspace to deploy into
                        (so the "Add an App Builder app" affordance is reachable) or
                        already carries an app. `appState` is undefined for a no-app
                        project → the card renders its No-app state. */}
                    {shouldShowAppCard(hasAdobeContext, appState) && (
                        <div className="dashboard-grid-container">
                            <AppBuilderCard app={appState} />
                        </div>
                    )}
                </div>
            </PageLayout>

            {/* Rename dialog — opened from the More menu's Rename item. On confirm
                we post renameProject; the backend re-sends init so the title
                refreshes. The dialog reuses the projects-list component. */}
            <DashboardRenameDialog
                isOpen={showRenameDialog}
                projectName={displayName}
                projectPath={project?.path}
                onRename={confirmRename}
                onClose={closeRenameDialog}
            />

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
