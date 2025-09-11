import { Logger } from './logger';
import { getLogger } from './debugLogger';
import { ExternalCommandManager } from './externalCommandManager';
import { StateCoordinator } from './stateCoordinator';
import { StepLogger } from './stepLogger';
import * as path from 'path';

export interface AdobeOrg {
    id: string;
    code: string;
    name: string;
}

export interface AdobeProject {
    id: string;
    name: string;
    title: string;
    description?: string;
    type?: string;
    org_id?: number;
}

export interface AdobeWorkspace {
    id: string;
    name: string;
    title?: string;
}

/**
 * Adobe Authentication Manager V2
 * Uses ExternalCommandManager and StateCoordinator for robust CLI operations
 */
export class AdobeAuthManagerV2 {
    private logger: Logger;
    private debugLogger = getLogger();
    private stepLogger: StepLogger;
    private commandManager: ExternalCommandManager;
    private stateCoordinator: StateCoordinator;

    constructor(
        extensionPath: string,
        logger: Logger,
        commandManager: ExternalCommandManager,
        stateCoordinator: StateCoordinator
    ) {
        this.logger = logger;
        this.commandManager = commandManager;
        this.stateCoordinator = stateCoordinator;
        
        // Initialize StepLogger with templates
        const templatesPath = path.join(extensionPath, 'templates', 'logging.json');
        this.stepLogger = new StepLogger(logger, undefined, templatesPath);
    }

    /**
     * Check if authenticated using StateCoordinator
     */
    public async isAuthenticated(): Promise<boolean> {
        try {
            this.debugLogger.debug('[AdobeAuthV2] Checking authentication status');
            
            const state = await this.stateCoordinator.getAdobeState();
            return state.authenticated;
        } catch (error) {
            this.debugLogger.error('[AdobeAuthV2] Authentication check failed', error as Error);
            return false;
        }
    }

    /**
     * Login with race condition protection
     */
    public async login(): Promise<boolean> {
        return this.commandManager.executeExclusive('adobe-auth', async () => {
            try {
                this.logger.info('Starting Adobe login...');
                this.debugLogger.debug('[AdobeAuthV2] Initiating Adobe login with browser');
                
                // Execute login command in background (browser-based)
                const loginPromise = this.commandManager.executeCommand(
                    'aio auth login -f',
                    { encoding: 'utf8' },
                    this.commandManager.getStrategy('adobe-cli')
                );
                
                // Don't wait for login to complete (it opens browser)
                loginPromise.catch(error => {
                    // Expected - command waits for browser auth
                    this.debugLogger.debug('[AdobeAuthV2] Login command error (expected):', error);
                });
                
                this.debugLogger.debug('[AdobeAuthV2] Login command initiated, browser should open');
                
                // Use polling to wait for authentication
                await this.commandManager.pollUntilCondition(
                    async () => {
                        const state = await this.stateCoordinator.getAdobeState(true);
                        return state.authenticated;
                    },
                    {
                        maxAttempts: 60,
                        initialDelay: 2000,
                        maxDelay: 5000,
                        timeout: 120000,
                        name: 'Adobe authentication'
                    }
                );
                
                this.logger.info('Adobe login successful');
                return true;
            } catch (error) {
                this.debugLogger.error('[AdobeAuthV2] Login failed', error as Error);
                this.logger.error('Adobe login failed', error as Error);
                return false;
            }
        });
    }

    /**
     * Force login with cleanup
     */
    public async forceLogin(): Promise<boolean> {
        return this.commandManager.executeExclusive('adobe-auth', async () => {
            try {
                this.logger.info('Forcing fresh Adobe login...');
                this.debugLogger.debug('[AdobeAuthV2] Starting force login process');
                
                // Clear all context using command sequence
                const clearCommands = [
                    { command: 'aio console project clear', resource: 'adobe-cli' },
                    { command: 'aio console workspace clear', resource: 'adobe-cli' },
                    { command: 'aio console org clear', resource: 'adobe-cli' }
                ];
                
                await this.commandManager.executeSequence(clearCommands, false);
                this.logger.info('Cleared all Adobe context');
                
                // Force logout
                await this.commandManager.executeCommand(
                    'aio auth logout --force',
                    { encoding: 'utf8' },
                    this.commandManager.getStrategy('adobe-cli')
                );
                
                // Update state to reflect logout
                await this.stateCoordinator.updateAdobeState({
                    authenticated: false,
                    currentOrg: undefined,
                    currentProject: undefined
                });
                
                // Brief pause before login
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Now perform login
                return await this.login();
            } catch (error) {
                this.debugLogger.error('[AdobeAuthV2] Force login failed', error as Error);
                return false;
            }
        });
    }

    /**
     * Get organizations with state management
     */
    public async getOrganizations(): Promise<AdobeOrg[]> {
        return this.commandManager.executeExclusive('adobe-cli', async () => {
            try {
                this.stepLogger.logTemplate('adobe-auth', 'operations.fetching', { item: 'organizations' });
                
                const result = await this.commandManager.executeCommand(
                    'aio console org list --json',
                    { encoding: 'utf8' },
                    this.commandManager.getStrategy('adobe-cli')
                );
                
                if (result.code !== 0) {
                    throw new Error(`Failed to get organizations: ${result.stderr}`);
                }
                
                const orgs = JSON.parse(result.stdout);
                
                if (!Array.isArray(orgs)) {
                    throw new Error('Invalid organizations response format');
                }
                
                this.stepLogger.logTemplate('adobe-auth', 'statuses.found', { 
                    count: orgs.length, 
                    item: orgs.length === 1 ? 'organization' : 'organizations' 
                });
                
                return orgs.map((org: any) => ({
                    id: org.id,
                    code: org.code,
                    name: org.name
                }));
            } catch (error) {
                this.debugLogger.error('[AdobeAuthV2] Failed to get organizations', error as Error);
                throw error;
            }
        });
    }

    /**
     * Select organization with state coordination
     */
    public async selectOrganization(orgCode: string, orgId: string, orgName: string): Promise<boolean> {
        try {
            this.logger.info(`Selecting organization: ${orgName}`);
            await this.stateCoordinator.setAdobeOrganization(orgId, orgName, orgCode);
            return true;
        } catch (error) {
            this.debugLogger.error('[AdobeAuthV2] Failed to select organization', error as Error);
            return false;
        }
    }

    /**
     * Get projects with state management
     */
    public async getProjects(): Promise<AdobeProject[]> {
        return this.commandManager.executeExclusive('adobe-cli', async () => {
            try {
                this.stepLogger.logTemplate('adobe-auth', 'operations.fetching', { item: 'projects' });
                
                const state = await this.stateCoordinator.getAdobeState();
                if (!state.currentOrg) {
                    throw new Error('No organization selected');
                }
                
                const result = await this.commandManager.executeCommand(
                    'aio console project list --json',
                    { encoding: 'utf8' },
                    this.commandManager.getStrategy('adobe-cli')
                );
                
                if (result.code !== 0) {
                    throw new Error(`Failed to get projects: ${result.stderr}`);
                }
                
                const projects = JSON.parse(result.stdout);
                
                if (!Array.isArray(projects)) {
                    throw new Error('Invalid projects response format');
                }
                
                this.stepLogger.logTemplate('adobe-auth', 'statuses.found', { 
                    count: projects.length, 
                    item: projects.length === 1 ? 'project' : 'projects' 
                });
                
                return projects.map((proj: any) => ({
                    id: proj.id,
                    name: proj.name,
                    title: proj.title || proj.name,
                    description: proj.description,
                    type: proj.type,
                    org_id: proj.org_id
                }));
            } catch (error) {
                this.debugLogger.error('[AdobeAuthV2] Failed to get projects', error as Error);
                throw error;
            }
        });
    }

    /**
     * Select project with state coordination
     */
    public async selectProject(projectId: string, projectName: string): Promise<boolean> {
        try {
            this.logger.info(`Selecting project: ${projectName}`);
            await this.stateCoordinator.setAdobeProject(projectId, projectName);
            return true;
        } catch (error) {
            this.debugLogger.error('[AdobeAuthV2] Failed to select project', error as Error);
            return false;
        }
    }

    /**
     * Get workspaces with state management
     */
    public async getWorkspaces(_projectId: string): Promise<AdobeWorkspace[]> {
        return this.commandManager.executeExclusive('adobe-cli', async () => {
            try {
                this.stepLogger.logTemplate('adobe-auth', 'operations.fetching', { item: 'workspaces' });
                
                const result = await this.commandManager.executeCommand(
                    `aio console workspace list --json`,
                    { encoding: 'utf8' },
                    this.commandManager.getStrategy('adobe-cli')
                );
                
                if (result.code !== 0) {
                    throw new Error(`Failed to get workspaces: ${result.stderr}`);
                }
                
                const workspaces = JSON.parse(result.stdout);
                
                if (!Array.isArray(workspaces)) {
                    throw new Error('Invalid workspaces response format');
                }
                
                this.stepLogger.logTemplate('adobe-auth', 'statuses.found', { 
                    count: workspaces.length, 
                    item: workspaces.length === 1 ? 'workspace' : 'workspaces' 
                });
                
                return workspaces.map((ws: any) => ({
                    id: ws.id,
                    name: ws.name,
                    title: ws.title || ws.name
                }));
            } catch (error) {
                this.debugLogger.error('[AdobeAuthV2] Failed to get workspaces', error as Error);
                throw error;
            }
        });
    }

    /**
     * Select workspace with state coordination
     */
    public async selectWorkspace(
        workspaceId: string,
        workspaceName: string,
        projectId: string,
        projectName: string
    ): Promise<boolean> {
        try {
            this.logger.info(`Selecting workspace: ${workspaceName}`);
            await this.stateCoordinator.setAdobeProject(projectId, projectName, workspaceId, workspaceName);
            return true;
        } catch (error) {
            this.debugLogger.error('[AdobeAuthV2] Failed to select workspace', error as Error);
            return false;
        }
    }

    /**
     * Logout with state cleanup
     */
    public async logout(): Promise<void> {
        return this.commandManager.executeExclusive('adobe-auth', async () => {
            try {
                await this.commandManager.executeCommand(
                    'aio auth logout',
                    { encoding: 'utf8' },
                    this.commandManager.getStrategy('adobe-cli')
                );
                
                await this.stateCoordinator.updateAdobeState({
                    authenticated: false,
                    currentOrg: undefined,
                    currentProject: undefined
                });
                
                this.logger.info('Adobe logout successful');
            } catch (error) {
                this.debugLogger.error('[AdobeAuthV2] Logout failed', error as Error);
                throw error;
            }
        });
    }

    /**
     * Validate state consistency
     */
    public async validateState(): Promise<boolean> {
        const validation = await this.stateCoordinator.validateStateConsistency();
        
        if (!validation.valid) {
            this.debugLogger.warn(`[AdobeAuthV2] State validation issues: ${validation.issues.join(', ')}`);
        }
        
        return validation.valid;
    }
}