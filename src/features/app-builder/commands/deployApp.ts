import * as vscode from 'vscode';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { BaseCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell';
import { StateManager } from '@/core/state';
import { ExecutionLock } from '@/core/utils';
import { deployAppComponent } from '@/features/app-builder/services/appDeployment';
import type { Logger } from '@/types/logger';
import { getAppBuilderInstance } from '@/types/typeGuards';

/**
 * Deploy (or redeploy) the project's App Builder app.
 *
 * Sibling of DeployMeshCommand: mirrors its guard order exactly
 * (concurrency lock → auth → org reachability → App Builder permission), then
 * calls the org-agnostic deployAppComponent INSIDE withOrgContext so the aio
 * deploy targets the project's org/project/workspace without mutating the shared
 * `aio` global. On success it persists appState + appStatusSummary='deployed' and
 * pushes the dashboard status; on failure it records appStatusSummary='error'.
 */
export class DeployAppCommand extends BaseCommand {
    /** Execution lock to prevent duplicate concurrent execution */
    private static lock = new ExecutionLock('DeployApp');

    constructor(
        context: vscode.ExtensionContext,
        stateManager: StateManager,
        logger: Logger,
    ) {
        super(context, stateManager, logger);
    }

    async execute(): Promise<void> {
        if (DeployAppCommand.lock.isLocked()) {
            this.logger.debug('[App Deployment] Already in progress');
            return;
        }

        await DeployAppCommand.lock.run(() => this.run());
    }

    /** Run the guarded deploy flow. Extracted to keep execute() under the lock thin. */
    private async run(): Promise<void> {
        const { ProjectDashboardWebviewCommand } = await import('@/features/dashboard/commands/showDashboard');

        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            vscode.window.showWarningMessage('No active project found. Create a project first.');
            return;
        }

        const app = getAppBuilderInstance(project);
        if (!app?.path) {
            await ProjectDashboardWebviewCommand.refreshStatus();
            vscode.window.showWarningMessage('This project does not have an App Builder app.');
            return;
        }

        await ProjectDashboardWebviewCommand.sendAppStatusUpdate('deploying', 'Checking requirements...');

        const authManager = ServiceLocator.getAuthenticationService();
        const passed = await this.runGuards(project, authManager, ProjectDashboardWebviewCommand);
        if (!passed) {
            return;
        }

        await this.deploy(project, app.path, authManager, ProjectDashboardWebviewCommand);
    }

    /**
     * Run the pre-flight guards in the same order as the mesh command. Returns
     * true when all pass; on any failure it surfaces the message, pushes/refreshes
     * dashboard status, and returns false (the caller aborts WITHOUT deploying).
     */
    private async runGuards(
        project: NonNullable<Awaited<ReturnType<StateManager['getCurrentProject']>>>,
        authManager: ReturnType<typeof ServiceLocator.getAuthenticationService>,
        dashboard: typeof import('@/features/dashboard/commands/showDashboard')['ProjectDashboardWebviewCommand'],
    ): Promise<boolean> {
        const authResult = await ensureAdobeIOAuth({
            authManager,
            logger: this.logger,
            logPrefix: '[App Deployment]',
            projectContext: {
                organization: project?.adobe?.organization,
                projectId: project?.adobe?.projectId,
                workspace: project?.adobe?.workspace,
            },
            warningMessage: 'Adobe sign-in required to deploy the App Builder app.',
        });
        if (!authResult.authenticated) {
            await dashboard.refreshStatus();
            if (!authResult.cancelled) {
                vscode.window.showErrorMessage('Sign-in failed or was cancelled. Please try again.');
            }
            return false;
        }

        const { detectProjectOrgMismatch } = await import(
            '@/features/authentication/services/detectProjectOrgMismatch'
        );
        const orgContext = await detectProjectOrgMismatch(authManager, project, this.logger);
        if (orgContext && !orgContext.reachable) {
            await dashboard.refreshStatus();
            vscode.window.showWarningMessage(
                `"${project.name}" uses a different Adobe organization than the account you're signed into`
                + (orgContext.currentOrg ? ` (${orgContext.currentOrg})` : '')
                + '. Use "Switch IMS Org" on the dashboard to continue.',
            );
            return false;
        }

        const { projectRequiresAppBuilder } = await import(
            '@/features/components/services/projectAppBuilderPredicate'
        );
        const { ComponentRegistryManager } = await import(
            '@/features/components/services/ComponentRegistryManager'
        );
        const registry = await new ComponentRegistryManager(this.context.extensionPath).loadRegistry();
        if (projectRequiresAppBuilder(project, registry)) {
            const permissionCheck = await authManager.testDeveloperPermissions();
            if (!permissionCheck.hasPermissions) {
                await dashboard.sendAppStatusUpdate('error', 'Developer access required');
                await dashboard.refreshStatus();
                vscode.window.showErrorMessage(
                    permissionCheck.error
                    || 'Your account lacks Developer or System Admin role for this organization. '
                    + 'App Builder deployment requires App Builder access. '
                    + 'Contact your administrator to restore access.',
                );
                return false;
            }
        }

        return true;
    }

    /**
     * Run the deploy itself under org-context targeting, persist results, and push
     * the dashboard status. Records appStatusSummary='error' on any failure.
     */
    private async deploy(
        project: NonNullable<Awaited<ReturnType<StateManager['getCurrentProject']>>>,
        appPath: string,
        authManager: ReturnType<typeof ServiceLocator.getAuthenticationService>,
        dashboard: typeof import('@/features/dashboard/commands/showDashboard')['ProjectDashboardWebviewCommand'],
    ): Promise<void> {
        const commandManager = ServiceLocator.getCommandExecutor();
        const target = buildOrgTargetFromProjectAdobe(project.adobe, authManager.getCachedOrganization());

        try {
            const result = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Deploying App Builder app',
                    cancellable: false,
                },
                (progress) => withOrgContext(target, () => deployAppComponent(
                    appPath,
                    commandManager,
                    this.logger,
                    (message: string) => {
                        progress.report({ message });
                        void dashboard.sendAppStatusUpdate('deploying', message);
                    },
                )),
            );

            if (!result.success) {
                project.appStatusSummary = 'error';
                await this.stateManager.saveProject(project);
                await dashboard.sendAppStatusUpdate('error', result.error || 'Deployment failed');
                vscode.window.showErrorMessage(result.error || 'App Builder deployment failed.');
                return;
            }

            project.appState = {
                appId: result.data?.appId,
                url: result.data?.url,
                status: 'deployed',
                deployedUrls: result.data?.deployedUrls,
                lastDeployed: new Date().toISOString(),
                sourceHash: null,
            };
            project.appStatusSummary = 'deployed';
            await this.stateManager.saveProject(project);

            await dashboard.sendAppStatusUpdate('deployed', undefined, result.data?.url);
            this.showSuccessMessage('App Builder app deployed successfully');
        } catch (error) {
            this.logger.error('[App Deployment] Unexpected error', error as Error);
            project.appStatusSummary = 'error';
            await this.stateManager.saveProject(project);
            await dashboard.sendAppStatusUpdate('error', 'Deployment failed');
            vscode.window.showErrorMessage('Failed to deploy App Builder app. Check logs for details.');
        }
    }
}
