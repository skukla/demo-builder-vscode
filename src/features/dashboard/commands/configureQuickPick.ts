import * as path from 'path';
import * as vscode from 'vscode';
import { Project } from '@/types';
import { BaseCommand } from '@/core/base';

export class ConfigureQuickPickCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found to configure.');
                return;
            }

            const inspectorComponent = project.componentInstances?.['demo-inspector'];
            const frontendComponent = project.componentInstances?.['citisignal-nextjs'];
            
            const options = [
                {
                    label: '$(edit) Edit Environment Variables',
                    description: 'Open .env file',
                    value: 'env',
                },
                {
                    label: '$(eye) Toggle Demo Inspector',
                    description: `Currently: ${inspectorComponent ? 'Enabled' : 'Disabled'}`,
                    value: 'inspector',
                },
                {
                    label: '$(cloud) Update Mesh Configuration',
                    description: 'Redeploy API Mesh',
                    value: 'mesh',
                },
                {
                    label: '$(server) Change Frontend Port',
                    description: `Current: ${frontendComponent?.port || 3000}`,
                    value: 'port',
                },
                {
                    label: '$(gear) Advanced Configuration',
                    description: 'Edit project configuration file',
                    value: 'advanced',
                },
            ];

            const selection = await this.showQuickPick(options, {
                placeHolder: 'What would you like to configure?',
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

    private async editEnvironmentFile(project: Project): Promise<void> {
        const envPath = path.join(project.path, '.env');
        const document = await vscode.workspace.openTextDocument(envPath);
        await vscode.window.showTextDocument(document);
    }

    private async toggleInspector(project: Project): Promise<void> {
        const inspectorComponent = project.componentInstances?.['demo-inspector'];
        if (!inspectorComponent) {
            await this.showWarning('Inspector component not found in project');
            return;
        }

        // Toggle the inspector component status
        const newStatus = inspectorComponent.status === 'running' ? 'stopped' : 'running';
        inspectorComponent.status = newStatus;
        await this.stateManager.saveProject(project);

        const status = newStatus === 'running' ? 'enabled' : 'disabled';
        await this.showInfo(`Demo Inspector ${status}`);

        const frontendComponent = project.componentInstances?.['citisignal-nextjs'];
        if (frontendComponent?.status === 'running') {
            await vscode.window.showInformationMessage(
                'Restart the demo to apply changes',
                'Restart Now',
            ).then(selection => {
                if (selection === 'Restart Now') {
                    vscode.commands.executeCommand('demoBuilder.stopDemo').then(() => {
                        vscode.commands.executeCommand('demoBuilder.startDemo');
                    });
                }
            });
        }
    }

    private async updateMesh(_project: Project): Promise<void> {
        const confirm = await this.confirm(
            'Redeploy API Mesh?',
            'This will update the mesh configuration and redeploy it to Adobe.',
        );

        if (confirm) {
            // Implementation for mesh update
            await this.showInfo('Mesh update functionality coming soon');
        }
    }

    private async changePort(project: Project): Promise<void> {
        const frontendComponent = project.componentInstances?.['citisignal-nextjs'];
        if (!frontendComponent) {
            await this.showWarning('Frontend component not found in project');
            return;
        }

        const newPort = await this.showInputBox({
            prompt: 'Enter new port number',
            value: String(frontendComponent.port || 3000),
            validateInput: (value) => {
                const port = parseInt(value);
                if (isNaN(port)) return 'Port must be a number';
                if (port < 1024 || port > 65535) return 'Port must be between 1024 and 65535';
                return undefined;
            },
        });

        if (newPort) {
            frontendComponent.port = parseInt(newPort);
            await this.stateManager.saveProject(project);
            await this.showInfo(`Port changed to ${newPort}`);

            if (frontendComponent.status === 'running') {
                await vscode.window.showInformationMessage(
                    'Restart the demo to apply the port change',
                    'Restart Now',
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

    private async openAdvancedConfig(project: Project): Promise<void> {
        const configPath = path.join(project.path, 'config.yaml');
        try {
            const document = await vscode.workspace.openTextDocument(configPath);
            await vscode.window.showTextDocument(document);
        } catch {
            await this.showWarning('Configuration file not found');
        }
    }
}