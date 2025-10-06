import * as vscode from 'vscode';
import { Project } from '../types';
import { StateManager } from '../utils/stateManager';

/**
 * Simple control panel provider for Demo Builder
 * Shows as a collapsible panel under the Explorer file tree
 */
export class ProjectTreeProvider implements vscode.TreeDataProvider<ControlAction> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ControlAction | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private stateManager: StateManager;

    constructor(stateManager: StateManager) {
        this.stateManager = stateManager;
        
        // Refresh tree when project state changes
        stateManager.onProjectChanged(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ControlAction): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<ControlAction[]> {
        const project = await this.stateManager.getCurrentProject();
        
        if (!project) {
            // No project - shouldn't happen due to "when" clause, but provide fallback
            return [
                new ControlAction(
                    'No Project',
                    'Click to create',
                    'add',
                    'demoBuilder.createProject'
                )
            ];
        }

        return this.getControlActions(project);
    }
    
    /**
     * Get flat list of control actions based on project state
     */
    private getControlActions(project: Project): ControlAction[] {
        const actions: ControlAction[] = [];
        const isRunning = project.frontend?.status === 'running' || project.status === 'running';
        const port = project.frontend?.port || 3000;
        
        // Primary control: Start or Stop
        if (isRunning) {
            actions.push(
                new ControlAction(
                    'Stop Demo',
                    'Stop the running demo',
                    'debug-stop',
                    'demoBuilder.stopDemo'
                )
            );
            
            actions.push(
                new ControlAction(
                    'Open in Browser',
                    `http://localhost:${port}`,
                    'globe',
                    'vscode.open',
                    [vscode.Uri.parse(`http://localhost:${port}`)]
                )
            );
        } else {
            actions.push(
                new ControlAction(
                    'Start Demo',
                    'Start the demo frontend',
                    'debug-start',
                    'demoBuilder.startDemo'
                )
            );
        }
        
        // API Mesh info (if exists)
        if (project.mesh || this.hasMeshComponent(project)) {
            const meshComponent = this.getMeshComponent(project);
            if (meshComponent?.endpoint) {
                actions.push(
                    new ControlAction(
                        'API Mesh Endpoint',
                        meshComponent.endpoint,
                        'cloud',
                        'vscode.open',
                        [vscode.Uri.parse(meshComponent.endpoint)]
                    )
                );
            }
        }
        
        // Separator
        actions.push(
            new ControlAction(
                '───────────',
                '',
                undefined,
                undefined
            )
        );
        
        // Configuration actions
        actions.push(
            new ControlAction(
                'Configure',
                'Edit project configuration',
                'settings-gear',
                'demoBuilder.configure'
            )
        );
        
        actions.push(
            new ControlAction(
                'View Status',
                'View detailed project status',
                'info',
                'demoBuilder.viewStatus'
            )
        );
        
        actions.push(
            new ControlAction(
                'Delete Project',
                'Delete this project',
                'trash',
                'demoBuilder.deleteProject'
            )
        );
        
        return actions;
    }
    
    /**
     * Check if project has a mesh component
     */
    private hasMeshComponent(project: Project): boolean {
        if (!project.componentInstances) {
            return false;
        }
        
        return Object.values(project.componentInstances).some(c => c.subType === 'mesh');
    }
    
    /**
     * Get mesh component from project
     */
    private getMeshComponent(project: Project) {
        if (!project.componentInstances) {
            return null;
        }
        
        return Object.values(project.componentInstances).find(c => c.subType === 'mesh');
    }
}

/**
 * Tree item representing a control action
 */
class ControlAction extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        iconId?: string,
        commandId?: string,
        commandArgs?: any[]
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        
        this.description = description;
        
        if (iconId) {
            this.iconPath = new vscode.ThemeIcon(iconId);
        }
        
        if (commandId) {
            this.command = {
                command: commandId,
                title: label,
                arguments: commandArgs || []
            };
        }
        
        // Disable command for separator
        if (label.startsWith('───')) {
            this.command = undefined;
            this.iconPath = undefined;
            this.contextValue = 'separator';
        }
    }
}
