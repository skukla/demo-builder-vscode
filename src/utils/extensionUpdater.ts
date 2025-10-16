import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Logger } from './logger';
import { TIMEOUTS } from './timeoutConfig';

export class ExtensionUpdater {
  private logger: Logger;
  private context: vscode.ExtensionContext;

  constructor(logger: Logger, context: vscode.ExtensionContext) {
    this.logger = logger;
    this.context = context;
  }

  /**
   * Download and install extension update via VSIX
   */
  async updateExtension(downloadUrl: string, newVersion: string): Promise<void> {
    this.logger.info(`[Update] Starting extension update to v${newVersion}`);
    
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Updating Demo Builder to v${newVersion}`,
      cancellable: false
    }, async (progress) => {
      // Download VSIX
      progress.report({ message: 'Downloading update...' });
      const vsixPath = await this.downloadVsix(downloadUrl, newVersion);
      
      // Install via VS Code command
      this.logger.info(`[Update] Installing extension from ${vsixPath}`);
      progress.report({ message: 'Installing...' });
      await vscode.commands.executeCommand(
        'workbench.extensions.installExtension',
        vscode.Uri.file(vsixPath)
      );
      
      this.logger.info(`[Update] ✓ Extension installed successfully`);
      
      // Set flag to skip auto-update check on next activation
      await this.context.globalState.update('justUpdatedExtension', true);
      this.logger.debug(`[Update] Set flag to skip auto-check on next reload`);
      
      // Cleanup temp file
      try {
        await fs.unlink(vsixPath);
        this.logger.debug(`[Update] Cleaned up temporary VSIX file`);
      } catch {}
    });
    
    // Show reload prompt AFTER progress notification completes
    const reload = await vscode.window.showInformationMessage(
      `Demo Builder updated to v${newVersion}. Reload window to apply changes?`,
      'Reload Now',
      'Later'
    );
    
    if (reload === 'Reload Now') {
      this.logger.info(`[Update] Reloading window to apply extension update`);
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    } else {
      this.logger.info(`[Update] User chose to reload later`);
    }
  }

  /**
   * Download VSIX file with timeout
   */
  private async downloadVsix(url: string, version: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUTS.UPDATE_DOWNLOAD);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      
      const tempDir = os.tmpdir();
      const vsixPath = path.join(tempDir, `demo-builder-${version}.vsix`);
      
      await fs.writeFile(vsixPath, Buffer.from(buffer));
      
      this.logger.info(`[Update] Downloaded VSIX to ${vsixPath}`);
      return vsixPath;
    } finally {
      clearTimeout(timeout);
    }
  }
}

