/**
 * The dashboard pushes an App Builder component operation sends when it ends:
 * the per-row status, the mesh card's status, the deploy destination, the full
 * component map, and the project status re-run.
 *
 * Split from `appBuilderComponentHandlers.ts` (EDS-8, 2026-10-04), which still
 * re-exports every function here, so importers and the `jest.mock`s of that
 * path keep working.
 *
 * @module features/dashboard/handlers/appBuilderComponentPush
 */

import type { HandlerContext } from '@/types/handlers';
import type { AppBuilderComponentRowStatus } from '@/types/webviewPayloads';

/**
 * Re-run the project status after the component SET changed.
 *
 * The status is derived from the set, so adding, deploying or removing a
 * component makes it stale. Same shape as rename / re-authenticate / forced org
 * switch, which already re-run `handleRequestStatus` after their mutations.
 *
 * REGRESSION (2026-08-04, live): removing a mesh left its card on the grid
 * reading "MESH DEPLOYED". The keyed entry was cleared and a fresh snapshot was
 * sent, but nothing refreshed `meshStatus`, so the derived mesh card outlived the
 * component it described.
 *
 * NOT called from `postComponentsSnapshot`, even though every one of these sites
 * pairs the two: RENAME also posts a snapshot, and rename is a local metadata
 * write that deliberately runs no Adobe guards so it works offline. This helper
 * reaches `ensureAdobeIOAuth` through `handleRequestStatus`, so folding it into
 * the snapshot would have put a guard on the offline path — a pinned property,
 * and the test that pins it is what caught the attempt. Rename does not need it
 * anyway: it changes a display name, not the set.
 *
 * LAZY import: `dashboardHandlers` imports FROM this module, so a static import
 * would close a cycle.
 */
export async function refreshProjectStatus(context: HandlerContext): Promise<void> {
    const { handleRequestStatus } = await import('@/features/dashboard/handlers/dashboardHandlers');
    await handleRequestStatus(context);
}

// The per-row status vocabulary moved to @/types/webviewPayloads
// (AppBuilderComponentRowStatus) — one declaration shared by this module,
// the channel's sender AND the webview receiver.

/**
 * Post a per-row status update via the dashboard command. Imported LAZILY so
 * this handler module never statically
 * pulls the webview-command class into the module-load graph (which would chain
 * BaseWebviewCommand into handler-only test contexts).
 *
 * `name` refreshes the row's display label on the same channel (rename path).
 *
 * Exported for the destination move, which walks every component and must
 * telegraph each one — the project-scoped progress notification has no owning
 * card, so without this the whole grid sits at DEPLOYED for the entire move.
 */
export async function postRowStatus(
    id: string,
    status: AppBuilderComponentRowStatus,
    message?: string,
    name?: string,
): Promise<void> {
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );
    await ProjectDashboardWebviewCommand.sendAppBuilderComponentStatusUpdate(
        id,
        status,
        message,
        name,
    );
}

/**
 * Post the FULL fresh persisted `appBuilderComponents` map over the
 * `appBuilderComponentsSnapshot` channel. The webview's map is seeded once at
 * init, so per-row status pushes alone drop ADDED entries (no row to flip) and
 * leave REMOVED entries lingering. Sent after terminal ops: add (success AND
 * failure — the entry may have persisted), deploy/redeploy terminal, remove
 * success, rename success. Same lazy import as postRowStatus.
 */
/**
 * Push MESH status on the mesh's own channel.
 *
 * The mesh card is keyed `'mesh'` and derives its status from `meshStatusUpdate`;
 * the row channel is deliberately told to skip the mesh's component id so it does
 * not synthesize a second card beside it. A row push for a mesh therefore reaches
 * nothing — which is why a moving mesh sat at DEPLOYED while it deployed.
 *
 * @param status - the mesh card's status
 * @param message - the in-flight line, shown only while transient
 */
export async function postMeshStatus(
    status: 'deploying' | 'deployed' | 'error',
    message?: string,
): Promise<void> {
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );
    await ProjectDashboardWebviewCommand.sendMeshStatusUpdate(status, message);
}

/**
 * Push the deploy destination to the header. Same lazy import as the two above,
 * for the same reason: keep the webview-command class out of this module's static
 * load graph.
 *
 * @param destination - the project/workspace titles the header renders
 */
export async function postDestination(destination: {
    projectTitle?: string;
    workspaceTitle?: string;
}): Promise<void> {
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );
    await ProjectDashboardWebviewCommand.sendProjectDestinationUpdate(destination);
}

export async function postComponentsSnapshot(context: HandlerContext): Promise<void> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return;
    }
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );
    await ProjectDashboardWebviewCommand.sendAppBuilderComponentsSnapshot(
        project.appBuilderComponents ?? {},
    );
}
