import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Logger } from '@/types/logger';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

export class ExtensionUpdater {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
   * Download and install extension update via VSIX
   */
    async updateExtension(downloadUrl: string, newVersion: string): Promise<void> {
        this.logger.debug(`[Updates] Starting extension update to v${newVersion}`);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Updating Demo Builder to v${newVersion}`,
            cancellable: false,
        }, async (progress) => {
            // Download VSIX
            progress.report({ message: 'Downloading update...' });
            const vsixPath = await this.downloadVsix(downloadUrl, newVersion);
      
            // Install via VS Code command
            progress.report({ message: 'Installing...' });
            this.logger.debug(`[Updates] Installing extension from ${vsixPath}`);
            await vscode.commands.executeCommand(
                'workbench.extensions.installExtension',
                vscode.Uri.file(vsixPath),
            );
            this.logger.info('[Updates] ✓ Extension installed successfully');
      
            // Cleanup temp file
            try {
                await fs.unlink(vsixPath);
            } catch {
                // Ignore cleanup errors
            }
      
            // Prompt for reload
            const reload = await vscode.window.showInformationMessage(
                `Demo Builder updated to v${newVersion}. Reload window to apply changes?`,
                'Reload Now',
                'Later',
            );

            if (reload === 'Reload Now') {
                this.logger.debug('[Updates] Reloading window to apply extension update');
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            } else {
                this.logger.debug('[Updates] User chose to reload later');
            }
        });
    }

    /**
   * Download VSIX file with timeout
   */
    private async downloadVsix(url: string, version: string): Promise<string> {
        // SECURITY: Validate GitHub URL before downloading
        const { validateGitHubDownloadURL } = await import('@/core/validation');
        try {
            validateGitHubDownloadURL(url);
        } catch (error) {
            this.logger.error('[Updates] Download URL validation failed', error as Error);
            throw new Error(`Security check failed: ${(error as Error).message}`);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUTS.AUTH.BROWSER);

        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) {
                throw new Error(`Download failed: HTTP ${response.status}`);
            }
            const buffer = await response.arrayBuffer();

            const tempDir = os.tmpdir();
            const vsixPath = path.join(tempDir, `demo-builder-${version}.vsix`);

            await fs.writeFile(vsixPath, Buffer.from(buffer));

            this.logger.debug(`[Updates] Downloaded VSIX to ${vsixPath}`);
            return vsixPath;
        } finally {
            clearTimeout(timeout);
        }
    }
}

