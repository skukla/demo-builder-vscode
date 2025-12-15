/**
 * Workspace Operations - Workspace management for Adobe entities
 *
 * Handles workspace listing, selection, and current context.
 * Extracted from AdobeEntityService for SOP compliance.
 */

import { getConsoleWhereContext, ensureContext, type ContextOperationsDeps } from './contextOperations';
import { mapWorkspaces } from './entityMappers';
import { doSelectProject } from './projectOperations';
import { getLogger, Logger, StepLogger } from '@/core/logging';
import { TIMEOUTS, formatDuration } from '@/core/utils';
import { validateWorkspaceId } from '@/core/validation';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type {
    AdobeWorkspace,
    RawAdobeWorkspace,
    SDKResponse,
} from '@/features/authentication/services/types';
import { parseJSON } from '@/types/typeGuards';

/**
 * Dependencies required for workspace operations
 */
export interface WorkspaceOperationsDeps extends ContextOperationsDeps {
    sdkClient: AdobeSDKClient;
    logger: Logger;
    stepLogger: StepLogger;
}

/**
 * Get list of workspaces for current project (SDK with CLI fallback)
 */
export async function getWorkspaces(deps: WorkspaceOperationsDeps): Promise<AdobeWorkspace[]> {
    const debugLogger = getLogger();
    const startTime = Date.now();

    try {
        deps.stepLogger.logTemplate('adobe-setup', 'operations.retrieving-workspaces', {});

        let mappedWorkspaces: AdobeWorkspace[] = [];
        const cachedOrg = deps.cacheManager.getCachedOrganization();
        const cachedProject = deps.cacheManager.getCachedProject();

        // Try SDK first if available and we have VALID numeric org ID and project ID
        const hasValidOrgId = cachedOrg?.id && cachedOrg.id.length > 0;
        const hasValidProjectId = cachedProject?.id && cachedProject.id.length > 0;

        // Auto-initialize SDK if not ready (lazy init pattern)
        if (!deps.sdkClient.isInitialized()) {
            await deps.sdkClient.ensureInitialized();
        }

        if (deps.sdkClient.isInitialized() && hasValidOrgId && hasValidProjectId) {
            try {
                const client = deps.sdkClient.getClient() as { getWorkspacesForProject: (orgId: string, projectId: string) => Promise<SDKResponse<RawAdobeWorkspace[]>> };
                const sdkResult = await client.getWorkspacesForProject(
                    cachedOrg.id,
                    cachedProject.id,
                );
                const sdkDuration = Date.now() - startTime;

                if (sdkResult.body && Array.isArray(sdkResult.body)) {
                    mappedWorkspaces = mapWorkspaces(sdkResult.body);

                    debugLogger.debug(`[Workspace Ops] Retrieved ${mappedWorkspaces.length} workspaces via SDK in ${formatDuration(sdkDuration)}`);
                } else {
                    throw new Error('Invalid SDK response format');
                }
            } catch (sdkError) {
                debugLogger.trace('[Workspace Ops] SDK failed, falling back to CLI:', sdkError);
                debugLogger.warn('[Workspace Ops] SDK unavailable, using slower CLI fallback for workspaces');
            }
        } else if (deps.sdkClient.isInitialized() && (!hasValidOrgId || !hasValidProjectId)) {
            debugLogger.debug('[Workspace Ops] SDK available but org ID or project ID is missing, using CLI');
        }

        // CLI fallback
        if (mappedWorkspaces.length === 0) {
            const result = await deps.commandManager.execute(
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

            mappedWorkspaces = mapWorkspaces(workspaces);

            debugLogger.debug(`[Workspace Ops] Retrieved ${mappedWorkspaces.length} workspaces via CLI in ${formatDuration(cliDuration)}`);
        }

        deps.stepLogger.logTemplate('adobe-setup', 'statuses.workspaces-loaded', {
            count: mappedWorkspaces.length,
            plural: mappedWorkspaces.length === 1 ? '' : 's',
        });

        return mappedWorkspaces;
    } catch (error) {
        debugLogger.error('[Workspace Ops] Failed to get workspaces', error as Error);
        throw error;
    }
}

/**
 * Get current workspace from CLI
 */
export async function getCurrentWorkspace(
    deps: WorkspaceOperationsDeps,
): Promise<AdobeWorkspace | undefined> {
    const debugLogger = getLogger();

    try {
        // Check cache first
        const cachedWorkspace = deps.cacheManager.getCachedWorkspace();
        if (cachedWorkspace) {
            return cachedWorkspace;
        }

        const context = await getConsoleWhereContext(deps);
        if (!context) {
            return undefined;
        }

        if (context.workspace) {
            // Type guard - workspace can be string or object
            if (typeof context.workspace === 'object') {
                debugLogger.debug(`[Workspace Ops] Current workspace: ${context.workspace.name}`);
                const result = {
                    id: context.workspace.id,
                    name: context.workspace.name,
                    title: context.workspace.title || context.workspace.name,
                };

                // Cache the result
                deps.cacheManager.setCachedWorkspace(result);
                return result;
            } else {
                debugLogger.debug('[Workspace Ops] Workspace is string format (not supported)');
            }
        }

        debugLogger.debug('[Workspace Ops] No workspace currently selected');
        return undefined;
    } catch (error) {
        debugLogger.debug('[Workspace Ops] Failed to get current workspace:', error);
        return undefined;
    }
}

/**
 * Select workspace with project context guard.
 * Ensures the project is selected first (protects against context drift).
 *
 * @param workspaceId - The workspace ID to select
 * @param projectId - Project ID to ensure context before selection
 * @param selectOrganization - Callback to select org if context drift detected
 */
export async function selectWorkspace(
    deps: WorkspaceOperationsDeps,
    workspaceId: string,
    projectId: string,
    selectOrganization: (orgId: string) => Promise<boolean>,
): Promise<boolean> {
    const debugLogger = getLogger();

    const contextOk = await ensureContext(
        deps,
        { projectId },
        selectOrganization,
        (pid) => doSelectProject(deps, pid),
    );
    if (!contextOk) {
        debugLogger.error('[Workspace Ops] Failed to ensure project context for workspace selection');
        return false;
    }

    return doSelectWorkspace(deps, workspaceId);
}

/**
 * Internal workspace selection (no context guard).
 * Used by selectWorkspace.
 */
export async function doSelectWorkspace(
    deps: WorkspaceOperationsDeps,
    workspaceId: string,
): Promise<boolean> {
    const debugLogger = getLogger();

    try {
        // SECURITY: Validate workspaceId to prevent command injection
        validateWorkspaceId(workspaceId);

        deps.stepLogger.logTemplate('adobe-setup', 'operations.selecting', { item: 'workspace' });

        const result = await deps.commandManager.execute(
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
                const workspaces = await getWorkspaces(deps);
                const selectedWorkspace = workspaces.find(w => w.id === workspaceId);

                if (selectedWorkspace) {
                    deps.cacheManager.setCachedWorkspace(selectedWorkspace);
                    workspaceName = selectedWorkspace.name || workspaceId;
                } else {
                    deps.cacheManager.setCachedWorkspace(undefined);
                    debugLogger.warn(`[Workspace Ops] Could not find workspace ${workspaceId} in list`);
                }
            } catch (error) {
                debugLogger.debug('[Workspace Ops] Failed to cache workspace after selection:', error);
                deps.cacheManager.setCachedWorkspace(undefined);
            }

            // Log with workspace name (or ID as fallback)
            deps.stepLogger.logTemplate('adobe-setup', 'statuses.workspace-selected', { name: workspaceName });

            // Invalidate console.where cache
            deps.cacheManager.clearConsoleWhereCache();

            return true;
        }

        debugLogger.debug(`[Workspace Ops] Workspace select failed with code: ${result.code}`);
        return false;
    } catch (error) {
        debugLogger.error('[Workspace Ops] Failed to select workspace', error as Error);
        return false;
    }
}
