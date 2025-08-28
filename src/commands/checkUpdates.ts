import * as vscode from 'vscode';
import { BaseCommand } from './baseCommand';
import { AutoUpdater } from '../utils/autoUpdater';

export class CheckUpdatesCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            await this.withProgress('Checking for updates...', async (progress) => {
                const updater = new AutoUpdater(this.context, this.logger);
                
                progress.report({ message: 'Connecting to update server...' });
                const updateInfo = await updater.checkForUpdates();
                
                if (!updateInfo) {
                    await this.showInfo('You are running the latest version!');
                    return;
                }

                progress.report({ message: 'Update available!' });
                
                const message = updateInfo.critical 
                    ? `Critical update ${updateInfo.version} is available`
                    : `Version ${updateInfo.version} is available`;
                
                const action = await vscode.window.showInformationMessage(
                    message,
                    'Install Now',
                    'View Changelog',
                    'Later'
                );

                if (action === 'Install Now') {
                    progress.report({ message: 'Downloading update...' });
                    await updater.downloadAndInstall(updateInfo);
                } else if (action === 'View Changelog') {
                    if (updateInfo.changelogUrl) {
                        await vscode.env.openExternal(vscode.Uri.parse(updateInfo.changelogUrl));
                    }
                }
            });
        } catch (error) {
            await this.showError('Failed to check for updates', error as Error);
        }
    }
}