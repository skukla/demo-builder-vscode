/**
 * What a failed project creation leaves behind, removed. Moved out of the wizard's
 * `createHandler` so the agent's `create_project` runs the same cleanup (2026-10-16).
 *
 * @module features/project-creation/handlers/creationFailureCleanup
 */

import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { creationPath } from './executorPreflight';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { demoBuilderNode } from '@/core/shell/demoBuilderNode';
import { MESH_DELETE_COMMAND } from '@/core/shell/meshDeleteCommand';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell/orgContextEnv';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/** The Adobe org/project identity used to target the orphaned-mesh cleanup. */
type CleanupAdobeRef =
    | { organization?: string; projectId?: string; workspace?: string }
    | undefined;

/**
 * Undo a creation that failed: remove the half-built project and any API Mesh this
 * creation made. An edit that fails keeps the project it was editing.
 *
 * Every door that runs creation calls this when it fails, the wizard and the
 * agent's `create_project` alike (owner, 2026-10-16). Never throws: a cleanup that
 * fails is logged, and the creation's own error is what the caller reports.
 *
 * @param context - the failed creation's context (its shared state says which mesh it made)
 * @param config - the creation request
 */
export async function cleanupFailedCreation(
    context: HandlerContext,
    config: ProjectCreationConfig,
): Promise<void> {
    const projectPath = creationPath(config);
    const isEditMode = Boolean(config.editProjectPath);
    // The adobe ref lets the mesh cleanup target the workspace it was created in.
    const adobeRef: CleanupAdobeRef = config.adobe;
    try {
        if (isEditMode) {
            context.logger.debug(
                '[Project Edit] Edit failed - preserving existing project (not deleting)',
            );
            context.logger.info(
                '[Project Edit] Edit operation failed. Your existing project has been preserved.',
            );
        } else if (fs.existsSync(projectPath)) {
            context.logger.debug(
                `[Project Creation] Cleaning up partial project at ${projectPath}`,
            );
            await fsPromises.rm(projectPath, { recursive: true, force: true });
            await context.stateManager.clearProject();
            context.logger.debug('[Project Creation] Cleanup complete');
        }

        await cleanupOrphanedMesh(context, adobeRef);
    } catch (cleanupError) {
        context.logger.warn(
            '[Project Creation] Failed to cleanup partial project',
            cleanupError as Error,
        );
    }
}

/**
 * Cleanup API Mesh if it was created during this session and didn't exist before.
 *
 * The delete MUST target the org/project/workspace the mesh was created in — via
 * per-invocation AIO_CONSOLE_* env (`withOrgContext`), NOT the user's stale
 * ambient `aio` selection. Targeting the ambient selection looks in the wrong
 * workspace ("No mesh found …") and strands the mesh as an orphan. The workspace
 * is the exact one the deploy hit (`meshCreatedForWorkspace`); org/project come
 * from the create config.
 */
async function cleanupOrphanedMesh(
    context: HandlerContext,
    adobeRef: CleanupAdobeRef,
): Promise<void> {
    const workspace = context.sharedState.meshCreatedForWorkspace;
    if (workspace && !context.sharedState.meshExistedBeforeSession) {
        context.logger.debug(
            `[Project Creation] Cleaning up orphaned API Mesh for workspace ${workspace}`,
        );
        try {
            const commandManager = ServiceLocator.getCommandExecutor();
            const target = buildOrgTargetFromProjectAdobe(
                { ...adobeRef, workspace },
                context.authManager?.getCacheManager().getCachedOrganization(),
            );
            const deleteResult = await withOrgContext(target, () =>
                commandManager.execute(MESH_DELETE_COMMAND, {
                    timeout: TIMEOUTS.LONG,
                    configureTelemetry: false,
                    enhancePath: true,
                    useNodeVersion: demoBuilderNode(),
                }),
            );

            if (deleteResult.code === 0) {
                context.logger.debug('[Project Creation] Successfully deleted orphaned mesh');
            } else {
                context.logger.warn(
                    `[Project Creation] Failed to delete orphaned mesh: ${deleteResult.stderr}`,
                );
            }
        } catch (meshCleanupError) {
            context.logger.warn(
                '[Project Creation] Error during mesh cleanup',
                meshCleanupError as Error,
            );
        }
    } else if (workspace && context.sharedState.meshExistedBeforeSession) {
        context.logger.debug(
            '[Project Creation] Mesh existed before session - preserving it (not deleting on cancel/failure)',
        );
    }
}
