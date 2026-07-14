import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { StateManager } from '@/core/state';
import { ExecutionLock } from '@/core/utils';
import type { Logger } from '@/types/logger';

/**
 * Deploy (or redeploy) the project's App Builder app.
 *
 * The command owns UX only — the lock, the progress notification, the dashboard
 * status bridge, and the toasts. The whole deploy sequence (pre-flight →
 * permission gate → find app → deploy under org-context → persist) lives in the
 * shared, UI-free `deployAppHeadless` core, which the projects-list `redeployApp`
 * handler also calls. Sibling of {@link import('@/features/mesh/commands/deployMesh').DeployMeshCommand}.
 */
export class DeployAppCommand extends BaseCommand {
    /** Execution lock to prevent duplicate concurrent execution */
    private static lock = new ExecutionLock('DeployApp');

    constructor(context: vscode.ExtensionContext, stateManager: StateManager, logger: Logger) {
        super(context, stateManager, logger);
    }

    async execute(): Promise<void> {
        if (DeployAppCommand.lock.isLocked()) {
            this.logger.debug('[App Deployment] Already in progress');
            return;
        }

        await DeployAppCommand.lock.run(() => this.run());
    }

    /** Run the shared headless deploy core, bridging its callbacks to the dashboard + toasts. */
    private async run(): Promise<void> {
        const { ProjectDashboardWebviewCommand } = await import(
            '@/features/dashboard/commands/showDashboard'
        );

        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            vscode.window.showWarningMessage('No active project found. Create a project first.');
            return;
        }

        const { deployAppHeadless } = await import(
            '@/features/app-builder/services/deployAppHeadless'
        );

        // Run the UI-free core inside the progress notification, bridging its
        // status/progress callbacks to the dashboard badge + notification. Capture
        // the result from the task so it survives regardless of withProgress's return.
        let result: import('@/features/app-builder/services/deployAppHeadless').DeployAppHeadlessResult =
            { success: false };
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Deploying App Builder app',
                cancellable: false,
            },
            async (progress) => {
                result = await deployAppHeadless({
                    project,
                    stateManager: this.stateManager,
                    logger: this.logger,
                    extensionPath: this.context.extensionPath,
                    // Omit the url arg entirely for non-'deployed' statuses.
                    onStatus: (status, message, url) =>
                        url === undefined
                            ? ProjectDashboardWebviewCommand.sendAppStatusUpdate(status, message)
                            : ProjectDashboardWebviewCommand.sendAppStatusUpdate(
                                  status,
                                  message,
                                  url,
                              ),
                    onProgress: (message) => {
                        progress.report({ message });
                    },
                });
            },
        );

        if (result.success) {
            this.showSuccessMessage('App Builder app deployed successfully');
            return;
        }

        // A guard stopped the deploy (auth/org/permission/no-app): the core already
        // emitted any 'error' status; refresh the dashboard and show the matching
        // toast. A raw deploy failure has no blockedBy and skips the refresh.
        if (result.blockedBy) {
            await ProjectDashboardWebviewCommand.refreshStatus();

            if (result.blockedBy === 'auth' || result.blockedBy === 'org') {
                if (!result.cancelled) {
                    vscode.window.showErrorMessage(
                        result.blockedBy === 'org'
                            ? `"${project.name}" uses a different Adobe organization than the ` +
                                  'account you\'re signed into. Use "Switch IMS Org" on the ' +
                                  'dashboard to continue.'
                            : 'Sign-in failed or was cancelled. Please try again.',
                    );
                }
                return;
            }
            if (result.blockedBy === 'no-app') {
                vscode.window.showWarningMessage('This project does not have an App Builder app.');
                return;
            }
            // permission
            vscode.window.showErrorMessage(
                result.error ||
                    'Your account lacks Developer or System Admin role for this organization. ' +
                        'App Builder deployment requires App Builder access. ' +
                        'Contact your administrator to restore access.',
            );
            return;
        }

        vscode.window.showErrorMessage(result.error || 'App Builder deployment failed.');
    }
}
