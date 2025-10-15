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
        
        // Save project if componentVersions were auto-fixed during check
        await this.stateManager.saveProject(project);
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
        vscode.window.showInformationMessage(`Demo Builder is up to date ✓ (v${extensionUpdate.current})`);
        return;
      }
      
      // Log updates found
      this.logger.info(`[Updates] Found ${updates.length} update(s):`);
      updates.forEach(update => this.logger.info(`[Updates]   - ${update}`));
      
      // Show update prompt with granular options
      const message = `Updates available:\n${updates.join('\n')}`;
      
      // Build button options based on what's available
      const buttons: string[] = [];
      const hasComponentUpdates = componentUpdates.size > 0 && Array.from(componentUpdates.values()).some(u => u.hasUpdate);
      const hasExtensionUpdate = extensionUpdate.hasUpdate;
      
      if (hasComponentUpdates && hasExtensionUpdate) {
        buttons.push('Update All', 'Components Only', 'Extension Only', 'Later');
      } else if (hasComponentUpdates) {
        buttons.push('Update Components', 'Later');
      } else if (hasExtensionUpdate) {
        buttons.push('Update Extension', 'Later');
      }
      
      const action = await vscode.window.showInformationMessage(message, ...buttons);
      
      if (action === 'Update All') {
        await this.performComponentUpdates(componentUpdates, project);
        await this.performExtensionUpdate(extensionUpdate);
      } else if (action === 'Components Only' || action === 'Update Components') {
        await this.performComponentUpdates(componentUpdates, project);
        vscode.window.showInformationMessage('✓ Component updates completed');
      } else if (action === 'Extension Only' || action === 'Update Extension') {
        await this.performExtensionUpdate(extensionUpdate);
      }
      
    } catch (error) {
      await this.showError('Failed to check for updates', error as Error);
    }
  }

  /**
   * Perform component updates only
   * RESILIENCE: Checks if demo is running before updating components
   */
  private async performComponentUpdates(
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
        this.logger.info('[Updates] User cancelled component update (demo still running)');
        return;
      }
      
      // Stop demo
      this.logger.info('[Updates] Stopping demo before component updates');
      await vscode.commands.executeCommand('demoBuilder.stopDemo');

    }
    
    // Run updates with visual progress indicator
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Updating Components',
        cancellable: false
      },
      async (progress) => {
        const componentUpdater = new ComponentUpdater(this.logger);
        
        // Update components first (must complete before extension reload)
        let componentUpdateCount = 0;
        const totalComponents = Array.from(componentUpdates.entries()).filter(([_, update]) => update.hasUpdate && update.releaseInfo).length;
        
        let currentComponent = 0;
        for (const [componentId, update] of componentUpdates.entries()) {
          if (update.hasUpdate && update.releaseInfo) {
            currentComponent++;
            progress.report({
              message: `(${currentComponent}/${totalComponents}) Updating ${componentId}...`,
              increment: (100 / totalComponents)
            });
            
            try {
              await componentUpdater.updateComponent(
                project,
                componentId,
                update.releaseInfo.downloadUrl,
                update.latest,
                update.releaseInfo.commitSha // Pass commit SHA to update instance.version
              );
              componentUpdateCount++;
              this.logger.info(`[Updates] ✓ Successfully updated ${componentId}`);
            } catch (error) {
              const errorMsg = (error as Error).message;
              
              // Check if this is a rollback failure (contains snapshot path)
              const snapshotMatch = errorMsg.match(/Snapshot at: (.+)$/);
              
              if (snapshotMatch) {
                // Rollback failed - offer retry button
                const snapshotPath = snapshotMatch[1];
                const action = await vscode.window.showErrorMessage(
                  `Failed to update ${componentId}: ${errorMsg}`,
                  'Retry Rollback',
                  'Dismiss'
                );
                
                if (action === 'Retry Rollback') {
                  this.logger.info(`[Updates] User requested manual rollback retry for ${componentId}`);
                  try {
                    const componentInstance = project.componentInstances?.[componentId];
                    if (componentInstance?.path) {
                      await componentUpdater.retryRollback(componentInstance.path, snapshotPath);
                      vscode.window.showInformationMessage(
                        `✓ Successfully restored ${componentId} from backup`
                      );
                      this.logger.info(`[Updates] Manual rollback successful for ${componentId}`);
                    }
                  } catch (retryError) {
                    vscode.window.showErrorMessage(
                      `Manual rollback failed: ${(retryError as Error).message}. Please restore manually from: ${snapshotPath}`
                    );
                    this.logger.error(`[Updates] Manual rollback failed for ${componentId}`, retryError as Error);
                  }
                }
              } else {
                // Normal update failure (rollback succeeded)
                vscode.window.showErrorMessage(
                  `Failed to update ${componentId}: ${errorMsg}`
                );
              }
              
              this.logger.error(`[Updates] Component update failed for ${componentId}`, error as Error);
            }
          }
        }
        
        if (componentUpdateCount > 0) {
          this.logger.info(`[Updates] ✓ ${componentUpdateCount} component(s) updated successfully`);
          progress.report({ message: 'Saving project state...' });
        }
        
        // Save project with updated versions
        if (project) {
          await this.stateManager.saveProject(project);
        }
      }
    );
    
    // Show restart notification if demo was running (outside withProgress for better visibility)
    const componentUpdateCount = Array.from(componentUpdates.entries()).filter(([_, update]) => update.hasUpdate && update.releaseInfo).length;
    if (componentUpdateCount > 0 && project && project.status === 'running') {
      const restart = await vscode.window.showInformationMessage(
        `${componentUpdateCount} component(s) updated. Restart demo to use new versions?`,
        'Restart Now',
        'Later'
      );
      
      if (restart === 'Restart Now') {
        await vscode.commands.executeCommand('demoBuilder.stopDemo');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await vscode.commands.executeCommand('demoBuilder.startDemo');
      }
    }
  }

  /**
   * Perform extension update only
   * This will trigger a reload prompt after installation
   */
  private async performExtensionUpdate(extensionUpdate: any): Promise<void> {
    if (!extensionUpdate.hasUpdate || !extensionUpdate.releaseInfo) {
      return;
    }
    
    const extensionUpdater = new ExtensionUpdater(this.logger);
    await extensionUpdater.updateExtension(
      extensionUpdate.releaseInfo.downloadUrl,
      extensionUpdate.latest
    );
  }
}
