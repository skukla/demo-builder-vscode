/**
 * Adobe Entity Service - Thin coordinator for Adobe entity operations
 *
 * Composes organization, project, and workspace operations from focused modules.
 * Reduced from 964 lines to ~150 lines via SOP-compliant decomposition.
 *
 * @see contextOperations.ts - Console context management
 * @see organizationOperations.ts - Organization listing/selection
 * @see projectOperations.ts - Project listing/selection
 * @see workspaceOperations.ts - Workspace listing/selection
 */

import { getLogger, Logger, StepLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    AdobeContext,
} from '@/features/authentication/services/types';

// Import operation modules
import * as orgOps from './organizationOperations';
import * as projectOps from './projectOperations';
import * as workspaceOps from './workspaceOperations';

/**
 * Service for managing Adobe entities (organizations, projects, workspaces)
 * Provides both SDK and CLI-based operations with intelligent caching
 */
export class AdobeEntityService {
    private debugLogger = getLogger();

    // Shared dependencies passed to operation modules
    private orgDeps: orgOps.OrganizationOperationsDeps;
    private projectDeps: projectOps.ProjectOperationsDeps;
    private workspaceDeps: workspaceOps.WorkspaceOperationsDeps;

    constructor(
        private commandManager: CommandExecutor,
        private sdkClient: AdobeSDKClient,
        private cacheManager: AuthCacheManager,
        private organizationValidator: OrganizationValidator,
        private logger: Logger,
        private stepLogger: StepLogger,
    ) {
        // Initialize shared dependencies
        const baseDeps = {
            commandManager,
            cacheManager,
            sdkClient,
            logger,
            stepLogger,
        };

        this.orgDeps = {
            ...baseDeps,
            organizationValidator,
        };

        this.projectDeps = baseDeps;
        this.workspaceDeps = baseDeps;
    }

    // =========================================================================
    // Organization Operations
    // =========================================================================

    /**
     * Get list of organizations (SDK with CLI fallback)
     */
    async getOrganizations(): Promise<AdobeOrg[]> {
        return orgOps.getOrganizations(this.orgDeps);
    }

    /**
     * Get current organization from CLI
     */
    async getCurrentOrganization(): Promise<AdobeOrg | undefined> {
        return orgOps.getCurrentOrganization(this.orgDeps);
    }

    /**
     * Select organization
     */
    async selectOrganization(orgId: string): Promise<boolean> {
        return orgOps.selectOrganization(this.orgDeps, orgId);
    }

    /**
     * Auto-select organization if only one is available
     */
    async autoSelectOrganizationIfNeeded(skipCurrentCheck = false): Promise<AdobeOrg | undefined> {
        return orgOps.autoSelectOrganizationIfNeeded(this.orgDeps, skipCurrentCheck);
    }

    // =========================================================================
    // Project Operations
    // =========================================================================

    /**
     * Get list of projects for current org (SDK with CLI fallback)
     * @param options.silent - If true, suppress user-facing log messages
     */
    async getProjects(options?: { silent?: boolean }): Promise<AdobeProject[]> {
        return projectOps.getProjects(this.projectDeps, options);
    }

    /**
     * Get current project from CLI
     */
    async getCurrentProject(): Promise<AdobeProject | undefined> {
        return projectOps.getCurrentProject(this.projectDeps);
    }

    /**
     * Select project with organization context guard.
     * Ensures the org is selected first (protects against context drift).
     *
     * @param projectId - The project ID to select
     * @param orgId - Org ID to ensure context before selection
     */
    async selectProject(projectId: string, orgId: string): Promise<boolean> {
        return projectOps.selectProject(
            this.projectDeps,
            projectId,
            orgId,
            (oid) => this.selectOrganization(oid),
        );
    }

    // =========================================================================
    // Workspace Operations
    // =========================================================================

    /**
     * Get list of workspaces for current project (SDK with CLI fallback)
     */
    async getWorkspaces(): Promise<AdobeWorkspace[]> {
        return workspaceOps.getWorkspaces(this.workspaceDeps);
    }

    /**
     * Get current workspace from CLI
     */
    async getCurrentWorkspace(): Promise<AdobeWorkspace | undefined> {
        return workspaceOps.getCurrentWorkspace(this.workspaceDeps);
    }

    /**
     * Select workspace with project context guard.
     * Ensures the project is selected first (protects against context drift).
     *
     * @param workspaceId - The workspace ID to select
     * @param projectId - Project ID to ensure context before selection
     */
    async selectWorkspace(workspaceId: string, projectId: string): Promise<boolean> {
        return workspaceOps.selectWorkspace(
            this.workspaceDeps,
            workspaceId,
            projectId,
            (oid) => this.selectOrganization(oid),
        );
    }

    // =========================================================================
    // Context Operations
    // =========================================================================

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
}
