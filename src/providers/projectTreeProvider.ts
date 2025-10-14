import * as vscode from 'vscode';
import { Project } from '../types';
import { StateManager } from '../utils/stateManager';

/**
 * Tree provider for demo controls panel
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
            // No project - return empty (Components view handles welcome message)
            return [];
        }

        return this.getControlActions(project);
    }
    
    /**
     * Get list of management actions
     */
    private getControlActions(project: Project): ControlAction[] {
        try {
            const actions: ControlAction[] = [];
            
            // Deploy Mesh (if mesh component exists)
            try {
                if (this.hasMeshComponent(project)) {
                    actions.push(
                        new ControlAction(
                            'Deploy Mesh',
                            'Deploy API Mesh to Adobe I/O',
                            'cloud-upload',
                            'demoBuilder.deployMesh',
                        ),
                    );
                }
            } catch (meshError) {
                console.error('[TreeView] Error checking mesh component:', meshError);
            }
            
            // Configuration
            actions.push(
                new ControlAction(
                    'Configure',
                    'Edit environment variables',
                    'settings-gear',
                    'demoBuilder.configure',
                ),
            );
            
            // Delete project
            actions.push(
                new ControlAction(
                    'Delete Project',
                    'Delete this project',
                    'trash',
                    'demoBuilder.deleteProject',
                ),
            );
            
            return actions;
        } catch (error) {
            console.error('[TreeView] Error building control actions:', error);
            return [
                new ControlAction(
                    'Error',
                    'Try reloading VSCode',
                    'error',
                    undefined,
                ),
            ];
        }
    }
    
    /**
     * Check if project has a mesh component
     */
    private hasMeshComponent(project: Project): boolean {
        try {
            if (!project?.componentInstances) {
                return false;
            }
            
            return Object.values(project.componentInstances).some(c => c && c.subType === 'mesh');
        } catch (error) {
            console.error('[TreeView] Error checking mesh component:', error);
            return false;
        }
    }
    
    /**
     * Get mesh component from project
     */
    private getMeshComponent(project: Project) {
        try {
            if (!project?.componentInstances) {
                return null;
            }
            
            // Find the mesh component by ID (commerce-mesh)
            const meshComponent = project.componentInstances['commerce-mesh'];
            if (meshComponent) {
                return meshComponent;
            }
            
            // Fallback: search by subType or any component with 'mesh' in the ID
            return Object.entries(project.componentInstances).find(([id, c]) => 
                c && (c.subType === 'mesh' || id.includes('mesh')),
            )?.[1] || null;
        } catch (error) {
            console.error('[TreeView] Error getting mesh component:', error);
            return null;
        }
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
        commandArgs?: unknown[],
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
                arguments: commandArgs || [],
            };
        }
        
        this.contextValue = 'action';
    }
}
