import * as vscode from 'vscode';
import { BaseCommand } from './baseCommand';

export class ViewStatusCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found.');
                const create = await vscode.window.showInformationMessage(
                    'No Demo Builder project found.',
                    'Create Project',
                    'Cancel'
                );
                if (create === 'Create Project') {
                    await vscode.commands.executeCommand('demoBuilder.createProject');
                }
                return;
            }

            // Create status report
            const status = [
                `**Project:** ${project.name}`,
                `**Template:** ${project.template}`,
                `**Status:** ${project.status}`,
                '',
                '### Frontend',
                `- **Status:** ${project.frontend?.status || 'Not configured'}`,
                `- **Port:** ${project.frontend?.port || 'N/A'}`,
                `- **Version:** ${project.frontend?.version || 'N/A'}`,
                '',
                '### API Mesh',
                `- **Status:** ${project.mesh?.status || 'Not deployed'}`,
                `- **Endpoint:** ${project.mesh?.endpoint || 'N/A'}`,
                '',
                '### Commerce',
                `- **Type:** ${project.commerce?.type || 'Not configured'}`,
                `- **URL:** ${project.commerce?.instance.url || 'N/A'}`,
                '',
                '### Demo Inspector',
                `- **Enabled:** ${project.inspector?.enabled ? 'Yes' : 'No'}`,
                `- **Installed:** ${project.inspector?.installed ? 'Yes' : 'No'}`,
            ].join('\n');

            // Show in output channel
            const outputChannel = vscode.window.createOutputChannel('Demo Builder Status');
            outputChannel.clear();
            outputChannel.appendLine('='.repeat(50));
            outputChannel.appendLine('Demo Builder Project Status');
            outputChannel.appendLine('='.repeat(50));
            outputChannel.appendLine('');
            outputChannel.appendLine(status);
            outputChannel.show();

            // Show quick actions
            const actions = [];
            if (project.frontend?.status === 'stopped') {
                actions.push('Start Demo');
            } else if (project.frontend?.status === 'running') {
                actions.push('Stop Demo');
                actions.push('Open Browser');
            }
            actions.push('Configure');

            const action = await vscode.window.showInformationMessage(
                `Project "${project.name}" is ${project.status}`,
                ...actions
            );

            if (action === 'Start Demo') {
                await vscode.commands.executeCommand('demoBuilder.startDemo');
            } else if (action === 'Stop Demo') {
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
            } else if (action === 'Open Browser') {
                const url = `http://localhost:${project.frontend?.port || 3000}`;
                await vscode.env.openExternal(vscode.Uri.parse(url));
            } else if (action === 'Configure') {
                await vscode.commands.executeCommand('demoBuilder.configure');
            }
            
        } catch (error) {
            await this.showError('Failed to get project status', error as Error);
        }
    }
}