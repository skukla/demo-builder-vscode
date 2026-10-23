import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { numberedSteps } from '@/core/utils/numberedSteps';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { stageLine } from '@/core/utils/stageLine';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { askDuringOperation } from '@/core/vscode/operationPrompt';
import { withProgressRegister } from '@/core/vscode/progressRegister';
import type { Logger } from '@/types/logger';

/** An extension update's steps, in order. */
const STEPS = [OPERATION_STAGES.downloadingUpdate.label, OPERATION_STAGES.installingUpdate.label];

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

        // Through the shared register, so an agent hears the steps too; two steps from
        // the stage table, numbered.
        await withProgressRegister({ title: `Updating Demo Builder to v${newVersion}` }, async (narrate) => {
            const step = numberedSteps(STEPS, (stage, _step, at) => narrate(stageLine(stage, at)));
            step(OPERATION_STAGES.downloadingUpdate.label);
            const vsixPath = await this.downloadVsix(downloadUrl, newVersion);

            step(OPERATION_STAGES.installingUpdate.label);
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
      
            // Asked in the Updates modal when it runs there (PL-80), otherwise a notification.
            const reload = await askDuringOperation(
                {
                    title: 'Reload to finish updating',
                    message: `Demo Builder updated to v${newVersion}. Reload the window to start using it?`,
                },
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
        const { validateGitHubDownloadURL } = await import('@/core/validation/URLValidator');
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

