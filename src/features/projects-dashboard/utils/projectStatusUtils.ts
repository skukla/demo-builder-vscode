/**
 * Project Status Utilities
 *
 * Shared utility functions for displaying project status information.
 * Extracted from ProjectCard, ProjectRow, ProjectListView, and ProjectButton
 * to eliminate code duplication.
 */

import { hasMeshInDependencies } from '@/core/constants';
import { getAppStatusDisplay } from '@/core/ui/utils/appStatusDisplay';
import { getMeshStatusDisplay, type MeshStatusDisplay } from '@/core/ui/utils/meshStatusDisplay';
import type { AppBuilderComponentState, Project, ProjectStatus } from '@/types/base';
import { getComponentInstanceValues, isEdsProject } from '@/types/typeGuards';

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
/** The slot's reading when the stack has a mesh but no mesh was ever deployed. */
const NO_MESH: MeshStatusDisplay = { text: 'No Mesh Exists', color: 'gray', variant: 'neutral' };

/**
 * Whether this project's STACK has a mesh at all. The mesh slot exists only here —
 * a stack with no mesh in it should show no slot rather than permanently reading
 * "No Mesh Exists".
 */
function projectSupportsMesh(project: Project): boolean {
    if (hasMeshInDependencies(project.componentSelections?.dependencies)) return true;
    if (Object.values(project.appBuilderComponents ?? {}).some((s) => s.kind === 'mesh')) {
        return true;
    }
    return Object.values(project.componentInstances ?? {}).some((i) => i.subType === 'mesh');
}

/**
 * Whether a mesh was ever actually deployed. An ENDPOINT is the proof: it exists
 * only once a deploy succeeded, so it separates "the mesh broke" from "the mesh
 * never happened". The drifted states imply a deployed mesh too.
 */
function meshExists(project: Project): boolean {
    const keyed = Object.values(project.appBuilderComponents ?? {}).find(
        (state) => state.kind === 'mesh',
    );
    // An endpoint is the strongest proof, but a deploy does not always capture one
    // — so the states that IMPLY a successful deploy count too. What is left is
    // `error` and `not-deployed`, the two that may never have produced a mesh.
    if (keyed?.endpoint) return true;
    if (keyed?.status === 'deployed' || keyed?.status === 'stale') return true;
    const summary = project.meshStatusSummary;
    return (
        summary === 'deployed' ||
        summary === 'stale' ||
        summary === 'update-declined' ||
        summary === 'config-incomplete'
    );
}

/**
 * The project card's mesh SLOT.
 *
 * A mesh is optional, so its absence is not a failure — `error` is reserved for a
 * mesh that deployed and THEN broke. A failed add used to persist `status:'error'`
 * and the card cried "Mesh Error" about a mesh that never existed (reported
 * 2026-08-04). It now reads "No Mesh Exists", which is true and unalarming.
 *
 * `meshStatusSummary` is written at deploy time and never persisted, so a reloaded
 * project carries only its keyed entry — the slot reads that too, and the summary
 * wins when present because it expresses states the entry cannot.
 *
 * @param project - the project whose mesh slot is being resolved
 * @returns the slot's display, or null on a stack that has no mesh
 */
function getMeshSlotDisplay(project: Project): MeshStatusDisplay | null {
    if (!projectSupportsMesh(project)) return null;
    if (!meshExists(project)) return NO_MESH;

    const keyed = Object.values(project.appBuilderComponents ?? {}).find(
        (state) => state.kind === 'mesh',
    );
    return getMeshStatusDisplay(project.meshStatusSummary ?? keyed?.status);
}

export function getMeshStatusText(project: Project): string | null {
    return getMeshSlotDisplay(project)?.text ?? null;
}

export function getMeshStatusVariant(project: Project): StatusVariant | null {
    return (getMeshSlotDisplay(project)?.variant as StatusVariant) ?? null;
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
function getIntegrationStatuses(project: Project): AppBuilderComponentState['status'][] {
    return Object.values(project.appBuilderComponents ?? {})
        .filter((state) => state.kind === 'integration')
        .map((state) => state.status);
}

function getWorstIntegrationStatus(
    project: Project,
): AppBuilderComponentState['status'] | undefined {
    const statuses = getIntegrationStatuses(project);
    return APP_STATUS_PRECEDENCE.find((status) => statuses.includes(status));
}

/** What each worst-status reads as, once the counts are in front of it. */
const INTEGRATION_STATUS_PHRASE: Record<AppBuilderComponentState['status'], string> = {
    deployed: 'deployed',
    error: 'failed',
    stale: 'need redeploy',
    'not-deployed': 'not deployed',
};

/**
 * The project card's integrations line.
 *
 * It used to read "App Deployed" — naming a thing that does not exist. A project
 * has no single app; it has N integrations that happen to deploy to one shared
 * workspace. At N > 1 the old text also hid the two facts that matter: how many
 * there are, and how many are actually in the state being reported. "App Error"
 * across two integrations told you neither which had failed nor that the other
 * was fine.
 *
 * So: name the integrations, and count them. The "of N" appears only when it
 * says something — with one integration, "1 of 1" is noise.
 *
 * @param project - the project whose integrations are being summarised
 * @returns the display line, or null when the project has no integrations
 */
export function getAppStatusText(project: Project): string | null {
    const statuses = getIntegrationStatuses(project);
    if (statuses.length === 0) return null;

    const worst = APP_STATUS_PRECEDENCE.find((status) => statuses.includes(status));
    if (!worst) return null;

    const total = statuses.length;
    const matching = statuses.filter((status) => status === worst).length;
    const phrase = INTEGRATION_STATUS_PHRASE[worst];
    const noun = total === 1 ? 'integration' : 'integrations';

    // "1 of 2 integrations failed" only when some are NOT in that state; when
    // they all are, the count alone is the whole truth.
    return matching === total
        ? `${total} ${noun} ${phrase}`
        : `${matching} of ${total} ${noun} ${phrase}`;
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


/**
 * Whether the project has any App Builder component at all — the test for
 * offering a route to the Integrations page.
 *
 * Replaced `listRedeployableIntegrations`, which existed to build one
 * "Redeploy <name>" menu item per integration. Those grew with N and predate the
 * dedicated Integrations page; the page owns per-integration actions now, so the
 * menu needs a single yes/no rather than a list. Deliberately NOT filtered by
 * status: a not-deployed or failed integration is exactly when you want to go
 * look at it.
 *
 * @param project - the project to test
 * @returns true when at least one App Builder component is keyed on the project
 */
export function hasIntegrations(project: Project): boolean {
    return Object.keys(project.appBuilderComponents ?? {}).length > 0;
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

/**
 * The primary status line both project surfaces show, derived once.
 *
 * EDS projects report STOREFRONT status; everything else reports demo-running
 * status. `ProjectCard` and `ProjectRow` had each written that branch out
 * (duplication scan, 2026-07-31); getting it wrong in one place would make the
 * card and list views disagree about the same project.
 *
 * @param project - the project to describe
 * @returns whether it is EDS, its frontend port, and the status text + variant
 */
export function getProjectStatusDisplay(project: Project): {
    isEds: boolean;
    port: number | undefined;
    statusText: string;
    statusVariant: StatusVariant;
} {
    const isEds = isEdsProject(project);
    const port = getFrontendPort(project);
    return {
        isEds,
        port,
        statusText: isEds
            ? getStorefrontStatusText(project)
            : getStatusText(project.status, port, false),
        statusVariant: isEds
            ? getStorefrontStatusVariant(project)
            : getStatusVariant(project.status, false),
    };
}
