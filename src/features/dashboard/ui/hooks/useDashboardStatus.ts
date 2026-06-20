/**
 * useDashboardStatus Hook
 *
 * Extracts status state, subscriptions, and computed status displays
 * from ProjectDashboardScreen.
 *
 * @module features/dashboard/ui/hooks/useDashboardStatus
 */

import { useState, useEffect, useMemo, useRef, useCallback, Dispatch, SetStateAction } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { getMeshStatusDisplay } from '@/core/ui/utils/meshStatusDisplay';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { OrgMismatchInfo } from '@/features/authentication/services/detectProjectOrgMismatch';
import type { CheckOutcome, CheckStatus, OrgContextCheckData, MeshVerifyCheckData } from '@/features/dashboard/services/onOpenChecks';
import type { AiRegenerateProgress } from '@/features/dashboard/ui/components/AiCapabilitiesModal';
import type { McpInventoryEntry, SkillInventoryEntry } from '@/types/ai';
import { CHECK_RESULT_MESSAGE, CHECK_IDS } from '@/types/messages';

/**
 * Mesh deployment status values
 */
export type MeshStatus =
    | 'checking'
    | 'needs-auth'
    | 'not-deployed'
    | 'deploying'
    | 'deployed'
    | 'config-changed'
    | 'config-incomplete'
    | 'update-declined'
    | 'error';

/**
 * Project status data from extension
 */
export interface ProjectStatus {
    name: string;
    path: string;
    status: 'created' | 'configuring' | 'ready' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
    port?: number;
    adobeOrg?: string;
    adobeProject?: string;
    frontendConfigChanged?: boolean;
    mesh?: {
        status: MeshStatus;
        endpoint?: string;
        message?: string;
    };
    edsStorefrontStatus?: EdsStorefrontStatus;
}

/**
 * Status display color values
 */
export type StatusColor = 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'gray';

/**
 * Status display object
 */
export interface StatusDisplay {
    color: StatusColor;
    text: string;
}

/**
 * AI Ready badge state — derived from `verify-ai-setup` response.
 *
 * Combines all 7 AI-setup signals (file checks + inventory inspectors +
 * global MCP registration) into a single 4-color badge. See the
 * "AI Ready badge state" section in the AI surface redesign plan.
 */
export interface AiReadyState {
    label: 'AI';
    color: 'blue' | 'gray' | 'green' | 'yellow' | 'red';
    text: 'Verifying' | 'Ready' | 'Setup incomplete' | 'Broken' | 'Updating AI configuration…';
}

/**
 * Shape we read from the AI verification — delivered on open via the
 * `checkResult{ai-verify}` push (`data`) and on demand via the `verify-ai-setup`
 * request (after Regenerate). `success` only appears on the request response.
 */
interface VerifyAiSetupResponse {
    success?: boolean;
    checks?: Array<{ name: string; status: 'ok' | 'warning' | 'error' }>;
    inventory?: {
        /** Task-framed capability list surfaced by the "View AI Capabilities" link. */
        skills?: SkillInventoryEntry[];
        skillsError?: string;
        /** MCP servers wired into the project's .mcp.json, with per-server status + tool count. */
        mcps?: McpInventoryEntry[];
        mcpsError?: string;
    };
}

/**
 * EDS storefront status values
 */
export type EdsStorefrontStatus = 'published' | 'stale' | 'update-declined' | 'not-published';

/**
 * Props for the useDashboardStatus hook
 */
export interface UseDashboardStatusProps {
    /** Whether project has mesh configuration */
    hasMesh?: boolean;
    /** Initial mesh status from card grid (avoids loading flash) */
    initialMeshStatus?: string;
    /** Initial EDS storefront status from initial data */
    initialEdsStorefrontStatus?: EdsStorefrontStatus;
    /**
     * Whether the project has an Adobe org (from init). When true, a proactive
     * org-context check runs on load; the UI telegraphs it as "checking" until
     * the first status resolves it.
     */
    hasAdobeContext?: boolean;
}

/**
 * Org-context check lifecycle for the dashboard notice:
 * - `checking`: the proactive check is expected to run but hasn't resolved yet.
 * - `mismatch`: the token reaches a different org than the project (warning).
 * - `unknown`: the check couldn't run non-interactively (no token / SDK cold) —
 *   surfaces a quiet "Sign in to check" affordance instead of launching a browser.
 * - `ok`: resolved and the org is reachable (drives a transient success banner).
 * - `none`: no check applies (project has no Adobe org).
 */
export type OrgCheckState = 'checking' | 'mismatch' | 'unknown' | 'ok' | 'none';

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

/**
 * Return type for the useDashboardStatus hook
 */
export interface UseDashboardStatusReturn {
    /** Current project status data */
    projectStatus: ProjectStatus | null;
    /** Whether demo is currently running */
    isRunning: boolean;
    /** Whether UI is transitioning (button pressed, waiting for response) */
    isTransitioning: boolean;
    /** Setter for transitioning state */
    setIsTransitioning: Dispatch<SetStateAction<boolean>>;
    /** Computed demo status display */
    demoStatusDisplay: StatusDisplay;
    /** Computed mesh status display (null if no mesh) */
    meshStatusDisplay: StatusDisplay | null;
    /** Display name for project */
    displayName: string;
    /** Current project status value */
    status: ProjectStatus['status'] | undefined;
    /** Current mesh status value */
    meshStatus: MeshStatus | undefined;
    /** Proactive org-context mismatch (drives the "Switch IMS Org" banner) */
    orgMismatch: OrgMismatchInfo | undefined;
    /** Org-context check lifecycle — telegraphs checking → mismatch/ok/none */
    orgCheckState: OrgCheckState;
    /** "IMS Org" status badge display (color + org name), or null when N/A */
    imsOrgDisplay: StatusDisplay | null;
    /** Derived AI Ready badge state */
    aiReady: AiReadyState;
    /** Task-framed capability list (skills) for the "View AI Capabilities" surface */
    aiSkills: SkillInventoryEntry[];
    /** True when the skill inspector errored (list shows a warning row) */
    aiSkillsError: boolean;
    /** Project MCP servers inventory for the "View AI Capabilities" surface */
    aiMcps: McpInventoryEntry[];
    /** True when the MCP inspector errored (list shows a warning row) */
    aiMcpsError: boolean;
    /** True while an AI verify/regenerate operation is in flight */
    aiBusy: boolean;
    /**
     * Live regenerate progress (step name + detail) when a regenerate is in flight,
     * else null. Sourced from the wizard's `creationProgress` channel — see
     * `handleRegenerateAiFiles`. Forwarded into the AI Capabilities modal.
     */
    aiRegenProgress: AiRegenerateProgress | null;
    /** Regenerate the project's AI files, then re-verify (refreshes badge + skills + MCPs) */
    regenerateAiFiles: () => Promise<void>;
}

/** Stable empty references so identity doesn't churn each render. */
const EMPTY_SKILLS: SkillInventoryEntry[] = [];
const EMPTY_MCPS: McpInventoryEntry[] = [];

/** Mesh statuses that indicate a user-initiated operation is in progress (preserve during updates) */
const isMeshDeploying = (status: MeshStatus | undefined): boolean =>
    status === 'deploying';

/** Mesh statuses that indicate any operation is in progress (disable UI actions) */
export const isMeshBusy = (status: MeshStatus | undefined): boolean =>
    status === 'deploying' || status === 'checking';

/**
 * Hook to manage dashboard status state and computed displays
 *
 * Extracts status management from ProjectDashboardScreen for better
 * separation of concerns and testability.
 *
 * @param props - Hook configuration
 * @returns Object containing status state and computed displays
 */
export function useDashboardStatus(props: UseDashboardStatusProps = {}, isEds = false): UseDashboardStatusReturn {
    const { hasMesh, initialMeshStatus, initialEdsStorefrontStatus, hasAdobeContext } = props;

    const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [verifyResult, setVerifyResult] = useState<VerifyAiSetupResponse | null>(null);
    const [verifyFailed, setVerifyFailed] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiRegenProgress, setAiRegenProgress] = useState<AiRegenerateProgress | null>(null);
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
    // Track whether status was requested (prevent StrictMode double-request)
    const statusRequestedRef = useRef(false);

    useEffect(() => {
        // Guard against StrictMode double-request (only send message once)
        if (!statusRequestedRef.current) {
            statusRequestedRef.current = true;
            webviewClient.postMessage('requestStatus');
        }

        const unsubscribeStatus = webviewClient.onMessage('statusUpdate', (data: unknown) => {
            const projectData = data as ProjectStatus;
            // Merge status update, preserving mesh status only during active deployment
            // AND only if the new status is a transient 'checking' state.
            // This prevents update checks from resetting mesh button state mid-deployment
            // but allows completion statuses (deployed, error, etc.) to come through.
            setProjectStatus(prev => {
                const shouldPreserveMeshStatus =
                    isMeshDeploying(prev?.mesh?.status) && projectData.mesh?.status === 'checking';
                return {
                    ...projectData,
                    mesh: shouldPreserveMeshStatus ? prev?.mesh : projectData.mesh,
                };
            });
            setIsRunning(projectData.status === 'running');
            // Clear transitioning state when we receive a definitive status
            if (projectData.status === 'running' || projectData.status === 'ready' || projectData.status === 'stopped') {
                setIsTransitioning(false);
            }
        });

        const unsubscribeMesh = webviewClient.onMessage('meshStatusUpdate', (data: unknown) => {
            const meshData = data as { status: MeshStatus; message?: string; endpoint?: string };
            setProjectStatus(prev => prev ? {
                ...prev,
                mesh: {
                    status: meshData.status,
                    message: meshData.message,
                    endpoint: meshData.endpoint,
                },
            } : prev);
            // Clear transitioning state when mesh operation completes
            if (!isMeshBusy(meshData.status)) {
                setIsTransitioning(false);
            }
        });

        // On-open check results (decoupled from statusUpdate), routed by checkId:
        //   - org-context: `pending` telegraph → ok / warning (mismatch) / unknown
        //     ("sign in to check"). Re-checks (after a switch / re-auth) repeat.
        //   - mcp-health: `warning` telegraphs a visible self-heal of stale MCP
        //     paths; ok/error ends it. (mesh-verify / ai-verify join in later steps.)
        const unsubscribeChecks = webviewClient.onMessage(CHECK_RESULT_MESSAGE, (data: unknown) => {
            const outcome = data as CheckOutcome<OrgContextCheckData>;

            if (outcome.checkId === CHECK_IDS.ORG_CONTEXT) {
                if (outcome.status === 'pending') {
                    setOrgChecked(false);
                    setOrgStatus('pending');
                    setOrgMismatch(undefined);
                    setOrgCurrentName(undefined);
                    return;
                }
                setOrgChecked(true);
                setOrgStatus(outcome.status);
                setOrgMismatch(outcome.data?.orgMismatch);
                setOrgCurrentName(outcome.data?.currentOrg);
                return;
            }

            if (outcome.checkId === CHECK_IDS.MCP_HEALTH) {
                // `warning` = heal in flight; `ok`/`error` end it. The AI badge
                // reflects the in-flight state; a failed heal falls back to the
                // verify-driven badge (whose "Regenerate AI files" is the retry).
                setMcpHealing(outcome.status === 'warning');
                return;
            }

            if (outcome.checkId === CHECK_IDS.MESH_VERIFY) {
                // The deployed mesh was background-verified. `warning` = it's gone
                // → flip the badge to not-deployed (now VISIBLE, not a silent state
                // mutation). `unknown` = transient verify error → leave the badge as
                // persisted (don't scare). `ok` = still there → keep current badge.
                const meshOutcome = outcome as CheckOutcome<MeshVerifyCheckData>;
                if (meshOutcome.status === 'warning') {
                    setProjectStatus(prev => prev ? {
                        ...prev,
                        mesh: { status: 'not-deployed', message: meshOutcome.message, endpoint: prev.mesh?.endpoint },
                    } : prev);
                }
                return;
            }

            if (outcome.checkId === CHECK_IDS.AI_VERIFY) {
                // The single on-open AI verification (the hook no longer pulls it).
                // `data` carries {checks, inventory} → drives the AI badge + skills/
                // MCP modal. A thrown verify arrives as an error outcome with no data
                // → mark verify failed so the badge leaves 'Verifying'.
                const aiData = (outcome as CheckOutcome<VerifyAiSetupResponse>).data;
                if (aiData) {
                    setVerifyResult(aiData);
                    setVerifyFailed(false);
                } else {
                    setVerifyFailed(true);
                }
                setAiBusy(false);
            }
        });

        // Subscribe to the wizard's `creationProgress` channel — the regenerate
        // handler reuses it so each step (install → AGENTS.md → MCP → skills →
        // finalize) is reported in the same payload shape. The AI Capabilities
        // modal renders this live via LoadingDisplay; no cross-talk with the
        // wizard because the wizard is a separate webview.
        const unsubscribeProgress = webviewClient.onMessage('creationProgress', (data: unknown) => {
            const payload = data as { currentOperation?: string; progress?: number; message?: string };
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
            const result = await webviewClient.request<VerifyAiSetupResponse>('verify-ai-setup', {});
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
        try {
            await webviewClient.request('regenerate-ai-files', {});
            await runVerify();
        } finally {
            setAiBusy(false);
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
            const storefrontStatus = projectStatus?.edsStorefrontStatus || initialEdsStorefrontStatus || 'published';
            switch (storefrontStatus) {
                case 'published':
                    return { color: 'green', text: 'Published' };
                case 'stale':
                    return { color: 'yellow', text: 'Republish Needed' };
                case 'update-declined':
                    return { color: 'orange', text: 'Republish Needed' };
                case 'not-published':
                    return { color: 'gray', text: 'Not Published' };
                default:
                    return { color: 'green', text: 'Published' };
            }
        }

        switch (status) {
            case 'starting':
                return { color: 'blue', text: 'Starting...' };
            case 'running':
                if (frontendConfigChanged) {
                    return { color: 'yellow', text: 'Restart needed' };
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
    }, [isEds, status, frontendConfigChanged, port, initialEdsStorefrontStatus, projectStatus?.edsStorefrontStatus]);

    const meshStatusDisplay = useMemo((): StatusDisplay | null => {
        // Use initialMeshStatus from init payload to avoid loading flash
        // Translate persisted values: 'stale' → 'config-changed' (dashboard terminology)
        const effectiveMeshStatus = meshStatus
            || (initialMeshStatus === 'stale' ? 'config-changed' : initialMeshStatus as MeshStatus | undefined);

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

        // Persisted statuses — use shared display mapping
        // Dashboard uses 'config-changed' for what's stored as 'stale'
        const lookupKey = effectiveMeshStatus === 'config-changed' ? 'stale' : effectiveMeshStatus;
        const display = getMeshStatusDisplay(lookupKey);
        if (display) {
            return { color: display.color, text: display.text };
        }

        return { color: 'gray', text: 'Unknown' };
    }, [meshStatus, meshMessage, hasMesh, projectStatus, initialMeshStatus]);

    // Derive AI Ready badge state from the verify response. Colors:
    //   blue:   verify hasn't returned yet (initial) — matches the dashboard's
    //           convention that blue is "in-flight / transient" across badges
    //           (Mesh "Loading status...", Frontend "Starting...", etc.)
    //   red:    any of the project AI file checks failed
    //   yellow: files OK but an inventory inspector errored
    //   green:  files OK and inventory healthy
    //
    // Global MCP registration (~/.claude.json) is an optional convenience for
    // cross-directory discovery, not a readiness requirement — the per-project
    // .mcp.json is written at creation and is sufficient. So it does NOT gate
    // this badge; the AI Configuration tab surfaces a Register button separately.
    const aiReady = useMemo<AiReadyState>(() => {
        // The mcp-health check is visibly self-healing stale MCP paths — telegraph
        // it on the badge (P2) so the work isn't silent. Overrides the verify state
        // until the heal resolves (ok → verify-driven badge; error → falls back to
        // the verify badge whose "Regenerate AI files" action is the retry).
        if (mcpHealing) {
            return { label: 'AI', color: 'blue', text: 'Updating AI configuration…' };
        }
        if (!verifyResult) {
            // Verify failed — surface as 'Setup incomplete' rather than leaving
            // the badge stuck on gray indefinitely.
            if (verifyFailed) {
                return { label: 'AI', color: 'yellow', text: 'Setup incomplete' };
            }
            return { label: 'AI', color: 'blue', text: 'Verifying' };
        }

        const checks = verifyResult.checks ?? [];
        const anyCheckFailed = checks.some(c => c.status !== 'ok');
        if (anyCheckFailed) {
            return { label: 'AI', color: 'red', text: 'Broken' };
        }

        const inv = verifyResult.inventory ?? {};
        const hasInventoryError = Boolean(inv.skillsError ?? inv.mcpsError);
        if (hasInventoryError) {
            return { label: 'AI', color: 'yellow', text: 'Setup incomplete' };
        }

        return { label: 'AI', color: 'green', text: 'Ready' };
    }, [verifyResult, verifyFailed, mcpHealing]);

    // Capability lists for the "View AI Capabilities" surface.
    const inventory = verifyResult?.inventory;
    const aiSkills = inventory?.skills ?? EMPTY_SKILLS;
    const aiSkillsError = Boolean(inventory?.skillsError);
    const aiMcps = inventory?.mcps ?? EMPTY_MCPS;
    const aiMcpsError = Boolean(inventory?.mcpsError);

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
        aiBusy,
        aiRegenProgress,
        regenerateAiFiles,
    };
}
