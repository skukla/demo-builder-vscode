import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import type { Project } from '@/types/base';
import { getComponentInstancesByType } from '@/types/typeGuards';

export class ViewStatusCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.handleNoProject();
                return;
            }

            this.logProjectStatus(project);
            await this.handleUserAction(project);
        } catch (error) {
            await this.showError('Failed to get project status', error as Error);
        }
    }

    private async handleNoProject(): Promise<void> {
        await this.showWarning('No project found.');
        const create = await vscode.window.showInformationMessage(
            'No Demo Builder project found.',
            'Create Project',
            'Cancel',
        );
        if (create === 'Create Project') {
            await vscode.commands.executeCommand('demoBuilder.createProject');
        }
    }

    private buildStatusReport(project: Project): string {
        const frontendComponent = getComponentInstancesByType(project, 'frontend')[0];
        const meshComponent = getComponentInstancesByType(project, 'mesh')[0];
        const inspectorComponent = project.componentInstances?.['demo-inspector'];

        return [
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
            `- **Endpoint:** ${project.meshState?.endpoint || meshComponent?.endpoint || 'N/A'}`,
            '',
            '### Commerce',
            `- **Type:** ${project.commerce?.type || 'Not configured'}`,
            `- **URL:** ${project.commerce?.instance.url || 'N/A'}`,
            '',
            '### Demo Inspector',
            `- **Enabled:** ${inspectorComponent ? 'Yes' : 'No'}`,
            `- **Status:** ${inspectorComponent?.status || 'Not installed'}`,
        ].join('\n');
    }

    private logProjectStatus(project: Project): void {
        const status = this.buildStatusReport(project);

        this.logger.info('='.repeat(50));
        this.logger.info('Demo Builder Project Status');
        this.logger.info('='.repeat(50));
        this.logger.info('');
        status.split('\n').forEach(line => {
            this.logger.info(line);
        });
    }

    private getAvailableActions(project: Project): string[] {
        const actions = [];
        if (project.status === 'ready' || project.status === 'stopped') {
            actions.push('Start Demo');
        } else if (project.status === 'running') {
            actions.push('Stop Demo');
            actions.push('Open Browser');
        }
        actions.push('Configure');
        return actions;
    }

    private async handleUserAction(project: Project): Promise<void> {
        const actions = this.getAvailableActions(project);
        const action = await vscode.window.showInformationMessage(
            `Project "${project.name}" is ${project.status}`,
            ...actions,
        );

        await this.executeAction(action, project);
    }

    private async executeAction(action: string | undefined, project: Project): Promise<void> {
        if (!action) {
            return;
        }

        switch (action) {
            case 'Start Demo':
                await vscode.commands.executeCommand('demoBuilder.startDemo');
                break;
            case 'Stop Demo':
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
                break;
            case 'Open Browser':
                await this.openBrowser(project);
                break;
            case 'Configure':
                await vscode.commands.executeCommand('demoBuilder.configure');
                break;
        }
    }

    private async openBrowser(project: Project): Promise<void> {
        const frontendComponent = getComponentInstancesByType(project, 'frontend')[0];
        const url = `http://localhost:${frontendComponent?.port || 3000}`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }
}
