import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { sanitizeErrorForLogging } from '@/core/validation/securityValidation';
import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import { ExtensionUpdater } from '@/features/updates/services/extensionUpdater';
import { UpdateManager, UpdateCheckResult } from '@/features/updates/services/updateManager';
import { Project } from '@/types';

/**
 * Command to check for and apply updates to extension and components
 * User must confirm before updates are applied
 * RESILIENCE: Checks if demo is running before updating (prevents file lock issues)
 */
export class CheckUpdatesCommand extends BaseCommand {
    async execute(): Promise<void> {
        try {
            // Run update check with visible progress notification
            const { extensionUpdate, componentUpdates, project, hasUpdates } = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Demo Builder Updates',
                    cancellable: false,
                },
                async (progress) => {
                    // Show initial message
                    progress.report({ message: 'Checking for updates...' });

                    // Wait to ensure message is visible before making GitHub API call
                    // This prevents race condition where API completes faster than VS Code can render
                    await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UPDATE_MESSAGE_DELAY));

                    const updateManager = new UpdateManager(this.context, this.logger);
                    const project = await this.stateManager.getCurrentProject();

                    // Check extension updates
                    this.logger.info('[Updates] Checking for extension updates');
                    const extensionUpdate = await updateManager.checkExtensionUpdate();

                    // Check component updates (if project loaded)
                    let componentUpdates: Map<string, UpdateCheckResult> = new Map();
                    if (project) {
                        this.logger.info('[Updates] Checking for component updates');
                        componentUpdates = await updateManager.checkComponentUpdates(project);
                    }

                    // Check if any updates available
                    const hasUpdates = extensionUpdate.hasUpdate ||
                        Array.from(componentUpdates.values()).some(u => u.hasUpdate);

                    if (!hasUpdates) {
                        // Show "up to date" result using centralized timeout
                        progress.report({
                            message: `Up to date (v${extensionUpdate.current})`,
                        });
                        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UPDATE_RESULT_DISPLAY));
                    }

                    return { extensionUpdate, componentUpdates, project, hasUpdates };
                },
            );

            // If no updates, we already showed the result - just return
            if (!hasUpdates) {
                this.logger.info('[Updates] ✓ No updates available - Demo Builder is up to date');
                return;
            }

            // Build update summary
            const updates: string[] = [];

            if (extensionUpdate.hasUpdate) {
                updates.push(`Extension: v${extensionUpdate.current} → v${extensionUpdate.latest}`);
            }

            for (const [componentId, update] of componentUpdates.entries()) {
                if (update.hasUpdate) {
                    updates.push(`${componentId}: v${update.current} → v${update.latest}`);
                }
            }

            // Log available updates
            this.logger.info(`[Updates] Found ${updates.length} update(s):`);
            updates.forEach(update => this.logger.info(`[Updates]   - ${update}`));
      
            // Show update prompt (simplified - no "View Details" button)
            const message = `Updates available:\n${updates.join('\n')}`;
            const action = await vscode.window.showInformationMessage(
                message,
                'Update All',
                'Later',
            );
      
            if (action === 'Update All') {
                // Convert undefined to null for performUpdates
                await this.performUpdates(extensionUpdate, componentUpdates, project || null);
            }
      
        } catch (error) {
            await this.showError('Failed to check for updates', error as Error);
        }
    }

    /**
     * Perform updates with user confirmation
     * Components first, then extension (extension triggers reload)
     * RESILIENCE: Checks if demo is running before updating components
     */
    private async performUpdates(
        extensionUpdate: UpdateCheckResult | null,
        componentUpdates: Map<string, UpdateCheckResult>,
        project: Project | null,
    ): Promise<void> {
        // RESILIENCE: Check if demo is running (prevents file locks on Windows)
        if (project && project.status === 'running' && componentUpdates.size > 0) {
            const stop = await vscode.window.showWarningMessage(
                'Demo is currently running. Stop it before updating components?',
                'Stop & Update',
                'Cancel',
            );
      
            if (stop !== 'Stop & Update') {
                this.logger.info('[Updates] User cancelled update (demo still running)');
                return;
            }
      
            // Stop demo
            this.logger.info('[Updates] Stopping demo before component updates');
            await vscode.commands.executeCommand('demoBuilder.stopDemo');

            // Wait for clean shutdown
            await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DEMO_STOP_WAIT));
        }

        // Update components first (must complete before extension reload)
        let componentUpdateCount = 0;
        const componentUpdater = componentUpdates.size > 0 ? new ComponentUpdater(this.logger) : null;

        for (const [componentId, update] of componentUpdates.entries()) {
            if (update.hasUpdate && update.releaseInfo) {
                if (!project) {
                    this.logger.warn(`[Updates] Cannot update ${componentId}: no project loaded`);
                    continue;
                }

                try {
                    await componentUpdater!.updateComponent(
                        project,
                        componentId,
                        update.releaseInfo.downloadUrl,
                        update.latest,
                    );
                    componentUpdateCount++;
                } catch (error) {
                    // SECURITY: Sanitize error message before showing to user
                    // Prevents information disclosure of paths, tokens, etc.
                    const sanitizedError = sanitizeErrorForLogging(error as Error);
                    vscode.window.showErrorMessage(
                        `Failed to update ${componentId}: ${sanitizedError}`,
                    );
                    this.logger.error(`[Updates] Component update failed for ${componentId}`, error as Error);
                }
            }
        }
    
        // Save project with updated versions
        if (project) {
            await this.stateManager.saveProject(project);
        }

        // Log component update summary
        if (componentUpdateCount > 0) {
            this.logger.info(`[Updates] ✓ ${componentUpdateCount} component(s) updated successfully`);
        }

        // Update extension last (triggers reload prompt)
        if (extensionUpdate && extensionUpdate.hasUpdate && extensionUpdate.releaseInfo) {
            const extensionUpdater = new ExtensionUpdater(this.logger);
            await extensionUpdater.updateExtension(
                extensionUpdate.releaseInfo.downloadUrl,
                extensionUpdate.latest,
            );
        } else if (componentUpdates.size > 0) {
            // Components updated but not extension - show success
            vscode.window.showInformationMessage(
                'Components updated successfully. Restart demo to apply changes.',
                'OK',
            );
        }
    }
}
