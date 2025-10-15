import * as vscode from 'vscode';
import { Project } from '../types';
import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import { ExtensionUpdater } from '@/features/updates/services/extensionUpdater';
import { UpdateManager, UpdateCheckResult } from '@/features/updates/services/updateManager';
import { BaseCommand } from '@/shared/base';

/**
 * Command to check for and apply updates to extension and components
 * User must confirm before updates are applied
 * RESILIENCE: Checks if demo is running before updating (prevents file lock issues)
 */
export class CheckUpdatesCommand extends BaseCommand {
    async execute(): Promise<void> {
        try {
            const updateManager = new UpdateManager(this.context, this.logger);
            const project = await this.stateManager.getCurrentProject();
      
            // Check extension updates
            this.logger.info('[Updates] Checking for extension updates');
            const extensionUpdate = await updateManager.checkExtensionUpdate();
      
            // Check component updates (if project loaded)
            let componentUpdates = new Map();
            if (project) {
                this.logger.info('[Updates] Checking for component updates');
                componentUpdates = await updateManager.checkComponentUpdates(project);
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
      
            if (updates.length === 0) {
                this.logger.info('[Updates] ✓ No updates available - Demo Builder is up to date');
                vscode.window.showInformationMessage('Demo Builder is up to date ✓');
                return;
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
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    
        const extensionUpdater = new ExtensionUpdater(this.logger);
        const componentUpdater = new ComponentUpdater(this.logger);

        // Update components first (must complete before extension reload)
        let componentUpdateCount = 0;
        for (const [componentId, update] of componentUpdates.entries()) {
            if (update.hasUpdate && update.releaseInfo) {
                // Ensure project is not null before updating components
                if (!project) {
                    this.logger.warn(`[Updates] Cannot update ${componentId}: no project loaded`);
                    continue;
                }

                try {
                    await componentUpdater.updateComponent(
                        project,
                        componentId,
                        update.releaseInfo.downloadUrl,
                        update.latest,
                    );
                    componentUpdateCount++;
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `Failed to update ${componentId}: ${(error as Error).message}`,
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
