/**
 * Project Status Utilities
 *
 * Shared utility functions for displaying project status information.
 * Extracted from ProjectCard, ProjectRow, ProjectListView, and ProjectButton
 * to eliminate code duplication.
 */

import { getAppStatusDisplay } from '@/core/ui/utils/appStatusDisplay';
import { getMeshStatusDisplay } from '@/core/ui/utils/meshStatusDisplay';
import { isUpdatePending } from '@/core/ui/utils/statusVocabulary';
import { getIdentifiedMeshAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentState';
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
/**
 * The mesh status key for a project card — or undefined when the project has no
 * mesh, in which case the card shows no mesh line at all.
 *
 * A mesh is OPTIONAL. Its absence gets no placeholder and no slot: cards are
 * allowed to differ in how many status lines they carry. A mesh DEPENDENCY in the
 * stack is deliberately not enough — selecting one during creation says the
 * project may have a mesh, not that it does, and driving the line off that put a
 * permanent placeholder on cards with nothing behind it.
 *
 * `meshStatusSummary` is written at deploy time and never persisted or recomputed,
 * so a reloaded project carries only its durable keyed entry — hence the fallback,
 * without which the line vanished for a deployed, healthy mesh. The summary wins
 * when present: it expresses states the entry cannot (update-declined,
 * config-incomplete) and is the fresher of the two.
 */
function getMeshStatusKey(project: Project): string | undefined {
    if (project.meshStatusSummary) return project.meshStatusSummary;
    // Route through the canonical resolver rather than re-deriving "which entry
    // is the mesh". It applies a two-step priority — the canonical `mesh` key
    // first, then first-by-kind — and this reader used to run only the fallback
    // half. On a project holding two mesh entries that showed the status of a
    // DIFFERENT mesh than the one the card acts on: the same shape as the
    // 2026-08-04 defect where Remove tore down the wrong component.
    return getIdentifiedMeshAppBuilderComponent(project)?.state.status;
}

/**
 * The project card's mesh line. The shared table holds the bare state; this card
 * is headed with the PROJECT name, so it supplies the noun — as
 * {@link getAppStatusText} already does for integrations.
 */
export function getMeshStatusText(project: Project): string | null {
    const text = getMeshStatusDisplay(getMeshStatusKey(project))?.text;
    return text ? `Mesh · ${text}` : null;
}

export function getMeshStatusVariant(project: Project): StatusVariant | null {
    return (getMeshStatusDisplay(getMeshStatusKey(project))?.variant as StatusVariant) ?? null;
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
 * Whether the project's API Mesh needs redeploying — the config has drifted from
 * what is deployed, or the user declined an update. Gates the kebab's "Redeploy
 * Mesh" action, which stays imperative because it IS a button.
 *
 * Asks the shared vocabulary rather than testing the two literals: that alias set
 * already grew once, and it is now collapsed in exactly one place.
 */
export function meshNeedsRedeploy(project: Project): boolean {
    return isUpdatePending(project.meshStatusSummary);
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
