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

            // Get component instances
            const frontendComponent = project.componentInstances?.['citisignal-nextjs'];
            const meshComponent = project.componentInstances?.['commerce-mesh'];
            const inspectorComponent = project.componentInstances?.['demo-inspector'];
            
            // Create status report
            const status = [
                `**Project:** ${project.name}`,
                `**Template:** ${project.template}`,
                `**Status:** ${project.status}`,
                '',
                '### Frontend',
                `- **Status:** ${frontendComponent?.status || 'Not configured'}`,
                `- **Port:** ${frontendComponent?.port || 'N/A'}`,
                `- **Version:** ${frontendComponent?.version || 'N/A'}`,
                '',
                '### API Mesh',
                `- **Status:** ${meshComponent?.status || 'Not deployed'}`,
                `- **Endpoint:** ${meshComponent?.endpoint || 'N/A'}`,
                '',
                '### Commerce',
                `- **Type:** ${project.commerce?.type || 'Not configured'}`,
                `- **URL:** ${project.commerce?.instance.url || 'N/A'}`,
                '',
                '### Demo Inspector',
                `- **Enabled:** ${inspectorComponent ? 'Yes' : 'No'}`,
                `- **Status:** ${inspectorComponent?.status || 'Not installed'}`,
            ].join('\n');

            // Show in output channel using the main logger
            this.logger.info('='.repeat(50));
            this.logger.info('Demo Builder Project Status');
            this.logger.info('='.repeat(50));
            this.logger.info('');
            status.split('\n').forEach(line => {
                this.logger.info(line);
            });

            // Show quick actions
            const actions = [];
            if (project.status === 'ready' || project.status === 'stopped') {
                actions.push('Start Demo');
            } else if (project.status === 'running') {
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
                const url = `http://localhost:${frontendComponent?.port || 3000}`;
                await vscode.env.openExternal(vscode.Uri.parse(url));
            } else if (action === 'Configure') {
                await vscode.commands.executeCommand('demoBuilder.configure');
            }
            
        } catch (error) {
            await this.showError('Failed to get project status', error as Error);
        }
    }
}