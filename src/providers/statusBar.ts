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
            100,
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
        const status = project.status;
        const port = project.componentInstances?.['citisignal-nextjs']?.port;
        
        // Status indicator and colors based on state
        let statusDot = '○';
        let backgroundColor: vscode.ThemeColor | undefined = undefined;
        let statusLabel = '';
        
        switch (status) {
            case 'starting':
                statusDot = '$(sync~spin)';
                statusLabel = 'Starting';
                break;
            case 'running':
                statusDot = '●';
                backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
                statusLabel = 'Running';
                break;
            case 'stopping':
                statusDot = '$(sync~spin)';
                statusLabel = 'Stopping';
                break;
            case 'stopped':
            case 'ready':
                statusDot = '○';
                statusLabel = 'Stopped';
                break;
            case 'configuring':
                statusDot = '$(sync~spin)';
                statusLabel = 'Configuring';
                break;
            case 'error':
                statusDot = '$(error)';
                backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                statusLabel = 'Error';
                break;
            default:
                statusDot = '○';
                statusLabel = 'Ready';
        }
        
        // Build status text - minimal and clean
        let statusText = `${statusDot} Demo: ${project.name}`;
        
        if (status === 'running' && port) {
            statusText += ` :${port}`;
        }

        // Build tooltip
        const tooltipLines = [
            `Project: ${project.name}`,
            `Status: ${statusLabel}`,
        ];

        if (status === 'running' && port) {
            tooltipLines.push(`Port: ${port}`);
        }

        const meshComponent = project.componentInstances?.['commerce-mesh'];
        if (meshComponent?.endpoint) {
            tooltipLines.push(`Mesh: ${meshComponent.status || 'deployed'}`);
        }

        tooltipLines.push('', 'Click to open Project Dashboard');

        // Update status bar
        this.statusBarItem.text = statusText;
        this.statusBarItem.tooltip = tooltipLines.join('\n');
        this.statusBarItem.command = 'demoBuilder.showProjectDashboard'; // Open Project Dashboard
        this.statusBarItem.backgroundColor = backgroundColor;

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

    public setLoading(message = 'Loading...'): void {
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