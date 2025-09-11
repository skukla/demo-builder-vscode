import * as vscode from 'vscode';
import { ExternalCommandManager } from './externalCommandManager';
import { getLogger } from './debugLogger';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Adobe CLI state information
 */
interface AdobeCliState {
    authenticated: boolean;
    currentOrg?: {
        id: string;
        name: string;
        code: string;
    };
    currentProject?: {
        id: string;
        name: string;
        workspaceId?: string;
        workspaceName?: string;
    };
    configPath?: string;
    lastCheck?: number;
    version?: string;
}

/**
 * Project state information
 */
interface ProjectState {
    name: string;
    path: string;
    status: 'creating' | 'running' | 'stopped' | 'error';
    createdAt: number;
    lastModified: number;
    components: string[];
    adobeConnection?: {
        orgId: string;
        projectId: string;
        workspaceId?: string;
    };
}

/**
 * State change event
 */
interface StateChangeEvent {
    type: 'adobe-auth' | 'adobe-org' | 'adobe-project' | 'project-status' | 'project-created';
    previousState: any;
    newState: any;
    timestamp: number;
}

/**
 * Coordinates state between Adobe CLI, VS Code, and project operations
 * 
 * Features:
 * - Adobe CLI state synchronization
 * - Project state tracking
 * - State change events
 * - Conflict resolution
 * - Cache management with TTL
 * - Atomic state updates
 */
export class StateCoordinator {
    private adobeState: AdobeCliState = { authenticated: false };
    private projectStates = new Map<string, ProjectState>();
    private stateChangeListeners = new Map<string, Set<(event: StateChangeEvent) => void>>();
    private commandManager: ExternalCommandManager;
    private logger = getLogger();
    private context: vscode.ExtensionContext;
    private stateLock = new Map<string, Promise<void>>();
    private cacheTTL = 5 * 60 * 1000; // 5 minutes cache TTL

    constructor(context: vscode.ExtensionContext, commandManager: ExternalCommandManager) {
        this.context = context;
        this.commandManager = commandManager;
        
        // Load persisted state
        this.loadPersistedState();
        
        // Set up periodic state refresh
        this.setupStateRefresh();
    }

    /**
     * Get current Adobe CLI state with optional refresh
     */
    async getAdobeState(forceRefresh = false): Promise<AdobeCliState> {
        // Check cache validity
        const cacheExpired = !this.adobeState.lastCheck || 
            Date.now() - this.adobeState.lastCheck > this.cacheTTL;
        
        if (forceRefresh || cacheExpired) {
            await this.refreshAdobeState();
        }
        
        return { ...this.adobeState };
    }

    /**
     * Refresh Adobe CLI state from actual CLI
     */
    private async refreshAdobeState(): Promise<void> {
        this.logger.debug('[StateCoordinator] Refreshing Adobe CLI state');
        
        try {
            // Check authentication status
            const authResult = await this.commandManager.executeCommand(
                'aio auth:ctx',
                { encoding: 'utf8' },
                this.commandManager.getStrategy('adobe-cli')
            );
            
            const authenticated = authResult.code === 0 && 
                !authResult.stdout.includes('not logged in');
            
            // Get current org if authenticated
            let currentOrg: AdobeCliState['currentOrg'];
            if (authenticated) {
                const orgResult = await this.commandManager.executeCommand(
                    'aio console:org:list --json',
                    { encoding: 'utf8' }
                );
                
                if (orgResult.code === 0) {
                    try {
                        const orgs = JSON.parse(orgResult.stdout);
                        const selected = orgs.find((org: any) => org.selected);
                        if (selected) {
                            currentOrg = {
                                id: selected.id,
                                name: selected.name,
                                code: selected.code
                            };
                        }
                    } catch (error) {
                        this.logger.debug('[StateCoordinator] Failed to parse org list', error);
                    }
                }
            }
            
            // Get current project if org selected
            let currentProject: AdobeCliState['currentProject'];
            if (currentOrg) {
                const projectResult = await this.commandManager.executeCommand(
                    'aio console:project:list --json',
                    { encoding: 'utf8' }
                );
                
                if (projectResult.code === 0) {
                    try {
                        const projects = JSON.parse(projectResult.stdout);
                        const selected = projects.find((proj: any) => proj.selected);
                        if (selected) {
                            currentProject = {
                                id: selected.id,
                                name: selected.name,
                                workspaceId: selected.workspace_id,
                                workspaceName: selected.workspace_name
                            };
                        }
                    } catch (error) {
                        this.logger.debug('[StateCoordinator] Failed to parse project list', error);
                    }
                }
            }
            
            // Get CLI version
            const versionResult = await this.commandManager.executeCommand(
                'aio --version',
                { encoding: 'utf8' }
            );
            
            const version = versionResult.stdout.match(/(\d+\.\d+\.\d+)/)?.[1];
            
            // Update state atomically
            await this.updateAdobeState({
                authenticated,
                currentOrg,
                currentProject,
                version,
                lastCheck: Date.now()
            });
            
        } catch (error) {
            this.logger.error('[StateCoordinator] Failed to refresh Adobe state', error as Error);
            throw error;
        }
    }

    /**
     * Update Adobe CLI state atomically
     */
    async updateAdobeState(updates: Partial<AdobeCliState>): Promise<void> {
        const lockKey = 'adobe-state';
        
        // Ensure atomic update
        await this.executeWithLock(lockKey, async () => {
            const previousState = { ...this.adobeState };
            this.adobeState = { ...this.adobeState, ...updates };
            
            // Persist state
            await this.context.globalState.update('adobeCliState', this.adobeState);
            
            // Emit change event
            this.emitStateChange({
                type: 'adobe-auth',
                previousState,
                newState: this.adobeState,
                timestamp: Date.now()
            });
            
            this.logger.debug('[StateCoordinator] Adobe state updated', this.adobeState);
        });
    }

    /**
     * Set Adobe organization with validation
     */
    async setAdobeOrganization(orgId: string, orgName: string, orgCode: string): Promise<void> {
        this.logger.debug(`[StateCoordinator] Setting Adobe org: ${orgName} (${orgId})`);
        
        // Execute CLI command to select org
        await this.commandManager.executeExclusive('adobe-cli', async () => {
            const result = await this.commandManager.executeCommand(
                `aio console:org:select ${orgCode}`,
                { encoding: 'utf8' },
                this.commandManager.getStrategy('adobe-cli')
            );
            
            if (result.code !== 0) {
                throw new Error(`Failed to select organization: ${result.stderr}`);
            }
        });
        
        // Update state
        await this.updateAdobeState({
            currentOrg: { id: orgId, name: orgName, code: orgCode },
            currentProject: undefined // Clear project when org changes
        });
    }

    /**
     * Set Adobe project with validation
     */
    async setAdobeProject(
        projectId: string, 
        projectName: string,
        workspaceId?: string,
        workspaceName?: string
    ): Promise<void> {
        this.logger.debug(`[StateCoordinator] Setting Adobe project: ${projectName} (${projectId})`);
        
        if (!this.adobeState.currentOrg) {
            throw new Error('No organization selected');
        }
        
        // Execute CLI command to select project
        await this.commandManager.executeExclusive('adobe-cli', async () => {
            const result = await this.commandManager.executeCommand(
                `aio console:project:select ${projectId}`,
                { encoding: 'utf8' },
                this.commandManager.getStrategy('adobe-cli')
            );
            
            if (result.code !== 0) {
                throw new Error(`Failed to select project: ${result.stderr}`);
            }
            
            // If workspace provided, select it too
            if (workspaceId) {
                const wsResult = await this.commandManager.executeCommand(
                    `aio console:workspace:select ${workspaceId}`,
                    { encoding: 'utf8' }
                );
                
                if (wsResult.code !== 0) {
                    this.logger.warn(`Failed to select workspace: ${wsResult.stderr}`);
                }
            }
        });
        
        // Update state
        await this.updateAdobeState({
            currentProject: {
                id: projectId,
                name: projectName,
                workspaceId,
                workspaceName
            }
        });
    }

    /**
     * Create a new project with state tracking
     */
    async createProject(
        name: string,
        path: string,
        components: string[],
        adobeConnection?: ProjectState['adobeConnection']
    ): Promise<ProjectState> {
        this.logger.debug(`[StateCoordinator] Creating project: ${name}`);
        
        const project: ProjectState = {
            name,
            path,
            status: 'creating',
            createdAt: Date.now(),
            lastModified: Date.now(),
            components,
            adobeConnection
        };
        
        // Store project state
        this.projectStates.set(path, project);
        await this.persistProjectStates();
        
        // Emit creation event
        this.emitStateChange({
            type: 'project-created',
            previousState: null,
            newState: project,
            timestamp: Date.now()
        });
        
        return project;
    }

    /**
     * Update project status
     */
    async updateProjectStatus(
        path: string,
        status: ProjectState['status'],
        metadata?: Partial<ProjectState>
    ): Promise<void> {
        const project = this.projectStates.get(path);
        if (!project) {
            throw new Error(`Project not found: ${path}`);
        }
        
        const previousState = { ...project };
        project.status = status;
        project.lastModified = Date.now();
        
        if (metadata) {
            Object.assign(project, metadata);
        }
        
        await this.persistProjectStates();
        
        // Emit status change
        this.emitStateChange({
            type: 'project-status',
            previousState,
            newState: project,
            timestamp: Date.now()
        });
    }

    /**
     * Get project state
     */
    getProjectState(path: string): ProjectState | undefined {
        return this.projectStates.get(path);
    }

    /**
     * Get all project states
     */
    getAllProjects(): ProjectState[] {
        return Array.from(this.projectStates.values());
    }

    /**
     * Listen for state changes
     */
    onStateChange(
        type: StateChangeEvent['type'],
        listener: (event: StateChangeEvent) => void
    ): vscode.Disposable {
        if (!this.stateChangeListeners.has(type)) {
            this.stateChangeListeners.set(type, new Set());
        }
        
        this.stateChangeListeners.get(type)!.add(listener);
        
        return new vscode.Disposable(() => {
            this.stateChangeListeners.get(type)?.delete(listener);
        });
    }

    /**
     * Validate state consistency
     */
    async validateStateConsistency(): Promise<{
        valid: boolean;
        issues: string[];
    }> {
        const issues: string[] = [];
        
        // Check Adobe CLI state matches actual CLI
        try {
            const actualState = await this.getAdobeState(true);
            
            if (this.adobeState.authenticated !== actualState.authenticated) {
                issues.push('Authentication state mismatch');
            }
            
            if (this.adobeState.currentOrg?.id !== actualState.currentOrg?.id) {
                issues.push('Organization selection mismatch');
            }
            
            if (this.adobeState.currentProject?.id !== actualState.currentProject?.id) {
                issues.push('Project selection mismatch');
            }
        } catch (error) {
            issues.push(`Failed to validate Adobe CLI state: ${error}`);
        }
        
        // Check project states match file system
        for (const [projectPath] of this.projectStates) {
            try {
                const stats = await fs.stat(projectPath);
                if (!stats.isDirectory()) {
                    issues.push(`Project path is not a directory: ${projectPath}`);
                }
                
                // Check for expected project files
                const configPath = path.join(projectPath, '.demo-builder', 'config.json');
                try {
                    await fs.access(configPath);
                } catch {
                    issues.push(`Project config missing: ${configPath}`);
                }
            } catch (error) {
                issues.push(`Project path does not exist: ${projectPath}`);
            }
        }
        
        return {
            valid: issues.length === 0,
            issues
        };
    }

    /**
     * Reset all state (for debugging/recovery)
     */
    async resetState(): Promise<void> {
        this.logger.warn('[StateCoordinator] Resetting all state');
        
        // Clear Adobe state
        this.adobeState = { authenticated: false };
        await this.context.globalState.update('adobeCliState', undefined);
        
        // Clear project states
        this.projectStates.clear();
        await this.context.globalState.update('projectStates', undefined);
        
        // Clear locks
        this.stateLock.clear();
        
        this.logger.info('[StateCoordinator] State reset complete');
    }

    /**
     * Execute operation with lock to ensure atomicity
     */
    private async executeWithLock<T>(
        lockKey: string,
        operation: () => Promise<T>
    ): Promise<T> {
        // Get or create lock
        const currentLock = this.stateLock.get(lockKey) || Promise.resolve();
        
        // Create new lock
        let releaseLock: () => void;
        const newLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });
        
        // Chain operation after current lock
        const resultPromise = currentLock
            .then(() => operation())
            .finally(() => releaseLock!());
        
        // Update lock
        this.stateLock.set(lockKey, newLock);
        
        return resultPromise;
    }

    /**
     * Emit state change event
     */
    private emitStateChange(event: StateChangeEvent): void {
        const listeners = this.stateChangeListeners.get(event.type);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(event);
                } catch (error) {
                    this.logger.error('[StateCoordinator] State change listener error', error as Error);
                }
            });
        }
    }

    /**
     * Load persisted state from storage
     */
    private async loadPersistedState(): Promise<void> {
        // Load Adobe state
        const savedAdobeState = this.context.globalState.get<AdobeCliState>('adobeCliState');
        if (savedAdobeState) {
            this.adobeState = savedAdobeState;
        }
        
        // Load project states
        const savedProjects = this.context.globalState.get<[string, ProjectState][]>('projectStates');
        if (savedProjects) {
            this.projectStates = new Map(savedProjects);
        }
        
        this.logger.debug('[StateCoordinator] Loaded persisted state');
    }

    /**
     * Persist project states to storage
     */
    private async persistProjectStates(): Promise<void> {
        const projectArray = Array.from(this.projectStates.entries());
        await this.context.globalState.update('projectStates', projectArray);
    }

    /**
     * Set up periodic state refresh
     */
    private setupStateRefresh(): void {
        // Refresh Adobe state every 5 minutes if authenticated
        setInterval(async () => {
            if (this.adobeState.authenticated) {
                try {
                    await this.refreshAdobeState();
                } catch (error) {
                    this.logger.debug('[StateCoordinator] Periodic refresh failed', error);
                }
            }
        }, 5 * 60 * 1000);
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.stateChangeListeners.clear();
        this.stateLock.clear();
    }
}