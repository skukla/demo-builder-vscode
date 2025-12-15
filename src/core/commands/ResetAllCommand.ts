import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { LAST_UPDATE_CHECK_VERSION } from '@/core/constants';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { sanitizeErrorForLogging, validatePathSafety } from '@/core/validation/securityValidation';
import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import { ShowProjectsListCommand } from '@/features/projects-dashboard/commands/showProjectsList';

export class ResetAllCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            // Only allow in development mode
            const isDevelopment = this.context.extensionMode === vscode.ExtensionMode.Development;

            if (!isDevelopment) {
                vscode.window.showWarningMessage('Reset command is only available in development mode');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                'This will delete all Demo Builder data and state. Are you sure?',
                { modal: true },
                'Yes, Reset Everything',
                'Cancel',
            );

            if (confirm !== 'Yes, Reset Everything') {
                return;
            }

            this.logger.info('Resetting all Demo Builder state...');

            // 1. Stop any running processes first
            try {
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
                this.logger.info('Stopped any running demos');
            } catch {
                // Ignore errors if no demo is running
            }

            // 2. Close all open webview panels (Projects List, Project Dashboard, Create Project wizard)
            try {
                ShowProjectsListCommand.disposeActivePanel();
                ProjectDashboardWebviewCommand.disposeActivePanel();
                BaseWebviewCommand.disposeAllActivePanels();

                this.logger.info('Closed all webview panels');
            } catch (err) {
                this.logger.warn('Error closing webview panels:', err as Error);
            }

            // 3. Remove any Demo Builder workspace folders (if user manually added them)
            // NOTE: Normal operation no longer adds workspace folders (Package 4 - beta.64),
            // but this cleanup handles legacy projects or manual additions.
            const workspaceFolders = vscode.workspace.workspaceFolders || [];
            const demoBuilderPath = path.join(os.homedir(), '.demo-builder');
            const indicesToRemove = workspaceFolders
                .map((folder, index) => folder.uri.fsPath.startsWith(demoBuilderPath) ? index : -1)
                .filter(index => index !== -1)
                .reverse();

            indicesToRemove.forEach(index => {
                vscode.workspace.updateWorkspaceFolders(index, 1);
            });

            if (indicesToRemove.length > 0) {
                this.logger.info(`Removed ${indicesToRemove.length} workspace folder(s)`);
            }

            // 4. Clear VSCode workspace state
            await this.stateManager.clearAll();
            this.logger.info('Cleared workspace state');

            // 5. Clear global state (update check version tracking, etc.)
            try {
                await this.context.globalState.update(LAST_UPDATE_CHECK_VERSION, undefined);
                this.logger.info('Cleared global state (update check version)');
            } catch (error) {
                this.logger.warn('Failed to clear global state:', error as Error);
            }

            /**
             * 6. Adobe CLI logout - clears ~/.aio/config.json token
             * Non-fatal: Logs warning and continues if logout fails to prevent blocking reset
             */
            try {
                const authService = ServiceLocator.getAuthenticationService();
                await authService.logout();
                this.logger.info('Adobe CLI logout successful');
            } catch (error) {
                // Non-fatal: Log warning and continue reset
                // SECURITY: Sanitize error message to prevent token leakage in logs
                const sanitizedError = sanitizeErrorForLogging(error as Error);
                this.logger.warn(
                    `Adobe CLI logout failed: ${sanitizedError}. You may need to manually clear authentication.`,
                    error as Error,
                );
                this.logger.warn('To manually logout, run: aio auth logout');
            }

            // 7. Reset status bar
            this.statusBar.reset();

            // 8. Delete .demo-builder directory (after all cleanup steps)
            try {
                // SECURITY: Validate path safety before deletion (symlink attack prevention)
                const homeDir = os.homedir();
                const pathValidation = await validatePathSafety(demoBuilderPath, homeDir);

                if (!pathValidation.safe) {
                    this.logger.warn(`Skipping directory deletion: ${pathValidation.reason}`);
                    this.logger.warn(`Please manually review and delete: ${demoBuilderPath}`);
                } else {
                    await fs.rm(demoBuilderPath, { recursive: true, force: true });
                    this.logger.info(`Deleted ${demoBuilderPath} and all projects`);
                }
            } catch (error) {
                // SECURITY: Sanitize error message to prevent path disclosure
                const sanitizedError = sanitizeErrorForLogging(error as Error);
                this.logger.warn(`Could not delete .demo-builder directory: ${sanitizedError}`);
                this.logger.warn('You may need to manually delete this directory');
            }

            // Reload window automatically to ensure clean state
            // This prevents workspace folder references from lingering
            this.logger.info('Reloading window to complete reset');
            vscode.window.setStatusBarMessage('✅ Demo Builder reset complete', TIMEOUTS.STATUS_BAR_INFO);

            await vscode.commands.executeCommand('workbench.action.reloadWindow');

        } catch (error) {
            // SECURITY: Sanitize error before showing to user
            const sanitizedMessage = sanitizeErrorForLogging(error as Error);
            const sanitizedError = new Error(sanitizedMessage);
            sanitizedError.name = (error as Error).name;
            await this.showError('Failed to reset Demo Builder', sanitizedError);
        }
    }
}
