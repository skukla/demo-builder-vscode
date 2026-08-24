/**
 * Project Status Utilities
 *
 * Shared utility functions for displaying project status information.
 * Extracted from ProjectCard, ProjectRow, ProjectListView, and ProjectButton
 * to eliminate code duplication.
 */

import type { StatusDotVariant } from '@/core/ui/components/ui/StatusDot';
import { getStorefrontStatusDisplay, severityToVariant } from '@/core/ui/utils/statusVocabulary';
import { getIdentifiedMeshAppBuilderComponent } from '@/core/state/appBuilderComponentState';
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
 * The mesh status key for a project — or undefined when the project has no mesh,
 * in which case the mesh contributes nothing to the deployment summary.
 *
 * A mesh is OPTIONAL, and a mesh DEPENDENCY in the stack is deliberately not
 * enough to count as having one: selecting it during creation says the project
 * MAY have a mesh, not that it does.
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
 * The statuses of the durable keyed `kind:'integration'` entries of
 * `project.appBuilderComponents` (mesh entries are read separately). The
 * deploy-time-only `appStatusSummary` is NOT read here: it is never persisted or
 * recomputed, so a reloaded project only carries the keyed entries.
 */
function getIntegrationStatuses(project: Project): AppBuilderComponentState['status'][] {
    return Object.values(project.appBuilderComponents ?? {})
        .filter((state) => state.kind === 'integration')
        .map((state) => state.status);
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
 * The storefront's label and dot for a surface that shows exactly one status
 * line (`ProjectRow`). Both halves come from the shared table, so this cannot
 * drift from the dashboard's rendering of the same state — which is precisely
 * what happened while these were two switch statements.
 */
export function getStorefrontStatusText(project: Project): string {
    return getStorefrontStatusDisplay(project.edsStorefrontStatusSummary).label;
}

export function getStorefrontStatusVariant(project: Project): StatusVariant {
    return severityToVariant(
        getStorefrontStatusDisplay(project.edsStorefrontStatusSummary).severity,
    );
}

// ============================================================================
// Deployment summary — ONE line for the whole project
// ============================================================================

/**
 * How urgently a deployable needs the user, worst first.
 *
 * Three vocabularies feed this — the mesh's, the storefront's and the
 * integrations' — and none of them share a value set. This is the common
 * denominator they collapse onto.
 */
type DeploymentConcern = 'attention' | 'deploying' | 'not-deployed' | 'current';

const CONCERN_ORDER: readonly DeploymentConcern[] = [
    // Attention beats deploying deliberately: an in-flight deploy is transient,
    // a failed or drifted one is not.
    'attention',
    'deploying',
    'not-deployed',
    'current',
];

/**
 * The card's one deployment line.
 *
 * Typed against `StatusDotVariant`, not this module's narrower `StatusVariant`:
 * the value feeds a StatusDot, and only the dot's type admits `info` — which is
 * what an in-flight deploy should be, rather than the `warning` the runtime line
 * uses for its transitional states.
 */
export interface DeploymentSummary {
    text: string;
    variant: StatusDotVariant;
}

const CONCERN_DISPLAY: Record<DeploymentConcern, DeploymentSummary> = {
    attention: { text: 'Attention needed', variant: 'warning' },
    deploying: { text: 'Deploying…', variant: 'info' },
    'not-deployed': { text: 'Not deployed', variant: 'neutral' },
    current: { text: 'Deployed', variant: 'success' },
};

/** Mesh + integration statuses share one value set. */
function concernFromComponentStatus(status: string | undefined): DeploymentConcern | null {
    if (!status) return null;
    if (status === 'deployed') return 'current';
    if (status === 'deploying') return 'deploying';
    if (status === 'not-deployed') return 'not-deployed';
    // error / stale / update-declined / config-incomplete
    return 'attention';
}

/** The storefront speaks published/not-published rather than deployed. */
function concernFromStorefront(
    summary: Project['edsStorefrontStatusSummary'],
): DeploymentConcern | null {
    if (!summary) return null;
    if (summary === 'published') return 'current';
    if (summary === 'not-published') return 'not-deployed';
    // stale / update-declined — "Later" postpones the prompt, not the drift.
    return 'attention';
}

/**
 * One line answering "is what this project has deployed current?".
 *
 * Replaces three: a mesh line that named the mesh, an integrations count, and a
 * storefront line that was written, tested, and rendered by nobody. Naming the
 * mesh on the PROJECT card is a leftover from when the mesh was the whole
 * integration story; it is now the first peer card in a dedicated integrations
 * dashboard, and the per-component detail belongs there.
 *
 * The runtime line stays separate — Running/Stopped is the local dev server, a
 * different axis from cloud drift.
 *
 * @param project - the project being summarised
 * @returns the line, or null when the project has nothing deployable at all
 */
export function getDeploymentSummary(project: Project): DeploymentSummary | null {
    const concerns = [
        concernFromComponentStatus(getMeshStatusKey(project)),
        concernFromStorefront(project.edsStorefrontStatusSummary),
        ...getIntegrationStatuses(project).map(concernFromComponentStatus),
    ].filter((concern): concern is DeploymentConcern => concern !== null);

    if (concerns.length === 0) return null;

    const worst = CONCERN_ORDER.find((concern) => concerns.includes(concern));
    if (!worst) return null;

    // A real failure outranks drift visually while sharing its wording — the dot
    // carries the severity, the text stays consolidated.
    const hasError =
        getIntegrationStatuses(project).includes('error') || getMeshStatusKey(project) === 'error';
    if (worst === 'attention' && hasError) {
        return { text: 'Attention needed', variant: 'error' };
    }
    return CONCERN_DISPLAY[worst];
}

/**
 * The card's runtime line — the LOCAL axis, kept apart from deployment.
 *
 * EDS projects have no running state: the kebab offers them no Start/Stop, and
 * {@link getStatusText} answers "Published" whatever their `status` says. So
 * their primary line carried STOREFRONT status instead — it was the only cloud
 * signal the card had.
 *
 * {@link getDeploymentSummary} reports the storefront now, alongside the mesh and
 * the integrations. Leaving the old line in place made an EDS card say the same
 * thing twice: "Republish needed" directly above "Attention needed", two warning
 * dots for one problem.
 *
 * An in-flight operation is different in kind. "Republishing…" is local and
 * transient, and the summary has no way to express it, so it keeps its line for
 * as long as it lasts.
 *
 * Distinct from {@link getProjectStatusDisplay}, which still answers the older
 * question — "one status line for this project" — for surfaces that show exactly
 * one. Only the card has somewhere else to put the storefront.
 *
 * @param project - the project to describe
 * @returns the runtime line, or null when the project has no local axis to report
 */
export function getRuntimeSummary(project: Project): DeploymentSummary | null {
    if (isEdsProject(project)) {
        const inFlight = project.status === 'resetting' || project.status === 'republishing';
        if (!inFlight) return null;
        return {
            text: getStatusText(project.status, undefined, true),
            variant: getStatusVariant(project.status, true),
        };
    }
    const port = getFrontendPort(project);
    return {
        text: getStatusText(project.status, port, false),
        variant: getStatusVariant(project.status, false),
    };
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
