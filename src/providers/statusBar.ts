import * as vscode from 'vscode';
import { Project } from '../types';
import { StateManager } from '../utils/stateManager';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private context: vscode.ExtensionContext;
    private stateManager: StateManager;
    private updateInterval: NodeJS.Timeout | undefined;

    constructor(context: vscode.ExtensionContext, stateManager: StateManager) {
        this.context = context;
        this.stateManager = stateManager;
        
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        
        context.subscriptions.push(this.statusBarItem);
    }

    public initialize(): void {
        const showStatusBar = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<boolean>('showStatusBar', true);
        
        if (showStatusBar) {
            this.statusBarItem.show();
            this.updateStatus();
            
            // Update status every 5 seconds
            this.updateInterval = setInterval(() => {
                this.updateStatus();
            }, 5000);
        }
    }

    public updateProject(project: Project): void {
        this.updateStatusForProject(project);
    }

    public clear(): void {
        this.statusBarItem.text = '$(package) Demo Builder';
        this.statusBarItem.tooltip = 'Click to create a project';
        this.statusBarItem.command = 'demoBuilder.createProject';
        this.statusBarItem.backgroundColor = undefined;
    }

    public reset(): void {
        // Clear the status bar and stop updates
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = undefined;
        }
        this.clear();
    }

    private async updateStatus(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();
        
        if (!project) {
            this.clear();
            return;
        }

        this.updateStatusForProject(project);
    }

    private updateStatusForProject(project: Project): void {
        const statusIcons: Record<string, string> = {
            'created': '$(circle-outline)',
            'configuring': '$(sync~spin)',
            'ready': '$(check)',
            'running': '$(play)',
            'stopped': '$(stop)',
            'error': '$(error)'
        };

        const statusColors: Record<string, vscode.ThemeColor | undefined> = {
            'running': new vscode.ThemeColor('statusBarItem.prominentBackground'),
            'error': new vscode.ThemeColor('statusBarItem.errorBackground'),
            'configuring': new vscode.ThemeColor('statusBarItem.warningBackground')
        };

        const icon = statusIcons[project.status] || '$(question)';
        const frontendStatus = project.frontend?.status || 'unknown';
        
        // Build status text
        let statusText = `${icon} Demo: ${project.name}`;
        
        if (frontendStatus === 'running' && project.frontend?.port) {
            statusText += ` $(server) :${project.frontend.port}`;
        }

        // Build tooltip
        const tooltipLines = [
            `Project: ${project.name}`,
            `Status: ${project.status}`,
            `Frontend: ${frontendStatus}`
        ];

        if (project.mesh?.endpoint) {
            tooltipLines.push(`Mesh: ${project.mesh.status}`);
        }

        tooltipLines.push('', 'Click to view status');

        // Update status bar
        this.statusBarItem.text = statusText;
        this.statusBarItem.tooltip = tooltipLines.join('\n');
        this.statusBarItem.command = 'demoBuilder.viewStatus';
        this.statusBarItem.backgroundColor = statusColors[project.status];

        // Show/hide based on settings
        const showStatusBar = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<boolean>('showStatusBar', true);
        
        if (showStatusBar) {
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }

    public setLoading(message: string = 'Loading...'): void {
        this.statusBarItem.text = `$(sync~spin) ${message}`;
        this.statusBarItem.tooltip = message;
        this.statusBarItem.command = undefined;
    }

    public setError(message: string): void {
        this.statusBarItem.text = `$(error) ${message}`;
        this.statusBarItem.tooltip = message;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.statusBarItem.command = 'demoBuilder.viewStatus';
    }

    public dispose(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.statusBarItem.dispose();
    }
}