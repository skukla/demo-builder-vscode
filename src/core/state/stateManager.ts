import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Project, StateData, ProcessInfo } from '@/types';
import { parseJSON, getComponentIds } from '@/types/typeGuards';
import { Logger } from '@/core/logging';

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
    private logger = new Logger('StateManager');

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.stateFile = path.join(os.homedir(), '.demo-builder', 'state.json');
        this.recentProjectsFile = path.join(os.homedir(), '.demo-builder', 'recent-projects.json');
        this.state = {
            version: 1,
            currentProject: undefined,
            processes: new Map(),
            lastUpdated: new Date(),
        };
    }

    public async initialize(): Promise<void> {
        // Ensure directory exists
        const dir = path.dirname(this.stateFile);
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (error) {
            this.logger.error('Failed to create state directory', error instanceof Error ? error : undefined);
        }

        // Load existing state
        await this.loadState();
    }

    private async loadState(): Promise<void> {
        try {
            const data = await fs.readFile(this.stateFile, 'utf-8');
            const parsed = parseJSON<{ version?: number; currentProject?: Project; processes?: Record<string, ProcessInfo>; lastUpdated?: string }>(data);
            if (!parsed) {
                this.logger.warn('Failed to parse state file, using defaults');
                return;
            }

            // Validate that project path exists if there's a current project
            let validProject = parsed.currentProject;
            if (validProject?.path) {
                try {
                    await fs.access(validProject.path);
                } catch {
                    // Project path doesn't exist, clear it
                    this.logger.warn(`Project path ${validProject.path} does not exist, clearing project`);
                    validProject = undefined;
                }
            }
            
            this.state = {
                version: parsed.version || 1,
                currentProject: validProject,
                processes: new Map(Object.entries(parsed.processes || {})),
                lastUpdated: new Date(parsed.lastUpdated || Date.now()),
            };
        } catch {
            // State file doesn't exist or is invalid, use defaults
            this.logger.info('No existing state found, using defaults');
        }
    }

    private async saveState(): Promise<void> {
        try {
            this.state.lastUpdated = new Date();

            const data = {
                version: this.state.version,
                currentProject: this.state.currentProject,
                processes: Object.fromEntries(this.state.processes),
                lastUpdated: this.state.lastUpdated,
            };

            await fs.writeFile(this.stateFile, JSON.stringify(data, null, 2));
        } catch (error) {
            this.logger.error('Failed to save state', error instanceof Error ? error : undefined);
            throw error;  // Re-throw so caller knows save failed
        }
    }

    public async hasProject(): Promise<boolean> {
        return this.state.currentProject !== undefined;
    }

    public async getCurrentProject(): Promise<Project | undefined> {
        // If we have a cached project, reload it from disk to get latest data
        // This ensures we always have the most up-to-date project state including componentVersions
        if (this.state.currentProject?.path) {
            try {
                const freshProject = await this.loadProjectFromPath(this.state.currentProject.path);

                // Check if reload failed (returns null on error)
                // Debug level: expected during project deletion or if files moved
                if (freshProject === null) {
                    this.logger.debug('Project files not found on disk, using cached version');
                    return this.state.currentProject;
                }

                // Update cache with fresh data
                this.state.currentProject = freshProject;
                return freshProject;
            } catch (error) {
                // Fallback for unexpected errors (loadProjectFromPath normally returns null, not throws)
                this.logger.debug('Failed to reload project from disk, using cached version');
                return this.state.currentProject;
            }
        }
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
        // Ensure directory exists
        try {
            await fs.mkdir(project.path, { recursive: true });
        } catch (error) {
            this.logger.error('Failed to create project directory', error instanceof Error ? error : undefined);
            throw error;  // Re-throw so caller knows directory creation failed
        }

        // Update .demo-builder.json manifest with latest state
        try {
            const manifestPath = path.join(project.path, '.demo-builder.json');
            const manifest = {
                name: project.name,
                version: '1.0.0',
                // Type-safe Date handling: Handle both Date objects and ISO strings from persistence
                created: (project.created instanceof Date
                    ? project.created
                    : new Date(project.created)
                ).toISOString(),
                lastModified: new Date().toISOString(),
                adobe: project.adobe,
                commerce: project.commerce,
                componentSelections: project.componentSelections,
                componentInstances: project.componentInstances,
                componentConfigs: project.componentConfigs,
                componentVersions: project.componentVersions,
                meshState: project.meshState,
                components: getComponentIds(project.componentInstances),
            };

            await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        } catch (error) {
            this.logger.error('Failed to update project manifest', error instanceof Error ? error : undefined);
            throw error;  // Re-throw so caller knows manifest creation failed
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
            '# Note: Component-specific environment variables are now stored in each component\'s .env file',
        ].join('\n');

        try {
            await fs.writeFile(envPath, envContent);
        } catch (error) {
            this.logger.error('Failed to create .env file', error instanceof Error ? error : undefined);
            throw error;  // Re-throw so caller knows .env creation failed
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
            lastUpdated: new Date(),
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
            const parsed = parseJSON<RecentProject[]>(data);
            if (!parsed) {
                // Debug level: expected on first run or if file is empty/corrupted
                this.logger.debug('Recent projects file empty or invalid, using empty list');
                this.recentProjects = [];
                return;
            }
            this.recentProjects = parsed;
            
            // Validate that paths still exist
            this.recentProjects = await Promise.all(
                this.recentProjects.map(async (project) => {
                    try {
                        await fs.access(project.path);
                        return project;
                    } catch {
                        return null;
                    }
                }),
            ).then(projects => projects.filter(p => p !== null));
            
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
                'utf-8',
            );
        } catch (error) {
            this.logger.error('Failed to save recent projects', error instanceof Error ? error : undefined);
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
            lastOpened: new Date().toISOString(),
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

    /**
     * Load a project from a directory path
     * @param projectPath - Path to the project directory
     * @param terminalProvider - Optional function to get terminals (for testing)
     */
    public async loadProjectFromPath(
        projectPath: string,
        terminalProvider: () => readonly vscode.Terminal[] = () => vscode.window.terminals,
    ): Promise<Project | null> {
        try {
            // Check if path exists
            await fs.access(projectPath);

            // Check for .demo-builder.json manifest
            const manifestPath = path.join(projectPath, '.demo-builder.json');
            await fs.access(manifestPath);

            // Load project manifest
            const manifestData = await fs.readFile(manifestPath, 'utf-8');
            const manifest = parseJSON<{
                name?: string;
                created?: string;
                lastModified?: string;
                adobe?: Project['adobe'];
                commerce?: Project['commerce'];
                componentInstances?: Project['componentInstances'];
                componentSelections?: Project['componentSelections'];
                componentConfigs?: Project['componentConfigs'];
                componentVersions?: Project['componentVersions'];
                meshState?: Project['meshState'];
            }>(manifestData);
            if (!manifest) {
                throw new Error('Failed to parse project manifest');
            }
            
            // Reconstruct componentInstances from components/ directory
            const componentInstances: Record<string, import('@/types').ComponentInstance> = {};
            const componentsDir = path.join(projectPath, 'components');
            
            try {
                const componentDirs = await fs.readdir(componentsDir);
                
                for (const componentId of componentDirs) {
                    const componentPath = path.join(componentsDir, componentId);
                    const stat = await fs.stat(componentPath);
                    
                    if (stat.isDirectory()) {
                        // Try to determine component type from manifest
                        
                        // Create a basic component instance
                        componentInstances[componentId] = {
                            id: componentId,
                            name: componentId,
                            type: 'dependency', // Default, should be refined
                            status: 'ready',
                            path: componentPath,
                            lastUpdated: new Date(),
                        };
                    }
                }
            } catch {
                // No components directory or error reading it
                this.logger.debug('No components directory found or error reading it');
            }
            
            const project: Project = {
                name: manifest.name || path.basename(projectPath),
                path: projectPath,
                status: 'stopped', // Will be updated below if demo is actually running
                created: manifest.created ? new Date(manifest.created) : new Date(),
                lastModified: manifest.lastModified ? new Date(manifest.lastModified) : new Date(),
                adobe: manifest.adobe,
                commerce: manifest.commerce,
                componentInstances: manifest.componentInstances || componentInstances,
                componentSelections: manifest.componentSelections,
                componentConfigs: manifest.componentConfigs,
                componentVersions: manifest.componentVersions || {},
                meshState: manifest.meshState,
            };
            
            // Detect if demo is actually running by checking for project-specific terminal
            // This handles cases where extension state was lost but terminal is still alive
            const frontendComponent = project.componentInstances?.['citisignal-nextjs'];
            if (frontendComponent) {
                try {
                    const projectTerminalName = `${project.name} - Frontend`;
                    const terminals = terminalProvider();
                    const hasProjectTerminal = terminals.some(t => t.name === projectTerminalName);

                    if (hasProjectTerminal) {
                        // This project's demo is running, update status
                        project.status = 'running';
                        frontendComponent.status = 'running';
                    } else {
                        // No terminal for this project, ensure status is stopped
                        project.status = 'stopped';
                        frontendComponent.status = 'ready';
                    }
                } catch (error) {
                    this.logger.error('Error detecting demo status', error instanceof Error ? error : undefined);
                }
            }
            
            // Set as current project
            await this.saveProject(project);
            
            // Add to recent projects
            await this.addToRecentProjects(project);
            
            return project;
        } catch (error) {
            // Check if this is an expected "not found" error (e.g., project was deleted)
            const isNotFound = error instanceof Error &&
                (error.message.includes('ENOENT') || (error as NodeJS.ErrnoException).code === 'ENOENT');

            if (isNotFound) {
                // Project directory doesn't exist - expected after deletion, log at debug
                this.logger.debug(`[StateManager] Project not found at ${projectPath} (deleted or moved)`);
            } else {
                // Unexpected error - log at error level
                this.logger.error(`Failed to load project from ${projectPath}`, error instanceof Error ? error : undefined);
            }
            return null;
        }
    }

    /**
     * Get all projects from the projects directory
     */
    public async getAllProjects(): Promise<{ name: string; path: string; lastModified: Date }[]> {
        const projectsDir = path.join(os.homedir(), '.demo-builder', 'projects');
        const projects: { name: string; path: string; lastModified: Date }[] = [];

        try {
            const entries = await fs.readdir(projectsDir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const projectPath = path.join(projectsDir, entry.name);
                    const manifestPath = path.join(projectPath, '.demo-builder.json');

                    // Check if it's a valid project (has manifest)
                    try {
                        await fs.access(manifestPath);
                        const stats = await fs.stat(manifestPath);

                        projects.push({
                            name: entry.name,
                            path: projectPath,
                            lastModified: stats.mtime,
                        });
                    } catch {
                        // Not a valid project (missing .demo-builder.json), skip silently
                        this.logger.debug(`Skipping directory without manifest: ${entry.name}`);
                    }
                }
            }

            // Sort by last modified (newest first)
            projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
        } catch (error) {
            // Distinguish between "doesn't exist yet" and "permission denied"
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code === 'ENOENT') {
                this.logger.debug('Projects directory does not exist yet');
            } else {
                this.logger.error('Failed to read projects directory', error instanceof Error ? error : undefined);
            }
        }

        return projects;
    }

    public dispose(): void {
        this._onProjectChanged.dispose();
    }
}