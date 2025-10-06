import * as vscode from 'vscode';
import * as path from 'path';
import { Project, ComponentInstance } from '../types';
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
            // Component-based hierarchy
            const items: ProjectTreeItem[] = [];
            
            if (!project.componentInstances || Object.keys(project.componentInstances).length === 0) {
                // Legacy support: fallback to old structure
                return this.getLegacyProjectChildren(project);
            }
            
            // Group components by type
            const frontendComponents = this.getComponentsByType(project, 'frontend');
            const meshComponents = this.getComponentsBySubType(project, 'mesh');
            const dependencyComponents = this.getComponentsByType(project, 'dependency').filter(c => c.subType !== 'mesh');
            const appBuilderComponents = this.getComponentsByType(project, 'app-builder');
            
            // Frontend section
            if (frontendComponents.length > 0) {
                items.push(new ProjectTreeItem(
                    '📱 Frontend',
                    '',
                    vscode.TreeItemCollapsibleState.Expanded,
                    'section-frontend',
                    undefined,
                    project
                ));
            }
            
            // API Mesh section
            if (meshComponents.length > 0) {
                items.push(new ProjectTreeItem(
                    '🔀 API Mesh',
                    '',
                    vscode.TreeItemCollapsibleState.Expanded,
                    'section-mesh',
                    undefined,
                    project
                ));
            }
            
            // Dependencies section
            if (dependencyComponents.length > 0) {
                items.push(new ProjectTreeItem(
                    '🔧 Dependencies',
                    '',
                    vscode.TreeItemCollapsibleState.Expanded,
                    'section-dependencies',
                    undefined,
                    project
                ));
            }
            
            // App Builder section
            if (appBuilderComponents.length > 0) {
                items.push(new ProjectTreeItem(
                    '⚡ App Builder Apps',
                    '',
                    vscode.TreeItemCollapsibleState.Expanded,
                    'section-app-builder',
                    undefined,
                    project
                ));
            }

            return items;
        }
        
        // Handle section expansions
        if (element.contextValue?.startsWith('section-')) {
            return this.getSectionChildren(element, project);
        }
        
        // Handle component children (for expandable components)
        if (element.contextValue === 'component' && element.component) {
            return this.getComponentChildren(element.component, project);
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
    
    /**
     * Get components by type
     */
    private getComponentsByType(project: Project, type: ComponentInstance['type']): ComponentInstance[] {
        if (!project.componentInstances) {
            return [];
        }
        
        return Object.values(project.componentInstances).filter(c => c.type === type);
    }
    
    /**
     * Get components by subType
     */
    private getComponentsBySubType(project: Project, subType: string): ComponentInstance[] {
        if (!project.componentInstances) {
            return [];
        }
        
        return Object.values(project.componentInstances).filter(c => c.subType === subType);
    }
    
    /**
     * Get children for a section
     */
    private getSectionChildren(element: ProjectTreeItem, project: Project): ProjectTreeItem[] {
        const items: ProjectTreeItem[] = [];
        
        switch (element.contextValue) {
            case 'section-frontend':
                const frontendComponents = this.getComponentsByType(project, 'frontend');
                for (const component of frontendComponents) {
                    items.push(this.createComponentItem(component, project));
                }
                break;
                
            case 'section-mesh':
                const meshComponents = this.getComponentsBySubType(project, 'mesh');
                for (const component of meshComponents) {
                    items.push(this.createComponentItem(component, project));
                }
                break;
                
            case 'section-dependencies':
                const dependencies = this.getComponentsByType(project, 'dependency').filter(c => c.subType !== 'mesh');
                for (const component of dependencies) {
                    items.push(this.createComponentItem(component, project));
                }
                break;
                
            case 'section-app-builder':
                const appBuilderComponents = this.getComponentsByType(project, 'app-builder');
                for (const component of appBuilderComponents) {
                    items.push(this.createComponentItem(component, project));
                }
                break;
        }
        
        return items;
    }
    
    /**
     * Create a tree item for a component
     */
    private createComponentItem(component: ComponentInstance, project: Project): ProjectTreeItem {
        const statusEmoji = this.getStatusEmoji(component.status);
        const description = `${statusEmoji} ${component.status}`;
        
        // Determine if component should be expandable (has actions)
        const hasActions = component.path || component.endpoint;
        const collapsibleState = hasActions 
            ? vscode.TreeItemCollapsibleState.Collapsed 
            : vscode.TreeItemCollapsibleState.None;
        
        return new ProjectTreeItem(
            component.name,
            description,
            collapsibleState,
            'component',
            undefined,
            project,
            component
        );
    }
    
    /**
     * Get children (actions) for a component
     */
    private getComponentChildren(component: ComponentInstance, project: Project): ProjectTreeItem[] {
        const items: ProjectTreeItem[] = [];
        
        // Frontend-specific actions
        if (component.type === 'frontend') {
            const isRunning = component.status === 'running';
            
            if (isRunning) {
                // Stop action
                items.push(new ProjectTreeItem(
                    '⏹️ Stop',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    'component-action',
                    {
                        command: 'demoBuilder.stopDemo',
                        title: 'Stop Demo',
                        arguments: []
                    }
                ));
                
                // Open in Browser action
                const port = (component as any).port || 3000;
                items.push(new ProjectTreeItem(
                    '🌐 Open in Browser',
                    `http://localhost:${port}`,
                    vscode.TreeItemCollapsibleState.None,
                    'component-action',
                    {
                        command: 'vscode.open',
                        title: 'Open Browser',
                        arguments: [vscode.Uri.parse(`http://localhost:${port}`)]
                    }
                ));
            } else {
                // Start action
                items.push(new ProjectTreeItem(
                    '▶️ Start',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    'component-action',
                    {
                        command: 'demoBuilder.startDemo',
                        title: 'Start Demo',
                        arguments: []
                    }
                ));
            }
            
            // Port info
            const port = (component as any).port || 3000;
            items.push(new ProjectTreeItem(
                'Port',
                `${port}`,
                vscode.TreeItemCollapsibleState.None,
                'component-info'
            ));
        }
        
        // Mesh-specific actions
        if (component.subType === 'mesh') {
            // Redeploy action
            items.push(new ProjectTreeItem(
                '🔄 Redeploy Mesh',
                '',
                vscode.TreeItemCollapsibleState.None,
                'component-action',
                {
                    command: 'demoBuilder.redeployMesh',
                    title: 'Redeploy Mesh',
                    arguments: [component.id, project]
                }
            ));
            
            // Copy Endpoint action (if endpoint exists)
            if (component.endpoint) {
                items.push(new ProjectTreeItem(
                    '📋 Copy Endpoint',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    'component-action',
                    {
                        command: 'demoBuilder.copyMeshEndpoint',
                        title: 'Copy Endpoint',
                        arguments: [component.endpoint]
                    }
                ));
                
                // Endpoint info (clickable)
                items.push(new ProjectTreeItem(
                    'Endpoint',
                    component.endpoint,
                    vscode.TreeItemCollapsibleState.None,
                    'component-info',
                    {
                        command: 'vscode.open',
                        title: 'Open Endpoint',
                        arguments: [vscode.Uri.parse(component.endpoint)]
                    }
                ));
            }
        }
        
        // Branch info
        if (component.branch) {
            items.push(new ProjectTreeItem(
                'Branch',
                component.branch,
                vscode.TreeItemCollapsibleState.None,
                'component-info'
            ));
        }
        
        // Version/commit info
        if (component.version) {
            items.push(new ProjectTreeItem(
                'Version',
                component.version,
                vscode.TreeItemCollapsibleState.None,
                'component-info'
            ));
        }
        
        return items;
    }
    
    /**
     * Get status emoji for component status
     */
    private getStatusEmoji(status: ComponentInstance['status']): string {
        switch (status) {
            case 'running': return '🟢';
            case 'ready': return '✅';
            case 'deployed': return '☁️';
            case 'stopped': return '⏹️';
            case 'error': return '❌';
            case 'cloning': return '⬇️';
            case 'installing': return '📦';
            case 'starting': return '⏳';
            case 'deploying': return '🚀';
            case 'updating': return '🔄';
            default: return '⚪';
        }
    }
    
    /**
     * Legacy support: get children using old project structure
     */
    private getLegacyProjectChildren(project: Project): ProjectTreeItem[] {
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
}

class ProjectTreeItem extends vscode.TreeItem {
    public project?: Project;
    public component?: ComponentInstance;
    
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly command?: vscode.Command,
        project?: Project,
        component?: ComponentInstance
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.contextValue = contextValue;
        this.project = project;
        this.component = component;
        
        // Set icons based on context
        switch (contextValue) {
            case 'project':
                this.iconPath = new vscode.ThemeIcon('project');
                break;
            case 'section-frontend':
                this.iconPath = new vscode.ThemeIcon('window');
                break;
            case 'section-mesh':
                this.iconPath = new vscode.ThemeIcon('cloud');
                break;
            case 'section-dependencies':
                this.iconPath = new vscode.ThemeIcon('package');
                break;
            case 'section-app-builder':
                this.iconPath = new vscode.ThemeIcon('rocket');
                break;
            case 'component':
                // Icon based on component type
                if (component) {
                    this.iconPath = this.getComponentIcon(component);
                }
                break;
            case 'component-action':
                this.iconPath = new vscode.ThemeIcon('play');
                break;
            case 'component-info':
                this.iconPath = new vscode.ThemeIcon('info');
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
        
        // Add tooltip
        if (component) {
            this.tooltip = this.buildComponentTooltip(component);
        }
    }
    
    private getComponentIcon(component: ComponentInstance): vscode.ThemeIcon {
        if (component.type === 'frontend') {
            return new vscode.ThemeIcon('browser');
        } else if (component.subType === 'mesh') {
            return new vscode.ThemeIcon('cloud');
        } else if (component.subType === 'inspector') {
            return new vscode.ThemeIcon('eye');
        } else if (component.type === 'app-builder') {
            return new vscode.ThemeIcon('rocket');
        } else if (component.type === 'dependency') {
            return new vscode.ThemeIcon('package');
        }
        
        return new vscode.ThemeIcon('circle-outline');
    }
    
    private buildComponentTooltip(component: ComponentInstance): string {
        const lines: string[] = [
            `**${component.name}**`,
            `Type: ${component.type}${component.subType ? ` (${component.subType})` : ''}`,
            `Status: ${component.status}`
        ];
        
        if (component.path) {
            lines.push(`Path: ${component.path}`);
        }
        
        if (component.endpoint) {
            lines.push(`Endpoint: ${component.endpoint}`);
        }
        
        if (component.branch) {
            lines.push(`Branch: ${component.branch}`);
        }
        
        if (component.version) {
            lines.push(`Version: ${component.version}`);
        }
        
        return lines.join('\n');
    }
}