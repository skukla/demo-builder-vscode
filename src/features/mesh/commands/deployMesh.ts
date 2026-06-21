import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { StateManager } from '@/core/state';
import { ExecutionLock } from '@/core/utils';
import type { Logger } from '@/types/logger';
import { getMeshComponentInstance } from '@/types/typeGuards';

/**
 * Deploy (or redeploy) API Mesh.
 *
 * The command owns orchestration + UX only — lock, pre-flight, dashboard status
 * telegraphing, and persistence. The actual build + deploy + verify is delegated
 * to the shared `deployMeshComponent` service (the single deploy core also used by
 * project creation and the reset flows), so there is one place that issues
 * `aio api-mesh:*`. Delegating also means the dashboard redeploy now rebuilds
 * mesh.json from the current .env (a Configure change actually takes effect) and
 * uses create-or-update instead of a hardcoded update.
 */
export class DeployMeshCommand extends BaseCommand {
    /** Execution lock to prevent duplicate concurrent execution */
    private static lock = new ExecutionLock('DeployMesh');

    constructor(
        context: vscode.ExtensionContext,
        stateManager: StateManager,
        logger: Logger,
    ) {
        super(context, stateManager, logger);
    }

    async execute(): Promise<void> {
        // Prevent duplicate concurrent execution
        if (DeployMeshCommand.lock.isLocked()) {
            this.logger.debug('[Mesh Deployment] Already in progress');
            return;
        }

        await DeployMeshCommand.lock.run(async () => {
            // Import ProjectDashboardWebviewCommand early for status updates
            const { ProjectDashboardWebviewCommand } = await import('@/features/dashboard/commands/showDashboard');

            try {
            // Get current project
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                vscode.window.showWarningMessage('No active project found. Create a project first.');
                return;
            }

            // Send "deploying" status immediately to prevent UI flash
            // This ensures the dashboard shows "Deploying..." while pre-flight checks run
            await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Checking requirements...');

            // PRE-FLIGHT: ensure auth AND the correct org context in one shared gate
            // (the same pre-flight the reset flows use). Auth-expiry → Sign In/Cancel;
            // wrong org → Switch IMS Org/Cancel; both recover inline rather than
            // dead-ending in a warning that points back at the dashboard banner.
            const authManager = ServiceLocator.getAuthenticationService();
            const { ensureProjectAdobeContext } = await import(
                '@/features/authentication/services/ensureProjectAdobeContext'
            );
            const preflight = await ensureProjectAdobeContext({
                authManager,
                project,
                logger: this.logger,
                logPrefix: '[Mesh Deployment]',
                warningMessage: 'Adobe sign-in required to deploy mesh.',
            });
            if (!preflight.ready) {
                await ProjectDashboardWebviewCommand.refreshStatus();
                if (!preflight.cancelled) {
                    vscode.window.showErrorMessage(
                        preflight.blockedBy === 'org'
                            ? 'Still signed into the wrong Adobe organization. '
                              + 'Close any other Adobe browser tab, then try again.'
                            : 'Sign-in failed or was cancelled. Please try again.',
                    );
                }
                return;
            }

            // App Builder permission gate. Defensive — by the time the user
            // reaches the dashboard, the create-time gate has already passed.
            // But IMS role membership can change in between; re-verifying here
            // surfaces the friendly error instead of an opaque CLI failure
            // mid-deploy.
            const { projectRequiresAppBuilder } = await import(
                '@/features/components/services/projectAppBuilderPredicate'
            );
            const { ComponentRegistryManager } = await import(
                '@/features/components/services/ComponentRegistryManager'
            );
            const registry = await new ComponentRegistryManager(
                this.context.extensionPath,
            ).loadRegistry();
            if (projectRequiresAppBuilder(project, registry)) {
                const permissionCheck = await authManager.testDeveloperPermissions();
                if (!permissionCheck.hasPermissions) {
                    await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('error', 'Developer access required');
                    await ProjectDashboardWebviewCommand.refreshStatus();
                    vscode.window.showErrorMessage(
                        permissionCheck.error
                        || 'Your account lacks Developer or System Admin role for this organization. '
                        + 'API Mesh deployment requires App Builder access. '
                        + 'Contact your administrator to restore access.',
                    );
                    return;
                }
            }

            // Find mesh component (uses subType detection, supports both EDS and Headless mesh)
            const meshComponent = getMeshComponentInstance(project);
            if (!meshComponent?.path) {
                // Refresh status to show correct state
                await ProjectDashboardWebviewCommand.refreshStatus();

                vscode.window.showWarningMessage('This project does not have an API Mesh component.');
                return;
            }

            // Log deployment start
            this.logger.info('='.repeat(60));
            this.logger.info('API Mesh Deployment Started');
            this.logger.info('='.repeat(60));
            this.logger.info(`Project: ${project.name}`);
            this.logger.info(`Mesh Component: ${meshComponent.path}`);
            this.logger.info(`Time: ${new Date().toISOString()}`);
            this.logger.info('='.repeat(60));

            try {
                // Send initial "deploying" status to Project Dashboard
                await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Starting deployment...');

                // Update component state to deploying
                meshComponent.status = 'deploying';
                await this.stateManager.saveProject(project);

                // Bounded pre-deploy subscribe: ensure the API Mesh API (+ baseline)
                // is subscribed on the shared App Builder project BEFORE deploying.
                // Runs under the project's org context (preflight already passed +
                // permission gate); a failure fails-fast via the inner catch below
                // (no half-deploy). Idempotent on an already-subscribed mesh.
                const { ensureMeshApiSubscribed } = await import(
                    '@/features/app-builder/services/ensureMeshApiSubscribed'
                );
                await ensureMeshApiSubscribed({ project, authService: authManager, logger: this.logger });

                // Show progress notification while the shared deploy pipeline runs.
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Deploying API Mesh',
                        cancellable: false,
                    },
                    async (progress) => {
                        // Bridge the shared service's progress callback to both the
                        // progress notification and the dashboard status badge.
                        const onProgress = (message: string, subMessage?: string) => {
                            const text = subMessage || message;
                            progress.report({ message: text });
                            void ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', text);
                        };

                        // Create-or-update: source the existing mesh id from Adobe I/O
                        // (remote truth) so a never-deployed mesh is created and an
                        // existing one is updated — mirrors the reset flow.
                        const { fetchMeshInfoFromAdobeIO } = await import('../services/meshVerifier');
                        const meshInfo = await fetchMeshInfoFromAdobeIO(this.logger);
                        const existingMeshId = meshInfo?.meshId || '';

                        // Delegate build + deploy + verify to the shared deploy core.
                        // The build step regenerates mesh.json from the current .env so a
                        // Configure change actually takes effect on redeploy.
                        const { deployMeshComponent } = await import('../services/meshDeployment');
                        const commandManager = ServiceLocator.getCommandExecutor();
                        const result = await deployMeshComponent(
                            meshComponent.path as string,
                            commandManager,
                            this.logger,
                            onProgress,
                            existingMeshId,
                        );

                        if (!result.success) {
                            throw new Error(result.error || 'Mesh deployment failed');
                        }

                        const deployedMeshId = result.data?.meshId;
                        const deployedEndpoint = result.data?.endpoint;

                        // Update component instance with deployment info
                        // Note: endpoint is stored in meshState (authoritative), not componentInstance
                        meshComponent.status = 'deployed';
                        meshComponent.metadata = {
                            ...meshComponent.metadata,
                            meshId: deployedMeshId || '',
                            meshStatus: 'deployed',
                        };

                        // Update mesh state (env vars + source hash + endpoint) to match deployed config
                        // so the dashboard knows the config is in sync.
                        // See docs/architecture/state-ownership.md for single-source-of-truth
                        const { updateMeshState } = await import('../services/stalenessDetector');
                        await updateMeshState(project, deployedEndpoint);
                        this.logger.debug('[Mesh Deployment] Updated mesh state after successful deployment');

                        // Persist deployed status for card grid display
                        project.meshStatusSummary = 'deployed';
                        await this.stateManager.saveProject(project);

                        // Send final "deployed" status to Project Dashboard
                        await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deployed', undefined, deployedEndpoint);

                        this.logger.info('');
                        this.logger.info('='.repeat(60));
                        this.logger.info('Deployment Completed Successfully');
                        this.logger.info('='.repeat(60));

                        // Show auto-dismissing success message (no logs button - only show logs on error)
                        this.showSuccessMessage('API Mesh deployed successfully');

                        // Reset mesh notification flag (user has deployed)
                        await vscode.commands.executeCommand('demoBuilder._internal.meshActionTaken');
                    },
                );

            } catch {
                // Error details already shown above (streamed by the service)
                this.logger.info(''); // Blank line (no ❌ prefix)
                this.logger.error('Deployment failed. See error above.');

                // Send error status to Project Dashboard
                await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('error', 'Deployment failed');

                // Update component state to error
                const project = await this.stateManager.getCurrentProject();
                const meshComponent = getMeshComponentInstance(project);
                if (meshComponent && project) {
                    meshComponent.status = 'error';
                    await this.stateManager.saveProject(project);
                }

                // Show simple error with View Logs button (details are in Demo Builder: User Logs channel)
                const selection = await vscode.window.showErrorMessage(
                    'Mesh deployment failed. Check logs for details.',
                    'View Logs',
                );
                if (selection === 'View Logs') {
                    vscode.commands.executeCommand('demoBuilder.showLogs');
                }
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
