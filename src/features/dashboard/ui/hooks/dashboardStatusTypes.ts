/**
 * Dashboard Status Vocabulary
 *
 * Types and small predicates shared by useDashboardStatus and its extracted
 * helpers (dashboardCheckRouting, aiStatusDerivations). The hook re-exports
 * every public name here, so consumers keep importing from useDashboardStatus
 * — the decomposition did not change the public API.
 *
 * @module features/dashboard/ui/hooks/dashboardStatusTypes
 */

import type { Dispatch, SetStateAction } from 'react';
import type { OrgMismatchInfo } from '@/features/authentication/services/detectProjectOrgMismatch';
import type { AiRegenerateProgress } from '@/features/dashboard/ui/components/AiCapabilitiesModal';
import type { McpInventoryEntry, SkillInventoryEntry } from '@/types/ai';

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
    status:
        | 'created'
        | 'configuring'
        | 'ready'
        | 'starting'
        | 'running'
        | 'stopping'
        | 'stopped'
        | 'error';
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
 * The fix a bad status needs, decided where the status is named rather than by
 * whichever component happens to render it.
 *
 * The Frontend badge used to report "Republish needed" and "Restart needed" and
 * offer neither: the republish sat in the ActionGrid's More overflow, and no
 * restart affordance existed at all. Naming the remedy beside the state is what
 * stops those drifting apart again.
 */
export type StatusRemedy = 'republish' | 'restart';

export interface StatusDisplay {
    color: StatusColor;
    text: string;
    /** Present only when this state has an inline fix to offer. */
    remedy?: StatusRemedy;
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
    text:
        | 'Verifying'
        | 'Ready'
        | 'Setup incomplete'
        | 'Broken'
        | 'Updating AI configuration…'
        | 'Regenerating AI files…'
        | 'AI tooling missing';
}

/**
 * Shape we read from the AI verification — delivered on open via the
 * `checkResult{ai-verify}` push (`data`) and on demand via the `verify-ai-setup`
 * request (after Regenerate). `success` only appears on the request response.
 */
export interface VerifyAiSetupResponse {
    success?: boolean;
    checks?: Array<{ name: string; status: 'ok' | 'warning' | 'error' }>;
    inventory?: {
        /** Task-framed capability list surfaced by the "View AI Capabilities" link. */
        skills?: SkillInventoryEntry[];
        skillsError?: string;
        /** MCP servers wired into the project's .mcp.json, with per-server status + tool count. */
        mcps?: McpInventoryEntry[];
        mcpsError?: string;
        /** ADR-013: bundle files whose disk hash differs from the recorded one ("kept your version"). */
        editedFiles?: string[];
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
    /** ADR-013: user-edited bundle files (relative posix paths) — the modal's "kept your version" flags. */
    aiEditedFiles: string[];
    /** The AI verify has not produced a result yet (nor failed) — inventory is unknown, not empty. */
    aiInventoryLoading: boolean;
    /** True while an AI verify/regenerate operation is in flight */
    aiBusy: boolean;
    /**
     * Live regenerate progress (step name + detail) when a regenerate is in flight,
     * else null. Sourced from the wizard's `creationProgress` channel — see
     * `handleRegenerateAiFiles`. Forwarded into the AI Capabilities modal.
     */
    aiRegenProgress: AiRegenerateProgress | null;
    /**
     * Error from the last regenerate — the handler's `{success:false}.error`
     * (e.g. the tooling-install failure) or a rejected request's message.
     * Null when the last regenerate succeeded (or none ran). Rendered as an
     * inline line in the AI Capabilities modal.
     */
    aiRegenError: string | null;
    /** Regenerate the project's AI files, then re-verify (refreshes badge + skills + MCPs) */
    regenerateAiFiles: () => Promise<void>;
}

/** Mesh statuses that indicate a user-initiated operation is in progress (preserve during updates) */
export const isMeshDeploying = (status: MeshStatus | undefined): boolean => status === 'deploying';

/** Mesh statuses that indicate any operation is in progress (disable UI actions) */
export const isMeshBusy = (status: MeshStatus | undefined): boolean =>
    status === 'deploying' || status === 'checking';
