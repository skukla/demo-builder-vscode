import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Project, CustomIconPaths } from '../types';
import { StateManager } from '../utils/stateManager';

type FileSystemItem = ComponentFolder | FileItem;

/**
 * Tree provider for displaying project components as a file browser
 */
export class ComponentTreeProvider implements vscode.TreeDataProvider<FileSystemItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<FileSystemItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private stateManager: StateManager;
    private extensionPath: string;

    constructor(stateManager: StateManager, extensionPath: string) {
        this.stateManager = stateManager;
        this.extensionPath = extensionPath;
        
        // Refresh tree when project state changes
        stateManager.onProjectChanged(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileSystemItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: FileSystemItem): Promise<FileSystemItem[]> {
        const project = await this.stateManager.getCurrentProject();
        
        if (!project) {
            // No project - show welcome message
            return [
                new FileItem(
                    'Get Started',
                    'Click here or use the Activity Bar icon to create your first demo project',
                    true
                )
            ];
        }

        // Root level: show component folders
        if (!element) {
            const items: FileSystemItem[] = [];
            
            if (project.componentInstances) {
                for (const [key, component] of Object.entries(project.componentInstances)) {
                    if (component && component.path) {
                        // Pass component icon and subType for custom icons
                        const icon = component.icon || null;
                        const subType = component.subType || null;
                        items.push(new ComponentFolder(component.name, component.path, icon, subType, this.extensionPath));
                    }
                }
            }
            
            return items;
        }

        // Expanding a component folder or subfolder - show its contents
        if (element instanceof ComponentFolder) {
            return this.getFileSystemChildren(element.fsPath);
        }
        
        return [];
    }

    /**
     * Get files and folders in a directory
     */
    private getFileSystemChildren(dirPath: string): FileSystemItem[] {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const items: FileSystemItem[] = [];

            for (const entry of entries) {
                // Skip hidden files and common ignore patterns
                // Exception: Allow .env* files (important configuration)
                const isEnvFile = entry.name.startsWith('.env');
                if ((entry.name.startsWith('.') && !isEnvFile) || 
                    entry.name === 'node_modules' || 
                    entry.name === 'dist' ||
                    entry.name === '.next') {
                    continue;
                }

                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    items.push(new ComponentFolder(entry.name, fullPath));
                } else {
                    items.push(new FileItem(entry.name, fullPath));
                }
            }

            // Sort: folders first, then files, alphabetically
            return items.sort((a, b) => {
                if (a instanceof ComponentFolder && !(b instanceof ComponentFolder)) {
                    return -1;
                }
                if (!(a instanceof ComponentFolder) && b instanceof ComponentFolder) {
                    return 1;
                }
                return a.label.localeCompare(b.label);
            });
        } catch (error) {
            return [];
        }
    }
}

/**
 * Tree item representing a folder (component root or subfolder)
 */
class ComponentFolder extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly fsPath: string,
        customIcon?: string | CustomIconPaths | null,
        subType?: string | null,
        private extensionPath?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        
        this.resourceUri = vscode.Uri.file(fsPath);
        
        // Use custom icon if provided
        if (customIcon) {
            if (typeof customIcon === 'string') {
                // String = VSCode ThemeIcon (codicon)
                this.iconPath = new vscode.ThemeIcon(customIcon);
            } else {
                // Object = custom icon paths for light/dark themes
                this.iconPath = this.resolveCustomIconPaths(customIcon);
            }
        } else if (subType) {
            // Fallback: use subType-based icon if no custom icon
            const iconMap: { [key: string]: string } = {
                'mesh': 'server-process',
                'inspector': 'eye',
                'service': 'link',
                'utility': 'tools'
            };
            this.iconPath = new vscode.ThemeIcon(iconMap[subType] || 'folder');
        } else {
            this.iconPath = vscode.ThemeIcon.Folder;
        }
        
        this.contextValue = 'folder';
    }

    /**
     * Resolve custom icon paths to VSCode Uri objects
     */
    private resolveCustomIconPaths(iconPaths: CustomIconPaths): { light: vscode.Uri; dark: vscode.Uri } {
        const resolvePath = (iconPath: string): vscode.Uri => {
            // If it's an absolute path, use it directly
            if (path.isAbsolute(iconPath)) {
                return vscode.Uri.file(iconPath);
            }
            
            // If extension path is available, resolve relative to media folder
            if (this.extensionPath) {
                const fullPath = path.join(this.extensionPath, 'media', iconPath);
                if (fs.existsSync(fullPath)) {
                    return vscode.Uri.file(fullPath);
                }
            }
            
            // Fallback: treat as relative to workspace or media folder
            return vscode.Uri.file(iconPath);
        };

        return {
            light: resolvePath(iconPaths.light),
            dark: resolvePath(iconPaths.dark)
        };
    }
}

/**
 * Tree item representing a file
 */
class FileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly fsPath: string,
        isWelcome: boolean = false
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        
        if (!isWelcome) {
            this.resourceUri = vscode.Uri.file(fsPath);
            this.iconPath = vscode.ThemeIcon.File;
            this.contextValue = 'file';
            
            // Make files clickable to open
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(fsPath)]
            };
        } else {
            this.iconPath = new vscode.ThemeIcon('info');
            this.command = {
                command: 'demoBuilder.showWelcome',
                title: 'Show Welcome'
            };
        }
    }
}

