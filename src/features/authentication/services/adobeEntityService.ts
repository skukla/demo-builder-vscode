/**
 * AdobeEntityService
 *
 * Facade for managing Adobe entities (organizations, projects, workspaces).
 * Composes specialized services for fetching, context resolution, and selection.
 *
 * Architecture (SOP §10 - God File Decomposition):
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    AdobeEntityService                        │
 * │                      (Facade/Orchestrator)                   │
 * └──────────────┬────────────────┬────────────────┬────────────┘
 *                │                │                │
 *     ┌──────────▼─────┐   ┌──────▼──────┐   ┌────▼──────────┐
 *     │ EntityFetcher  │   │ContextResolver│   │EntitySelector │
 *     │                │◄──│              │   │               │
 *     │ getOrgs()      │   │ getCurrentOrg│◄──│ selectOrg()   │
 *     │ getProjects()  │   │ getCurrentProj│  │ selectProject()│
 *     │ getWorkspaces()│   │ getCurrentWs │   │ selectWs()    │
 *     └────────────────┘   └──────────────┘   └───────────────┘
 * ```
 *
 * Responsibilities:
 * - Compose specialized services
 * - Delegate operations to appropriate service
 * - Maintain backward-compatible API
 */

import { AdobeContextResolver } from './adobeContextResolver';
import { AdobeEntityFetcher } from './adobeEntityFetcher';
import { AdobeEntitySelector } from './adobeEntitySelector';
import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import type { OrganizationValidator } from './organizationValidator';
import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    AdobeContext,
} from './types';
import { StepLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import type { Logger } from '@/types/logger';

/**
 * Facade service for managing Adobe entities
 * Composes fetcher, resolver, and selector for clean separation of concerns
 */
export class AdobeEntityService {
    private fetcher: AdobeEntityFetcher;
    private resolver: AdobeContextResolver;
    private selector: AdobeEntitySelector;

    constructor(
        commandManager: CommandExecutor,
        sdkClient: AdobeSDKClient,
        cacheManager: AuthCacheManager,
        organizationValidator: OrganizationValidator,
        logger: Logger,
        stepLogger: StepLogger,
    ) {
        // Create selector first (needed for clearConsoleContext callback)
        // But selector needs fetcher and resolver, so we create a temporary reference
        // eslint-disable-next-line prefer-const -- reassigned on line 101 after callback setup
        let selectorRef: AdobeEntitySelector | undefined;

        // Create fetcher with callback to selector's clearConsoleContext
        this.fetcher = new AdobeEntityFetcher(
            commandManager,
            sdkClient,
            cacheManager,
            logger,
            stepLogger,
            {
                onNoOrgsAccessible: async () => {
                    if (selectorRef) {
                        await selectorRef.clearConsoleContext();
                    }
                },
            },
        );

        // Create resolver (depends on fetcher)
        this.resolver = new AdobeContextResolver(
            commandManager,
            cacheManager,
            this.fetcher,
        );

        // Create selector (depends on fetcher and resolver)
        this.selector = new AdobeEntitySelector(
            commandManager,
            cacheManager,
            organizationValidator,
            this.fetcher,
            this.resolver,
            logger,
            stepLogger,
        );

        // Set the reference for the callback
        selectorRef = this.selector;
    }

    // =========================================================================
    // Fetcher Delegations
    // =========================================================================

    /**
     * Get list of organizations (SDK with CLI fallback)
     */
    getOrganizations(): Promise<AdobeOrg[]> {
        return this.fetcher.getOrganizations();
    }

    /**
     * Get list of projects for current org (SDK with CLI fallback)
     * @param options.silent - If true, suppress user-facing log messages
     */
    getProjects(options?: { silent?: boolean }): Promise<AdobeProject[]> {
        return this.fetcher.getProjects(options);
    }

    /**
     * Get list of workspaces for current project (SDK with CLI fallback)
     */
    getWorkspaces(): Promise<AdobeWorkspace[]> {
        return this.fetcher.getWorkspaces();
    }

    // =========================================================================
    // Context Resolver Delegations
    // =========================================================================

    /**
     * Get current organization from CLI
     */
    getCurrentOrganization(): Promise<AdobeOrg | undefined> {
        return this.resolver.getCurrentOrganization();
    }

    /**
     * Get current project from CLI
     */
    getCurrentProject(): Promise<AdobeProject | undefined> {
        return this.resolver.getCurrentProject();
    }

    /**
     * Get current workspace from CLI
     */
    getCurrentWorkspace(): Promise<AdobeWorkspace | undefined> {
        return this.resolver.getCurrentWorkspace();
    }

    /**
     * Get current context (org, project, workspace)
     */
    getCurrentContext(): Promise<AdobeContext> {
        return this.resolver.getCurrentContext();
    }

    // =========================================================================
    // Selector Delegations
    // =========================================================================

    /**
     * Select organization
     */
    selectOrganization(orgId: string): Promise<boolean> {
        return this.selector.selectOrganization(orgId);
    }

    /**
     * Select project with organization context guard
     * @param projectId - The project ID to select
     * @param orgId - Org ID to ensure context before selection
     */
    selectProject(projectId: string, orgId: string): Promise<boolean> {
        return this.selector.selectProject(projectId, orgId);
    }

    /**
     * Select workspace with project context guard
     * @param workspaceId - The workspace ID to select
     * @param projectId - Project ID to ensure context before selection
     */
    selectWorkspace(workspaceId: string, projectId: string): Promise<boolean> {
        return this.selector.selectWorkspace(workspaceId, projectId);
    }

    /**
     * Auto-select organization if only one is available
     */
    autoSelectOrganizationIfNeeded(skipCurrentCheck = false): Promise<AdobeOrg | undefined> {
        return this.selector.autoSelectOrganizationIfNeeded(skipCurrentCheck);
    }
}
