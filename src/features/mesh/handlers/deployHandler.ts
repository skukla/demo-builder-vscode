/**
 * Mesh Deploy Handler
 *
 * Handles the `deploy-api-mesh` message: the headless entry behind the
 * `deploy_mesh` MCP tool. Resolves the current project and runs the shared
 * {@link deployMeshHeadless} core with NO UI callbacks, then shapes the result
 * into a tool response. The dashboard's Deploy button goes through
 * `DeployMeshCommand` (same core, with UI) — this is the agent-facing path.
 */

import {
    deployMeshHeadless,
    type MeshDeployBlock,
} from '@/features/mesh/services/deployMeshHeadless';
import { ErrorCode } from '@/types/errorCodes';
import type { MessageHandler } from '@/types/handlers';

/** Actionable message per guard block (the tool has no UI to recover inline). */
const BLOCK_MESSAGE: Record<MeshDeployBlock, string> = {
    auth: 'Adobe sign-in required. Sign in (sign_in), then retry.',
    org: 'This project uses a different Adobe organization. Switch orgs, then retry.',
    permission:
        'Your account lacks the Developer or System Admin role for this organization ' +
        '(required for App Builder / API Mesh).',
    'no-mesh': 'This project has no API Mesh component to deploy.',
};

/**
 * Handle 'deploy-api-mesh' — deploy (or redeploy) the current project's API Mesh.
 */
export const handleDeployApiMesh: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const result = await deployMeshHeadless({
        project,
        stateManager: context.stateManager,
        logger: context.logger,
        extensionPath: context.context.extensionPath,
    });

    if (result.success) {
        return { success: true, data: { meshId: result.meshId, endpoint: result.endpoint } };
    }
    if (result.blockedBy) {
        return { success: false, error: result.error || BLOCK_MESSAGE[result.blockedBy] };
    }
    return { success: false, error: result.error || 'Mesh deployment failed' };
};
