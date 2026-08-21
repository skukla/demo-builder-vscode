/**
 * useDashboardStatus Hook
 *
 * Extracts status state, subscriptions, and computed status displays
 * from ProjectDashboardScreen.
 *
 * Decomposed siblings (all re-exported here, so the public API is unchanged):
 * - dashboardStatusTypes.ts — the status vocabulary (types + mesh predicates)
 * - dashboardCheckRouting.ts — the on-open `checkResult` routing switch
 * - aiStatusDerivations.ts — the AI badge + inventory-view pure derivations
 *
 * @module features/dashboard/ui/hooks/useDashboardStatus
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { deriveAiInventoryView, deriveAiReadyState } from './aiStatusDerivations';
import { routeCheckOutcome } from './dashboardCheckRouting';
import {
    isMeshBusy,
    isMeshDeploying,
    type AiReadyState,
    type MeshStatusUpdatePayload,
    type OrgCheckState,
    type DashboardStatusUpdatePayload,
    type StatusDisplay,
    type UseDashboardStatusProps,
    type UseDashboardStatusReturn,
    type VerifyAiSetupResponse,
} from './dashboardStatusTypes';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { getMeshStatusDisplay } from '@/core/ui/utils/meshStatusDisplay';
import {
    getStorefrontStatusDisplay,
    isUpdatePending,
    severityToColor,
} from '@/core/ui/utils/statusVocabulary';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { OrgMismatchInfo } from '@/features/authentication/services/detectProjectOrgMismatch';
import type {
    CheckOutcome,
    CheckStatus,
    OrgContextCheckData,
} from '@/features/dashboard/services/onOpenChecks';
import type { AiRegenerateProgress } from '@/features/dashboard/ui/components/AiCapabilitiesModal';
import { CHECK_RESULT_MESSAGE } from '@/types/messages';

// Public API — everything consumers imported from this module before the
// decomposition still resolves here.
export { isMeshBusy } from './dashboardStatusTypes';
export type {
    AiReadyState,
    EdsStorefrontStatus,
    MeshStatus,
    OrgCheckState,
    DashboardStatusUpdatePayload,
    StatusColor,
    StatusDisplay,
    StatusRemedy,
    UseDashboardStatusProps,
    UseDashboardStatusReturn,
} from './dashboardStatusTypes';

/**
 * Derive the org-check lifecycle (avoids a nested ternary in the hook body).
 *
 * Telegraphs "checking" while the proactive check is expected (the project has
 * an Adobe org) and not yet *perceptibly* resolved — i.e. until the async
 * `checkResult` has arrived (orgChecked) AND a minimum display time has elapsed,
 * so a fast (warm-cache) check doesn't flash the indicator and make the banner
 * appear out of nowhere. Once resolved, the typed outcome status drives the rest.
 */
function deriveOrgCheckState(
    orgStatus: CheckStatus | undefined,
    orgChecked: boolean,
    hasAdobeContext: boolean,
    minDisplayElapsed: boolean,
): OrgCheckState {
    if (!hasAdobeContext) return 'none';
    if (!orgChecked || !minDisplayElapsed) return 'checking';
    if (orgStatus === 'warning') return 'mismatch';
    // unknown OR an unexpected error both degrade to the quiet "sign in" affordance.
    if (orgStatus === 'unknown' || orgStatus === 'error') return 'unknown';
    return 'ok';
}

/** Fallback when a failed regenerate carries no usable error message. */
const AI_REGEN_FALLBACK_ERROR = 'Regenerating AI files failed.';

/**
 * Hook to manage dashboard status state and computed displays
 *
 * Extracts status management from ProjectDashboardScreen for better
 * separation of concerns and testability.
 *
 * @param props - Hook configuration
 * @returns Object containing status state and computed displays
 */
export function useDashboardStatus(
    props: UseDashboardStatusProps = {},
    isEds = false,
): UseDashboardStatusReturn {
    const { hasMesh, initialEdsStorefrontStatus, hasAdobeContext } = props;

    const [projectStatus, setProjectStatus] = useState<DashboardStatusUpdatePayload | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [verifyResult, setVerifyResult] = useState<VerifyAiSetupResponse | null>(null);
    const [verifyFailed, setVerifyFailed] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    // True only while a REGENERATE is in flight (aiBusy also covers verifies).
    // Drives the badge's "Regenerating AI files…" telegraph — without it the
    // click on "Regenerate AI files" is invisible for the whole (up to ~1 min)
    // run and reads as a dead link.
    const [aiRegenerating, setAiRegenerating] = useState(false);
    const [aiRegenProgress, setAiRegenProgress] = useState<AiRegenerateProgress | null>(null);
    // Error from the last regenerate (handler {success:false}.error or a
    // rejected request). Cleared by the next successful regenerate.
    const [aiRegenError, setAiRegenError] = useState<string | null>(null);
    // Gate the "Checking Adobe organization…" indicator to a minimum visible
    // duration so a fast check is still perceived before the banner shows.
    const [orgCheckMinElapsed, setOrgCheckMinElapsed] = useState(false);
    // Org-context check result, delivered asynchronously (decoupled from status)
    // via the on-open orchestrator's `checkResult` message (checkId `org-context`).
    // orgChecked flips true once resolved; orgStatus carries the typed outcome so
    // the badge can distinguish ok / mismatch / unknown ("sign in to check").
    const [orgMismatch, setOrgMismatch] = useState<OrgMismatchInfo | undefined>(undefined);
    const [orgChecked, setOrgChecked] = useState(false);
    const [orgStatus, setOrgStatus] = useState<CheckStatus | undefined>(undefined);
    // Name of the org the token currently reaches — shown in the "IMS Org" badge.
    const [orgCurrentName, setOrgCurrentName] = useState<string | undefined>(undefined);
    // True while the mcp-health check is visibly auto-healing stale MCP paths
    // (checkResult{mcp-health, warning} → true; ok/error → false). Drives the AI
    // badge's "Updating AI configuration…" telegraph (replaces the silent failure).
    const [mcpHealing, setMcpHealing] = useState(false);
    // True when the ai-context-freshness check reports the project is missing AI
    // tooling packages its components qualify for (the composition axis — a stale
    // version stamp returns ok + a log line and never lands here; warning → true,
    // ok → false). Detect-only: it flips the AI badge to "AI tooling missing",
    // which surfaces the existing "Regenerate AI files" action (the remediation).
    const [aiToolingMissing, setAiToolingMissing] = useState(false);
    // Track whether status was requested (prevent StrictMode double-request)
    const statusRequestedRef = useRef(false);

    useEffect(() => {
        // Guard against StrictMode double-request (only send message once)
        if (!statusRequestedRef.current) {
            statusRequestedRef.current = true;
            webviewClient.postMessage('requestStatus');
        }

        const unsubscribeStatus = webviewClient.onMessage('statusUpdate', (data: unknown) => {
            const projectData = data as DashboardStatusUpdatePayload;
            // Merge status update, preserving mesh status only during active deployment
            // AND only if the new status is a transient 'checking' state.
            // This prevents update checks from resetting mesh button state mid-deployment
            // but allows completion statuses (deployed, error, etc.) to come through.
            setProjectStatus((prev) => {
                const shouldPreserveMeshStatus =
                    isMeshDeploying(prev?.mesh?.status) && projectData.mesh?.status === 'checking';
                return {
                    ...projectData,
                    mesh: shouldPreserveMeshStatus ? prev?.mesh : projectData.mesh,
                };
            });
            setIsRunning(projectData.status === 'running');
            // Clear transitioning state when we receive a definitive status
            if (
                projectData.status === 'running' ||
                projectData.status === 'ready' ||
                projectData.status === 'stopped'
            ) {
                setIsTransitioning(false);
            }
        });

        const unsubscribeMesh = webviewClient.onMessage('meshStatusUpdate', (data: unknown) => {
            const meshData = data as MeshStatusUpdatePayload;
            setProjectStatus((prev) =>
                prev
                    ? {
                          ...prev,
                          mesh: {
                              status: meshData.status,
                              message: meshData.message,
                              endpoint: meshData.endpoint,
                          },
                      }
                    : prev,
            );
            // Clear transitioning state when mesh operation completes
            if (!isMeshBusy(meshData.status)) {
                setIsTransitioning(false);
            }
        });

        // On-open check results (decoupled from statusUpdate), routed by checkId
        // in routeCheckOutcome — see dashboardCheckRouting.ts for the per-check
        // semantics (org-context, mcp-health, ai-context-freshness, mesh-verify,
        // ai-verify).
        const unsubscribeChecks = webviewClient.onMessage(CHECK_RESULT_MESSAGE, (data: unknown) => {
            routeCheckOutcome(data as CheckOutcome<OrgContextCheckData>, {
                setOrgChecked,
                setOrgStatus,
                setOrgMismatch,
                setOrgCurrentName,
                setMcpHealing,
                setAiToolingMissing,
                setProjectStatus,
                setVerifyResult,
                setVerifyFailed,
                setAiBusy,
            });
        });

        // Subscribe to the wizard's `creationProgress` channel — the regenerate
        // handler reuses it so each step (install → AGENTS.md → MCP → skills →
        // finalize) is reported in the same payload shape. The AI Capabilities
        // modal renders this live via LoadingDisplay; no cross-talk with the
        // wizard because the wizard is a separate webview.
        const unsubscribeProgress = webviewClient.onMessage('creationProgress', (data: unknown) => {
            const payload = data as {
                currentOperation?: string;
                progress?: number;
                message?: string;
            };
            if (!payload?.currentOperation) return;
            setAiRegenProgress({
                currentOperation: payload.currentOperation,
                message: payload.message,
                progress: payload.progress,
            });
        });

        return () => {
            unsubscribeStatus();
            unsubscribeMesh();
            unsubscribeChecks();
            unsubscribeProgress();
        };
    }, []);

    // Hold the org-check "checking" indicator on screen for a minimum duration so
    // a fast (warm-cache) check is still perceived before the banner/clear.
    useEffect(() => {
        if (!hasAdobeContext) return;
        const timer = setTimeout(
            () => setOrgCheckMinElapsed(true),
            FRONTEND_TIMEOUTS.ORG_CHECK_MIN_DISPLAY,
        );
        return () => clearTimeout(timer);
    }, [hasAdobeContext]);

    // Run the AI setup verification on demand (after Regenerate). The ON-OPEN
    // verification is delivered by the orchestrator's ai-verify check via
    // `checkResult{ai-verify}` (see the listener above) — the hook no longer
    // pulls it on mount, so the MCP servers spawn once on open, not twice.
    const runVerify = useCallback(async (): Promise<void> => {
        try {
            const result = await webviewClient.request<VerifyAiSetupResponse>(
                'verify-ai-setup',
                {},
            );
            setVerifyResult(result);
            setVerifyFailed(false);
        } catch {
            setVerifyFailed(true);
        }
    }, []);

    // Regenerate the project's AI files (rewrites .claude/* + AGENTS.md, including
    // skills), then re-verify so the badge and the skills list reflect the result.
    // Clears any stale `aiRegenProgress` at start so the modal opens on the static
    // copy before the first creationProgress lands, and again at end so a stopped
    // regen doesn't leave a frozen step name showing on next open.
    const regenerateAiFiles = useCallback(async (): Promise<void> => {
        setAiRegenProgress(null);
        setAiBusy(true);
        setAiRegenerating(true);
        try {
            const result = await webviewClient.request<{ success?: boolean; error?: string }>(
                'regenerate-ai-files',
                {},
            );
            if (result?.success !== false) {
                // The handler persisted a fresh aiContextVersion stamp, but
                // `aiToolingMissing` is fed by the ON-OPEN freshness check, which
                // does not re-run here — without this clear, a successful
                // regenerate leaves the badge stuck on "AI tooling missing"
                // until the dashboard reopens. The reRunnable check re-confirms
                // on next open.
                setAiToolingMissing(false);
                setAiRegenError(null);
            } else {
                // The handler built `error` precisely so callers can surface it
                // (e.g. the tooling-install failure message) — discarding it
                // left the modal returning to idle with no signal.
                setAiRegenError(result.error || AI_REGEN_FALLBACK_ERROR);
            }
            await runVerify();
        } catch (error) {
            // A rejected request used to escape into a void'ed promise (no
            // catch) — the same silent return to idle. Capture it instead.
            setAiRegenError(error instanceof Error ? error.message : AI_REGEN_FALLBACK_ERROR);
        } finally {
            setAiBusy(false);
            setAiRegenerating(false);
            setAiRegenProgress(null);
        }
    }, [runVerify]);

    // Derived values
    const status = projectStatus?.status;
    const port = projectStatus?.port || 3000;
    const frontendConfigChanged = projectStatus?.frontendConfigChanged || false;
    const meshStatus = projectStatus?.mesh?.status;
    const meshMessage = projectStatus?.mesh?.message;
    const orgCheckState = deriveOrgCheckState(
        orgStatus,
        orgChecked,
        Boolean(hasAdobeContext),
        orgCheckMinElapsed,
    );
    const displayName = projectStatus?.name || '';

    // "IMS Org" status badge — ambient org-context health: blue while checking,
    // green with the org name when reachable, red with the (wrong) org name on
    // mismatch. Null for non-Adobe projects (no badge). The mismatch BANNER is
    // separate (it carries the attention + Switch IMS Org action).
    const imsOrgDisplay = useMemo((): StatusDisplay | null => {
        switch (orgCheckState) {
            case 'checking':
                return { color: 'blue', text: 'Checking…' };
            case 'ok':
                return { color: 'green', text: orgCurrentName || 'Connected' };
            case 'mismatch':
                return { color: 'red', text: orgCurrentName || 'Wrong org' };
            case 'unknown':
                // Couldn't check non-interactively — neutral badge; the "Sign in to
                // check" action (rendered on the badge) is the recovery affordance.
                return { color: 'gray', text: 'Not checked' };
            default:
                return null;
        }
    }, [orgCheckState, orgCurrentName]);

    // Memoize status displays for performance
    const demoStatusDisplay = useMemo((): StatusDisplay => {
        // EDS projects show dynamic status based on storefront config state
        // Use updated value from projectStatus (via statusUpdate) or fall back to initial prop
        if (isEds) {
            // One shared table, so this cannot drift from how the project card
            // renders the same state — which is exactly what happened while both
            // surfaces owned a switch statement (they disagreed on the casing of
            // "Not published").
            const storefrontStatus =
                projectStatus?.edsStorefrontStatus || initialEdsStorefrontStatus;
            const display = getStorefrontStatusDisplay(storefrontStatus);
            return {
                color: severityToColor(display.severity),
                text: display.label,
                // Only DRIFT offers a republish. `not-published` is a storefront
                // that has never shipped, and its verb is Sync Storefront.
                remedy: isUpdatePending(storefrontStatus) ? 'republish' : undefined,
            };
        }

        switch (status) {
            case 'starting':
                return { color: 'blue', text: 'Starting...' };
            case 'running':
                if (frontendConfigChanged) {
                    return { color: 'yellow', text: 'Restart needed', remedy: 'restart' };
                }
                return { color: 'green', text: `Running on port ${port}` };
            case 'stopping':
                return { color: 'yellow', text: 'Stopping...' };
            case 'stopped':
            case 'ready':
                return { color: 'gray', text: 'Stopped' };
            case 'configuring':
                return { color: 'blue', text: 'Configuring...' };
            case 'error':
                return { color: 'red', text: 'Error' };
            default:
                return { color: 'gray', text: 'Ready' };
        }
    }, [
        isEds,
        status,
        frontendConfigChanged,
        port,
        initialEdsStorefrontStatus,
        projectStatus?.edsStorefrontStatus,
    ]);

    const meshStatusDisplay = useMemo((): StatusDisplay | null => {
        // No init-payload seed: the first statusUpdate (which is also what
        // unblocks the surfaces that render this) already carries the DERIVED
        // mesh status — auth/deploying/error aware, unlike the persisted
        // summary the retired `initialMeshStatus` seed replayed.
        const effectiveMeshStatus = meshStatus;

        if (!effectiveMeshStatus) {
            // If we know hasMesh, use it
            if (hasMesh) return { color: 'blue', text: 'Loading status...' };
            // If projectStatus hasn't loaded yet, show loading (avoids flash)
            if (!projectStatus) return { color: 'blue', text: 'Loading status...' };
            // projectStatus loaded and no mesh - hide the section
            return null;
        }

        // Transient dashboard-only states (not persisted)
        switch (effectiveMeshStatus) {
            case 'checking':
                return { color: 'blue', text: 'Checking status...' };
            case 'needs-auth':
                return { color: 'yellow', text: 'Session expired' };
            case 'deploying':
                return { color: 'blue', text: meshMessage || 'Deploying...' };
        }

        // Persisted statuses — the shared vocabulary. The 'config-changed' →
        // 'stale' translation used to happen here AND in the grid's
        // toMeshCardStatus; it now happens once, in normalizeDisplayStatus, so
        // the alias cannot mean one thing on this badge and another on the card.
        const display = getMeshStatusDisplay(effectiveMeshStatus);
        if (display) {
            return { color: display.color, text: display.text };
        }

        return { color: 'gray', text: 'Unknown' };
    }, [meshStatus, meshMessage, hasMesh, projectStatus]);

    // AI Ready badge — pure derivation, see deriveAiReadyState for the color
    // semantics and precedence order.
    const aiReady = useMemo<AiReadyState>(
        () =>
            deriveAiReadyState({
                verifyResult,
                verifyFailed,
                mcpHealing,
                aiToolingMissing,
                aiRegenerating,
            }),
        [verifyResult, verifyFailed, mcpHealing, aiToolingMissing, aiRegenerating],
    );

    // Capability lists for the "View AI Capabilities" surface (extracted helper
    // — see deriveAiInventoryView).
    const { aiSkills, aiMcps, aiInventoryLoading, aiSkillsError, aiMcpsError, aiEditedFiles } =
        deriveAiInventoryView(verifyResult, verifyFailed);

    return {
        projectStatus,
        isRunning,
        isTransitioning,
        setIsTransitioning,
        demoStatusDisplay,
        meshStatusDisplay,
        displayName,
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
    };
}
