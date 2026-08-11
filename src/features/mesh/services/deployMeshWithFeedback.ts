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
 * The register split is the same one the whole integrations surface uses
 * (`withComponentProgress`): the NOTIFICATION carries the steps under a static
 * title naming the operation, and the CARD names the operation once and holds
 * still. No two surfaces narrate the same step.
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
import {
    cardInFlightLabel,
    withProgressRegister,
} from '@/core/vscode/progressRegister';

/**
 * The card's one in-flight line. Built through the shared helper so this surface
 * and the App Builder component path cannot word it differently.
 */
const CARD_IN_FLIGHT_LABEL = cardInFlightLabel('Deploying', 'Mesh');

/** The deploy inputs, minus the feedback bridges this module supplies. */
export type DeployMeshWithFeedbackDeps = Omit<DeployMeshHeadlessDeps, 'onStatus' | 'onProgress'>;

/**
 * Run the mesh deploy inside the progress notification, pushing status and step
 * detail to the mesh card.
 *
 * @param deps - project + state/logger + extension path
 * @returns the core's result
 */
export async function deployMeshWithFeedback(
    deps: DeployMeshWithFeedbackDeps,
): Promise<DeployMeshHeadlessResult> {
    const { ProjectDashboardWebviewCommand } = await import(
        '@/features/dashboard/commands/showDashboard'
    );

    return withProgressRegister(
        {
            title: 'Deploying API Mesh',
            cardLabel: CARD_IN_FLIGHT_LABEL,
            pushCardStatus: (label) => {
                void ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', label);
            },
        },
        (report) =>
            deployMeshHeadless({
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
                // Steps reach the NOTIFICATION through the shared register.
                onProgress: (message, subMessage) => report(subMessage || message),
            }),
    );

}
