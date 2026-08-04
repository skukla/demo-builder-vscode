/**
 * deployMeshWithFeedback — the mesh deploy, wired to the surfaces that report it.
 *
 * `deployMeshHeadless` is deliberately UI-free (it imports no `vscode`), which is
 * what lets it be shared. This is the thin layer that gives it eyes: a progress
 * notification and the dashboard/card status pushes. Both callers use it —
 * `DeployMeshCommand` (the UI path) and `handleDeployApiMesh` (the `deploy_mesh`
 * MCP tool) — so the two cannot disagree about what a deploy looks like.
 *
 * They DID disagree. The MCP path called the core with no callbacks at all, so an
 * agent could deploy the mesh and the user saw nothing for one to three minutes,
 * while the same agent deploying an INTEGRATION raised a notification and animated
 * its card (that tool routes through the keyed runner). Nobody's attention is
 * further from a deploy than when a chat turn started it, so agent-driven work is
 * exactly the case the notification exists for.
 *
 * The register split is the same one the whole integrations surface uses: the
 * notification carries its TITLE and a spinner — coarse, ambient, for someone not
 * looking at the page — and the CARD carries the steps.
 *
 * What each caller still owns: the command adds an execution lock, toasts and
 * result→UI mapping; the tool handler shapes the result into a tool response.
 *
 * @module features/mesh/services/deployMeshWithFeedback
 */

import * as vscode from 'vscode';
import {
    deployMeshHeadless,
    type DeployMeshHeadlessDeps,
    type DeployMeshHeadlessResult,
} from './deployMeshHeadless';

/** The deploy inputs, minus the feedback bridges this module supplies. */
export type DeployMeshWithFeedbackDeps = Omit<DeployMeshHeadlessDeps, 'onStatus' | 'onProgress'>;

/**
 * Run the mesh deploy inside the progress notification, pushing status and step
 * detail to the mesh card.
 *
 * @param deps - project + state/logger + extension path
 * @returns the core's result, captured from the task so it survives regardless
 */
export async function deployMeshWithFeedback(
    deps: DeployMeshWithFeedbackDeps,
): Promise<DeployMeshHeadlessResult> {
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );

    // Captured from the task rather than taken from withProgress's return, so a
    // caller still gets a result whatever the notification does.
    let result: DeployMeshHeadlessResult = { success: false };

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Deploying API Mesh',
            cancellable: false,
        },
        async () => {
            result = await deployMeshHeadless({
                ...deps,
                // Forward the core's args faithfully — omit the endpoint arg
                // entirely for non-'deployed' statuses.
                onStatus: (status, message, endpoint) =>
                    endpoint === undefined
                        ? ProjectDashboardWebviewCommand.sendMeshStatusUpdate(status, message)
                        : ProjectDashboardWebviewCommand.sendMeshStatusUpdate(
                              status,
                              message,
                              endpoint,
                          ),
                // Steps go to the CARD only; the notification keeps its title.
                onProgress: (message, subMessage) => {
                    void ProjectDashboardWebviewCommand.sendMeshStatusUpdate(
                        'deploying',
                        subMessage || message,
                    );
                },
            });
        },
    );

    return result;
}
