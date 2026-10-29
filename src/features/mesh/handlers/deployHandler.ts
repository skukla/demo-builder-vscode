/**
 * Mesh Deploy Handler
 *
 * Handles the `deploy-api-mesh` message: the entry behind the `deploy_mesh` MCP
 * tool. Resolves the current project, runs the deploy through
 * {@link deployMeshWithFeedback}, and shapes the result into a tool response.
 *
 * It ran the core with NO callbacks until 2026-08-04, so an agent could deploy
 * the mesh and the user saw nothing for one to three minutes — while the same
 * agent deploying an INTEGRATION raised a notification and animated its card,
 * because that tool routes through the keyed runner. An agent-driven deploy is
 * the case the notification exists for, so it now reports itself exactly like
 * the UI path (`DeployMeshCommand`, same wrapper). What stays different is only
 * what each does with the RESULT: toasts there, a tool response here.
 */

import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { ensureDaLiveAuth } from '@/features/eds/handlers/edsHelpers';
import { republishStorefrontConfig } from '@/features/eds/services/storefront/storefrontRepublishService';
import type { DeployMeshHeadlessResult, MeshDeployBlock } from '@/features/mesh/services/deployMeshHeadless';
import {
    deployMeshWithFeedback,
    type DeployMeshWithFeedbackDeps,
} from '@/features/mesh/services/deployMeshWithFeedback';
import { meshDeployLock } from '@/features/mesh/services/meshDeployLock';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

/** Actionable message per guard block (the tool has no UI to recover inline). */
const BLOCK_MESSAGE: Record<MeshDeployBlock, string> = {
    auth: 'Adobe sign-in required. Sign in (sign_in), then retry.',
    org: 'This project uses a different Adobe organization. Switch orgs, then retry.',
    permission:
        'Your account lacks the Developer or System Admin role for this organization ' +
        '(required for App Builder / API Mesh).',
    'no-mesh': 'This project has no API Mesh component to deploy.',
};

/** The deploy's inputs, assembled once for both doors into it. */
function meshDeps(context: HandlerContext, project: Project): DeployMeshWithFeedbackDeps {
    return {
        authManager: ServiceLocator.getAuthenticationService(),
        secrets: ServiceLocator.getSecretStorage() ?? undefined,
        commandManager: ServiceLocator.getCommandExecutor(),
        project,
        stateManager: context.stateManager,
        logger: context.logger,
        extensionPath: context.context.extensionPath,
        republishStorefront: (deployed) =>
            republishStorefrontConfig({
                project: deployed,
                secrets: context.context.secrets,
                logger: context.logger,
                persist: (p) => context.stateManager.saveProject(p),
                ensureDaLiveSession: () => ensureDaLiveAuth(context, '[Mesh Deploy]'),
            }),
    };
}

/** What a successful deploy answers — with the storefront republish, when it did not happen. */
function deployedData(result: DeployMeshHeadlessResult): Record<string, unknown> {
    return {
        meshId: result.meshId,
        endpoint: result.endpoint,
        ...(result.storefrontNotRepublished
            ? { warning: `The mesh is deployed, but the storefront was not republished: ${result.storefrontNotRepublished}` }
            : {}),
    };
}

/**
 * Handle 'deploy-api-mesh' — deploy (or redeploy) the current project's API Mesh.
 */
export const handleDeployApiMesh: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const result = await deployMeshWithFeedback(meshDeps(context, project));

    if (result.success) {
        return { success: true, data: deployedData(result) };
    }
    if (result.blockedBy) {
        return { success: false, error: result.error || BLOCK_MESSAGE[result.blockedBy] };
    }
    return { success: false, error: result.error || 'Mesh deployment failed' };
};

/**
 * Deploy the mesh from a button on a screen, reporting to that screen's progress modal
 * (PL-59 phase 2, rule R1). Pattern B: it answers with the outcome; the modal is
 * told as it goes. One deploy at a time, shared with the palette command.
 *
 * @param operationId - the id the screen named the operation by
 */
export async function deployMeshFromScreen(
    context: HandlerContext,
    operationId: string,
): Promise<HandlerResponse> {
    if (meshDeployLock.isLocked()) {
        return { success: false, error: 'A mesh deploy is already running.' };
    }
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    return meshDeployLock.run(async () => {
        const result = await deployMeshWithFeedback(meshDeps(context, project), {
            progress: 'modal',
            operationId,
        });
        if (result.success) {
            await vscode.commands.executeCommand('demoBuilder._internal.meshActionTaken');
            return { success: true, data: deployedData(result) };
        }
        return { success: false, error: result.error };
    });
}
