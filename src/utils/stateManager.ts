import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Project, StateData, ProcessInfo } from '../types';

interface RecentProject {
    path: string;
    name: string;
    organization?: string;
    lastOpened: string;
}

export class StateManager {
    private context: vscode.ExtensionContext;
    private state: StateData;
    private stateFile: string;
    private recentProjectsFile: string;
    private recentProjects: RecentProject[] = [];
    private _onProjectChanged = new vscode.EventEmitter<Project | undefined>();
    readonly onProjectChanged = this._onProjectChanged.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.stateFile = path.join(os.homedir(), '.demo-builder', 'state.json');
        this.recentProjectsFile = path.join(os.homedir(), '.demo-builder', 'recent-projects.json');
        this.state = {
            version: 1,
            currentProject: undefined,
            processes: new Map(),
            lastUpdated: new Date()
        };
    }

    public async initialize(): Promise<void> {
        // Ensure directory exists
        const dir = path.dirname(this.stateFile);
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (error) {
            console.error('Failed to create state directory:', error);
        }

        // Load existing state
        await this.loadState();
    }

    private async loadState(): Promise<void> {
        try {
            const data = await fs.readFile(this.stateFile, 'utf-8');
            const parsed = JSON.parse(data);
            
            // Validate that project path exists if there's a current project
            let validProject = parsed.currentProject;
            if (validProject && validProject.path) {
                try {
                    await fs.access(validProject.path);
                } catch {
                    // Project path doesn't exist, clear it
                    console.warn(`Project path ${validProject.path} does not exist, clearing project`);
                    validProject = undefined;
                }
            }
            
            this.state = {
                version: parsed.version || 1,
                currentProject: validProject,
                processes: new Map(Object.entries(parsed.processes || {})),
                lastUpdated: new Date(parsed.lastUpdated || Date.now())
            };
        } catch (error) {
            // State file doesn't exist or is invalid, use defaults
            console.log('No existing state found, using defaults');
        }
    }

    private async saveState(): Promise<void> {
        try {
            this.state.lastUpdated = new Date();
            
            const data = {
                version: this.state.version,
                currentProject: this.state.currentProject,
                processes: Object.fromEntries(this.state.processes),
                lastUpdated: this.state.lastUpdated
            };

            await fs.writeFile(this.stateFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save state:', error);
        }
    }

    public async hasProject(): Promise<boolean> {
        return this.state.currentProject !== undefined;
    }

    public async getCurrentProject(): Promise<Project | undefined> {
        return this.state.currentProject;
    }

    public async saveProject(project: Project): Promise<void> {
        this.state.currentProject = project;
        await this.saveState();
        
        // Save project-specific config
        await this.saveProjectConfig(project);
        
        // Notify listeners
        this._onProjectChanged.fire(project);
    }

    private async saveProjectConfig(project: Project): Promise<void> {
        const configFile = path.join(project.path, 'config.yaml');
        
        // Ensure directory exists
        try {
            await fs.mkdir(project.path, { recursive: true });
        } catch (error) {
            console.error('Failed to create project directory:', error);
        }

        // For now, we'll save as JSON (can convert to YAML later)
        const configData = {
            project: {
                name: project.name,
                template: project.template,
                created: project.created,
                lastModified: new Date()
            },
            adobe: project.adobe,
            commerce: project.commerce,
            frontend: project.frontend,
            mesh: project.mesh,
            inspector: project.inspector
        };

        try {
            await fs.writeFile(
                path.join(project.path, 'config.json'),
                JSON.stringify(configData, null, 2)
            );
        } catch (error) {
            console.error('Failed to save project config:', error);
        }

        // Create .env file
        await this.createEnvFile(project);
    }

    private async createEnvFile(project: Project): Promise<void> {
        const envPath = path.join(project.path, '.env');
        
        const envContent = [
            '# Demo Builder Configuration',
            `PROJECT_NAME=${project.name}`,
            '',
            '# Commerce Configuration',
            `COMMERCE_URL=${project.commerce?.instance.url || ''}`,
            `COMMERCE_ENV_ID=${project.commerce?.instance.environmentId || ''}`,
            `COMMERCE_STORE_CODE=${project.commerce?.instance.storeCode || ''}`,
            `COMMERCE_STORE_VIEW=${project.commerce?.instance.storeView || ''}`,
            '',
            '# API Keys',
            `CATALOG_API_KEY=${project.commerce?.services.catalog?.apiKey || ''}`,
            `SEARCH_API_KEY=${project.commerce?.services.liveSearch?.apiKey || ''}`,
            '',
            '# Mesh Configuration',
            `MESH_ENDPOINT=${project.mesh?.endpoint || ''}`,
            '',
            '# Demo Inspector',
            `DEMO_INSPECTOR_ENABLED=${project.inspector?.enabled || false}`,
            '',
            '# Frontend',
            `FRONTEND_PORT=${project.frontend?.port || 3000}`
        ].join('\n');

        try {
            await fs.writeFile(envPath, envContent);
        } catch (error) {
            console.error('Failed to create .env file:', error);
        }
    }

    public async clearProject(): Promise<void> {
        this.state.currentProject = undefined;
        this.state.processes.clear();
        await this.saveState();
        this._onProjectChanged.fire(undefined);
    }

    public async clearAll(): Promise<void> {
        // Clear all state
        this.state = {
            version: 1,
            currentProject: undefined,
            processes: new Map(),
            lastUpdated: new Date()
        };
        
        // Clear context state
        await this.context.workspaceState.update('demoBuilder.state', undefined);
        
        // Delete state file
        try {
            await fs.unlink(this.stateFile);
        } catch {
            // Ignore if file doesn't exist
        }
        
        this._onProjectChanged.fire(undefined);
    }

    public async addProcess(name: string, info: ProcessInfo): Promise<void> {
        this.state.processes.set(name, info);
        await this.saveState();
    }

    public async removeProcess(name: string): Promise<void> {
        this.state.processes.delete(name);
        await this.saveState();
    }

    public async getProcess(name: string): Promise<ProcessInfo | undefined> {
        return this.state.processes.get(name);
    }

    public async reload(): Promise<void> {
        await this.loadState();
        await this.loadRecentProjects();
        this._onProjectChanged.fire(this.state.currentProject);
    }

    // Recent Projects Management
    private async loadRecentProjects(): Promise<void> {
        try {
            const data = await fs.readFile(this.recentProjectsFile, 'utf-8');
            this.recentProjects = JSON.parse(data);
            
            // Validate that paths still exist
            this.recentProjects = await Promise.all(
                this.recentProjects.map(async (project) => {
                    try {
                        await fs.access(project.path);
                        return project;
                    } catch {
                        return null;
                    }
                })
            ).then(projects => projects.filter(p => p !== null) as RecentProject[]);
            
            // Limit to 10 recent projects
            this.recentProjects = this.recentProjects.slice(0, 10);
            await this.saveRecentProjects();
        } catch {
            this.recentProjects = [];
        }
    }

    private async saveRecentProjects(): Promise<void> {
        try {
            await fs.writeFile(
                this.recentProjectsFile,
                JSON.stringify(this.recentProjects, null, 2),
                'utf-8'
            );
        } catch (error) {
            console.error('Failed to save recent projects:', error);
        }
    }

    public async getRecentProjects(): Promise<RecentProject[]> {
        await this.loadRecentProjects();
        return this.recentProjects;
    }

    public async addToRecentProjects(project: Project): Promise<void> {
        await this.loadRecentProjects();
        
        // Remove if already exists
        this.recentProjects = this.recentProjects.filter(p => p.path !== project.path);
        
        // Add to beginning
        this.recentProjects.unshift({
            path: project.path,
            name: project.name,
            organization: project.organization,
            lastOpened: new Date().toISOString()
        });
        
        // Keep only 10 most recent
        this.recentProjects = this.recentProjects.slice(0, 10);
        
        await this.saveRecentProjects();
    }

    public async removeFromRecentProjects(projectPath: string): Promise<void> {
        await this.loadRecentProjects();
        this.recentProjects = this.recentProjects.filter(p => p.path !== projectPath);
        await this.saveRecentProjects();
    }

    public async loadProjectFromPath(projectPath: string): Promise<Project | null> {
        try {
            // Check if path exists
            await fs.access(projectPath);
            
            // Check for .demo-builder.json manifest
            const manifestPath = path.join(projectPath, '.demo-builder.json');
            await fs.access(manifestPath);
            
            // Load project manifest
            const manifestData = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestData);
            
            // Reconstruct componentInstances from components/ directory
            const componentInstances: { [key: string]: any } = {};
            const componentsDir = path.join(projectPath, 'components');
            
            try {
                const componentDirs = await fs.readdir(componentsDir);
                
                for (const componentId of componentDirs) {
                    const componentPath = path.join(componentsDir, componentId);
                    const stat = await fs.stat(componentPath);
                    
                    if (stat.isDirectory()) {
                        // Try to determine component type from manifest
                        const componentInfo = manifest.components?.find((c: any) => c === componentId);
                        
                        // Create a basic component instance
                        componentInstances[componentId] = {
                            id: componentId,
                            name: componentId,
                            type: 'dependency', // Default, should be refined
                            status: 'ready',
                            path: componentPath,
                            lastUpdated: new Date()
                        };
                    }
                }
            } catch {
                // No components directory or error reading it
                console.log('No components directory found or error reading it');
            }
            
            const project: Project = {
                name: manifest.name || path.basename(projectPath),
                path: projectPath,
                status: 'stopped',
                created: manifest.created ? new Date(manifest.created) : new Date(),
                lastModified: manifest.lastModified ? new Date(manifest.lastModified) : new Date(),
                adobe: manifest.adobe,
                componentInstances,
                componentSelections: manifest.componentSelections
            };
            
            // Set as current project
            await this.saveProject(project);
            
            // Add to recent projects
            await this.addToRecentProjects(project);
            
            return project;
        } catch (error) {
            console.error(`Failed to load project from ${projectPath}:`, error);
            return null;
        }
    }

    public dispose(): void {
        this._onProjectChanged.dispose();
    }
}