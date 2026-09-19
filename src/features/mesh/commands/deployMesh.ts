import * as vscode from 'vscode';
import { meshDeployLock } from '../services/meshDeployLock';
import { BaseCommand } from '@/core/base/baseCommand';
import { ServiceLocator } from '@/core/di/serviceLocator';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/**
 * Deploy (or redeploy) API Mesh.
 *
 * The command owns UX only — the lock, the progress notification, the dashboard
 * status bridge, and the toasts. The whole deploy sequence (pre-flight →
 * permission gate → find mesh → pre-deploy subscribe → create-or-update deploy →
 * persist) lives in the shared, UI-free `deployMeshHeadless` core, which the
 * `deploy_mesh` MCP tool also calls. The command maps the core's result to
 * toasts and routes its callbacks by REGISTER: status and step progress go to
 * the dashboard/card badge; the notification carries only its title and a
 * spinner, so the two never narrate the same step at the same moment.
 */
export class DeployMeshCommand extends BaseCommand {
    constructor(context: vscode.ExtensionContext, stateManager: StateManager, logger: Logger) {
        super(context, stateManager, logger);
    }

    async execute(): Promise<void> {
        // Prevent duplicate concurrent execution
        if (meshDeployLock.isLocked()) {
            this.logger.debug('[Mesh Deployment] Already in progress');
            return;
        }

        await meshDeployLock.run(async () => {
            const { ProjectDashboardWebviewCommand } = await import(
                '@/features/dashboard/commands/showDashboard'
            );

            try {
                const project = await this.stateManager.getCurrentProject();
                if (!project) {
                    vscode.window.showWarningMessage(
                        'No active project found. Create a project first.',
                    );
                    return;
                }

                const { deployMeshWithFeedback } = await import(
                    '../services/deployMeshWithFeedback'
                );
                const { meshFailureForPerson } = await import('../services/meshDeployWording');

                // The notification + card bridges live in that wrapper, shared
                // with the deploy_mesh MCP tool so an agent-triggered deploy looks
                // the same as this one. The command keeps only what is its own:
                // the lock (above), the toasts and result mapping (below).
                const result = await deployMeshWithFeedback({
                    authManager: ServiceLocator.getAuthenticationService(),
                    secrets: ServiceLocator.getSecretStorage() ?? undefined,
                    commandManager: ServiceLocator.getCommandExecutor(),
                    project,
                    stateManager: this.stateManager,
                    logger: this.logger,
                    extensionPath: this.context.extensionPath,
                });

                if (result.success) {
                    this.showSuccessMessage('API Mesh deployed successfully');
                    // Reset mesh notification flag (user has deployed).
                    await vscode.commands.executeCommand('demoBuilder._internal.meshActionTaken');
                    return;
                }

                // A guard stopped the deploy (auth/org/permission/no-mesh): the core
                // already emitted any 'error' status; refresh the dashboard and show
                // the matching toast. (A raw deploy failure has no blockedBy and skips
                // the refresh — the core streamed its error to the logs.)
                if (result.blockedBy) {
                    await ProjectDashboardWebviewCommand.refreshStatus();

                    // One wording for a person, shared with the screen's progress modal.
                    const reason = meshFailureForPerson(result);
                    if (result.blockedBy === 'no-mesh') {
                        vscode.window.showWarningMessage(reason);
                    } else if (!result.cancelled) {
                        vscode.window.showErrorMessage(reason);
                    }
                    return;
                }

                // Deploy failure: simple error with a View Logs jump.
                const selection = await vscode.window.showErrorMessage(
                    meshFailureForPerson(result),
                    'View Logs',
                );
                if (selection === 'View Logs') {
                    vscode.commands.executeCommand('demoBuilder.showLogs');
                }
            } catch (error) {
                // Outer catch for any unexpected errors during validation/setup
                this.logger.error('[Mesh Deployment] Unexpected error', error as Error);
                const selection = await vscode.window.showErrorMessage(
                    'Failed to deploy API Mesh. Check logs for details.',
                    'View Logs',
                );
                if (selection === 'View Logs') {
                    vscode.commands.executeCommand('demoBuilder.showLogs');
                }
            }
        });
    }
}
