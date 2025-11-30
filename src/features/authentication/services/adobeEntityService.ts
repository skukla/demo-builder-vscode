import { getLogger, Logger, StepLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS, formatDuration } from '@/core/utils';
import { validateOrgId, validateProjectId, validateWorkspaceId } from '@/core/validation';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    AdobeContext,
    RawAdobeOrg,
    RawAdobeProject,
    RawAdobeWorkspace,
    AdobeCLIError,
    AdobeConsoleWhereResponse,
    SDKResponse,
} from '@/features/authentication/services/types';
import { parseJSON } from '@/types/typeGuards';

/**
 * Service for managing Adobe entities (organizations, projects, workspaces)
 * Provides both SDK and CLI-based operations with intelligent caching
 */
export class AdobeEntityService {
    private debugLogger = getLogger();

    constructor(
        private commandManager: CommandExecutor,
        private sdkClient: AdobeSDKClient,
        private cacheManager: AuthCacheManager,
        private organizationValidator: OrganizationValidator,
        private logger: Logger,
        private stepLogger: StepLogger,
    ) {}

    /**
     * Map raw organization data to AdobeOrg type
     */
    private mapOrganizations(data: RawAdobeOrg[]): AdobeOrg[] {
        return data.map((org: RawAdobeOrg) => ({
            id: org.id,
            code: org.code,
            name: org.name,
        }));
    }

    /**
     * Map raw project data to AdobeProject type
     */
    private mapProjects(data: RawAdobeProject[]): AdobeProject[] {
        return data.map((proj: RawAdobeProject) => ({
            id: proj.id,
            name: proj.name,
            title: proj.title || proj.name,
            description: proj.description,
            org_id: proj.org_id,
        }));
    }

    /**
     * Map raw workspace data to AdobeWorkspace type
     */
    private mapWorkspaces(data: RawAdobeWorkspace[]): AdobeWorkspace[] {
        return data.map((ws: RawAdobeWorkspace) => ({
            id: ws.id,
            name: ws.name,
            title: ws.title || ws.name,
        }));
    }

    /**
     * Get console.where context with caching
     *
     * Fetches the current Adobe console context (org, project, workspace) from CLI
     * and caches the result. Used by getCurrentOrganization, getCurrentProject,
     * and getCurrentWorkspace to avoid redundant CLI calls.
     *
     * @returns The console context or undefined if fetch fails
     */
    private async getConsoleWhereContext(): Promise<AdobeConsoleWhereResponse | undefined> {
        // Check console.where cache first
        let context = this.cacheManager.getCachedConsoleWhere();

        if (!context) {
            this.debugLogger.debug('[Entity Service] Fetching context from Adobe CLI');
            const result = await this.commandManager.execute(
                'aio console where --json',
                { encoding: 'utf8', timeout: TIMEOUTS.API_CALL },
            );

            if (result.code === 0 && result.stdout) {
                // SECURITY: Use parseJSON for type-safe parsing
                const parsedContext = parseJSON<AdobeConsoleWhereResponse>(result.stdout);
                if (!parsedContext) {
                    this.debugLogger.warn('[Entity Service] Failed to parse console.where response');
                    return undefined;
                }
                context = parsedContext;
                this.cacheManager.setCachedConsoleWhere(context);
            } else {
                return undefined;
            }
        }

        return context;
    }

    /**
     * Get list of organizations (SDK with CLI fallback)
     */
    async getOrganizations(): Promise<AdobeOrg[]> {
        const startTime = Date.now();

        try {
            // Check cache first
            const cachedOrgs = this.cacheManager.getCachedOrgList();
            if (cachedOrgs) {
                return cachedOrgs;
            }

            this.stepLogger.logTemplate('adobe-setup', 'loading-organizations', {});

            let mappedOrgs: AdobeOrg[] = [];

            // Auto-initialize SDK if not ready (lazy init pattern)
            if (!this.sdkClient.isInitialized()) {
                await this.sdkClient.ensureInitialized();
            }

            // Try SDK first for 30x performance improvement
            if (this.sdkClient.isInitialized()) {
                try {
                    const client = this.sdkClient.getClient() as { getOrganizations: () => Promise<SDKResponse<RawAdobeOrg[]>> };
                    const sdkResult = await client.getOrganizations();
                    const sdkDuration = Date.now() - startTime;

                    if (sdkResult.body && Array.isArray(sdkResult.body)) {
                        mappedOrgs = this.mapOrganizations(sdkResult.body);

                        this.debugLogger.debug(`[Entity Service] Retrieved ${mappedOrgs.length} organizations via SDK in ${formatDuration(sdkDuration)}`);
                    } else {
                        throw new Error('Invalid SDK response format');
                    }
                } catch (sdkError) {
                    this.debugLogger.debug('[Entity Service] SDK failed, falling back to CLI:', sdkError);
                    this.debugLogger.warn('[Entity Service] SDK unavailable, using slower CLI fallback for organizations');
                }
            }

            // CLI fallback (if SDK not available or failed)
            if (mappedOrgs.length === 0) {

                const result = await this.commandManager.execute(
                    'aio console org list --json',
                    { encoding: 'utf8' },
                );

                const cliDuration = Date.now() - startTime;

                if (result.code !== 0) {
                    throw new Error(`Failed to get organizations: ${result.stderr}`);
                }

                // SECURITY: Use parseJSON for type-safe parsing
                const orgs = parseJSON<RawAdobeOrg[]>(result.stdout);

                if (!orgs || !Array.isArray(orgs)) {
                    throw new Error('Invalid organizations response format');
                }

                mappedOrgs = this.mapOrganizations(orgs);

                this.debugLogger.debug(`[Entity Service] Retrieved ${mappedOrgs.length} organizations via CLI in ${formatDuration(cliDuration)}`);
            }

            // Clear stale CLI context if no orgs accessible
            if (mappedOrgs.length === 0) {
                this.logger.info('No organizations accessible. Clearing previous selections...');
                this.debugLogger.debug('[Entity Service] No organizations accessible - clearing stale CLI context');
                await this.clearConsoleContext();
            }

            // Cache the result
            this.cacheManager.setCachedOrgList(mappedOrgs);

            this.stepLogger.logTemplate('adobe-setup', 'found', {
                count: mappedOrgs.length,
                item: mappedOrgs.length === 1 ? 'organization' : 'organizations',
            });

            return mappedOrgs;
        } catch (error) {
            this.debugLogger.error('[Entity Service] Failed to get organizations', error as Error);
            throw error;
        }
    }

    /**
     * Get list of projects for current org (SDK with CLI fallback)
     * @param options.silent - If true, suppress user-facing log messages (used for internal ID resolution)
     */
    async getProjects(options?: { silent?: boolean }): Promise<AdobeProject[]> {
        const startTime = Date.now();
        const silent = options?.silent ?? false;

        try {
            if (!silent) {
                this.stepLogger.logTemplate('adobe-setup', 'operations.loading-projects', {});
            }

            let mappedProjects: AdobeProject[] = [];
            const cachedOrg = this.cacheManager.getCachedOrganization();

            // Try SDK first if available and we have a VALID numeric org ID
            // PERFORMANCE FIX: SDK requires numeric org ID (e.g., "3397333")
            // The 'id' field contains the numeric org ID, while 'code' is the IMS org ID (e.g., "E94E1E3766FBA7DC0A495FFA@AdobeOrg")
            // Passing IMS org code or org name causes 400 Bad Request and forces slow CLI fallback
            const hasValidOrgId = cachedOrg?.id && cachedOrg.id.length > 0;

            // Auto-initialize SDK if not ready (lazy init pattern)
            if (!this.sdkClient.isInitialized()) {
                await this.sdkClient.ensureInitialized();
            }

            if (this.sdkClient.isInitialized() && hasValidOrgId) {
                try {
                    const client = this.sdkClient.getClient() as { getProjectsForOrg: (orgId: string) => Promise<SDKResponse<RawAdobeProject[]>> };
                    const sdkResult = await client.getProjectsForOrg(cachedOrg.id);
                    const sdkDuration = Date.now() - startTime;

                    if (sdkResult.body && Array.isArray(sdkResult.body)) {
                        mappedProjects = this.mapProjects(sdkResult.body);

                        this.debugLogger.debug(`[Entity Service] Retrieved ${mappedProjects.length} projects via SDK in ${formatDuration(sdkDuration)}`);
                    } else {
                        throw new Error('Invalid SDK response format');
                    }
                } catch (sdkError) {
                    this.debugLogger.debug('[Entity Service] SDK failed, falling back to CLI:', sdkError);
                    this.debugLogger.warn('[Entity Service] SDK unavailable, using slower CLI fallback for projects');
                }
            } else if (this.sdkClient.isInitialized() && !hasValidOrgId) {
                this.debugLogger.debug('[Entity Service] SDK available but org ID is missing (expected numeric ID like "3397333"), using CLI');
            }

            // CLI fallback
            if (mappedProjects.length === 0) {
                const result = await this.commandManager.execute(
                    'aio console project list --json',
                    { encoding: 'utf8' },
                );

                const cliDuration = Date.now() - startTime;

                if (result.code !== 0) {
                    // Check if it's just no projects
                    if (result.stderr?.includes('does not have any projects')) {
                        this.debugLogger.debug('[Entity Service] No projects found for organization');
                        return [];
                    }
                    throw new Error(`Failed to get projects: ${result.stderr}`);
                }

                // SECURITY: Use parseJSON for type-safe parsing
                const projects = parseJSON<RawAdobeProject[]>(result.stdout);

                if (!projects || !Array.isArray(projects)) {
                    throw new Error('Invalid projects response format');
                }

                mappedProjects = this.mapProjects(projects);

                this.debugLogger.debug(`[Entity Service] Retrieved ${mappedProjects.length} projects via CLI in ${formatDuration(cliDuration)}`);
            }

            if (!silent) {
                this.stepLogger.logTemplate('adobe-setup', 'statuses.projects-loaded', {
                    count: mappedProjects.length,
                    plural: mappedProjects.length === 1 ? '' : 's',
                });
            }

            return mappedProjects;
        } catch (error) {
            this.debugLogger.error('[Entity Service] Failed to get projects', error as Error);
            throw error;
        }
    }

    /**
     * Get list of workspaces for current project (SDK with CLI fallback)
     */
    async getWorkspaces(): Promise<AdobeWorkspace[]> {
        const startTime = Date.now();

        try {
            this.stepLogger.logTemplate('adobe-setup', 'operations.retrieving-workspaces', {});

            let mappedWorkspaces: AdobeWorkspace[] = [];
            const cachedOrg = this.cacheManager.getCachedOrganization();
            const cachedProject = this.cacheManager.getCachedProject();

            // Try SDK first if available and we have VALID numeric org ID and project ID
            // PERFORMANCE FIX: SDK requires numeric org ID (e.g., "3397333")
            // The 'id' field contains the numeric org ID, while 'code' is the IMS org ID (e.g., "E94E1E3766FBA7DC0A495FFA@AdobeOrg")
            const hasValidOrgId = cachedOrg?.id && cachedOrg.id.length > 0;
            const hasValidProjectId = cachedProject?.id && cachedProject.id.length > 0;

            // Auto-initialize SDK if not ready (lazy init pattern)
            if (!this.sdkClient.isInitialized()) {
                await this.sdkClient.ensureInitialized();
            }

            if (this.sdkClient.isInitialized() && hasValidOrgId && hasValidProjectId) {
                try {
                    const client = this.sdkClient.getClient() as { getWorkspacesForProject: (orgId: string, projectId: string) => Promise<SDKResponse<RawAdobeWorkspace[]>> };
                    const sdkResult = await client.getWorkspacesForProject(
                        cachedOrg.id,
                        cachedProject.id,
                    );
                    const sdkDuration = Date.now() - startTime;

                    if (sdkResult.body && Array.isArray(sdkResult.body)) {
                        mappedWorkspaces = this.mapWorkspaces(sdkResult.body);

                        this.debugLogger.debug(`[Entity Service] Retrieved ${mappedWorkspaces.length} workspaces via SDK in ${formatDuration(sdkDuration)}`);
                    } else {
                        throw new Error('Invalid SDK response format');
                    }
                } catch (sdkError) {
                    this.debugLogger.debug('[Entity Service] SDK failed, falling back to CLI:', sdkError);
                    this.debugLogger.warn('[Entity Service] SDK unavailable, using slower CLI fallback for workspaces');
                }
            } else if (this.sdkClient.isInitialized() && (!hasValidOrgId || !hasValidProjectId)) {
                this.debugLogger.debug('[Entity Service] SDK available but org ID or project ID is missing, using CLI');
            }

            // CLI fallback
            if (mappedWorkspaces.length === 0) {
                const result = await this.commandManager.execute(
                    'aio console workspace list --json',
                    { encoding: 'utf8' },
                );

                const cliDuration = Date.now() - startTime;

                if (result.code !== 0) {
                    throw new Error(`Failed to get workspaces: ${result.stderr}`);
                }

                // SECURITY: Use parseJSON for type-safe parsing
                const workspaces = parseJSON<RawAdobeWorkspace[]>(result.stdout);

                if (!workspaces || !Array.isArray(workspaces)) {
                    throw new Error('Invalid workspaces response format');
                }

                mappedWorkspaces = this.mapWorkspaces(workspaces);

                this.debugLogger.debug(`[Entity Service] Retrieved ${mappedWorkspaces.length} workspaces via CLI in ${formatDuration(cliDuration)}`);
            }

            this.stepLogger.logTemplate('adobe-setup', 'statuses.workspaces-loaded', {
                count: mappedWorkspaces.length,
                plural: mappedWorkspaces.length === 1 ? '' : 's',
            });

            return mappedWorkspaces;
        } catch (error) {
            this.debugLogger.error('[Entity Service] Failed to get workspaces', error as Error);
            throw error;
        }
    }

    /**
     * Get current organization from CLI
     */
    async getCurrentOrganization(): Promise<AdobeOrg | undefined> {
        try {
            // Check cache first
            const cachedOrg = this.cacheManager.getCachedOrganization();
            if (cachedOrg) {
                return cachedOrg;
            }

            const context = await this.getConsoleWhereContext();
            if (!context) {
                return undefined;
            }

            if (context.org) {
                // Handle both string and object formats
                let orgData;
                if (typeof context.org === 'string') {
                    if (context.org.trim()) {

                        // PERFORMANCE FIX: Always resolve full org object for SDK compatibility
                        // The SDK requires numeric org ID (e.g., "3397333"), not names or IMS org codes
                        // Passing name or IMS org code causes 400 Bad Request and forces slow CLI fallback

                        // Check if we're in post-login phase (no cached org list)
                        const cachedOrgList = this.cacheManager.getCachedOrgList();

                        if (!cachedOrgList || cachedOrgList.length === 0) {
                            // No cached org list = likely post-login, fetch it now to resolve full org object
                            try {
                                // Fetch org list to get full org object with code (required for SDK operations)
                                const orgs = await this.getOrganizations();
                                const matchedOrg = orgs.find(o => o.name === context.org || o.code === context.org);

                                if (matchedOrg) {
                                    orgData = matchedOrg;
                                } else {
                                    this.debugLogger.warn('[Entity Service] Could not find org in list, using name as fallback');
                                    orgData = {
                                        id: context.org,
                                        code: context.org,
                                        name: context.org,
                                    };
                                }
                            } catch (error) {
                                this.debugLogger.debug('[Entity Service] Failed to fetch org list for ID resolution:', error);
                                // Fallback to name-only (SDK operations will fail, CLI fallback will be used)
                                orgData = {
                                    id: context.org,
                                    code: context.org,
                                    name: context.org,
                                };
                            }
                        } else {
                            // We have cached org list, safe to resolve full org object without API calls
                            try {
                                // Try to resolve ID from cache
                                const matchedOrg = cachedOrgList.find(o => o.name === context.org || o.code === context.org);

                                if (matchedOrg) {
                                    orgData = matchedOrg;
                                } else {
                                    this.debugLogger.warn('[Entity Service] Could not find org in cached list, using name as fallback');
                                    orgData = {
                                        id: context.org,
                                        code: context.org,
                                        name: context.org,
                                    };
                                }
                            } catch (error) {
                                this.debugLogger.debug('[Entity Service] Failed to resolve from cache:', error);
                                orgData = {
                                    id: context.org,
                                    code: context.org,
                                    name: context.org,
                                };
                            }
                        }
                    } else {
                        this.debugLogger.debug('[Entity Service] Organization name is empty string');
                        return undefined;
                    }
                } else if (context.org && typeof context.org === 'object') {
                    const orgName = context.org.name || context.org.id || 'Unknown';
                    this.debugLogger.debug(`[Entity Service] Current organization: ${orgName}`);
                    orgData = {
                        id: context.org.id || orgName,
                        code: context.org.code || orgName,
                        name: orgName,
                    };
                } else {
                    this.debugLogger.debug('[Entity Service] Organization data is not string or object');
                    return undefined;
                }

                // Cache the result
                this.cacheManager.setCachedOrganization(orgData);
                return orgData;
            }

            this.debugLogger.debug('[Entity Service] No organization currently selected');
            return undefined;
        } catch (error) {
            this.debugLogger.debug('[Entity Service] Failed to get current organization:', error);
            return undefined;
        }
    }

    /**
     * Get current project from CLI
     */
    async getCurrentProject(): Promise<AdobeProject | undefined> {
        try {
            // Check cache first
            const cachedProject = this.cacheManager.getCachedProject();
            if (cachedProject) {
                return cachedProject;
            }

            const context = await this.getConsoleWhereContext();
            if (!context) {
                return undefined;
            }

            if (context.project) {
                let projectData;

                if (typeof context.project === 'string') {
                    try {
                        // Use silent mode for internal ID resolution to avoid duplicate log messages
                        const projects = await this.getProjects({ silent: true });
                        const matchedProject = projects.find(p => p.name === context.project || p.title === context.project);

                        if (matchedProject) {
                            projectData = matchedProject;
                        } else {
                            this.debugLogger.warn(`[Entity Service] Could not find numeric ID for project "${context.project}", using name as fallback`);
                            projectData = {
                                id: context.project,
                                name: context.project,
                                title: context.project,
                            };
                        }
                    } catch (error) {
                        this.debugLogger.debug('[Entity Service] Failed to fetch project list for ID lookup:', error);
                        projectData = {
                            id: context.project,
                            name: context.project,
                            title: context.project,
                        };
                    }
                } else if (typeof context.project === 'object') {
                    const projectName = context.project.name || context.project.id || 'Unknown';
                    this.debugLogger.debug(`[Entity Service] Current project: ${projectName}`);
                    projectData = {
                        id: context.project.id,
                        name: context.project.name,
                        title: context.project.title || context.project.name,
                        description: context.project.description,
                        org_id: context.project.org_id,
                    };
                } else {
                    this.debugLogger.debug('[Entity Service] Project data is not string or object');
                    return undefined;
                }

                // Cache the result
                this.cacheManager.setCachedProject(projectData);
                return projectData;
            }

            this.debugLogger.debug('[Entity Service] No project currently selected');
            return undefined;
        } catch (error) {
            this.debugLogger.debug('[Entity Service] Failed to get current project:', error);
            return undefined;
        }
    }

    /**
     * Get current workspace from CLI
     */
    async getCurrentWorkspace(): Promise<AdobeWorkspace | undefined> {
        try {
            // Check cache first
            const cachedWorkspace = this.cacheManager.getCachedWorkspace();
            if (cachedWorkspace) {
                return cachedWorkspace;
            }

            const context = await this.getConsoleWhereContext();
            if (!context) {
                return undefined;
            }

            if (context.workspace) {
                // Type guard - workspace can be string or object
                if (typeof context.workspace === 'object') {
                    this.debugLogger.debug(`[Entity Service] Current workspace: ${context.workspace.name}`);
                    const result = {
                        id: context.workspace.id,
                        name: context.workspace.name,
                        title: context.workspace.title || context.workspace.name,
                    };

                    // Cache the result
                    this.cacheManager.setCachedWorkspace(result);
                    return result;
                } else {
                    this.debugLogger.debug('[Entity Service] Workspace is string format (not supported)');
                }
            }

            this.debugLogger.debug('[Entity Service] No workspace currently selected');
            return undefined;
        } catch (error) {
            this.debugLogger.debug('[Entity Service] Failed to get current workspace:', error);
            return undefined;
        }
    }

    /**
     * Get current context (org, project, workspace)
     */
    async getCurrentContext(): Promise<AdobeContext> {
        // Use individual cached methods which will fetch only missing data
        this.debugLogger.debug('[Entity Service] Fetching context using cached methods');
        const [org, project, workspace] = await Promise.all([
            this.getCurrentOrganization(),
            this.getCurrentProject(),
            this.getCurrentWorkspace(),
        ]);

        return {
            org,
            project,
            workspace,
        };
    }

    // =========================================================================
    // Context Guard - Protects against external CLI context changes
    // =========================================================================

    /**
     * Extract ID from context value (can be string or object with id)
     */
    private extractContextId(value: string | { id: string } | undefined): string | undefined {
        if (!value) return undefined;
        if (typeof value === 'string') return value;
        return value.id;
    }

    /**
     * Ensure Adobe CLI context matches expected state before dependent operations.
     * Re-selects org/project if another process changed the global context.
     *
     * @param expected - The org/project IDs that should be selected
     * @returns true if context is correct (or was corrected), false on failure
     */
    private async ensureContext(expected: { orgId?: string; projectId?: string }): Promise<boolean> {
        const context = await this.getConsoleWhereContext();

        // Check organization context
        const currentOrgId = this.extractContextId(context?.org);
        if (expected.orgId && currentOrgId !== expected.orgId) {
            this.debugLogger.debug(
                `[Entity Service] Context drift: org ${currentOrgId || 'none'} → ${expected.orgId}`,
            );
            const orgSelected = await this.selectOrganization(expected.orgId);
            if (!orgSelected) {
                this.debugLogger.error('[Entity Service] Failed to restore org context');
                return false;
            }
        }

        // Check project context (re-fetch context if org was changed)
        if (expected.projectId) {
            const currentContext = expected.orgId ? await this.getConsoleWhereContext() : context;
            const currentProjectId = this.extractContextId(currentContext?.project);
            if (currentProjectId !== expected.projectId) {
                this.debugLogger.debug(
                    `[Entity Service] Context drift: project ${currentProjectId || 'none'} → ${expected.projectId}`,
                );
                const projectSelected = await this.doSelectProject(expected.projectId);
                if (!projectSelected) {
                    this.debugLogger.error('[Entity Service] Failed to restore project context');
                    return false;
                }
            }
        }

        return true;
    }

    // =========================================================================
    // Selection Operations
    // =========================================================================

    /**
     * Select organization
     */
    async selectOrganization(orgId: string): Promise<boolean> {
        try {
            // SECURITY: Validate orgId to prevent command injection
            validateOrgId(orgId);

            this.stepLogger.logTemplate('adobe-setup', 'operations.selecting', { item: 'organization' });

            const result = await this.commandManager.execute(
                `aio console org select ${orgId}`,
                {
                    encoding: 'utf8',
                    timeout: TIMEOUTS.CONFIG_WRITE,
                },
            );

            if (result.code === 0) {
                // Clear validation failure flag since new org was successfully selected
                this.cacheManager.setOrgClearedDueToValidation(false);

                // Smart caching: populate org cache directly and get name for logging
                let orgName = orgId; // Fallback to ID if name lookup fails
                try {
                    const orgs = await this.getOrganizations();
                    const selectedOrg = orgs.find(o => o.id === orgId);

                    if (selectedOrg) {
                        this.cacheManager.setCachedOrganization(selectedOrg);
                        orgName = selectedOrg.name;
                    } else {
                        this.cacheManager.setCachedOrganization(undefined);
                        this.debugLogger.warn(`[Entity Service] Could not find org ${orgId} in list`);
                    }
                } catch (error) {
                    this.debugLogger.debug('[Entity Service] Failed to cache org after selection:', error);
                    this.cacheManager.setCachedOrganization(undefined);
                }

                // Log with org name (or ID as fallback)
                this.stepLogger.logTemplate('adobe-setup', 'statuses.organization-selected', { name: orgName });

                // Clear downstream caches
                this.cacheManager.setCachedProject(undefined);
                this.cacheManager.setCachedWorkspace(undefined);
                this.cacheManager.clearConsoleWhereCache();

                // Test Developer permissions after org selection
                this.debugLogger.debug('[Entity Service] Testing Developer permissions after org selection');
                const permissionCheck = await this.organizationValidator.testDeveloperPermissions();

                if (!permissionCheck.hasPermissions) {
                    this.debugLogger.error('[Entity Service] User lacks Developer permissions for this organization');
                    const errorMessage = permissionCheck.error || 'Insufficient permissions for App Builder access';
                    this.logger.error(`[Entity Service] Developer permissions check failed: ${errorMessage}`);

                    // Throw error with specific message to signal permission failure to UI
                    throw new Error(errorMessage);
                }

                this.debugLogger.debug('[Entity Service] Developer permissions confirmed');

                return true;
            }

            this.debugLogger.debug(`[Entity Service] Organization select failed with code: ${result.code}`);
            return false;
        } catch (error) {
            this.debugLogger.error('[Entity Service] Failed to select organization', error as Error);
            return false;
        }
    }

    /**
     * Select project with organization context guard.
     * Ensures the org is selected first (protects against context drift).
     *
     * @param projectId - The project ID to select
     * @param orgId - Org ID to ensure context before selection
     */
    async selectProject(projectId: string, orgId: string): Promise<boolean> {
        const contextOk = await this.ensureContext({ orgId });
        if (!contextOk) {
            this.debugLogger.error('[Entity Service] Failed to ensure org context for project selection');
            return false;
        }

        return this.doSelectProject(projectId);
    }

    /**
     * Internal project selection (no context guard).
     * Used by ensureContext and selectProject.
     */
    private async doSelectProject(projectId: string): Promise<boolean> {
        try {
            // SECURITY: Validate projectId to prevent command injection
            validateProjectId(projectId);

            this.stepLogger.logTemplate('adobe-setup', 'operations.selecting', { item: 'project' });

            const result = await this.commandManager.execute(
                `aio console project select ${projectId}`,
                {
                    encoding: 'utf8',
                    timeout: TIMEOUTS.CONFIG_WRITE,
                },
            );

            if (result.code === 0) {
                // Smart caching - use silent mode to avoid duplicate log messages
                let projectName = projectId; // Fallback to ID if name lookup fails
                try {
                    const projects = await this.getProjects({ silent: true });
                    const selectedProject = projects.find(p => p.id === projectId);

                    if (selectedProject) {
                        this.cacheManager.setCachedProject(selectedProject);
                        projectName = selectedProject.title || selectedProject.name || projectId;
                    } else {
                        this.cacheManager.setCachedProject(undefined);
                        this.debugLogger.warn(`[Entity Service] Could not find project ${projectId} in list`);
                    }
                } catch (error) {
                    this.debugLogger.debug('[Entity Service] Failed to cache project after selection:', error);
                    this.cacheManager.setCachedProject(undefined);
                }

                // Log with project name (or ID as fallback)
                this.stepLogger.logTemplate('adobe-setup', 'statuses.project-selected', { name: projectName });

                // Clear downstream caches
                this.cacheManager.setCachedWorkspace(undefined);
                this.cacheManager.clearConsoleWhereCache();

                return true;
            }

            this.debugLogger.debug(`[Entity Service] Project select failed with code: ${result.code}`);
            return false;
        } catch (error) {
            // Check if command succeeded despite timeout
            const err = error as AdobeCLIError;
            if (err.stdout?.includes('Project selected :')) {
                this.debugLogger.debug('[Entity Service] Project selection succeeded despite timeout');

                // Smart caching even on timeout success - use silent mode
                let projectName = projectId; // Fallback to ID if name lookup fails
                try {
                    const projects = await this.getProjects({ silent: true });
                    const selectedProject = projects.find(p => p.id === projectId);

                    if (selectedProject) {
                        this.cacheManager.setCachedProject(selectedProject);
                        projectName = selectedProject.title || selectedProject.name || projectId;
                    }
                } catch (cacheError) {
                    this.debugLogger.debug('[Entity Service] Failed to cache project after timeout success:', cacheError);
                    this.cacheManager.setCachedProject(undefined);
                }

                // Log with project name (or ID as fallback)
                this.stepLogger.logTemplate('adobe-setup', 'statuses.project-selected', { name: projectName });

                // Clear downstream caches
                this.cacheManager.setCachedWorkspace(undefined);
                this.cacheManager.clearConsoleWhereCache();

                return true;
            }

            this.debugLogger.error('[Entity Service] Failed to select project', error as Error);
            return false;
        }
    }

    /**
     * Select workspace with project context guard.
     * Ensures the project is selected first (protects against context drift).
     *
     * @param workspaceId - The workspace ID to select
     * @param projectId - Project ID to ensure context before selection
     */
    async selectWorkspace(workspaceId: string, projectId: string): Promise<boolean> {
        const contextOk = await this.ensureContext({ projectId });
        if (!contextOk) {
            this.debugLogger.error('[Entity Service] Failed to ensure project context for workspace selection');
            return false;
        }

        return this.doSelectWorkspace(workspaceId);
    }

    /**
     * Internal workspace selection (no context guard).
     * Used by selectWorkspace.
     */
    private async doSelectWorkspace(workspaceId: string): Promise<boolean> {
        try {
            // SECURITY: Validate workspaceId to prevent command injection
            validateWorkspaceId(workspaceId);

            this.stepLogger.logTemplate('adobe-setup', 'operations.selecting', { item: 'workspace' });

            const result = await this.commandManager.execute(
                `aio console workspace select ${workspaceId}`,
                {
                    encoding: 'utf8',
                    timeout: TIMEOUTS.CONFIG_WRITE,
                },
            );

            if (result.code === 0) {
                // Smart caching and get name for logging
                let workspaceName = workspaceId; // Fallback to ID if name lookup fails
                try {
                    const workspaces = await this.getWorkspaces();
                    const selectedWorkspace = workspaces.find(w => w.id === workspaceId);

                    if (selectedWorkspace) {
                        this.cacheManager.setCachedWorkspace(selectedWorkspace);
                        workspaceName = selectedWorkspace.name || workspaceId;
                    } else {
                        this.cacheManager.setCachedWorkspace(undefined);
                        this.debugLogger.warn(`[Entity Service] Could not find workspace ${workspaceId} in list`);
                    }
                } catch (error) {
                    this.debugLogger.debug('[Entity Service] Failed to cache workspace after selection:', error);
                    this.cacheManager.setCachedWorkspace(undefined);
                }

                // Log with workspace name (or ID as fallback)
                this.stepLogger.logTemplate('adobe-setup', 'statuses.workspace-selected', { name: workspaceName });

                // Invalidate console.where cache
                this.cacheManager.clearConsoleWhereCache();

                return true;
            }

            this.debugLogger.debug(`[Entity Service] Workspace select failed with code: ${result.code}`);
            return false;
        } catch (error) {
            this.debugLogger.error('[Entity Service] Failed to select workspace', error as Error);
            return false;
        }
    }

    /**
     * Auto-select organization if only one is available
     */
    async autoSelectOrganizationIfNeeded(skipCurrentCheck = false): Promise<AdobeOrg | undefined> {
        try {
            // Check if org already selected (unless explicitly skipped)
            if (!skipCurrentCheck) {
                const currentOrg = await this.getCurrentOrganization();
                if (currentOrg) {
                    this.debugLogger.debug(`[Entity Service] Organization already selected: ${currentOrg.name}`);
                    return currentOrg;
                }
            } else {
                this.debugLogger.debug('[Entity Service] Skipping current org check - caller knows org is empty');
            }

            // Get available organizations
            this.debugLogger.debug('[Entity Service] No organization selected, fetching available organizations...');
            const orgs = await this.getOrganizations();

            if (orgs.length === 1) {
                // Auto-select single organization
                this.debugLogger.debug(`[Entity Service] Auto-selecting single organization: ${orgs[0].name}`);
                this.logger.info(`Auto-selecting organization: ${orgs[0].name}`);

                const selected = await this.selectOrganization(orgs[0].id);

                if (selected) {
                    this.cacheManager.setCachedOrganization(orgs[0]);
                    this.debugLogger.debug(`[Entity Service] Successfully auto-selected organization: ${orgs[0].name}`);
                    return orgs[0];
                }
            } else if (orgs.length > 1) {
                this.debugLogger.debug(`[Entity Service] Multiple organizations available (${orgs.length}), manual selection required`);
                this.logger.info(`Found ${orgs.length} organizations - manual selection required`);
            } else {
                this.debugLogger.warn('[Entity Service] No organizations available');
                this.logger.warn('No organizations available for this user');
            }

            return undefined;
        } catch (error) {
            this.debugLogger.error('[Entity Service] Failed to auto-select organization:', error as Error);
            return undefined;
        }
    }

    /**
     * Clear Adobe CLI console context (org/project/workspace selections)
     * Preserves authentication token (ims context)
     */
    private async clearConsoleContext(): Promise<void> {
        try {
            // Use established pattern: Promise.all for parallel execution
            await Promise.all([
                this.commandManager.execute('aio config delete console.org', { encoding: 'utf8' }),
                this.commandManager.execute('aio config delete console.project', { encoding: 'utf8' }),
                this.commandManager.execute('aio config delete console.workspace', { encoding: 'utf8' }),
            ]);

            // Clear console.where cache since context was cleared
            this.cacheManager.clearConsoleWhereCache();

            this.debugLogger.debug('[Entity Service] Cleared Adobe CLI console context (preserved token)');
        } catch (error) {
            // Fail gracefully - config may not exist
            this.debugLogger.debug('[Entity Service] Failed to clear console context (non-critical):', error);
        }
    }
}
