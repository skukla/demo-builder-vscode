/**
 * Project Status Utilities
 *
 * Shared utility functions for displaying project status information.
 * Extracted from ProjectCard, ProjectRow, ProjectListView, and ProjectButton
 * to eliminate code duplication.
 */

import { getAppStatusDisplay } from '@/core/ui/utils/appStatusDisplay';
import { getMeshStatusDisplay } from '@/core/ui/utils/meshStatusDisplay';
import type { AppBuilderComponentState, Project, ProjectStatus } from '@/types/base';
import { getComponentInstanceValues } from '@/types/typeGuards';

/**
 * StatusDot variant type for visual status indication
 */
export type StatusVariant = 'success' | 'neutral' | 'warning' | 'error';

/**
 * Gets the human-readable display text for a project status
 *
 * @param status - The project status
 * @param port - Optional port number for running projects
 * @param isEds - Whether the project is an EDS project
 * @returns Human-readable status text
 */
export function getStatusText(status: ProjectStatus, port?: number, isEds?: boolean): string {
    // EDS projects show "Published" unless they're in a transitional state
    if (isEds) {
        if (status === 'resetting') {
            return 'Resetting...';
        }
        if (status === 'republishing') {
            return 'Republishing...';
        }
        return 'Published';
    }

    switch (status) {
        case 'running':
            return port ? `Running on port ${port}` : 'Running';
        case 'starting':
            return 'Starting...';
        case 'stopping':
            return 'Stopping...';
        case 'resetting':
            return 'Resetting...';
        case 'republishing':
            return 'Republishing...';
        case 'stopped':
        case 'ready':
            return 'Stopped';
        case 'error':
            return 'Error';
        default:
            return 'Stopped';
    }
}

/**
 * Gets the StatusDot variant for visual status indication
 *
 * @param status - The project status
 * @param isEds - Whether the project is an EDS project
 * @returns StatusDot variant for color coding
 */
export function getStatusVariant(status: ProjectStatus, isEds?: boolean): StatusVariant {
    // EDS projects show "success" (green) unless they're in a transitional state
    if (isEds) {
        if (status === 'resetting' || status === 'republishing') {
            return 'warning'; // Yellow/orange during transitional operations
        }
        return 'success';
    }

    switch (status) {
        case 'running':
            return 'success';
        case 'starting':
        case 'stopping':
        case 'resetting':
        case 'republishing':
            return 'warning';
        case 'error':
            return 'error';
        default:
            return 'neutral';
    }
}

/**
 * Gets the mesh status display text for a project card
 *
 * @returns Display text or null if no mesh status to show
 */
export function getMeshStatusText(project: Project): string | null {
    const display = getMeshStatusDisplay(project.meshStatusSummary);
    return display?.text ?? null;
}

/**
 * Gets the StatusDot variant for mesh status display
 *
 * @returns StatusDot variant or null if no mesh status to show
 */
export function getMeshStatusVariant(project: Project): StatusVariant | null {
    const display = getMeshStatusDisplay(project.meshStatusSummary);
    return (display?.variant as StatusVariant) ?? null;
}

/** Worst-first precedence for collapsing N integration statuses into one card line. */
const APP_STATUS_PRECEDENCE: ReadonlyArray<AppBuilderComponentState['status']> = [
    'error',
    'stale',
    'not-deployed',
    'deployed',
];

/**
 * The worst status across the durable keyed `kind:'integration'` entries of
 * `project.appBuilderComponents` (mesh entries have their own line). The
 * deploy-time-only `appStatusSummary` is NOT read here: it is never persisted
 * or recomputed, so a reloaded project only carries the keyed entries.
 */
function getWorstIntegrationStatus(
    project: Project,
): AppBuilderComponentState['status'] | undefined {
    const statuses = Object.values(project.appBuilderComponents ?? {})
        .filter((state) => state.kind === 'integration')
        .map((state) => state.status);
    return APP_STATUS_PRECEDENCE.find((status) => statuses.includes(status));
}

/**
 * Gets the App Builder app status display text for a project card, derived
 * from the keyed `appBuilderComponents` map (worst status across integrations).
 *
 * @returns Display text or null if the project has no integrations
 */
export function getAppStatusText(project: Project): string | null {
    const display = getAppStatusDisplay(getWorstIntegrationStatus(project));
    return display?.text ?? null;
}

/**
 * Gets the StatusDot variant for App Builder app status display, derived
 * from the keyed `appBuilderComponents` map (worst status across integrations).
 *
 * @returns StatusDot variant or null if the project has no integrations
 */
export function getAppStatusVariant(project: Project): StatusVariant | null {
    const display = getAppStatusDisplay(getWorstIntegrationStatus(project));
    return (display?.variant as StatusVariant) ?? null;
}

/**
 * Whether the project's API Mesh is in a "Redeploy Mesh" state — the config has
 * drifted from what is deployed (`stale`) or the user declined an update
 * (`update-declined`). Gates the kebab's "Redeploy Mesh" action.
 */
export function meshNeedsRedeploy(project: Project): boolean {
    return project.meshStatusSummary === 'stale' || project.meshStatusSummary === 'update-declined';
}

/** A keyed integration the kebab can offer a per-integration Redeploy item for. */
export interface RedeployableIntegration {
    id: string;
    /** Menu label — the keyed entry's display name, falling back to its id. */
    label: string;
}

/**
 * Statuses that make an integration redeployable: reached a deploy (`deployed`),
 * drifted (`stale`), or failed retryably (`error`). `not-deployed` entries have
 * nothing to redeploy.
 */
const REDEPLOYABLE_STATUSES: ReadonlyArray<AppBuilderComponentState['status']> = [
    'deployed',
    'stale',
    'error',
];

/**
 * The project's redeployable App Builder integrations, enumerated from the
 * durable keyed `appBuilderComponents` map (ADR-011 D3 Step 04). Replaces the
 * singular `appIsDeployable` read of `appStatusSummary`: the kebab renders one
 * "Redeploy <label>" item per entry instead of one global "Redeploy App".
 * Mesh entries are excluded — the mesh has its own staleness-gated item.
 */
export function listRedeployableIntegrations(project: Project): RedeployableIntegration[] {
    return Object.entries(project.appBuilderComponents ?? {})
        .filter(
            ([, state]) =>
                state.kind === 'integration' && REDEPLOYABLE_STATUSES.includes(state.status),
        )
        .map(([id, state]) => ({ id, label: state.name ?? id }));
}

/**
 * Gets the storefront status display text for EDS project cards
 *
 * @returns Display text based on edsStorefrontStatusSummary
 */
export function getStorefrontStatusText(project: Project): string {
    const status = project.edsStorefrontStatusSummary;
    switch (status) {
        case 'stale':
        case 'update-declined':
            return 'Republish Needed';
        case 'not-published':
            return 'Not Published';
        case 'published':
        default:
            return 'Published';
    }
}

/**
 * Gets the StatusDot variant for storefront status display
 *
 * @returns StatusDot variant based on edsStorefrontStatusSummary
 */
export function getStorefrontStatusVariant(project: Project): StatusVariant {
    const status = project.edsStorefrontStatusSummary;
    switch (status) {
        case 'stale':
            return 'warning'; // Yellow
        case 'update-declined':
            return 'warning'; // Orange (same variant, different context)
        case 'not-published':
            return 'neutral'; // Gray
        case 'published':
        default:
            return 'success'; // Green
    }
}

/**
 * Gets the frontend port from a running project
 *
 * Searches component instances for the first one with a port defined.
 * Returns undefined if project is not running or has no components with ports.
 *
 * SOP §4: Uses getComponentInstanceValues() helper instead of inline Object.values()
 *
 * @param project - The project to get the port from
 * @returns The frontend port number, or undefined if not available
 */
export function getFrontendPort(project: Project): number | undefined {
    if (project.status !== 'running' || !project.componentInstances) {
        return undefined;
    }
    const instances = getComponentInstanceValues(project);
    const frontend = instances.find((c) => c.port !== undefined);
    return frontend?.port;
}
