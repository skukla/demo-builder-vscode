import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';
import { ServiceLocator } from '@/core/di/serviceLocator';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/**
 * Deploy (or redeploy) API Mesh.
 *
 * The command owns its toasts only. The one-at-a-time lock, the mesh prompt, the
 * progress notification and the dashboard status bridge are `deployMeshWithFeedback`'s. The whole deploy sequence (pre-flight →
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

    async execute(projectPath?: unknown): Promise<void> {
        // The project a screen or agent named, else the current one (AI-15).
        const state = this.stateFor(projectPath);
        const { ProjectDashboardWebviewCommand } = await import(
            '@/features/dashboard/commands/showDashboard'
        );

        try {
            const project = await state.getCurrentProject();
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
            // the same as this one. The lock and the mesh prompt are the
            // wrapper's too; the command keeps only the toasts and result mapping.
            const result = await deployMeshWithFeedback({
                authManager: ServiceLocator.getAuthenticationService(),
                secrets: ServiceLocator.getSecretStorage() ?? undefined,
                commandManager: ServiceLocator.getCommandExecutor(),
                project,
                stateManager: state,
                logger: this.logger,
                extensionPath: this.context.extensionPath,
                republishStorefront: async (deployed) => {
                    const { republishStorefrontConfig } = await import(
                        '@/features/eds/services/storefront/storefrontRepublishService'
                    );
                    const { ensureDaLiveAuth } = await import('@/features/eds/handlers/edsHelpers');
                    return republishStorefrontConfig({
                        project: deployed,
                        secrets: this.context.secrets,
                        logger: this.logger,
                        persist: (p) => state.saveProject(p),
                        ensureDaLiveSession: () =>
                            ensureDaLiveAuth(
                                { context: this.context, logger: this.logger },
                                '[Mesh Deploy]',
                            ),
                    });
                },
            });

            // Another door's deploy is running: this one did nothing, and says nothing.
            if (result.alreadyRunning) {
                this.logger.debug('[Mesh Deployment] Already in progress');
                return;
            }
            if (result.success && result.storefrontNotRepublished) {
                vscode.window.showWarningMessage(
                    `API Mesh deployed, but the storefront was not republished: ${result.storefrontNotRepublished}`,
                );
                return;
            }
            if (result.success) {
                this.showSuccessMessage('API Mesh deployed successfully');
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
    }
}
