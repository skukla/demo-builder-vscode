import * as vscode from 'vscode';
import * as path from 'path';
import { BaseCommand } from './baseCommand';

export class ConfigureCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found to configure.');
                return;
            }

            const options = [
                {
                    label: '$(edit) Edit Environment Variables',
                    description: 'Open .env file',
                    value: 'env'
                },
                {
                    label: '$(eye) Toggle Demo Inspector',
                    description: `Currently: ${project.inspector?.enabled ? 'Enabled' : 'Disabled'}`,
                    value: 'inspector'
                },
                {
                    label: '$(cloud) Update Mesh Configuration',
                    description: 'Redeploy API Mesh',
                    value: 'mesh'
                },
                {
                    label: '$(server) Change Frontend Port',
                    description: `Current: ${project.frontend?.port || 3000}`,
                    value: 'port'
                },
                {
                    label: '$(gear) Advanced Configuration',
                    description: 'Edit project configuration file',
                    value: 'advanced'
                }
            ];

            const selection = await this.showQuickPick(options, {
                placeHolder: 'What would you like to configure?'
            });

            if (!selection) {
                return;
            }

            switch (selection.value) {
                case 'env':
                    await this.editEnvironmentFile(project);
                    break;
                case 'inspector':
                    await this.toggleInspector(project);
                    break;
                case 'mesh':
                    await this.updateMesh(project);
                    break;
                case 'port':
                    await this.changePort(project);
                    break;
                case 'advanced':
                    await this.openAdvancedConfig(project);
                    break;
            }
            
        } catch (error) {
            await this.showError('Configuration failed', error as Error);
        }
    }

    private async editEnvironmentFile(project: any): Promise<void> {
        const envPath = path.join(project.path, '.env');
        const document = await vscode.workspace.openTextDocument(envPath);
        await vscode.window.showTextDocument(document);
    }

    private async toggleInspector(project: any): Promise<void> {
        project.inspector!.enabled = !project.inspector!.enabled;
        await this.stateManager.saveProject(project);
        
        const status = project.inspector!.enabled ? 'enabled' : 'disabled';
        await this.showInfo(`Demo Inspector ${status}`);
        
        if (project.frontend?.status === 'running') {
            await vscode.window.showInformationMessage(
                'Restart the demo to apply changes',
                'Restart Now'
            ).then(selection => {
                if (selection === 'Restart Now') {
                    vscode.commands.executeCommand('demoBuilder.stopDemo').then(() => {
                        vscode.commands.executeCommand('demoBuilder.startDemo');
                    });
                }
            });
        }
    }

    private async updateMesh(project: any): Promise<void> {
        const confirm = await this.confirm(
            'Redeploy API Mesh?',
            'This will update the mesh configuration and redeploy it to Adobe.'
        );
        
        if (confirm) {
            // Implementation for mesh update
            await this.showInfo('Mesh update functionality coming soon');
        }
    }

    private async changePort(project: any): Promise<void> {
        const newPort = await this.showInputBox({
            prompt: 'Enter new port number',
            value: String(project.frontend?.port || 3000),
            validateInput: (value) => {
                const port = parseInt(value);
                if (isNaN(port)) return 'Port must be a number';
                if (port < 1024 || port > 65535) return 'Port must be between 1024 and 65535';
                return undefined;
            }
        });

        if (newPort) {
            project.frontend!.port = parseInt(newPort);
            await this.stateManager.saveProject(project);
            await this.showInfo(`Port changed to ${newPort}`);
            
            if (project.frontend?.status === 'running') {
                await vscode.window.showInformationMessage(
                    'Restart the demo to apply the port change',
                    'Restart Now'
                ).then(selection => {
                    if (selection === 'Restart Now') {
                        vscode.commands.executeCommand('demoBuilder.stopDemo').then(() => {
                            vscode.commands.executeCommand('demoBuilder.startDemo');
                        });
                    }
                });
            }
        }
    }

    private async openAdvancedConfig(project: any): Promise<void> {
        const configPath = path.join(project.path, 'config.yaml');
        try {
            const document = await vscode.workspace.openTextDocument(configPath);
            await vscode.window.showTextDocument(document);
        } catch {
            await this.showWarning('Configuration file not found');
        }
    }
}