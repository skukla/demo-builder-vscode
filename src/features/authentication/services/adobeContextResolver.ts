/**
 * AdobeContextResolver
 *
 * Resolves current Adobe CLI context (organization, project, workspace).
 * Part of the EntityServices decomposition (created via createEntityServices).
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

import type { AdobeEntityFetcher } from './adobeEntityFetcher';
import type { AuthCacheManager } from './authCacheManager';
import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    AdobeContext,
    AdobeConsoleWhereResponse,
} from './types';
import { getLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';
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
                { encoding: 'utf8', timeout: TIMEOUTS.NORMAL, useNodeVersion: getMeshNodeVersion() },
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
     * Create a fallback org object from a name/code string
     */
    private createFallbackOrg(orgString: string): AdobeOrg {
        return { id: orgString, code: orgString, name: orgString };
    }

    /**
     * Resolve org string to full org object using fetcher or cache
     */
    private async resolveOrgFromString(orgString: string): Promise<AdobeOrg> {
        const cachedOrgList = this.cacheManager.getCachedOrgList();
        const orgList = (cachedOrgList && cachedOrgList.length > 0)
            ? cachedOrgList
            : await this.fetchOrgListSafely();

        const matchedOrg = orgList.find(o => o.name === orgString || o.code === orgString);
        if (matchedOrg) return matchedOrg;

        this.debugLogger.warn('[Context Resolver] Could not find org in list, using name as fallback');
        return this.createFallbackOrg(orgString);
    }

    /**
     * Fetch org list safely (returns empty array on failure)
     */
    private async fetchOrgListSafely(): Promise<AdobeOrg[]> {
        try {
            return await this.fetcher.getOrganizations();
        } catch (error) {
            this.debugLogger.trace('[Context Resolver] Failed to fetch org list for ID resolution:', error);
            return [];
        }
    }

    /**
     * Parse org data from console context value
     */
    private async parseOrgFromContext(
        orgValue: string | { id: string; code?: string; name?: string },
    ): Promise<AdobeOrg | undefined> {
        if (typeof orgValue === 'string') {
            if (!orgValue.trim()) {
                this.debugLogger.debug('[Context Resolver] Organization name is empty string');
                return undefined;
            }
            return this.resolveOrgFromString(orgValue);
        }

        if (typeof orgValue === 'object') {
            const orgName = orgValue.name || orgValue.id || 'Unknown';
            this.debugLogger.debug(`[Context Resolver] Current organization: ${orgName}`);
            return {
                id: orgValue.id || orgName,
                code: orgValue.code || orgName,
                name: orgName,
            };
        }

        this.debugLogger.debug('[Context Resolver] Organization data is not string or object');
        return undefined;
    }

    /**
     * Get current organization from CLI
     */
    async getCurrentOrganization(): Promise<AdobeOrg | undefined> {
        try {
            const cachedOrg = this.cacheManager.getCachedOrganization();
            if (cachedOrg) return cachedOrg;

            const context = await this.getConsoleWhereContext();
            if (!context?.org) {
                this.debugLogger.debug('[Context Resolver] No organization currently selected');
                return undefined;
            }

            const orgData = await this.parseOrgFromContext(context.org);
            if (orgData) {
                this.cacheManager.setCachedOrganization(orgData);
            }
            return orgData;
        } catch (error) {
            this.debugLogger.debug('[Context Resolver] Failed to get current organization:', error);
            return undefined;
        }
    }

    /**
     * Resolve project string to full project object
     */
    private async resolveProjectFromString(projectString: string): Promise<AdobeProject> {
        const fallback: AdobeProject = { id: projectString, name: projectString, title: projectString };
        try {
            const projects = await this.fetcher.getProjects({ silent: true });
            const matched = projects.find(p => p.name === projectString || p.title === projectString);
            if (matched) return matched;

            this.debugLogger.warn(`[Context Resolver] Could not find numeric ID for project "${projectString}", using name as fallback`);
            return fallback;
        } catch (error) {
            this.debugLogger.debug('[Context Resolver] Failed to fetch project list for ID lookup:', error);
            return fallback;
        }
    }

    /**
     * Parse project data from console context value
     */
    private async parseProjectFromContext(
        projectValue: string | { id: string; name: string; title?: string; description?: string; org_id?: string },
    ): Promise<AdobeProject | undefined> {
        if (typeof projectValue === 'string') {
            return this.resolveProjectFromString(projectValue);
        }

        if (typeof projectValue === 'object') {
            const projectName = projectValue.name || projectValue.id || 'Unknown';
            this.debugLogger.debug(`[Context Resolver] Current project: ${projectName}`);
            return {
                id: projectValue.id,
                name: projectValue.name,
                title: projectValue.title || projectValue.name,
                description: projectValue.description,
                org_id: projectValue.org_id,
            };
        }

        this.debugLogger.debug('[Context Resolver] Project data is not string or object');
        return undefined;
    }

    /**
     * Get current project from CLI
     */
    async getCurrentProject(): Promise<AdobeProject | undefined> {
        try {
            const cachedProject = this.cacheManager.getCachedProject();
            if (cachedProject) return cachedProject;

            const context = await this.getConsoleWhereContext();
            if (!context?.project) {
                this.debugLogger.debug('[Context Resolver] No project currently selected');
                return undefined;
            }

            const projectData = await this.parseProjectFromContext(context.project);
            if (projectData) {
                this.cacheManager.setCachedProject(projectData);
            }
            return projectData;
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
