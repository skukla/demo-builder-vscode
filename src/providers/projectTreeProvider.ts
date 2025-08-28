import * as vscode from 'vscode';
import { Project } from '../types';
import { StateManager } from '../utils/stateManager';

export class ProjectTreeProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private stateManager: StateManager;

    constructor(stateManager: StateManager) {
        this.stateManager = stateManager;
        
        // Refresh tree when state changes
        stateManager.onProjectChanged(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
        const project = await this.stateManager.getCurrentProject();
        
        if (!project) {
            return [new ProjectTreeItem(
                'No Project',
                'Click to create a project',
                vscode.TreeItemCollapsibleState.None,
                'empty',
                {
                    command: 'demoBuilder.createProject',
                    title: 'Create Project',
                    arguments: []
                }
            )];
        }

        if (!element) {
            // Root level items
            return [
                new ProjectTreeItem(
                    project.name,
                    `Status: ${project.status}`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'project'
                ),
                new ProjectTreeItem(
                    'Quick Actions',
                    '',
                    vscode.TreeItemCollapsibleState.Expanded,
                    'actions'
                )
            ];
        }

        if (element.contextValue === 'project') {
            // Project details
            const items: ProjectTreeItem[] = [];
            
            // Frontend
            if (project.frontend) {
                items.push(new ProjectTreeItem(
                    'Frontend',
                    `${project.frontend.status} (Port: ${project.frontend.port})`,
                    vscode.TreeItemCollapsibleState.None,
                    'frontend',
                    project.frontend.status === 'running' ? {
                        command: 'demoBuilder.stopDemo',
                        title: 'Stop Demo',
                        arguments: []
                    } : {
                        command: 'demoBuilder.startDemo',
                        title: 'Start Demo',
                        arguments: []
                    }
                ));
            }

            // Mesh
            if (project.mesh) {
                items.push(new ProjectTreeItem(
                    'API Mesh',
                    project.mesh.status,
                    vscode.TreeItemCollapsibleState.None,
                    'mesh'
                ));
            }

            // Commerce
            if (project.commerce) {
                items.push(new ProjectTreeItem(
                    'Commerce',
                    project.commerce.type,
                    vscode.TreeItemCollapsibleState.None,
                    'commerce'
                ));
            }

            // Inspector
            if (project.inspector) {
                items.push(new ProjectTreeItem(
                    'Demo Inspector',
                    project.inspector.enabled ? 'Enabled' : 'Disabled',
                    vscode.TreeItemCollapsibleState.None,
                    'inspector'
                ));
            }

            return items;
        }

        if (element.contextValue === 'actions') {
            // Quick action items
            const actions: ProjectTreeItem[] = [];
            
            if (project.frontend?.status === 'running') {
                actions.push(new ProjectTreeItem(
                    'Stop Demo',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    {
                        command: 'demoBuilder.stopDemo',
                        title: 'Stop Demo',
                        arguments: []
                    }
                ));
                
                actions.push(new ProjectTreeItem(
                    'Open in Browser',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    {
                        command: 'vscode.open',
                        title: 'Open',
                        arguments: [vscode.Uri.parse(`http://localhost:${project.frontend.port}`)]
                    }
                ));
            } else {
                actions.push(new ProjectTreeItem(
                    'Start Demo',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    {
                        command: 'demoBuilder.startDemo',
                        title: 'Start Demo',
                        arguments: []
                    }
                ));
            }

            actions.push(new ProjectTreeItem(
                'Configure',
                '',
                vscode.TreeItemCollapsibleState.None,
                'action',
                {
                    command: 'demoBuilder.configure',
                    title: 'Configure',
                    arguments: []
                }
            ));

            actions.push(new ProjectTreeItem(
                'View Status',
                '',
                vscode.TreeItemCollapsibleState.None,
                'action',
                {
                    command: 'demoBuilder.viewStatus',
                    title: 'View Status',
                    arguments: []
                }
            ));

            return actions;
        }

        return [];
    }
}

class ProjectTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.contextValue = contextValue;
        
        // Set icons based on context
        switch (contextValue) {
            case 'project':
                this.iconPath = new vscode.ThemeIcon('project');
                break;
            case 'frontend':
                this.iconPath = new vscode.ThemeIcon('window');
                break;
            case 'mesh':
                this.iconPath = new vscode.ThemeIcon('cloud');
                break;
            case 'commerce':
                this.iconPath = new vscode.ThemeIcon('database');
                break;
            case 'inspector':
                this.iconPath = new vscode.ThemeIcon('eye');
                break;
            case 'actions':
                this.iconPath = new vscode.ThemeIcon('zap');
                break;
            case 'action':
                this.iconPath = new vscode.ThemeIcon('play');
                break;
            case 'empty':
                this.iconPath = new vscode.ThemeIcon('add');
                break;
        }
        
        if (command) {
            this.command = command;
        }
    }
}