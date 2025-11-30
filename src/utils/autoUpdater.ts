import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import axios from 'axios';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { Logger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { UpdateInfo } from '@/types';

export class AutoUpdater {
    private context: vscode.ExtensionContext;
    private logger: Logger;
    private updateCheckInterval: NodeJS.Timeout | undefined;
    private readonly UPDATE_CHECK_URL = 'https://api.github.com/repos/skukla/demo-builder-vscode/releases/latest';

    constructor(context: vscode.ExtensionContext, logger: Logger) {
        this.context = context;
        this.logger = logger;
        
        // Check for updates every 4 hours
        this.updateCheckInterval = setInterval(() => {
            this.checkForUpdates().catch(err => {
                this.logger.warn('Auto-update check failed:', err.message);
            });
        }, TIMEOUTS.AUTO_UPDATE_CHECK_INTERVAL);
    }

    public async checkForUpdates(): Promise<UpdateInfo | undefined> {
        try {
            const currentVersion = this.context.extension.packageJSON.version;
            // Debug level for background checks (only log to info when update found)
            this.logger.debug(`[Updates] Background check starting (current: ${currentVersion})`);

            // For development, use mock data
            if (process.env.NODE_ENV === 'development') {
                return this.getMockUpdateInfo();
            }

            // Fetch latest release from GitHub
            const response = await axios.get(this.UPDATE_CHECK_URL, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                },
                timeout: TIMEOUTS.UPDATE_CHECK,
            });

            const latestVersion = response.data.tag_name.replace('v', '');
            
            // Compare versions
            if (semver.gt(latestVersion, currentVersion)) {
                const vsixAsset = response.data.assets.find((asset: { name: string }) =>
                    asset.name.endsWith('.vsix'),
                );

                if (vsixAsset) {
                    const updateInfo: UpdateInfo = {
                        version: latestVersion,
                        critical: response.data.body?.includes('[CRITICAL]') || false,
                        downloadUrl: vsixAsset.browser_download_url,
                        changelogUrl: response.data.html_url,
                        releaseDate: response.data.published_at,
                        minSupportedVersion: '1.0.0',
                    };

                    this.logger.info(`[Updates] Update available: ${latestVersion}`);
                    return updateInfo;
                }
            }

            // Debug level for background checks (don't spam user logs)
            this.logger.debug('[Updates] Background check: no updates available');
            return undefined;

        } catch (error) {
            // Silently handle 404 errors (repository doesn't exist yet)
            if (error && typeof error === 'object' && 'response' in error) {
                const axiosError = error as { response?: { status: number } };
                if (axiosError.response?.status === 404) {
                    this.logger.debug('Update repository not available yet');
                } else {
                    this.logger.error('Failed to check for updates', error as unknown as Error);
                }
            } else {
                this.logger.error('Failed to check for updates', error as Error);
            }
            return undefined;
        }
    }

    private getMockUpdateInfo(): UpdateInfo | undefined {
        // For development/testing
        return undefined;
    }

    public async downloadAndInstall(updateInfo: UpdateInfo): Promise<void> {
        try {
            this.logger.info(`[Updates] Downloading update ${updateInfo.version}...`);
            
            // Download VSIX to temp directory
            const tempDir = os.tmpdir();
            const vsixPath = path.join(tempDir, `demo-builder-${updateInfo.version}.vsix`);
            
            const response = await axios.get(updateInfo.downloadUrl, {
                responseType: 'arraybuffer',
                timeout: TIMEOUTS.UPDATE_DOWNLOAD,
                onDownloadProgress: (progressEvent) => {
                    const percentCompleted = progressEvent.total 
                        ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
                        : 0;
                    this.logger.debug(`Download progress: ${percentCompleted}%`);
                },
            });

            await fs.writeFile(vsixPath, Buffer.from(response.data));
            this.logger.info(`[Updates] Downloaded to: ${vsixPath}`);

            // Install the extension
            await vscode.commands.executeCommand(
                'workbench.extensions.installExtension',
                vscode.Uri.file(vsixPath),
            );

            // Prompt to reload
            const reload = await vscode.window.showInformationMessage(
                `Demo Builder ${updateInfo.version} has been installed. Reload to apply the update?`,
                'Reload Now',
                'Later',
            );

            if (reload === 'Reload Now') {
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            }

            // Clean up temp file
            try {
                await fs.unlink(vsixPath);
            } catch {
                // Ignore cleanup errors
            }

        } catch (error) {
            this.logger.error('Failed to download and install update', error as Error);
            throw error;
        }
    }

    public dispose(): void {
        if (this.updateCheckInterval) {
            clearInterval(this.updateCheckInterval);
        }
    }
}