/**
 * The live pushes to an open project panel: mesh status, a component row's status,
 * the full component map, the deploy destination and the authoring URL. Each is a
 * no-op when no panel is open to receive it.
 *
 * These were static methods on `ProjectDashboardWebviewCommand` until 2026-10-07.
 * Every handler and service that pushed had to import that command, which imports
 * the dashboard's whole handler map, so the pushes closed three import cycles
 * (each hidden behind an `await import`). Here they depend on the panel registry
 * alone.
 *
 * @module features/dashboard/services/projectPanelPushes
 */

import type * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import type { AppBuilderComponentState } from '@/types/base';
import type {
    AppBuilderComponentRowStatus,
    AppBuilderComponentStatusUpdatePayload,
    AppBuilderComponentsSnapshotPayload,
    AuthoringExperienceUpdatePayload,
    DestinationTitles,
    MeshStatusUpdatePayload,
    ProjectDestinationUpdatePayload,
} from '@/types/webviewPayloads';

/**
 * Resolve whichever project-scoped panel is live for the live push channels.
 *
 * These pushes used to address the Project Dashboard alone. Opening the
 * dedicated integrations surface is a tab REPLACEMENT — the dashboard panel
 * is disposed — so a dashboard-only lookup would silently reach nobody and
 * the grid would never flip status or land an added card.
 *
 * Dashboard wins when both are somehow live, so a push renders once.
 */
function getLiveProjectPanel(): vscode.WebviewPanel | undefined {
    return (
        BaseWebviewCommand.getActivePanel('demoBuilder.projectDashboard') ??
        BaseWebviewCommand.getActivePanel('demoBuilder.integrations')
    );
}

/**
 * Push the project's deploy destination after `setProjectDestination` writes it.
 *
 * The Integrations header's "project · workspace" crumb comes from the init
 * payload, which is seeded ONCE — so a destination change left the header naming
 * the OLD target while every card deployed to the new one (reported live
 * 2026-08-07).
 *
 * @param destination - the titles the header renders, post-write
 */
export async function sendProjectDestinationUpdate(destination: DestinationTitles): Promise<void> {
    const panel = getLiveProjectPanel();
    if (panel) {
        const payload: ProjectDestinationUpdatePayload = { destination };
        await panel.webview.postMessage({ type: 'projectDestinationUpdate', payload });
    }
}

/**
 * Push MESH status on the mesh's own channel.
 *
 * The mesh card is keyed `'mesh'` and derives its status from `meshStatusUpdate`;
 * the row channel is deliberately told to skip the mesh's component id so it does
 * not synthesize a second card beside it. A row push for a mesh therefore reaches
 * nothing — which is why a moving mesh sat at DEPLOYED while it deployed.
 */
export async function sendMeshStatusUpdate(
    status: 'deploying' | 'deployed' | 'config-changed' | 'error' | 'not-deployed',
    message?: string,
    endpoint?: string,
): Promise<void> {
    const panel = getLiveProjectPanel();
    if (panel) {
        const payload: MeshStatusUpdatePayload = { status, message, endpoint };
        await panel.webview.postMessage({ type: 'meshStatusUpdate', payload });
    }
}

/**
 * Push one component row's status, keyed by the component `id` so the
 * integrations list flips ONLY that row.
 *
 * `name` (optional) refreshes the row's display label on the same channel —
 * the rename handler pushes the entry's CURRENT status (incl. the persisted
 * 'stale') plus the new name, since the init-seeded map never re-delivers.
 */
export async function sendAppBuilderComponentStatusUpdate(
    id: string,
    status: AppBuilderComponentRowStatus,
    message?: string,
    name?: string,
): Promise<void> {
    const panel = getLiveProjectPanel();
    if (panel) {
        const payload: AppBuilderComponentStatusUpdatePayload = { id, status, message, name };
        await panel.webview.postMessage({ type: 'appBuilderComponentStatusUpdate', payload });
    }
}

/**
 * Push the FULL fresh persisted `appBuilderComponents` map, after terminal ops
 * (add/deploy terminal, remove success, rename success). The webview's map is
 * seeded once at init, so without this snapshot an added card never appears and
 * a removed card lingers.
 */
export async function sendAppBuilderComponentsSnapshot(
    components: Record<string, AppBuilderComponentState>,
): Promise<void> {
    const panel = getLiveProjectPanel();
    if (panel) {
        const payload: AppBuilderComponentsSnapshotPayload = { components };
        await panel.webview.postMessage({ type: 'appBuilderComponentsSnapshot', payload });
    }
}

/**
 * Push the live DA URL after an authoring-experience flip (the Configure save) —
 * no reopen required. The Author tile label is STATIC ("Author Content"), so only
 * the URL rides on the message. Reaches the Project Dashboard only.
 */
export async function sendAuthoringExperienceUpdate(edsDaLiveUrl?: string): Promise<void> {
    const panel = BaseWebviewCommand.getActivePanel('demoBuilder.projectDashboard');
    if (panel) {
        const payload: AuthoringExperienceUpdatePayload = { edsDaLiveUrl };
        await panel.webview.postMessage({ type: 'authoringExperienceUpdate', payload });
    }
}
