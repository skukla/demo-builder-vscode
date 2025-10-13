import * as vscode from 'vscode';
import { BaseCommand } from './baseCommand';
import { UpdateManager } from '../utils/updateManager';
import { ExtensionUpdater } from '../utils/extensionUpdater';
import { ComponentUpdater } from '../utils/componentUpdater';

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
      
      // Log updates found
      this.logger.info(`[Updates] Found ${updates.length} update(s):`);
      updates.forEach(update => this.logger.info(`[Updates]   - ${update}`));
      
      // Show update prompt (simplified - no "View Details" button)
      const message = `Updates available:\n${updates.join('\n')}`;
      const action = await vscode.window.showInformationMessage(
        message,
        'Update All',
        'Later'
      );
      
      if (action === 'Update All') {
        await this.performUpdates(extensionUpdate, componentUpdates, project);
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
    extensionUpdate: any,
    componentUpdates: Map<string, any>,
    project: any
  ): Promise<void> {
    // RESILIENCE: Check if demo is running (prevents file locks on Windows)
    if (project && project.status === 'running' && componentUpdates.size > 0) {
      const stop = await vscode.window.showWarningMessage(
        'Demo is currently running. Stop it before updating components?',
        'Stop & Update',
        'Cancel'
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
        try {
          await componentUpdater.updateComponent(
            project,
            componentId,
            update.releaseInfo.downloadUrl,
            update.latest
          );
          componentUpdateCount++;
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to update ${componentId}: ${(error as Error).message}`
          );
          this.logger.error(`[Updates] Component update failed for ${componentId}`, error as Error);
        }
      }
    }
    
    if (componentUpdateCount > 0) {
      this.logger.info(`[Updates] ✓ ${componentUpdateCount} component(s) updated successfully`);
    }
    
    // Save project with updated versions
    if (project) {
      await this.stateManager.saveProject(project);
    }
    
    // Update extension last (triggers reload prompt)
    if (extensionUpdate.hasUpdate && extensionUpdate.releaseInfo) {
      await extensionUpdater.updateExtension(
        extensionUpdate.releaseInfo.downloadUrl,
        extensionUpdate.latest
      );
    } else if (componentUpdates.size > 0) {
      // Components updated but not extension - show success
      vscode.window.showInformationMessage(
        'Components updated successfully. Restart demo to apply changes.',
        'OK'
      );
    }
  }
}
