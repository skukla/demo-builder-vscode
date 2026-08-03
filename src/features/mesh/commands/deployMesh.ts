import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { StateManager } from '@/core/state';
import { ExecutionLock } from '@/core/utils';
import type { Logger } from '@/types/logger';

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
    /** Execution lock to prevent duplicate concurrent execution */
    private static lock = new ExecutionLock('DeployMesh');

    constructor(context: vscode.ExtensionContext, stateManager: StateManager, logger: Logger) {
        super(context, stateManager, logger);
    }

    async execute(): Promise<void> {
        // Prevent duplicate concurrent execution
        if (DeployMeshCommand.lock.isLocked()) {
            this.logger.debug('[Mesh Deployment] Already in progress');
            return;
        }

        await DeployMeshCommand.lock.run(async () => {
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

                const { deployMeshHeadless } = await import('../services/deployMeshHeadless');

                // Run the shared, UI-free deploy core inside the progress
                // notification, bridging its status/progress callbacks to the
                // dashboard badge. The notification itself carries only the title
                // below. The result is captured from the task (not withProgress's
                // return) so it survives regardless.
                let result: import('../services/deployMeshHeadless').DeployMeshHeadlessResult = {
                    success: false,
                };
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Deploying API Mesh',
                        cancellable: false,
                    },
                    async () => {
                        result = await deployMeshHeadless({
                            project,
                            stateManager: this.stateManager,
                            logger: this.logger,
                            extensionPath: this.context.extensionPath,
                            // Forward the core's args faithfully — omit the
                            // endpoint arg entirely for non-'deployed' statuses.
                            onStatus: (status, message, endpoint) =>
                                endpoint === undefined
                                    ? ProjectDashboardWebviewCommand.sendMeshStatusUpdate(
                                          status,
                                          message,
                                      )
                                    : ProjectDashboardWebviewCommand.sendMeshStatusUpdate(
                                          status,
                                          message,
                                          endpoint,
                                      ),
                            // Steps go to the CARD only. This used to also call
                            // `progress.report`, so the mesh card read
                            // "STARTING DEPLOYMENT…" while the notification beside
                            // it announced the same moment in different words. The
                            // notification keeps the coarse register — its title
                            // and a spinner, which is what a user who is NOT on the
                            // Integrations page needs; the card carries the steps,
                            // because it is the thing being deployed.
                            onProgress: (message, subMessage) => {
                                void ProjectDashboardWebviewCommand.sendMeshStatusUpdate(
                                    'deploying',
                                    subMessage || message,
                                );
                            },
                        });
                    },
                );

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

                    if (result.blockedBy === 'auth' || result.blockedBy === 'org') {
                        if (!result.cancelled) {
                            vscode.window.showErrorMessage(
                                result.blockedBy === 'org'
                                    ? 'Still signed into the wrong Adobe organization. ' +
                                          'Close any other Adobe browser tab, then try again.'
                                    : 'Sign-in failed or was cancelled. Please try again.',
                            );
                        }
                        return;
                    }
                    if (result.blockedBy === 'no-mesh') {
                        vscode.window.showWarningMessage(
                            'This project does not have an API Mesh component.',
                        );
                        return;
                    }
                    // permission
                    vscode.window.showErrorMessage(
                        result.error ||
                            'Your account lacks Developer or System Admin role for this organization. ' +
                                'API Mesh deployment requires App Builder access. ' +
                                'Contact your administrator to restore access.',
                    );
                    return;
                }

                // Deploy failure: simple error with a View Logs jump.
                const selection = await vscode.window.showErrorMessage(
                    'Mesh deployment failed. Check logs for details.',
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
