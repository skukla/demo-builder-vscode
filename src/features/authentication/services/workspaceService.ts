/**
 * WorkspaceService - Simplified Workspace Management
 *
 * Replaces the multi-layered approach of:
 * - adobeEntityFetcher (getWorkspaces)
 * - adobeEntitySelector (selectWorkspace)
 * - adobeContextResolver (getCurrentWorkspace)
 * - workspaceOperations (all workspace operations)
 *
 * Design Principle: Direct CLI calls with caching, minimal indirection.
 */

import type { AuthCache } from './authCache';
import type { AdobeWorkspace, RawAdobeWorkspace, AdobeConsoleWhereResponse } from './types';
import { getLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateWorkspaceId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';

export interface WorkspaceValidationResult {
    valid: boolean;
    workspace?: AdobeWorkspace;
    error?: string;
}

/**
 * Maps raw CLI workspace data to AdobeWorkspace type
 */
function mapWorkspace(raw: RawAdobeWorkspace): AdobeWorkspace {
    return {
        id: raw.id,
        name: raw.name,
        title: raw.title || raw.name,
    };
}

/**
 * Simplified workspace service with direct CLI calls
 */
export class WorkspaceService {
    private logger = getLogger();

    constructor(
        private commandExecutor: CommandExecutor,
        private cache: AuthCache,
    ) {}

    /**
     * Get list of workspaces for a project
     * Uses cache if available, otherwise fetches from CLI
     */
    async getWorkspaces(orgId: string, projectId: string): Promise<AdobeWorkspace[]> {
        // Check cache first
        const cached = this.cache.getWorkspaces(orgId, projectId);
        if (cached) {
            return cached;
        }

        // Fetch from CLI
        const result = await this.commandExecutor.execute(
            'aio console workspace list --json',
            { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
        );

        if (result.code !== 0) {
            throw new Error(`Failed to get workspaces: ${result.stderr || 'Unknown error'}`);
        }

        // Parse response
        const rawWorkspaces = parseJSON<RawAdobeWorkspace[]>(result.stdout);
        if (!rawWorkspaces || !Array.isArray(rawWorkspaces)) {
            throw new Error('Invalid workspaces response format');
        }

        const workspaces = rawWorkspaces.map(mapWorkspace);

        // Cache the result
        this.cache.setWorkspaces(orgId, projectId, workspaces);

        this.logger.debug(`[WorkspaceService] Retrieved ${workspaces.length} workspaces for project ${projectId}`);
        return workspaces;
    }

    /**
     * Select a workspace
     */
    async selectWorkspace(orgId: string, projectId: string, workspaceId: string): Promise<boolean> {
        // SECURITY: Validate workspaceId to prevent command injection
        validateWorkspaceId(workspaceId);

        const result = await this.commandExecutor.execute(
            `aio console workspace select ${workspaceId}`,
            { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
        );

        if (result.code !== 0) {
            this.logger.debug(`[WorkspaceService] Failed to select workspace ${workspaceId}: ${result.stderr}`);
            return false;
        }

        // Update current workspace in cache (try from cached workspaces first)
        const workspaces = this.cache.getWorkspaces(orgId, projectId);
        if (workspaces) {
            const selectedWorkspace = workspaces.find(w => w.id === workspaceId);
            if (selectedWorkspace) {
                this.cache.setCurrentWorkspace(selectedWorkspace);
            }
        }

        // Clear console where cache (context changed)
        this.cache.clearConsoleWhere();

        this.logger.debug(`[WorkspaceService] Selected workspace: ${workspaceId}`);
        return true;
    }

    /**
     * Get current workspace from CLI context
     */
    async getCurrentWorkspace(): Promise<AdobeWorkspace | undefined> {
        // Check cache first
        const cached = this.cache.getCurrentWorkspace();
        if (cached) {
            return cached;
        }

        // Fetch from CLI
        const context = await this.getConsoleWhereContext();
        if (!context?.workspace) {
            return undefined;
        }

        // Handle string or object format
        let workspace: AdobeWorkspace | undefined;
        if (typeof context.workspace === 'string') {
            // Create minimal workspace object
            workspace = {
                id: context.workspace,
                name: context.workspace,
            };
        } else {
            workspace = {
                id: context.workspace.id,
                name: context.workspace.name,
                title: context.workspace.title || context.workspace.name,
            };
        }

        // Cache the result
        this.cache.setCurrentWorkspace(workspace);
        return workspace;
    }

    /**
     * Validate that a workspace exists and is accessible
     */
    async validateWorkspace(orgId: string, projectId: string, workspaceId: string): Promise<WorkspaceValidationResult> {
        const workspaces = await this.getWorkspaces(orgId, projectId);
        const workspace = workspaces.find(w => w.id === workspaceId);

        if (!workspace) {
            return { valid: false, error: `Workspace ${workspaceId} not found` };
        }

        return { valid: true, workspace };
    }

    /**
     * Get console.where context (shared helper)
     */
    private async getConsoleWhereContext(): Promise<AdobeConsoleWhereResponse | undefined> {
        // Check cache first
        const cached = this.cache.getConsoleWhere();
        if (cached) {
            return cached;
        }

        // Fetch from CLI
        const result = await this.commandExecutor.execute(
            'aio console where --json',
            { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
        );

        if (result.code !== 0 || !result.stdout) {
            return undefined;
        }

        const context = parseJSON<AdobeConsoleWhereResponse>(result.stdout);
        if (!context) {
            return undefined;
        }

        // Cache the result
        this.cache.setConsoleWhere(context);
        return context;
    }
}
