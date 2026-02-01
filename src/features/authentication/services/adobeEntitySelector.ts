/**
 * AdobeEntitySelector
 *
 * Handles selection operations for Adobe entities (organizations, projects, workspaces).
 * Part of the AdobeEntityService decomposition for SOP §10 compliance.
 *
 * Responsibilities:
 * - Selecting org/project/workspace via CLI
 * - Context guards (ensureContext)
 * - Auto-selection logic
 * - Permission validation after org selection
 *
 * Dependencies:
 * - CommandExecutor for CLI operations
 * - AuthCacheManager for caching
 * - OrganizationValidator for permission checks
 * - AdobeEntityFetcher for cache population after selection
 * - AdobeContextResolver for context checks
 * - Logger/StepLogger for logging
 */

import { getLogger, StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils';
import { validateOrgId, validateProjectId, validateWorkspaceId } from '@/core/validation';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';
import type { AuthCacheManager } from './authCacheManager';
import type { OrganizationValidator } from './organizationValidator';
import type { AdobeEntityFetcher } from './adobeEntityFetcher';
import type { AdobeContextResolver } from './adobeContextResolver';
import type {
    AdobeOrg,
    AdobeCLIError,
} from './types';

/**
 * Handles Adobe entity selection operations
 */
export class AdobeEntitySelector {
    private debugLogger = getLogger();

    constructor(
        private commandManager: CommandExecutor,
        private cacheManager: AuthCacheManager,
        private organizationValidator: OrganizationValidator,
        private fetcher: AdobeEntityFetcher,
        private resolver: AdobeContextResolver,
        private logger: Logger,
        private stepLogger: StepLogger,
    ) {}

    /**
     * Extract ID from context value (can be string or object with id)
     */
    private extractContextId(value: string | { id: string } | undefined): string | undefined {
        if (!value) return undefined;
        if (typeof value === 'string') return value;
        return value.id;
    }

    /**
     * Resolve entity name to ID using cache (CLI returns names, we compare by ID)
     */
    private resolveNameToId(
        name: string | undefined,
        cached: { id?: string; name?: string; title?: string } | undefined,
    ): string | undefined {
        if (!name || !cached?.id) return name;
        // Match by name or title (projects use title)
        if (cached.name === name || cached.title === name) {
            this.debugLogger.trace(`[Entity Selector] Resolved "${name}" to ID: ${cached.id}`);
            return cached.id;
        }
        return name;
    }

    /**
     * Ensure Adobe CLI context matches expected state before dependent operations.
     * Re-selects org/project if another process changed the global context.
     *
     * @param expected - The org/project IDs that should be selected
     * @returns true if context is correct (or was corrected), false on failure
     */
    private async ensureContext(expected: { orgId?: string; projectId?: string }): Promise<boolean> {
        const context = await this.resolver.getConsoleWhereContext();

        // Check organization context
        const currentOrgValue = this.extractContextId(context?.org);
        const resolvedOrgId = typeof context?.org === 'string'
            ? this.resolveNameToId(currentOrgValue, this.cacheManager.getCachedOrganization())
            : currentOrgValue;

        if (expected.orgId && resolvedOrgId !== expected.orgId) {
            this.debugLogger.debug(
                `[Entity Selector] Context sync: org mismatch (current: "${resolvedOrgId || 'none'}"), re-selecting...`,
            );
            const orgSelected = await this.selectOrganization(expected.orgId);
            if (!orgSelected) {
                this.debugLogger.error('[Entity Selector] Failed to restore org context');
                return false;
            }
        }

        // Check project context (re-fetch context if org was changed)
        if (expected.projectId) {
            const currentContext = expected.orgId ? await this.resolver.getConsoleWhereContext() : context;
            const currentProjectValue = this.extractContextId(currentContext?.project);
            const resolvedProjectId = typeof currentContext?.project === 'string'
                ? this.resolveNameToId(currentProjectValue, this.cacheManager.getCachedProject())
                : currentProjectValue;

            if (resolvedProjectId !== expected.projectId) {
                this.debugLogger.debug(
                    `[Entity Selector] Context sync: project mismatch (current: "${resolvedProjectId || 'none'}"), re-selecting...`,
                );
                const projectSelected = await this.doSelectProject(expected.projectId);
                if (!projectSelected) {
                    this.debugLogger.error('[Entity Selector] Failed to restore project context');
                    return false;
                }
            }
        }

        return true;
    }

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
                    timeout: TIMEOUTS.NORMAL,
                    useNodeVersion: getMeshNodeVersion(),
                },
            );

            // Accept exit code 0 or 2 - Adobe CLI uses exit code 2 for warnings, not errors
            if (result.code === 0 || result.code === 2) {
                // Clear validation failure flag since new org was successfully selected
                this.cacheManager.setOrgClearedDueToValidation(false);

                // Smart caching: populate org cache directly and get name for logging
                let orgName = orgId; // Fallback to ID if name lookup fails
                const orgs = await this.fetcher.getOrganizations();
                const selectedOrg = orgs.find(o => o.id === orgId);

                if (selectedOrg) {
                    this.cacheManager.setCachedOrganization(selectedOrg);
                    orgName = selectedOrg.name;
                } else {
                    this.cacheManager.setCachedOrganization(undefined);
                    this.debugLogger.warn(`[Entity Selector] Could not find org ${orgId} in list`);
                }

                // Log with org name (or ID as fallback)
                this.stepLogger.logTemplate('adobe-setup', 'statuses.organization-selected', { name: orgName });

                // Clear downstream caches
                this.cacheManager.setCachedProject(undefined);
                this.cacheManager.setCachedWorkspace(undefined);
                this.cacheManager.clearConsoleWhereCache();

                // Test Developer permissions after org selection
                this.debugLogger.debug('[Entity Selector] Testing Developer permissions after org selection');
                const permissionCheck = await this.organizationValidator.testDeveloperPermissions();

                if (!permissionCheck.hasPermissions) {
                    this.debugLogger.error('[Entity Selector] User lacks Developer permissions for this organization');
                    const errorMessage = permissionCheck.error || 'Insufficient permissions for App Builder access';
                    this.logger.error(`[Entity Selector] Developer permissions check failed: ${errorMessage}`);

                    // Throw error with specific message to signal permission failure to UI
                    throw new Error(errorMessage);
                }

                this.debugLogger.debug('[Entity Selector] Developer permissions confirmed');

                return true;
            }

            this.debugLogger.debug(`[Entity Selector] Organization select failed with code: ${result.code}, stdout: ${result.stdout?.substring(0, 100)}`);
            return false;
        } catch (error) {
            // Propagate AUTH_EXPIRED so callers can show re-login prompt
            if ((error as Error).message?.includes('AUTH_EXPIRED')) {
                throw error;
            }
            this.debugLogger.error('[Entity Selector] Failed to select organization', error as Error);
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
            this.debugLogger.error('[Entity Selector] Failed to ensure org context for project selection');
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
                    timeout: TIMEOUTS.NORMAL,
                    useNodeVersion: getMeshNodeVersion(),
                },
            );

            // Accept exit code 0 or 2 - Adobe CLI uses exit code 2 for warnings, not errors
            if (result.code === 0 || result.code === 2) {
                // Smart caching - use silent mode to avoid duplicate log messages
                let projectName = projectId; // Fallback to ID if name lookup fails
                const projects = await this.fetcher.getProjects({ silent: true });
                const selectedProject = projects.find(p => p.id === projectId);

                if (selectedProject) {
                    this.cacheManager.setCachedProject(selectedProject);
                    projectName = selectedProject.title || selectedProject.name || projectId;
                } else {
                    this.cacheManager.setCachedProject(undefined);
                    this.debugLogger.warn(`[Entity Selector] Could not find project ${projectId} in list`);
                }

                // Log with project name (or ID as fallback)
                this.stepLogger.logTemplate('adobe-setup', 'statuses.project-selected', { name: projectName });

                // Clear downstream caches
                this.cacheManager.setCachedWorkspace(undefined);
                this.cacheManager.clearConsoleWhereCache();

                return true;
            }

            this.debugLogger.debug(`[Entity Selector] Project select failed with code: ${result.code}`);
            return false;
        } catch (error) {
            // Check if command succeeded despite timeout
            const err = error as AdobeCLIError;
            if (err.stdout?.includes('Project selected :')) {
                this.debugLogger.debug('[Entity Selector] Project selection succeeded despite timeout');

                // Smart caching even on timeout success - use silent mode
                let projectName = projectId; // Fallback to ID if name lookup fails
                const projects = await this.fetcher.getProjects({ silent: true });
                const selectedProject = projects.find(p => p.id === projectId);

                if (selectedProject) {
                    this.cacheManager.setCachedProject(selectedProject);
                    projectName = selectedProject.title || selectedProject.name || projectId;
                }

                // Log with project name (or ID as fallback)
                this.stepLogger.logTemplate('adobe-setup', 'statuses.project-selected', { name: projectName });

                // Clear downstream caches
                this.cacheManager.setCachedWorkspace(undefined);
                this.cacheManager.clearConsoleWhereCache();

                return true;
            }

            // Propagate AUTH_EXPIRED so callers can show re-login prompt
            if ((error as Error).message?.includes('AUTH_EXPIRED')) {
                throw error;
            }
            this.debugLogger.error('[Entity Selector] Failed to select project', error as Error);
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
            this.debugLogger.error('[Entity Selector] Failed to ensure project context for workspace selection');
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
                    timeout: TIMEOUTS.NORMAL,
                    useNodeVersion: getMeshNodeVersion(),
                },
            );

            // Accept exit code 0 or 2 - Adobe CLI uses exit code 2 for warnings
            if (result.code === 0 || result.code === 2) {
                // Smart caching and get name for logging
                let workspaceName = workspaceId; // Fallback to ID if name lookup fails
                const workspaces = await this.fetcher.getWorkspaces();
                const selectedWorkspace = workspaces.find(w => w.id === workspaceId);

                if (selectedWorkspace) {
                    this.cacheManager.setCachedWorkspace(selectedWorkspace);
                    workspaceName = selectedWorkspace.name || workspaceId;
                } else {
                    this.cacheManager.setCachedWorkspace(undefined);
                    this.debugLogger.warn(`[Entity Selector] Could not find workspace ${workspaceId} in list`);
                }

                // Log with workspace name (or ID as fallback)
                this.stepLogger.logTemplate('adobe-setup', 'statuses.workspace-selected', { name: workspaceName });

                // Invalidate console.where cache
                this.cacheManager.clearConsoleWhereCache();

                return true;
            }

            this.debugLogger.debug(`[Entity Selector] Workspace select failed with code: ${result.code}, stdout: ${result.stdout?.substring(0, 100)}`);
            return false;
        } catch (error) {
            // Propagate AUTH_EXPIRED so callers can show re-login prompt
            if ((error as Error).message?.includes('AUTH_EXPIRED')) {
                throw error;
            }
            this.debugLogger.error('[Entity Selector] Failed to select workspace', error as Error);
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
                const currentOrg = await this.resolver.getCurrentOrganization();
                if (currentOrg) {
                    this.debugLogger.debug(`[Entity Selector] Organization already selected: ${currentOrg.name}`);
                    return currentOrg;
                }
            } else {
                this.debugLogger.debug('[Entity Selector] Skipping current org check - caller knows org is empty');
            }

            // Get available organizations
            this.debugLogger.debug('[Entity Selector] No organization selected, fetching available organizations...');
            const orgs = await this.fetcher.getOrganizations();

            if (orgs.length === 1) {
                // Auto-select single organization
                this.debugLogger.debug(`[Entity Selector] Auto-selecting single organization: ${orgs[0].name}`);
                this.logger.info(`Auto-selecting organization: ${orgs[0].name}`);

                const selected = await this.selectOrganization(orgs[0].id);

                if (selected) {
                    this.cacheManager.setCachedOrganization(orgs[0]);
                    this.debugLogger.debug(`[Entity Selector] Successfully auto-selected organization: ${orgs[0].name}`);
                    return orgs[0];
                }
            } else if (orgs.length > 1) {
                this.debugLogger.debug(`[Entity Selector] Multiple organizations available (${orgs.length}), manual selection required`);
                this.logger.info(`Found ${orgs.length} organizations - manual selection required`);
            } else {
                this.debugLogger.warn('[Entity Selector] No organizations available');
                this.logger.warn('No organizations available for this user');
            }

            return undefined;
        } catch (error) {
            this.debugLogger.error('[Entity Selector] Failed to auto-select organization:', error as Error);
            return undefined;
        }
    }

    /**
     * Clear Adobe CLI console context (org/project/workspace selections)
     * Preserves authentication token (ims context)
     */
    async clearConsoleContext(): Promise<void> {
        try {
            // Use established pattern: Promise.all for parallel execution
            await Promise.all([
                this.commandManager.execute('aio config delete console.org', { encoding: 'utf8', useNodeVersion: getMeshNodeVersion() }),
                this.commandManager.execute('aio config delete console.project', { encoding: 'utf8', useNodeVersion: getMeshNodeVersion() }),
                this.commandManager.execute('aio config delete console.workspace', { encoding: 'utf8', useNodeVersion: getMeshNodeVersion() }),
            ]);

            // Clear console.where cache since context was cleared
            this.cacheManager.clearConsoleWhereCache();

            this.debugLogger.debug('[Entity Selector] Cleared Adobe CLI console context (preserved token)');
        } catch (error) {
            // Fail gracefully - config may not exist
            this.debugLogger.debug('[Entity Selector] Failed to clear console context (non-critical):', error);
        }
    }
}
