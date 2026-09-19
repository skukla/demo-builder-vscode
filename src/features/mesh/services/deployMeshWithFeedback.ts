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
 * Where it reports is `withOperationProgress`'s decision, shared with every other
 * operation (PL-59 phase 2): the screen's progress modal when a button started it,
 * else one notification titled "Deploying API Mesh" showing the stage name, else the
 * agent's notification. The CARD names the operation once and holds still.
 *
 * Being a SECOND implementation of that policy is what made it drift: when the
 * split was reversed on 2026-08-04 — steps had been on the card, which wrapped
 * them across two shouting lines inside a ~450px tile — this module kept the old
 * assignment, so a mesh redeploy from the integrations grid still showed the old
 * arrangement. If the policy changes again, it changes in both places or in
 * neither.
 *
 * What each caller still owns: the command adds an execution lock, toasts and
 * result→UI mapping; the tool handler shapes the result into a tool response.
 *
 * @module features/mesh/services/deployMeshWithFeedback
 */

import {
    deployMeshHeadless,
    type DeployMeshHeadlessDeps,
    type DeployMeshHeadlessResult,
} from './deployMeshHeadless';
import { meshFailureForPerson } from './meshDeployWording';
import { cardInFlightLabel } from '@/core/vscode/progressRegister';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';

/**
 * The card's one in-flight line. Built through the shared helper so this surface
 * and the App Builder component path cannot word it differently.
 */
const CARD_IN_FLIGHT_LABEL = cardInFlightLabel('Deploying', 'Mesh');

/** The operation id a screen uses when it has no mesh component id to name. */
export const MESH_OPERATION_ID = 'mesh';

/** The deploy inputs, minus the feedback bridges this module supplies. */
export type DeployMeshWithFeedbackDeps = Omit<DeployMeshHeadlessDeps, 'onStatus' | 'onProgress'>;

/** Where the deploy reports: the screen's modal when a button started it (PL-59 R1). */
export interface DeployMeshFeedbackOptions {
    progress?: 'modal';
    /** The id the screen named the operation by, so its modal follows it. */
    operationId?: string;
}

/**
 * Run the mesh deploy, reporting where the SC is looking — the screen's progress modal
 * when a button started it, else one notification — and pushing status to the mesh
 * card. Where it reports is decided by `withOperationProgress`, shared with every
 * other operation.
 *
 * @param deps - project + state/logger + extension path
 * @param options - `progress: 'modal'` when started from a button
 * @returns the core's result; for a modal, a failure carries a person's sentence
 */
export async function deployMeshWithFeedback(
    deps: DeployMeshWithFeedbackDeps,
    options: DeployMeshFeedbackOptions = {},
): Promise<DeployMeshHeadlessResult> {
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );
    const inModal = options.progress === 'modal';

    return withOperationProgress(
        {
            id: options.operationId ?? MESH_OPERATION_ID,
            title: 'Deploying API Mesh',
            inModal,
            cardLabel: CARD_IN_FLIGHT_LABEL,
            pushCardStatus: (label) => {
                void ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', label);
            },
        },
        async (report) => {
            const result = await deployMeshHeadless({
                ...deps,
                // The status channel, distinct from the step channel. A TERMINAL
                // status (deployed / error) carries its message to the card,
                // endpoint included on success.
                //
                // An IN-FLIGHT 'deploying' does not: the core sends step-ish text
                // here too ("Starting deployment…"), which would overwrite the
                // card's one static line and put narration back on it through a
                // second door. The card keeps naming the operation until the
                // deploy resolves.
                onStatus: (status, message, endpoint) => {
                    if (status === 'deploying') {
                        return ProjectDashboardWebviewCommand.sendMeshStatusUpdate(
                            status,
                            CARD_IN_FLIGHT_LABEL,
                        );
                    }
                    return endpoint === undefined
                        ? ProjectDashboardWebviewCommand.sendMeshStatusUpdate(status, message)
                        : ProjectDashboardWebviewCommand.sendMeshStatusUpdate(
                              status,
                              message,
                              endpoint,
                          );
                },
                onProgress: (stage, step) => report(stage, step),
            });
            // A modal shows the reason to a person; other callers word their own
            // (the agent's handler names its tools).
            return inModal && !result.success ? { ...result, error: meshFailureForPerson(result) } : result;
        },
    );
}
