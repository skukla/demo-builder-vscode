/**
 * AdobeContextResolver
 *
 * Resolves current Adobe CLI context (organization, project, workspace).
 * Part of the AdobeEntityService decomposition for SOP §10 compliance.
 *
 * Responsibilities:
 * - Fetching and caching console.where context
 * - Resolving current org/project/workspace from CLI
 * - ID resolution via fetcher when context only has names
 *
 * Dependencies:
 * - CommandExecutor for CLI operations
 * - AuthCacheManager for caching
 * - AdobeEntityFetcher for ID resolution
 * - Logger for logging
 */

import { getLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils';
import type { AuthCacheManager } from './authCacheManager';
import type { AdobeEntityFetcher } from './adobeEntityFetcher';
import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    AdobeContext,
    AdobeConsoleWhereResponse,
} from './types';
import { parseJSON } from '@/types/typeGuards';

/**
 * Resolves current Adobe CLI context
 */
export class AdobeContextResolver {
    private debugLogger = getLogger();

    constructor(
        private commandManager: CommandExecutor,
        private cacheManager: AuthCacheManager,
        private fetcher: AdobeEntityFetcher,
    ) {}

    /**
     * Get console.where context with caching
     *
     * Fetches the current Adobe console context (org, project, workspace) from CLI
     * and caches the result. Used by getCurrentOrganization, getCurrentProject,
     * and getCurrentWorkspace to avoid redundant CLI calls.
     *
     * @returns The console context or undefined if fetch fails
     */
    async getConsoleWhereContext(): Promise<AdobeConsoleWhereResponse | undefined> {
        // Check console.where cache first
        let context = this.cacheManager.getCachedConsoleWhere();

        if (!context) {
            this.debugLogger.debug('[Context Resolver] Fetching context from Adobe CLI');
            const result = await this.commandManager.execute(
                'aio console where --json',
                { encoding: 'utf8', timeout: TIMEOUTS.API_CALL },
            );

            if (result.code === 0 && result.stdout) {
                // SECURITY: Use parseJSON for type-safe parsing
                const parsedContext = parseJSON<AdobeConsoleWhereResponse>(result.stdout);
                if (!parsedContext) {
                    this.debugLogger.warn('[Context Resolver] Failed to parse console.where response');
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
                                const orgs = await this.fetcher.getOrganizations();
                                const matchedOrg = orgs.find(o => o.name === context.org || o.code === context.org);

                                if (matchedOrg) {
                                    orgData = matchedOrg;
                                } else {
                                    this.debugLogger.warn('[Context Resolver] Could not find org in list, using name as fallback');
                                    orgData = {
                                        id: context.org,
                                        code: context.org,
                                        name: context.org,
                                    };
                                }
                            } catch (error) {
                                this.debugLogger.trace('[Context Resolver] Failed to fetch org list for ID resolution:', error);
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
                                    this.debugLogger.warn('[Context Resolver] Could not find org in cached list, using name as fallback');
                                    orgData = {
                                        id: context.org,
                                        code: context.org,
                                        name: context.org,
                                    };
                                }
                            } catch (error) {
                                this.debugLogger.trace('[Context Resolver] Failed to resolve from cache:', error);
                                orgData = {
                                    id: context.org,
                                    code: context.org,
                                    name: context.org,
                                };
                            }
                        }
                    } else {
                        this.debugLogger.debug('[Context Resolver] Organization name is empty string');
                        return undefined;
                    }
                } else if (context.org && typeof context.org === 'object') {
                    const orgName = context.org.name || context.org.id || 'Unknown';
                    this.debugLogger.debug(`[Context Resolver] Current organization: ${orgName}`);
                    orgData = {
                        id: context.org.id || orgName,
                        code: context.org.code || orgName,
                        name: orgName,
                    };
                } else {
                    this.debugLogger.debug('[Context Resolver] Organization data is not string or object');
                    return undefined;
                }

                // Cache the result
                this.cacheManager.setCachedOrganization(orgData);
                return orgData;
            }

            this.debugLogger.debug('[Context Resolver] No organization currently selected');
            return undefined;
        } catch (error) {
            this.debugLogger.debug('[Context Resolver] Failed to get current organization:', error);
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
                        const projects = await this.fetcher.getProjects({ silent: true });
                        const matchedProject = projects.find(p => p.name === context.project || p.title === context.project);

                        if (matchedProject) {
                            projectData = matchedProject;
                        } else {
                            this.debugLogger.warn(`[Context Resolver] Could not find numeric ID for project "${context.project}", using name as fallback`);
                            projectData = {
                                id: context.project,
                                name: context.project,
                                title: context.project,
                            };
                        }
                    } catch (error) {
                        this.debugLogger.debug('[Context Resolver] Failed to fetch project list for ID lookup:', error);
                        projectData = {
                            id: context.project,
                            name: context.project,
                            title: context.project,
                        };
                    }
                } else if (typeof context.project === 'object') {
                    const projectName = context.project.name || context.project.id || 'Unknown';
                    this.debugLogger.debug(`[Context Resolver] Current project: ${projectName}`);
                    projectData = {
                        id: context.project.id,
                        name: context.project.name,
                        title: context.project.title || context.project.name,
                        description: context.project.description,
                        org_id: context.project.org_id,
                    };
                } else {
                    this.debugLogger.debug('[Context Resolver] Project data is not string or object');
                    return undefined;
                }

                // Cache the result
                this.cacheManager.setCachedProject(projectData);
                return projectData;
            }

            this.debugLogger.debug('[Context Resolver] No project currently selected');
            return undefined;
        } catch (error) {
            this.debugLogger.debug('[Context Resolver] Failed to get current project:', error);
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
                    this.debugLogger.debug(`[Context Resolver] Current workspace: ${context.workspace.name}`);
                    const result = {
                        id: context.workspace.id,
                        name: context.workspace.name,
                        title: context.workspace.title || context.workspace.name,
                    };

                    // Cache the result
                    this.cacheManager.setCachedWorkspace(result);
                    return result;
                } else {
                    this.debugLogger.debug('[Context Resolver] Workspace is string format (not supported)');
                }
            }

            this.debugLogger.debug('[Context Resolver] No workspace currently selected');
            return undefined;
        } catch (error) {
            this.debugLogger.debug('[Context Resolver] Failed to get current workspace:', error);
            return undefined;
        }
    }

    /**
     * Get current context (org, project, workspace)
     */
    async getCurrentContext(): Promise<AdobeContext> {
        // Use individual cached methods which will fetch only missing data
        this.debugLogger.debug('[Context Resolver] Fetching context using cached methods');
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
}
